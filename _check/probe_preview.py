
import functools, http.server, json, sys, threading
from pathlib import Path
from playwright.sync_api import sync_playwright
sys.path.insert(0, r"C:\Users\juwen_lie\.vector\scratch\session_mw5raqtz1ml6a9qa\voice-expenses\_check")
from audit_all_seed import expenses
APP = Path(r"C:\Users\juwen_lie\.vector\scratch\session_mw5raqtz1ml6a9qa\voice-expenses")
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass
srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), functools.partial(Q, directory=str(APP)))
threading.Thread(target=srv.serve_forever, daemon=True).start()
with sync_playwright() as p:
    b = p.chromium.launch()
    for w, h in [(390, 844), (375, 667), (320, 568), (430, 932)]:
        c = b.new_context(viewport={"width": w, "height": h}, service_workers="block")
        c.add_init_script("localStorage.setItem('tally.expenses.v1', %s);" % json.dumps(json.dumps(expenses)))
        pg = c.new_page()
        pg.goto(f"http://127.0.0.1:{srv.server_port}/index.html", wait_until="networkidle")
        pg.click("#shareButton")
        pg.wait_for_timeout(300)
        m = pg.evaluate("""() => {
            const canvas = document.querySelector('#shareCanvas').getBoundingClientRect();
            const bar = document.querySelector('.share-actions').getBoundingClientRect();
            return {canvasTop: Math.round(canvas.top), canvasH: Math.round(canvas.height), barTop: Math.round(bar.top), vh: innerHeight};
        }""")
        m["room"] = m["barTop"] - m["canvasTop"] - 14
        m["chrome"] = m["vh"] - m["room"]
        print(w, h, m)
        c.close()
    b.close()
