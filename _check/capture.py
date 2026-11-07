"""Contact sheet of the key screens (light + dark + zh) for the judge."""
import functools
import http.server
import json
import sys
import threading
from pathlib import Path

from PIL import Image
from playwright.sync_api import sync_playwright

sys.path.insert(0, str(Path(__file__).resolve().parent))
from audit_all_seed import expenses  # noqa: E402

APP = Path(__file__).resolve().parent.parent
OUT = Path(__file__).resolve().parent / f"sheet-{sys.argv[1]}.png"


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), functools.partial(Quiet, directory=str(APP)))
threading.Thread(target=server.serve_forever, daemon=True).start()
BASE = f"http://127.0.0.1:{server.server_port}/index.html"

SHOTS = [
    ("light", "US", []), ("light", "US", ["#view-overview .block:nth-of-type(4)"]),
    ("light", "US", ["click:.tabbar [data-tab=transactions]"]), ("light", "US", ["click:.tabbar [data-tab=budgets]"]),
    ("light", "US", ["record"]), ("light", "US", ["click:#shareButton"]),
    ("dark", "US", []), ("dark", "US", ["click:.tabbar [data-tab=transactions]"]),
    ("dark", "US", ["record"]), ("light", "TW", []), ("light", "ID", ["click:.tabbar [data-tab=settings]"]),
    ("dark", "TW", ["click:#shareButton"]),
]
REGION = {"US": ("en-US", "USD", "en-US", 0), "ID": ("id-ID", "IDR", "id-ID", 1), "TW": ("zh-TW", "TWD", "zh-TW", 0)}

frames = []
with sync_playwright() as p:
    browser = p.chromium.launch(channel="msedge")
    for scheme, region, steps in SHOTS:
        context = browser.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, color_scheme=scheme)
        context.add_init_script("window.SpeechRecognition = window.webkitSpeechRecognition = class { start() {} stop() {} abort() {} };")
        page = context.new_page()
        settings = {"region": region, "budgetTotal": 30000, "budgets": {"Food": 9000},
                    **dict(zip(["locale", "currency", "lang", "weekStart"], REGION[region]))}
        page.goto(BASE)
        page.evaluate(f"localStorage.setItem('tally.expenses.v1', {json.dumps(json.dumps(expenses))});"
                      f"localStorage.setItem('tally.settings.v1', {json.dumps(json.dumps(settings))});")
        page.goto(BASE)
        page.wait_for_timeout(150)
        for step in steps:
            if step.startswith("click:"):
                page.click(step[6:])
            elif step == "record":
                page.click("#recordButton")
                page.fill("#recInput", "lunch 120 and taxi 250 yesterday")
                page.dispatch_event("#recInput", "input")
            else:
                page.locator(step).scroll_into_view_if_needed()
            page.wait_for_timeout(200)
        path = OUT.with_suffix(f".{len(frames)}.png")
        page.screenshot(path=path)
        frames.append(Image.open(path).convert("RGB").resize((390, 844)))
        path.unlink()
        context.close()
    browser.close()
server.shutdown()

columns = 6
sheet = Image.new("RGB", (columns * 400 - 10, 2 * 854 - 10), "#888888")
for i, frame in enumerate(frames):
    sheet.paste(frame, ((i % columns) * 400, (i // columns) * 854))
sheet.save(OUT)
print("saved", OUT)
