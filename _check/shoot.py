"""Renders every screen of the app with seeded data and checks the main flows."""
import json
import random
import sys
from datetime import date, timedelta
from pathlib import Path

from playwright.sync_api import sync_playwright

APP = Path(__file__).resolve().parent.parent
OUT = Path(__file__).resolve().parent
TODAY = date.today()

random.seed(7)
TEMPLATES = [
    ("Lunch", "Food", 90, 220), ("Coffee", "Food", 55, 160), ("Dinner", "Food", 180, 650),
    ("Grab", "Transport", 90, 320), ("MRT", "Transport", 20, 60), ("Pxmart", "Groceries", 250, 1400),
    ("Uniqlo", "Shopping", 590, 1990), ("Netflix", "Bills", 390, 390), ("Electricity bill", "Bills", 900, 1600),
    ("Pharmacy", "Health", 120, 600), ("Movie", "Entertainment", 280, 560), ("7-Eleven", "Groceries", 45, 180),
]
expenses = []
for offset in range(40, -1, -1):
    day = TODAY - timedelta(days=offset)
    for n in range(random.choice([1, 2, 2, 3])):
        desc, cat, low, high = random.choice(TEMPLATES)
        expenses.append({
            "id": f"seed-{offset}-{n}", "created": n, "date": day.isoformat(), "desc": desc, "cat": cat,
            "amount": round(random.uniform(low, high) / 5) * 5, "note": "", "raw": f"{desc.lower()} {low}",
        })
settings = {"currency": "TWD", "lang": "en-US", "weekStart": 1, "budgetTotal": 30000,
            "budgets": {"Food": 9000, "Transport": 3000, "Shopping": 3000}}
seed_script = (
    f"if (!sessionStorage.getItem('seeded')) {{"
    f"localStorage.setItem('tally.expenses.v1', {json.dumps(json.dumps(expenses))});"
    f"localStorage.setItem('tally.settings.v1', {json.dumps(json.dumps(settings))});"
    f"sessionStorage.setItem('seeded', '1'); }}"
)

errors = []
checks = []


def check(name, condition):
    checks.append((name, bool(condition)))


with sync_playwright() as p:
    browser = p.chromium.launch(channel="msedge")
    for width in (390, 320):
        page = browser.new_page(viewport={"width": width, "height": 844}, device_scale_factor=2, locale="en-US")
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        page.add_init_script(seed_script)
        page.goto((APP / "index.html").as_uri())
        page.wait_for_timeout(300)
        page.screenshot(path=OUT / f"overview-{width}.png", full_page=True)
        overflow = page.evaluate("document.documentElement.scrollWidth - innerWidth")
        check(f"no horizontal overflow at {width}px", overflow <= 0)
        if width == 320:
            for tab in ("transactions", "budgets", "settings"):
                page.click(f".tabbar [data-tab={tab}]")
                check(f"no overflow on {tab} at 320px", page.evaluate("document.documentElement.scrollWidth - innerWidth") <= 0)
            page.close()
            continue

        # Voice entry point used by the Siri Shortcut
        before = page.evaluate("JSON.parse(localStorage.getItem('tally.expenses.v1')).length")
        page.goto((APP / "index.html").as_uri() + "?add=" + "lunch%20120%20and%20grab%2035")
        page.wait_for_timeout(300)
        after = page.evaluate("JSON.parse(localStorage.getItem('tally.expenses.v1')).length")
        check("?add= saves two expenses", after - before == 2)
        check("toast offers undo", page.is_visible("#toastActions button"))
        page.click("#toastActions button:last-child")
        check("undo removes them", page.evaluate("JSON.parse(localStorage.getItem('tally.expenses.v1')).length") == before)

        for period in ("week", "year"):
            page.click(f"[data-period={period}]")
            page.screenshot(path=OUT / f"overview-{period}.png", full_page=False)
        page.click("[data-period=month]")
        page.click("#prevPeriod")
        check("previous month label", page.inner_text("#periodLabel") != "")
        page.click("[data-period=month]")

        page.click(".tabbar [data-tab=transactions]")
        page.screenshot(path=OUT / "activity.png")
        page.fill("#txSearch", "netflix")
        check("search filters", page.locator("#txList .tx").count() >= 1 and all(
            "Netflix" in t for t in page.locator("#txList .tx .title").all_inner_texts()))
        page.fill("#txSearch", "")
        page.dispatch_event("#txSearch", "input")

        page.locator("#txList .tx").first.click()
        page.wait_for_timeout(100)
        page.screenshot(path=OUT / "edit-sheet.png")
        page.fill("#editForm [name=amount]", "999")
        page.click("button[form=editForm]")
        check("edit saves amount", "999" in page.inner_text("#txList"))

        page.click(".tabbar [data-tab=budgets]")
        page.screenshot(path=OUT / "budgets.png", full_page=True)
        page.click(".tabbar [data-tab=settings]")
        page.screenshot(path=OUT / "settings.png", full_page=True)

        page.click(".tabbar [data-tab=overview]")
        page.click("#recordButton")
        page.wait_for_timeout(300)
        page.fill("#recInput", "dinner 450 and parking 60 yesterday")
        page.dispatch_event("#recInput", "input")
        page.screenshot(path=OUT / "record-sheet.png")
        check("record preview shows 2 rows", page.locator("#recPreview .tx").count() == 2)
        page.close()
    browser.close()

for name, ok in checks:
    print(("PASS " if ok else "FAIL ") + name)
print("JS errors:", errors or "none")
sys.exit(0 if all(ok for _, ok in checks) else 1)
