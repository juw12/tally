"""First-run (no data) screenshots for the council: overview, budgets, activity at 390 px."""
import functools
import http.server
import sys
import threading
from pathlib import Path

from playwright.sync_api import sync_playwright
from PIL import Image

label = sys.argv[1] if len(sys.argv) > 1 else "v0"
APP = Path(__file__).resolve().parent.parent
OUT = Path(__file__).resolve().parent / "council"
OUT.mkdir(exist_ok=True)


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), functools.partial(Quiet, directory=str(APP)))
threading.Thread(target=server.serve_forever, daemon=True).start()
url = f"http://127.0.0.1:{server.server_port}/index.html"

shots = []
with sync_playwright() as playwright:
    browser = playwright.chromium.launch()
    context = browser.new_context(viewport={"width": 390, "height": 844}, service_workers="block")
    page = context.new_page()
    page.goto(url, wait_until="networkidle")
    for tab in ["overview", "transactions", "budgets"]:
        page.click(f".tabbar [data-tab={tab}]")
        page.wait_for_timeout(250)
        path = OUT / f"{label}-firstrun-{tab}.png"
        page.screenshot(path=str(path))
        shots.append(path)
    browser.close()

sheet = Image.new("RGB", (390 * len(shots) + 12 * (len(shots) - 1), 844), "#cccccc")
for index, path in enumerate(shots):
    sheet.paste(Image.open(path).convert("RGB"), (index * 402, 0))
sheet.save(OUT / f"{label}-firstrun.jpg", quality=86)
print(OUT / f"{label}-firstrun.jpg")
