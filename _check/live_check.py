"""Checks the deployed site (https://juw12.github.io/tally/) for a given release.

Usage: python live_check.py tally-v12
Runs on phone-shaped browsers: Android Chrome (Pixel 7 emulation) and iPhone Safari (WebKit, iPhone 14
emulation). Goes through the corporate proxy (proxy8.intra:80).
"""
import sys
import time

from playwright.sync_api import sync_playwright

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
VERSION = sys.argv[1] if len(sys.argv) > 1 else "tally-v12"
URL = "https://juw12.github.io/tally/"
stamp = int(time.time())
checks = []
# Corporate network: the internet is only reachable through the system proxy.
PROXY = {"server": "http://proxy8.intra:80"}

ALPHA_BOUNDS = """() => {
    const c = document.querySelector('#shareCanvas');
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let top = -1, bottom = -1;
    for (let y = 0; y < c.height; y++) {
        for (let x = 0; x < c.width; x++) {
            if (d[(y * c.width + x) * 4 + 3] > 24) { if (top < 0) top = y; bottom = y; break; }
        }
    }
    return [top, bottom];
}"""


def check(name, ok):
    checks.append((name, bool(ok)))


def run(browser, device, label):
    context = browser.new_context(**device, service_workers="block")
    page = context.new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))

    sw = context.new_page()
    sw.goto(f"{URL}sw.js?cb={stamp}")
    check(f"{label}: live service worker is {VERSION}", VERSION in sw.inner_text("body"))
    sw.close()

    response = page.goto(f"{URL}?demo=1&cb={stamp}", wait_until="networkidle")
    check(f"{label}: page loads (HTTP {response.status})", response.status == 200)
    check(f"{label}: overview budget meter has today tick", page.locator("#view-overview .meter b.today").count() >= 1)

    page.click("#shareButton")
    page.wait_for_timeout(500)
    page.click("[data-bg=transparent]")
    page.wait_for_timeout(300)
    top, bottom = page.evaluate(ALPHA_BOUNDS)
    check(f"{label}: story card inside Instagram safe zone (y {top}..{bottom})", top >= 244 and 0 < bottom <= 1676)
    page.click("[data-bg=light]")
    page.click("[data-close]")

    fresh = context.new_page()
    fresh.goto(f"{URL}?cb={stamp}", wait_until="networkidle")
    fresh.evaluate("localStorage.clear()")
    fresh.reload(wait_until="networkidle")
    check(f"{label}: first-run screen has Log by voice / Add manually",
          fresh.locator("#view-overview .empty.cta [data-record]").count() == 1)
    fresh.tap("#view-overview [data-add]") if device.get("has_touch") else fresh.click("#view-overview [data-add]")
    fresh.wait_for_timeout(300)
    check(f"{label}: Add manually opens the editor", fresh.locator("#editForm").count() == 1)
    fresh.screenshot(path=__file__.replace("live_check.py", f"live-{VERSION}-{label}.png"))
    check(f"{label}: no JS errors", not errors)
    context.close()


with sync_playwright() as p:
    android = p.chromium.launch(channel="msedge", proxy=PROXY)
    run(android, p.devices["Pixel 7"], "android")
    android.close()
    iphone = p.webkit.launch(proxy=PROXY)
    run(iphone, p.devices["iPhone 14"], "iphone")
    iphone.close()

for name, ok in checks:
    print(("PASS " if ok else "FAIL ") + name)
print(f"{sum(ok for _, ok in checks)}/{len(checks)} passed")
sys.exit(0 if all(ok for _, ok in checks) else 1)
