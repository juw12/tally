"""G4 parser suite, G5 PWA cache coverage, and checks for the round-1 features."""
import json
import re
import sys
from datetime import date, timedelta
from pathlib import Path

from playwright.sync_api import sync_playwright

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
APP = Path(__file__).resolve().parent.parent
checks = []


def check(name, ok):
    checks.append((name, bool(ok)))


# ---- G5: every file the page references is in the service-worker cache list
html = (APP / "index.html").read_text(encoding="utf-8")
referenced = set(re.findall(r'(?:src|href)="([^"#:]+)"', html))
manifest = json.loads((APP / "manifest.json").read_text(encoding="utf-8"))
referenced |= {icon["src"] for icon in manifest["icons"]}
cached = set(json.loads(re.search(r"const FILES = (\[.*?\]);", (APP / "sw.js").read_text(encoding="utf-8")).group(1)))
missing = sorted(f for f in referenced if f not in cached)
check(f"G5 service worker caches every referenced file (missing: {missing or 'none'})", not missing)
check("G5 every cached file exists", all((APP / f).exists() for f in cached if f != "./"))

PHRASES = [
    ("lunch 120 and grab 35 yesterday", [(120, "Food"), (35, "Transport")]),
    ("I spent $12.50 on coffee at Starbucks", [(12.5, "Food")]),
    ("paid 1,250 for electricity bill", [(1250, "Bills")]),
    ("coffee and cake 120", [(120, "Food")]),
    ("2 coffees 120", [(120, "Food")]),
    ("taxi twenty-five dollars", [(25, "Transport")]),
    ("bensin 50rb kemarin", [(50000, "Transport")]),
    ("7-Eleven 85", [(85, "Groceries")]),
    ("groceries 1.250.000 rupiah", [(1250000, "Groceries")]),
    ("netflix 390 , gym 1500, movie 280 day before yesterday", [(390, "Bills"), (1500, "Health"), (280, "Entertainment")]),
    ("hello there", []),
    ("dinner one hundred twenty", [(120, "Food")]),
    ("5 kopi 25 ribu", [(25000, "Food")]),
    ("makan siang 45 ribu dan parkir 5 ribu kemarin", [(45000, "Food"), (5000, "Transport")]),
    ("ojek 18.000 3 hari lalu", [(18000, "Transport")]),
    ("午餐120和計程車250昨天", [(120, "Food"), (250, "Transport")]),
    ("花了85塊買咖啡", [(85, "Food")]),
    ("房租1.5萬", [(15000, "Bills")]),
    ("全聯 860元，捷運 30元 前天", [(860, "Groceries"), (30, "Transport")]),
    ("晚饭 68 元 和 打车 25", [(68, "Food"), (25, "Transport")]),
]

with sync_playwright() as p:
    browser = p.chromium.launch(channel="msedge")
    page = browser.new_page(viewport={"width": 390, "height": 844})
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))

    # ---- G4: parser
    page.goto((APP / "index.html").as_uri())
    results = page.evaluate("(phrases) => phrases.map(p => parseExpenses(p).map(e => [e.amount, e.cat]))", [p for p, _ in PHRASES])
    passed = sum(1 for (phrase, expected), got in zip(PHRASES, results) if [tuple(x) for x in got] == expected)
    for (phrase, expected), got in zip(PHRASES, results):
        if [tuple(x) for x in got] != expected:
            print("   parser mismatch:", phrase, got, "expected", expected)
    check(f"G4 parser {passed}/{len(PHRASES)}", passed == len(PHRASES))

    # ---- Round-1 features
    day = (date.today() - timedelta(days=1)).isoformat()
    seed = [{"id": "a", "created": 1, "date": day, "desc": "Lunch", "cat": "Food", "amount": 120, "note": "", "raw": ""},
            {"id": "b", "created": 2, "date": date.today().isoformat(), "desc": "Taxi", "cat": "Transport", "amount": 250, "note": "", "raw": ""}]
    page.evaluate(f"localStorage.clear(); localStorage.setItem('tally.expenses.v1', {json.dumps(json.dumps(seed))})")
    page.reload()
    if date.today().day > 1:
        page.click(f"rect[data-day='{day}']", force=True)
        check("chart bar opens that day's activity", page.locator("#txList .tx").count() == 1 and page.is_visible("[data-clear-day]"))
        page.click("[data-clear-day]")
        check("clearing the day filter shows the period again", page.locator("#txList .tx").count() == 2)
    page.click(".tabbar [data-tab=overview]")
    page.click("#recordButton")
    page.fill("#recInput", "coffee 65")
    page.click("#recForm button")
    labels = page.locator("#toastActions button").all_inner_texts()
    check(f"single add offers Edit and Undo ({labels})", labels == ["Edit", "Undo"])
    page.click("#toastActions button:first-child")
    check("Edit opens the editor on the new expense", page.input_value("#editForm [name=desc]") == "Coffee")
    page.click("[data-close]")
    page.click(".tabbar [data-tab=settings]")
    check("settings shows no-backup hint", "No backup yet" in page.inner_text("#view-settings .foot"))
    with page.expect_download():
        page.click("#backup")
    check("backup date recorded", "Last backup" in page.inner_text("#view-settings .foot"))
    # ---- Demo mode: sample data shown, nothing written to storage
    page.evaluate("localStorage.clear()")
    page.goto((APP / "index.html").as_uri() + "?demo=1")
    page.wait_for_timeout(200)
    check("demo shows sample expenses", page.locator("#view-overview .tx").count() >= 3)
    page.click("#recordButton")
    page.fill("#recInput", "coffee 4")
    page.click("#recForm button")
    check("demo never writes localStorage", page.evaluate("localStorage.getItem('tally.expenses.v1')") is None)
    check("no JS errors", not errors)
    browser.close()

for name, ok in checks:
    print(("PASS " if ok else "FAIL ") + name)
sys.exit(0 if all(ok for _, ok in checks) else 1)
