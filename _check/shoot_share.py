"""Checks regions/languages and renders the share cards from seeded data."""
import base64
import json
import random
import sys
from datetime import date, datetime, timedelta
from pathlib import Path

from playwright.sync_api import sync_playwright

APP = Path(__file__).resolve().parent.parent
OUT = Path(__file__).resolve().parent / "cards"
OUT.mkdir(exist_ok=True)
TODAY = date.today()

random.seed(11)
TEMPLATES = [
    ("Lunch", "Food", 90, 220), ("Coffee", "Food", 55, 160), ("Dinner", "Food", 180, 650),
    ("Grab", "Transport", 90, 320), ("MRT", "Transport", 20, 60), ("Pxmart", "Groceries", 250, 1400),
    ("Uniqlo", "Shopping", 590, 1990), ("Netflix", "Bills", 390, 390), ("Pharmacy", "Health", 120, 600),
    ("Movie", "Entertainment", 280, 560), ("7-Eleven", "Groceries", 45, 180),
]
expenses = []
for offset in range(40, -1, -1):
    day = TODAY - timedelta(days=offset)
    for n in range(random.choice([1, 2, 3])):
        desc, cat, low, high = random.choice(TEMPLATES)
        when = datetime(day.year, day.month, day.day, random.choice([8, 9, 12, 13, 15, 18, 19, 21]), random.randint(0, 59))
        expenses.append({
            "id": f"seed-{offset}-{n}", "created": int(when.timestamp() * 1000), "date": day.isoformat(),
            "desc": desc, "cat": cat, "amount": round(random.uniform(low, high) / 5) * 5, "note": "", "raw": "",
        })
settings = {"currency": "TWD", "lang": "en-US", "weekStart": 1, "budgetTotal": 30000, "budgets": {}}
seed = (
    "if (!sessionStorage.getItem('seeded')) {"
    f"localStorage.setItem('tally.expenses.v1', {json.dumps(json.dumps(expenses))});"
    f"localStorage.setItem('tally.settings.v1', {json.dumps(json.dumps(settings))});"
    "sessionStorage.setItem('seeded', '1'); }"
)

checks = []
errors = []


def check(name, condition):
    checks.append((name, bool(condition)))


def save_card(page, name):
    data_url = page.evaluate("document.querySelector('#shareCanvas').toDataURL('image/png')")
    (OUT / f"{name}.png").write_bytes(base64.b64decode(data_url.split(",")[1]))


def pick(page, group, value):
    page.click(f"[data-share={group}] [data-value={value}]")
    page.wait_for_timeout(80)


with sync_playwright() as p:
    browser = p.chromium.launch(channel="msedge")
    page = browser.new_page(viewport={"width": 390, "height": 844}, device_scale_factor=2, locale="en-US")
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    page.add_init_script(seed)
    page.goto((APP / "index.html").as_uri())
    page.wait_for_timeout(300)

    # Share cards in English
    page.click("#shareButton")
    page.wait_for_timeout(200)
    size = page.evaluate("[shareCanvas.width, shareCanvas.height]")
    check("story card is 1080x1920", size == [1080, 1920])
    page.screenshot(path=OUT / "share-sheet.png")
    for kind, fmt, theme in [("month", "story", "light"), ("week", "story", "dark"), ("day", "story", "navy"),
                             ("month", "square", "dark"), ("week", "square", "light")]:
        pick(page, "kind", kind)
        pick(page, "format", fmt)
        pick(page, "theme", theme)
        save_card(page, f"{kind}-{fmt}-{theme}")
    check("square card is 1080x1080", page.evaluate("[shareCanvas.width, shareCanvas.height]") == [1080, 1080])
    pick(page, "kind", "month")
    pick(page, "format", "story")
    pick(page, "theme", "light")
    page.check("#shareHide")
    page.wait_for_timeout(80)
    save_card(page, "month-story-hidden")
    page.uncheck("#shareHide")
    page.click("[data-close]")

    # Region: Indonesia -> Indonesian UI, rupiah, id-ID number entry
    page.click(".tabbar [data-tab=settings]")
    page.select_option("#setRegion", "ID")
    page.wait_for_timeout(150)
    check("Indonesian UI after choosing Indonesia", page.inner_text("#screenTitle") == "Pengaturan")
    check("currency switched to IDR", page.input_value("#setCurrency") == "IDR")
    check("voice language switched to id-ID", page.input_value("#setLang") == "id-ID")
    page.click(".tabbar [data-tab=overview]")
    check("rupiah formatting", "Rp" in page.inner_text(".hero .total"))
    page.screenshot(path=OUT / "overview-id.png")
    page.click(".tabbar [data-tab=transactions]")
    page.locator("#txList .tx").first.click()
    page.fill("#editForm [name=amount]", "12.500")
    page.click("button[form=editForm]")
    check("id-ID amount '12.500' saved as 12500", "12.500" in page.inner_text("#txList"))

    # Region: Taiwan -> Traditional Chinese UI
    page.click(".tabbar [data-tab=settings]")
    page.select_option("#setRegion", "TW")
    page.wait_for_timeout(150)
    check("Chinese UI after choosing Taiwan", page.inner_text("#screenTitle") == "設定")
    check("voice language switched to zh-TW", page.input_value("#setLang") == "zh-TW")
    page.screenshot(path=OUT / "settings-tw.png", full_page=True)
    page.click(".tabbar [data-tab=overview]")
    page.screenshot(path=OUT / "overview-tw.png")
    page.click("#shareButton")
    pick(page, "kind", "month")
    pick(page, "format", "story")
    pick(page, "theme", "light")
    save_card(page, "month-story-zh")
    page.click("[data-close]")

    # Explicit app language overrides region
    page.click(".tabbar [data-tab=settings]")
    page.select_option("#setUi", "en")
    page.wait_for_timeout(100)
    check("app language override keeps region", page.inner_text("#screenTitle") == "Settings" and page.input_value("#setCurrency") == "TWD")

    # Voice text in Chinese through the Siri entry point
    before = page.evaluate("JSON.parse(localStorage.getItem('tally.expenses.v1')).length")
    page.goto((APP / "index.html").as_uri() + "?add=" + "%E5%8D%88%E9%A4%90120%E5%92%8C%E8%A8%88%E7%A8%8B%E8%BB%8A250")
    page.wait_for_timeout(200)
    check("Chinese ?add= saves two", page.evaluate("JSON.parse(localStorage.getItem('tally.expenses.v1')).length") - before == 2)
    browser.close()

for name, ok in checks:
    print(("PASS " if ok else "FAIL ") + name)
print("JS errors:", errors or "none")
sys.exit(0 if all(ok for _, ok in checks) else 1)
