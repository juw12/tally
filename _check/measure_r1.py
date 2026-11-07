"""Round-2/1 metrics: share buttons visible without scrolling; settings label line counts (ID/EN/ZH)."""
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
OUT = Path(__file__).resolve().parent / ("measure-" + (sys.argv[1] if len(sys.argv) > 1 else "run"))
OUT.mkdir(exist_ok=True)


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), functools.partial(Quiet, directory=str(APP)))
threading.Thread(target=server.serve_forever, daemon=True).start()
BASE = f"http://127.0.0.1:{server.server_port}/index.html"

REGIONS = {"US": ("en-US", "USD", "en-US", 0), "ID": ("id-ID", "IDR", "id-ID", 1), "TW": ("zh-TW", "TWD", "zh-TW", 0)}
results = {}

with sync_playwright() as playwright:
    browser = playwright.chromium.launch()
    for width, height in [(390, 844), (320, 640), (375, 667)]:
        for region, (locale, currency, lang, week_start) in REGIONS.items():
            settings = {"region": region, "currency": currency, "lang": lang, "weekStart": week_start,
                        "uiLang": "auto", "budgetTotal": 30000, "budgets": {}}
            context = browser.new_context(viewport={"width": width, "height": height}, device_scale_factor=2,
                                          service_workers="block")
            context.add_init_script(
                f"localStorage.setItem('tally.expenses.v1', {json.dumps(json.dumps(expenses))});"
                f"localStorage.setItem('tally.settings.v1', {json.dumps(json.dumps(settings))});"
            )
            page = context.new_page()
            errors = []
            page.on("pageerror", lambda error: errors.append(str(error)))
            page.goto(BASE, wait_until="networkidle")
            tag = f"{width}_{region}"

            # Share sheet: are both action buttons inside the viewport without scrolling?
            page.click("#shareButton")
            page.wait_for_timeout(400)
            share_visible = page.evaluate("""() => ['#shareSave', '#shareSend'].every((selector) => {
                const r = document.querySelector(selector).getBoundingClientRect();
                return r.top >= 0 && r.bottom <= window.innerHeight;
            })""")
            page.screenshot(path=str(OUT / f"share_{tag}.png"))
            page.click("[data-close]")
            page.wait_for_timeout(200)

            # Settings: how many preference labels wrap past one line?
            page.click(".tabbar [data-tab=settings]")
            page.wait_for_timeout(200)
            label_lines = page.evaluate("""() => [...document.querySelectorAll('#view-settings .setting > label')]
                .slice(0, 5).map((label) => {
                    const own = [...label.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join('');
                    const range = document.createRange();
                    const textNode = [...label.childNodes].find((n) => n.nodeType === 3);
                    range.selectNodeContents(textNode);
                    const lineHeight = parseFloat(getComputedStyle(label).lineHeight) || 20;
                    return { text: own.trim(), lines: Math.round(range.getBoundingClientRect().height / lineHeight) };
                })""")
            overflow = page.evaluate("() => document.documentElement.scrollWidth > window.innerWidth")
            page.screenshot(path=str(OUT / f"settings_{tag}.png"))
            results[tag] = {
                "share_buttons_visible": share_visible,
                "wrapped_labels": [l["text"] for l in label_lines if l["lines"] > 1],
                "hscroll": overflow,
                "errors": errors,
            }
            context.close()
    browser.close()

for tag, result in results.items():
    print(tag, json.dumps(result, ensure_ascii=False))
