"""Round-4 (precedent study) gates.

R4.1  Story cards keep every drawn pixel inside Instagram's safe zone (y 250..1670)
      for day / week / month, hidden amounts and Chinese text.
R4.2  Square cards still fit their 1080 px canvas with a margin.
R4.3  Budget meters carry a "today" tick at elapsed/span of the month (Toshl precedent).
R4.4  Empty Overview / Activity / Categories show a call to action that opens the recorder
      or the manual editor; search with no matches stays a plain message.
R4.5  New strings exist in all four UI languages.
R4.6  CTA buttons are at least 44 px tall; no console errors.
"""
import json
import re
import sys
from datetime import date, datetime, timedelta
from pathlib import Path

from playwright.sync_api import sync_playwright

APP = Path(__file__).resolve().parent.parent
SAFE_TOP = 250
SAFE_BOTTOM = 1920 - 250
TODAY = date.today()

checks = []
errors = []


def check(name, condition, detail=""):
    checks.append((name, bool(condition), detail))


expenses = []
for offset in range(35, -1, -1):
    day = TODAY - timedelta(days=offset)
    for n, (desc, cat, amount) in enumerate([("Lunch", "Food", 160), ("Grab", "Transport", 210), ("Pxmart", "Groceries", 640)][: 1 + offset % 3]):
        when = datetime(day.year, day.month, day.day, 9 + 4 * n, 15)
        expenses.append({
            "id": f"r4-{offset}-{n}", "created": int(when.timestamp() * 1000), "date": day.isoformat(),
            "desc": desc, "cat": cat, "amount": amount, "note": "", "raw": "",
        })
settings = {"currency": "TWD", "lang": "en-US", "weekStart": 1, "budgetTotal": 30000,
            "budgets": {"Food": 6000, "Transport": 4000}}
seed = (
    "if (!sessionStorage.getItem('seeded')) {"
    f"localStorage.setItem('tally.expenses.v1', {json.dumps(json.dumps(expenses))});"
    f"localStorage.setItem('tally.settings.v1', {json.dumps(json.dumps(settings))});"
    "sessionStorage.setItem('seeded', '1'); }"
)

ALPHA_BOUNDS = """() => {
    const c = document.querySelector('#shareCanvas');
    const data = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let top = -1, bottom = -1;
    for (let y = 0; y < c.height; y++) {
        const row = y * c.width * 4;
        for (let x = 0; x < c.width; x++) {
            if (data[row + x * 4 + 3] > 24) { if (top < 0) top = y; bottom = y; break; }
        }
    }
    return [top, bottom, c.width, c.height];
}"""


def pick(page, group, value):
    if group == "theme":
        page.click(f"[data-bg={value}]")
    else:
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

    # R4.1 / R4.2 share-card bounds (transparent sticker = alpha shows exactly what is drawn)
    page.click("#shareButton")
    page.wait_for_timeout(200)
    pick(page, "theme", "transparent")
    for kind in ["day", "week", "month"]:
        pick(page, "kind", kind)
        pick(page, "format", "story")
        top, bottom, _, height = page.evaluate(ALPHA_BOUNDS)
        check(f"R4.1 {kind} story inside safe zone", height == 1920 and top >= SAFE_TOP - 6 and bottom <= SAFE_BOTTOM + 6,
              f"content y {top}..{bottom}")
        pick(page, "format", "square")
        top, bottom, _, height = page.evaluate(ALPHA_BOUNDS)
        check(f"R4.2 {kind} square keeps margins", height == 1080 and top >= 40 and bottom <= 1040, f"content y {top}..{bottom}")
    pick(page, "format", "story")
    pick(page, "kind", "month")
    page.check("#shareHide")
    page.wait_for_timeout(80)
    top, bottom, _, _ = page.evaluate(ALPHA_BOUNDS)
    check("R4.1 hidden-amounts story inside safe zone", top >= SAFE_TOP - 6 and bottom <= SAFE_BOTTOM + 6, f"content y {top}..{bottom}")
    page.uncheck("#shareHide")
    page.click("[data-close]")

    # R4.3 budget "today" ticks
    page.click(".tabbar [data-tab=budgets]")
    page.wait_for_timeout(150)
    ticks = page.locator("#view-budgets .meter b.today")
    span = (date(TODAY.year + (TODAY.month == 12), TODAY.month % 12 + 1, 1) - date(TODAY.year, TODAY.month, 1)).days
    expected = round(TODAY.day / span * 100, 1)
    lefts = [float(re.sub(r"[^0-9.]", "", ticks.nth(i).get_attribute("style"))) for i in range(ticks.count())]
    check("R4.3 one tick per set budget (total + 2 categories)", ticks.count() == 3, f"{ticks.count()} ticks")
    check("R4.3 tick sits at elapsed/span of month", lefts and all(abs(v - expected) < 0.2 for v in lefts), f"{lefts} vs {expected}")
    check("R4.3 tick explained on page", "tick marks today" in page.inner_text("#view-budgets"))
    page.click(".tabbar [data-tab=overview]")
    page.wait_for_timeout(150)
    check("R4.3 overview meter has today tick", page.locator("#view-overview .budget-line .meter b.today").count() == 1)

    # R4.4 empty period with data elsewhere: activity + categories CTA; search keeps plain message
    page.evaluate("ui.period = 'month'; ui.anchor = new Date(2001, 0, 15); render();")
    page.wait_for_timeout(120)
    check("R4.4 empty-period categories have CTA", page.locator("#view-overview .empty.cta [data-record]").count() == 1)
    page.click(".tabbar [data-tab=transactions]")
    page.wait_for_timeout(120)
    check("R4.4 empty-period activity has CTA", page.locator("#txList .empty.cta [data-record]").count() == 1)
    page.fill("#txSearch", "zzzz-no-such-thing")
    page.wait_for_timeout(120)
    check("R4.4 no-match search stays plain", page.locator("#txList .empty.cta").count() == 0 and page.locator("#txList .empty").count() == 1)
    page.fill("#txSearch", "")

    # Fresh install: overview + activity CTA open the recorder / editor
    fresh = browser.new_page(viewport={"width": 390, "height": 844}, locale="en-US")
    fresh.on("pageerror", lambda e: errors.append(str(e)))
    fresh.goto((APP / "index.html").as_uri())
    fresh.wait_for_timeout(250)
    check("R4.4 first-run overview has CTA", fresh.locator("#view-overview .empty.cta [data-record]").count() == 1)
    heights = fresh.evaluate("[...document.querySelectorAll('.empty-actions button')].map(b => b.getBoundingClientRect().height)")
    check("R4.6 CTA buttons >= 44 px", heights and min(heights) >= 44, str(heights))
    fresh.click("#view-overview [data-record]")
    fresh.wait_for_timeout(200)
    check("R4.4 'Log by voice' opens recorder", fresh.locator("#recInput").count() == 1)
    fresh.evaluate("closeSheet()")
    fresh.wait_for_timeout(200)
    fresh.click(".tabbar [data-tab=transactions]")
    fresh.wait_for_timeout(150)
    check("R4.4 first-run activity has CTA", fresh.locator("#txList .empty.cta [data-add]").count() == 1)
    fresh.click("#txList [data-add]")
    fresh.wait_for_timeout(200)
    check("R4.4 'Add manually' opens editor", fresh.locator("#editForm").count() == 1)
    browser.close()

# R4.5 strings in every language
i18n = (APP / "i18n.js").read_text(encoding="utf-8")
for key in ["logByVoice", "addManually", "emptyPeriodHint", "paceTickHint"]:
    count = len(re.findall(rf"\b{key}:", i18n))
    check(f"R4.5 '{key}' in 4 languages", count == 4, f"{count}")

check("R4.6 no console errors", not errors, "; ".join(errors[:3]))

failed = 0
for name, ok, detail in checks:
    print(f"{'PASS' if ok else 'FAIL'}  {name}  {detail}")
    failed += not ok
print(f"\n{len(checks) - failed}/{len(checks)} passed")
sys.exit(1 if failed else 0)
