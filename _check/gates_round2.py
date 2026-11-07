"""Checks for the second refine pass: share actions reachable, live no-amount hint, consistent amounts, settings rows."""
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


def open_app(browser, width, height, region="US", currency="USD", lang="en-US"):
    settings = {"region": region, "currency": currency, "lang": lang, "weekStart": 1, "uiLang": "auto",
                "budgetTotal": 30000, "budgets": {}}
    context = browser.new_context(viewport={"width": width, "height": height}, service_workers="block")
    context.add_init_script(
        f"localStorage.setItem('tally.expenses.v1', {json.dumps(json.dumps(expenses))});"
        f"localStorage.setItem('tally.settings.v1', {json.dumps(json.dumps(settings))});"
    )
    page = context.new_page()
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.goto(BASE, wait_until="networkidle")
    return context, page, errors


with sync_playwright() as playwright:
    browser = playwright.chromium.launch()
    all_errors = []

    # Share: Save/Share reachable without scrolling on small phones.
    for width, height in [(320, 568), (375, 667), (390, 844)]:
        context, page, errors = open_app(browser, width, height)
        page.click("#shareButton")
        page.wait_for_timeout(300)
        visible = page.evaluate("""() => ['#shareSave', '#shareSend'].every((s) => {
            const r = document.querySelector(s).getBoundingClientRect();
            return r.top >= 0 && r.bottom <= window.innerHeight;
        })""")
        check(f"share buttons visible without scrolling at {width}x{height}", visible)
        all_errors += errors
        context.close()

    # Record sheet: typing text with no amount says so immediately; adding a number clears it.
    context, page, errors = open_app(browser, 390, 844)
    page.evaluate("openRecorder()")
    page.wait_for_timeout(200)
    page.fill("#recInput", "coffee")
    page.dispatch_event("#recInput", "input")
    hint = page.inner_text("#recStatus")
    check(f"live hint for text without an amount ({hint!r})", "No amount" in hint)
    page.fill("#recInput", "coffee 65")
    page.dispatch_event("#recInput", "input")
    status_after = page.inner_text("#recStatus").strip()
    listening_text = page.evaluate("t('listening')")
    keyboard_text = page.evaluate("t('useKeyboardMic')")
    check("no-amount hint clears once an amount is typed", status_after != hint.strip())
    check(
        f"status falls back to the live state, not blank ({status_after!r})",
        status_after in (listening_text, keyboard_text),
    )
    check("preview shows the parsed row", page.locator("#recPreview .tx").count() == 1)
    all_errors += errors
    context.close()

    # Budget card projects the month-end total from the pace so far; the share preview fits above the buttons.
    context, page, errors = open_app(browser, 390, 844)
    pace = page.inner_text("#view-overview .budget-line")
    check(f"budget card shows a month-end projection ({pace.splitlines()[-1]!r})", "At this pace" in pace)
    pace_colours = page.evaluate("""() => {
        const notes = [...document.querySelectorAll('#view-overview .budget-line .note')];
        const projection = notes[notes.length - 1];
        const overage = projection.querySelector('.neg');
        const probe = document.createElement('span');
        probe.style.color = 'var(--negative)';
        document.body.append(probe);
        const negative = getComputedStyle(probe).color;
        probe.remove();
        return {
            sentence: getComputedStyle(projection).color,
            overage: overage ? getComputedStyle(overage).color : null,
            negative,
        };
    }""")
    check(
        f"projection sentence is neutral, only the overage is red ({pace_colours})",
        pace_colours["sentence"] != pace_colours["negative"] and pace_colours["overage"] == pace_colours["negative"],
    )
    page.click("#shareButton")
    page.wait_for_timeout(300)
    badge = page.evaluate("""() => {
        const on = document.querySelector('.bg-swatch.on');
        const off = document.querySelector('.bg-swatch:not(.on)');
        return {
            on: getComputedStyle(on, '::after').content,
            off: getComputedStyle(off, '::after').content,
            width: getComputedStyle(on, '::after').width,
        };
    }""")
    check(f"selected background shows a check badge, others do not ({badge})", badge["on"] != "none" and badge["off"] == "none")
    fits = page.evaluate("""() => document.querySelector('#shareCanvas').getBoundingClientRect().bottom
        <= document.querySelector('.share-actions').getBoundingClientRect().top""")
    check("whole share preview visible above the buttons at 390x844", fits)
    all_errors += errors
    context.close()

    # Category shares name their count; unset category limits read as an action, not a disabled box.
    context, page, errors = open_app(browser, 390, 844)
    shares = page.eval_on_selector_all("#view-overview .cat-row .share", "nodes => nodes.map(n => n.textContent.trim())")
    check(f"category shares name the count ({shares[:2]})", bool(shares) and all("expense" in s for s in shares))
    page.click(".tabbar [data-tab=budgets]")
    page.wait_for_timeout(200)
    empty_fields = page.evaluate("""() => [...document.querySelectorAll('#view-budgets input[data-budget]:not([data-budget=__total])')]
        .filter((input) => !input.value)
        .map((input) => ({ placeholder: input.placeholder, border: getComputedStyle(input).borderTopStyle }))""")
    check(
        f"unset category limits say 'Set limit' in a dashed field ({empty_fields[:1]})",
        bool(empty_fields) and all(f["placeholder"] == "Set limit" and f["border"] == "dashed" for f in empty_fields),
    )
    all_errors += errors
    context.close()

    # Amounts below 10,000 read the same way in English and Chinese.
    legends = {}
    for region, currency, lang in [("US", "USD", "en-US"), ("TW", "USD", "zh-TW")]:
        context, page, errors = open_app(browser, 390, 844, region, currency, lang)
        legends[region] = page.inner_text("#view-overview .legend")
        all_errors += errors
        context.close()
    check(f"EN chart legend uses full amounts ({legends['US']!r})", "K" not in legends["US"] and "," in legends["US"])
    check(f"ZH chart legend uses grouped amounts ({legends['TW']!r})", "," in legends["TW"])

    # Settings rows never squeeze a label onto two lines (Indonesian, 320 px).
    context, page, errors = open_app(browser, 320, 640, "ID", "IDR", "id-ID")
    page.click(".tabbar [data-tab=settings]")
    page.wait_for_timeout(200)
    wrapped = page.evaluate("""() => [...document.querySelectorAll('#view-settings .setting > label')].filter((label) => {
        const node = [...label.childNodes].find((n) => n.nodeType === 3);
        if (!node) return false;
        const range = document.createRange();
        range.selectNodeContents(node);
        return range.getClientRects().length > 1;
    }).map((label) => label.textContent.trim())""")
    check(f"no wrapped setting labels in Indonesian at 320 px ({wrapped})", not wrapped)
    all_errors += errors
    context.close()
    browser.close()

check(f"no JS errors ({all_errors or 'none'})", not all_errors)
for name, ok in checks:
    print(("PASS " if ok else "FAIL ") + name)
sys.exit(0 if all(ok for _, ok in checks) else 1)
