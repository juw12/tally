"""Confirms the deployed site serves the open-items release (tally-v11) and its new features work live."""
import sys
import time

from playwright.sync_api import sync_playwright

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
URL = "https://juw12.github.io/tally/"
stamp = int(time.time())
checks = []

with sync_playwright() as p:
    browser = p.chromium.launch(channel="msedge", proxy={"server": "http://localhost:3128"})
    context = browser.new_context(viewport={"width": 390, "height": 844}, service_workers="block")
    page = context.new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))

    sw_page = context.new_page()
    sw_page.goto(f"{URL}sw.js?cb={stamp}")
    sw_source = sw_page.inner_text("body")
    checks.append(("live service worker is tally-v11", "tally-v11" in sw_source))
    sw_page.close()

    response = page.goto(f"{URL}?demo=1&cb={stamp}", wait_until="networkidle")
    checks.append((f"page loads (HTTP {response.status})", response.status == 200))
    ticks = page.eval_on_selector_all("#view-overview .chart .y-tick", "n => n.map(x => x.textContent.trim())")
    checks.append((f"chart value labels live ({ticks})", len(ticks) >= 1))
    checks.append(("tap-a-bar hint live", page.locator("#view-overview .chart-hint").count() == 1))

    page.click(".tabbar [data-tab=budgets]")
    page.wait_for_timeout(300)
    suggestions = page.eval_on_selector_all("[data-suggest]", "n => n.map(x => x.textContent.trim())")
    checks.append((f"suggested limits live ({suggestions[:2]})", len(suggestions) >= 1))

    page.click(".tabbar [data-tab=overview]")
    page.wait_for_timeout(200)
    page.click("#shareButton")
    page.wait_for_timeout(400)
    page.click("#sharePreviewOpen")
    page.wait_for_timeout(300)
    checks.append(("full-size share preview live", page.locator(".lightbox img").count() == 1))
    page.keyboard.press("Escape")
    page.click("[data-close]")

    page.evaluate("openRecorder()")
    page.wait_for_timeout(200)
    page.fill("#recInput", "lunch 120 and taxi 250")
    page.dispatch_event("#recInput", "input")
    checks.append(("editable parsed rows live", page.locator("[data-heard-remove]").count() == 2))
    checks.append(("no JS errors", not errors))
    page.screenshot(path=__file__.replace("live_check_v11.py", "live-v11.png"))
    browser.close()

for name, ok in checks:
    print(("PASS " if ok else "FAIL ") + name)
sys.exit(0 if all(ok for _, ok in checks) else 1)
