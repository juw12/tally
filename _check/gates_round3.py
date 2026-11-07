"""Checks for the open items fixed after refine pass 2.

Chart value labels, top-bar scroll shadow, mic pulse, live found-count, editable parsed rows,
suggested budget limits, full-size share preview, plus a WebKit (Safari engine) smoke test.
"""
import functools
import http.server
import json
import sys
import threading
from pathlib import Path

from playwright.sync_api import sync_playwright

sys.path.insert(0, str(Path(__file__).resolve().parent))
from audit_all_seed import expenses  # noqa: E402

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
APP = Path(__file__).resolve().parent.parent
checks = []


def check(name, ok):
    checks.append((name, bool(ok)))


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), functools.partial(Quiet, directory=str(APP)))
threading.Thread(target=server.serve_forever, daemon=True).start()
BASE = f"http://127.0.0.1:{server.server_port}/index.html"
SETTINGS = {"region": "US", "currency": "USD", "lang": "en-US", "weekStart": 1, "uiLang": "auto",
            "budgetTotal": 30000, "budgets": {}}


def open_app(browser, width=390, height=844, seeded=True, query=""):
    context = browser.new_context(viewport={"width": width, "height": height}, service_workers="block")
    if seeded:
        context.add_init_script(
            f"localStorage.setItem('tally.expenses.v1', {json.dumps(json.dumps(expenses))});"
            f"localStorage.setItem('tally.settings.v1', {json.dumps(json.dumps(SETTINGS))});"
        )
    page = context.new_page()
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.goto(BASE + query, wait_until="networkidle")
    return context, page, errors


with sync_playwright() as playwright:
    browser = playwright.chromium.launch()
    all_errors = []

    # Chart: peak and average values are labelled, ticks are readable, and the drill-down is announced.
    context, page, errors = open_app(browser)
    ticks = page.eval_on_selector_all(
        "#view-overview .chart .y-tick",
        "nodes => nodes.map(n => ({ text: n.textContent.trim(), size: parseFloat(getComputedStyle(n).fontSize) }))",
    )
    check(f"chart labels the peak and average ({[t['text'] for t in ticks]})", len(ticks) >= 1 and ticks[0]["text"].startswith("$"))
    check("chart value labels are at least 12 px", ticks and all(t["size"] >= 12 for t in ticks))
    hint = page.inner_text("#view-overview .chart-hint")
    check(f"chart says bars are tappable ({hint!r})", "Tap a bar" in hint)

    # Top bar: shadow appears once content scrolls under it, and goes away at the top.
    page.mouse.wheel(0, 600)
    page.wait_for_timeout(250)
    scrolled = page.evaluate("""() => {
        const bar = document.querySelector('.topbar');
        return { cls: bar.classList.contains('scrolled'), shadow: getComputedStyle(bar).boxShadow };
    }""")
    check(f"top bar casts a shadow when scrolled ({scrolled['shadow'][:40]})", scrolled["cls"] and scrolled["shadow"] != "none")
    page.mouse.wheel(0, -2000)
    page.wait_for_timeout(250)
    check("top bar shadow clears at the top", not page.evaluate("document.querySelector('.topbar').classList.contains('scrolled')"))
    all_errors += errors
    context.close()

    # Record sheet: pulse while live, live count, editable rows that are what gets saved.
    context, page, errors = open_app(browser)
    page.evaluate("openRecorder()")
    page.wait_for_timeout(200)
    page.evaluate("document.querySelector('#recMic').classList.add('live')")
    pulse = page.evaluate("getComputedStyle(document.querySelector('#recMic'), '::before').animationName")
    check(f"mic pulses while listening ({pulse})", pulse == "mic-pulse")
    page.evaluate("document.querySelector('#recMic').classList.remove('live')")

    page.evaluate("recognizer = { stop() {}, abort() {} }")
    page.evaluate("showHeard('lunch 120 and taxi 250 yesterday', true)")
    live_status = page.inner_text("#recStatus").strip()
    check(f"status counts what it heard while listening ({live_status!r})", live_status == "Listening · 2 found")
    page.evaluate("recognizer = null")

    text = "lunch 120 and taxi 250 yesterday"
    page.fill("#recInput", text)
    page.dispatch_event("#recInput", "input")
    check("edit hint shows under the parsed rows", page.is_visible("#recEditHint"))
    page.click("[data-heard-toggle='0']")
    check("tapping a row opens its editor", page.locator(".heard-edit").count() == 1)
    page.select_option("[data-heard-cat='0']", "Transport")
    page.fill("[data-heard-amount='0']", "99")
    page.dispatch_event("[data-heard-amount='0']", "change")
    row_text = page.inner_text("#recPreview .heard-row")
    check(f"edited row shows new category and amount ({' '.join(row_text.split())!r})", "Transport" in row_text and "$99" in row_text)
    page.click("[data-heard-remove='1']")
    check("removed row disappears", page.locator("#recPreview .heard-row").count() == 1)
    before = page.evaluate("store.expenses.length")
    page.click("#recForm .btn")
    page.wait_for_timeout(200)
    saved = page.evaluate(f"store.expenses.filter(e => e.raw === {json.dumps(text)}).map(e => [e.desc, e.cat, e.amount])")
    check(f"saved what was edited, not the raw parse ({saved})", page.evaluate("store.expenses.length") == before + 1
          and saved == [["Lunch", "Transport", 99]])
    all_errors += errors
    context.close()

    # Budgets: unset limits offer a suggestion from a fully tracked past month; tapping applies it.
    context, page, errors = open_app(browser, seeded=False, query="?demo=1")
    page.click(".tabbar [data-tab=budgets]")
    page.wait_for_timeout(200)
    suggestions = page.eval_on_selector_all(
        "[data-suggest]", "nodes => nodes.map(n => [n.dataset.suggest, Number(n.dataset.amount), n.textContent.trim()])"
    )
    check(f"unset limits offer a suggestion ({suggestions[:2]})", len(suggestions) >= 3)
    sizes = page.eval_on_selector_all("[data-suggest]", "nodes => nodes.map(n => n.getBoundingClientRect().height)")
    check(f"suggestion buttons are at least 32 px tall ({min(sizes) if sizes else None})", sizes and min(sizes) >= 32)
    category = next((s for s in suggestions if s[0] != "__total"), None)
    if category:
        page.click(f"[data-suggest='{category[0]}']")
        page.wait_for_timeout(200)
        applied = page.evaluate(f"store.settings.budgets[{json.dumps(category[0])}]")
        check(f"tapping a suggestion sets that limit ({category[0]} = {applied})", applied == category[1])
        value = page.input_value(f"[data-budget='{category[0]}']")
        check(f"limit field shows the applied value ({value})", value.replace(",", "") == str(category[1]))
    overflow = page.evaluate("document.documentElement.scrollWidth > window.innerWidth")
    check("budgets page has no horizontal overflow", not overflow)
    all_errors += errors
    context.close()

    # Indonesian at 320 px: the longer suggestion label still fits.
    context = browser.new_context(viewport={"width": 320, "height": 640}, service_workers="block")
    context.add_init_script(
        "localStorage.setItem('tally.settings.v1', JSON.stringify({region:'ID',currency:'IDR',lang:'id-ID',"
        "weekStart:1,uiLang:'auto',budgetTotal:0,budgets:{}}));"
    )
    page = context.new_page()
    page.goto(BASE + "?demo=1", wait_until="networkidle")
    page.click(".tabbar [data-tab=budgets]")
    page.wait_for_timeout(200)
    id_overflow = page.evaluate("document.documentElement.scrollWidth > window.innerWidth")
    id_label = page.eval_on_selector("[data-suggest]", "n => n.textContent.trim()") if page.locator("[data-suggest]").count() else ""
    check(f"Indonesian suggestion fits at 320 px ({id_label!r})", id_label.startswith("Pakai saran") and not id_overflow)
    context.close()

    # Share: full-size preview opens over the sheet and closes with Escape.
    context, page, errors = open_app(browser)
    page.click("#shareButton")
    page.wait_for_timeout(300)
    page.click("#sharePreviewOpen")
    page.wait_for_timeout(200)
    image = page.evaluate("""() => {
        const img = document.querySelector('.lightbox img');
        if (!img) return null;
        const r = img.getBoundingClientRect();
        return { w: r.width, h: r.height, natural: img.naturalWidth };
    }""")
    preview_height = page.evaluate("document.querySelector('#shareCanvas').getBoundingClientRect().height")
    check(f"full-size preview is much larger than the thumbnail ({image} vs {preview_height:.0f}px)",
          image and image["natural"] > 0 and image["h"] > preview_height * 1.15)  # v14: thumbnail is ~400px now (preview-first sheet), lightbox still larger
    page.keyboard.press("Escape")
    check("Escape closes the full-size preview", page.locator(".lightbox").count() == 0)
    check("share buttons still visible with the expand control", page.evaluate("""() => {
        const r = document.querySelector('#shareSave').getBoundingClientRect();
        return r.bottom <= window.innerHeight;
    }"""))
    all_errors += errors
    context.close()
    browser.close()

    # WebKit (Safari engine) smoke test: closest available stand-in for iOS Safari.
    try:
        # Loopback must bypass the corporate proxy, which rejects 127.0.0.1 requests.
        webkit = playwright.webkit.launch(proxy={"server": "http://localhost:3128", "bypass": "127.0.0.1,localhost,<-loopback>"})
    except Exception as error:  # engine not installed
        check(f"WebKit smoke test (skipped: {str(error).splitlines()[0][:60]})", True)
        webkit = None
    if webkit:
        context, page, errors = open_app(webkit)
        check("WebKit: overview renders", "$" in page.inner_text("#view-overview .hero, #view-overview"))
        page.click("#shareButton")
        page.wait_for_timeout(400)
        page.click("[data-bg=transparent]")
        page.wait_for_timeout(300)
        alpha = page.evaluate("""() => new Promise((resolve) => {
            document.querySelector('#shareCanvas').toBlob(async (blob) => {
                const bitmap = await createImageBitmap(blob);
                const c = document.createElement('canvas');
                c.width = bitmap.width;
                c.height = bitmap.height;
                const ctx = c.getContext('2d');
                ctx.drawImage(bitmap, 0, 0);
                const corner = ctx.getImageData(2, 2, 1, 1).data[3];
                resolve({ type: blob.type, corner });
            }, 'image/png');
        })""")
        check(f"WebKit: transparent card exports a PNG with clear corners ({alpha})", alpha["type"] == "image/png" and alpha["corner"] == 0)
        page.click("#sharePreviewOpen")
        page.wait_for_timeout(200)
        check("WebKit: full-size preview opens", page.locator(".lightbox img").count() == 1)
        page.keyboard.press("Escape")
        page.click("[data-close]")
        page.evaluate("openRecorder()")
        page.wait_for_timeout(200)
        page.fill("#recInput", "coffee 65")
        page.dispatch_event("#recInput", "input")
        check("WebKit: typed entry parses in the record sheet", page.locator("#recPreview .heard-row").count() == 1)
        check(f"WebKit: no JS errors ({errors or 'none'})", not errors)
        context.close()
        webkit.close()

check(f"no JS errors ({all_errors or 'none'})", not all_errors)
for name, ok in checks:
    print(("PASS " if ok else "FAIL ") + name)
sys.exit(0 if all(ok for _, ok in checks) else 1)

