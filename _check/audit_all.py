"""Gate G1/G2: runs the refine app_audit PROBE on every screen, theme, width and language."""
import functools
import http.server
import json
import sys
import threading
from datetime import date, datetime, timedelta
from pathlib import Path
import random

sys.path.insert(0, str(Path.home() / ".vector/skills/refine/app/tools"))
from app_audit import PROBE  # noqa: E402
from playwright.sync_api import sync_playwright  # noqa: E402

APP = Path(__file__).resolve().parent.parent
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
OUT = Path(__file__).resolve().parent / ("audit-" + (sys.argv[1] if len(sys.argv) > 1 else "run"))
OUT.mkdir(exist_ok=True)

class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


handler = functools.partial(QuietHandler, directory=str(APP))
server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
threading.Thread(target=server.serve_forever, daemon=True).start()
BASE = f"http://127.0.0.1:{server.server_port}/index.html"

random.seed(5)
today = date.today()
expenses = []
for offset in range(40, -1, -1):
    day = today - timedelta(days=offset)
    for n in range(random.choice([1, 2, 3])):
        desc, cat = random.choice([("Lunch", "Food"), ("Grab", "Transport"), ("Pxmart", "Groceries"), ("Netflix", "Bills"), ("Uniqlo", "Shopping")])
        when = datetime(day.year, day.month, day.day, random.choice([9, 13, 19]), 5)
        expenses.append({"id": f"s{offset}-{n}", "created": int(when.timestamp() * 1000), "date": day.isoformat(),
                         "desc": desc, "cat": cat, "amount": random.randint(40, 900), "note": "", "raw": f"{desc} 100"})


def seed_script(region, data=True):
    settings = {"region": region, "budgetTotal": 30000, "budgets": {"Food": 9000}}
    from_region = {"US": ("en-US", "USD", "en-US", 0), "ID": ("id-ID", "IDR", "id-ID", 1), "TW": ("zh-TW", "TWD", "zh-TW", 0)}[region]
    settings.update(dict(zip(["locale", "currency", "lang", "weekStart"], from_region)))
    return (
        "localStorage.clear();"
        f"localStorage.setItem('tally.expenses.v1', {json.dumps(json.dumps(expenses if data else []))});"
        f"localStorage.setItem('tally.settings.v1', {json.dumps(json.dumps(settings))});"
    )


SCREENS = [
    ("overview-month", []),
    ("overview-week", ["click:[data-period=week]"]),
    ("overview-year", ["click:[data-period=year]"]),
    ("activity", ["click:.tabbar [data-tab=transactions]"]),
    ("budgets", ["click:.tabbar [data-tab=budgets]"]),
    ("settings", ["click:.tabbar [data-tab=settings]"]),
    ("edit-sheet", ["click:.tabbar [data-tab=transactions]", "click:#txList .tx"]),
    ("record-sheet", ["fill-record"]),
    ("share-sheet", ["click:#shareButton"]),
]

failures = {}
count = 0
with sync_playwright() as pw:
    browser = pw.chromium.launch(channel="msedge")
    combos = [
        ("US", "light", 390), ("US", "dark", 390), ("US", "light", 1280), ("US", "dark", 1280),
        ("ID", "light", 390), ("TW", "light", 390), ("TW", "dark", 390), ("US", "light", 320),
    ]
    for region, scheme, width in combos:
        context = browser.new_context(viewport={"width": width, "height": 844}, color_scheme=scheme, locale="en-US")
        # Headless Edge has no microphone: replace speech recognition with a silent stub.
        context.add_init_script("window.webkitSpeechRecognition = class { start() {} stop() { this.onend && this.onend(); } abort() { this.onend && this.onend(); } };")
        page = context.new_page()
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)[:160]))
        page.on("console", lambda m: errors.append(m.text[:160]) if m.type == "error" else None)
        screens = SCREENS + ([("empty", ["empty"])] if region == "US" else [])
        for name, steps in screens:
            page.goto("about:blank")
            page.goto(BASE)
            page.evaluate(seed_script(region, data=(steps != ["empty"])))
            page.goto(BASE)
            page.wait_for_timeout(150)
            for step in steps:
                if step.startswith("click:"):
                    page.locator(step[6:]).first.click()
                elif step == "fill-record":
                    page.click("#recordButton")
                    page.fill("#recInput", "lunch 120 and taxi 250")
                    page.dispatch_event("#recInput", "input")
                page.wait_for_timeout(120)
            errors[:] = [e for e in errors if "speech" not in e.lower()]
            probe = page.evaluate(PROBE)
            count += 1
            tag = f"{region}/{scheme}/{width}/{name}"
            problems = {}
            if errors:
                problems["A1"] = errors[:2]
            if probe["overflow"] > 1:
                problems["A2"] = [f"{probe['overflow']}px"]
            if not probe["viewport_meta"]:
                problems["A3"] = ["missing"]
            if probe["contrast"]:
                problems["A4"] = probe["contrast"][:4]
            if probe["tap"]:
                problems["A5"] = probe["tap"][:4]
            if probe["small_text"]:
                problems["A6"] = probe["small_text"][:4]
            if probe["img"]:
                problems["A7"] = probe["img"][:3]
            if probe["h1"] != 1 or not probe["brand"]["title"]:
                problems["A8"] = [f"h1={probe['h1']}"]
            if problems:
                failures[tag] = problems
                page.screenshot(path=OUT / f"{tag.replace('/', '_')}.png")
            errors.clear()
        context.close()
    browser.close()
server.shutdown()

by_gate = {}
for tag, problems in failures.items():
    for gate, items in problems.items():
        by_gate.setdefault(gate, []).append((tag, items))
print(f"screens audited: {count}, screens with failures: {len(failures)}")
for gate in sorted(by_gate):
    print(f"{gate}: {len(by_gate[gate])} screens")
    seen = set()
    for tag, items in by_gate[gate]:
        for item in items:
            key = item.split('"')[0] + item.split('"')[1][:12] if '"' in item else item
            if key not in seen and len(seen) < 8:
                seen.add(key)
                print(f"   {tag}: {item}")
(OUT / "failures.json").write_text(json.dumps(failures, ensure_ascii=False, indent=1), encoding="utf-8")
sys.exit(0 if not failures else 1)
