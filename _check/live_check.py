"""Verifies the deployed site: loads over HTTPS, no errors, service worker active, ?add= works, manifest served."""
import sys
import time

from playwright.sync_api import sync_playwright

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
URL = "https://juw12.github.io/tally/"
stamp = int(time.time())
checks = []

with sync_playwright() as p:
    browser = p.chromium.launch(channel="msedge", proxy={"server": "http://localhost:3128"})
    context = browser.new_context(viewport={"width": 390, "height": 844})
    page = context.new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    response = page.goto(f"{URL}?cb={stamp}", wait_until="networkidle")
    checks.append((f"page loads (HTTP {response.status})", response.status == 200))
    checks.append(("title is Tally", page.title() == "Tally"))
    page.wait_for_timeout(1500)
    sw = page.evaluate("navigator.serviceWorker.getRegistration().then(r => !!(r && (r.active || r.installing || r.waiting)))")
    checks.append(("service worker registered", sw))
    manifest = page.request.get(URL + "manifest.json")
    checks.append(("manifest served", manifest.ok and manifest.json()["short_name"] == "Tally"))
    page.goto(URL + "?add=lunch%20120%20and%20taxi%20250")
    page.wait_for_timeout(800)
    saved = page.evaluate("JSON.parse(localStorage.getItem('tally.expenses.v1') || '[]').length")
    checks.append((f"?add= saved {saved} expenses on the live site", saved == 2))
    checks.append(("no JS errors", not [e for e in errors if "speech" not in e.lower()]))
    page.screenshot(path=__file__.replace("live_check.py", "live.png"))
    browser.close()

for name, ok in checks:
    print(("PASS " if ok else "FAIL ") + name)
