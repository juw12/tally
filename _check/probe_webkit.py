"""Quick WebKit probe: does the app boot, and are there page errors?"""
import functools
import http.server
import threading
from pathlib import Path

from playwright.sync_api import sync_playwright

APP = Path(__file__).resolve().parent.parent


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), functools.partial(Quiet, directory=str(APP)))
threading.Thread(target=server.serve_forever, daemon=True).start()
url = f"http://127.0.0.1:{server.server_port}/index.html"

with sync_playwright() as playwright:
    browser = playwright.webkit.launch(proxy={"server": "http://localhost:3128", "bypass": "127.0.0.1,localhost,<-loopback>"})
    context = browser.new_context(viewport={"width": 390, "height": 844}, service_workers="block")
    page = context.new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))
    page.on("console", lambda m: errors.append(f"console {m.type}: {m.text}") if m.type in ("error", "warning") else None)
    page.goto(url, wait_until="load", timeout=20000)
    page.wait_for_timeout(1500)
    print("errors:", errors)
    print("overview text:", page.evaluate("document.querySelector('#view-overview')?.innerText.slice(0, 160)"))
    print("overview visible:", page.is_visible("#view-overview"))
    browser.close()

