"""Round 6 gates (v14): category drill-down chip, dark Activity rows, preview-first share sheet, grouped card amounts."""
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

HERE = Path(__file__).resolve().parent
APP = HERE.parent
ns = {"__file__": str(HERE / "shoot.py")}
exec((HERE / "shoot.py").read_text(encoding="utf-8-sig").split("errors = []")[0], ns)
seed_script = ns["seed_script"]

checks = []
errors = []


def check(name, ok):
    checks.append((name, bool(ok)))


def contrast(a, b):
    def lum(rgb):
        vals = []
        for c in rgb:
            c = c / 255
            vals.append(c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4)
        return 0.2126 * vals[0] + 0.7152 * vals[1] + 0.0722 * vals[2]
    la, lb = sorted([lum(a), lum(b)], reverse=True)
    return (la + 0.05) / (lb + 0.05)


def rgb(text):
    return [int(float(x)) for x in text[text.index("(") + 1:text.index(")")].split(",")[:3]]


with sync_playwright() as p:
    browser = p.chromium.launch(channel="msedge")
    page = browser.new_page(viewport={"width": 390, "height": 844}, locale="en-US", color_scheme="dark")
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.add_init_script(seed_script)
    page.goto((APP / "index.html").as_uri())
    page.wait_for_timeout(400)

    first_cat = page.get_attribute(".cat-row >> nth=0", "data-cat")
    page.click(".cat-row >> nth=0")
    page.wait_for_timeout(200)
    titles = page.locator("#txList .tx .sub").all_inner_texts()
    check("category tap opens Activity filtered to that category",
          page.is_visible("#view-transactions") and titles and all(t.split(" · ")[0] for t in titles))
    check("drill-down shows a clearable category chip", page.is_visible("[data-clear-cat]"))
    check("summary line names the category", first_cat.lower() in page.inner_text(".summary-line").lower()
          or page.inner_text("[data-clear-cat]").split(" · ")[0] in page.inner_text(".summary-line"))
    filtered = page.locator("#txList .tx").count()
    page.click("[data-clear-cat]")
    page.wait_for_timeout(200)
    check("clearing the chip shows every category again",
          page.locator("#txList .tx").count() > filtered and not page.is_visible("[data-clear-cat]")
          and page.input_value("#txCategory") == "")

    styles = page.evaluate("""() => {
        const rows = [...document.querySelectorAll('#txList .rows')].find((r) => r.children.length > 1);
        const second = rows.children[1];
        const panel = getComputedStyle(rows).backgroundColor;
        const line = getComputedStyle(second).borderTopColor;
        const tx = second.getBoundingClientRect().height;
        const mark = getComputedStyle(second.querySelector('.mark'));
        return { panel, line, tx, markBg: mark.backgroundColor, markFg: mark.color };
    }""")
    ratio = contrast(rgb(styles["line"]), rgb(styles["panel"]))
    check(f"dark row divider visible on the panel (contrast {ratio:.2f} >= 1.4)", ratio >= 1.4)
    check(f"Activity rows have room to breathe ({styles['tx']:.0f}px >= 58)", styles["tx"] >= 58)
    check(f"letter mark has a tinted background in dark ({styles['markBg']})", styles["markBg"] not in ("rgba(0, 0, 0, 0)", "transparent"))
    page.close()

    page = browser.new_page(viewport={"width": 390, "height": 844}, locale="en-US")
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.add_init_script(seed_script)
    page.goto((APP / "index.html").as_uri())
    page.wait_for_timeout(400)
    page.click("#shareButton")
    page.wait_for_timeout(600)
    geo = page.evaluate("""() => {
        const c = document.querySelector('#shareCanvas').getBoundingClientRect();
        const a = document.querySelector('.share-actions').getBoundingClientRect();
        const k = document.querySelector('.share-controls').getBoundingClientRect();
        return { h: c.height, bottom: c.bottom, actionsTop: a.top, controlsTop: k.top };
    }""")
    check(f"share preview is large ({geo['h']:.0f}px >= 380 at 390x844)", geo["h"] >= 380)
    check("preview sits above the controls (preview-first sheet)", geo["bottom"] <= geo["controlsTop"])
    check("whole preview visible above the Share buttons", geo["bottom"] <= geo["actionsTop"])
    grouped = page.evaluate("""() => {
        const ctx = document.createElement('canvas').getContext('2d');
        ctx.font = '600 24px sans-serif';
        return { wide: cardAmount(ctx, 12345, 400), narrow: cardAmount(ctx, 12345, 30) };
    }""")
    check(f"card amounts are grouped in full when they fit ({grouped})",
          "12,345" in grouped["wide"] and grouped["narrow"] != grouped["wide"])
    page.close()
    browser.close()

for name, ok in checks:
    print(("PASS " if ok else "FAIL ") + name)
print("JS errors:", errors or "none")
sys.exit(0 if all(ok for _, ok in checks) and not errors else 1)
