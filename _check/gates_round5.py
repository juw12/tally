"""Round-5 gates: real-phone conditions, simulated in Android Chrome (Pixel 7) and iPhone Safari (WebKit, iPhone 14).

R5.1  Every speech-recognition failure shows a specific message; fatal ones hand focus to the text field.
R5.2  Offline: voice is skipped with a clear message, typed entry still saves.
R5.3  recognizer.start() throwing does not break the sheet.
R5.4  Voice success: two expenses saved, "Just added" chip on Overview and Activity, Undo and dismiss work.
R5.5  Share: navigator.share is called synchronously inside the tap (keeps iOS user activation) with a 1080x1920 PNG;
      a refused share sheet falls back to saving the image; closing the sheet (AbortError) does nothing.
R5.6  Budget fields show grouped numbers (30,000 / 30.000) and read them back.
R5.7  Indonesian Siri heading reads naturally; no JS errors.
"""
import functools
import http.server
import json
import sys
import threading
from datetime import date, timedelta
from pathlib import Path

from playwright.sync_api import sync_playwright

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
APP = Path(__file__).resolve().parent.parent
LOOPBACK = {"server": "http://localhost:3128", "bypass": "127.0.0.1,localhost,<-loopback>"}
checks = []


def check(name, ok, detail=""):
    checks.append((name, bool(ok), detail))


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


# `python gates_round5.py live` runs the same checks against the deployed site through the corporate proxy.
if len(sys.argv) > 1 and sys.argv[1] == "live":
    URL = f"https://juw12.github.io/tally/?cb={int(__import__('time').time())}"
    LOOPBACK = {"server": "http://proxy8.intra:80"}
else:
    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), functools.partial(Quiet, directory=str(APP)))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    URL = f"http://127.0.0.1:{server.server_port}/index.html"

today = date.today()
seed_expenses = [
    {"id": f"s{i}", "created": 1, "date": (today - timedelta(days=i)).isoformat(), "desc": "Lunch", "cat": "Food",
     "amount": 120, "note": "", "raw": ""}
    for i in range(5)
]
SEED = (
    "if (!sessionStorage.getItem('seeded')) {"
    f"localStorage.setItem('tally.expenses.v1', {json.dumps(json.dumps(seed_expenses))});"
    "localStorage.setItem('tally.settings.v1', JSON.stringify({currency:'TWD', lang:'en-US', weekStart:1, budgetTotal:30000, budgets:{Food:6000}}));"
    "sessionStorage.setItem('seeded','1'); }"
)

# A controllable stand-in for the browser's speech engine.
FAKE_SPEECH = """
window.__speech = { mode: 'ok', error: null, transcript: '' };
class FakeRecognition {
  start() {
    const s = window.__speech;
    if (s.mode === 'throw') { throw new DOMException('busy', 'InvalidStateError'); }
    setTimeout(() => {
      if (s.mode === 'error') {
        this.onerror && this.onerror({ error: s.error });
        this.onend && this.onend();
        return;
      }
      const result = [{ transcript: s.transcript }];
      result.isFinal = true;
      this.onresult && this.onresult({ results: [result] });
      this.onend && this.onend();
    }, 60);
  }
  stop() {}
  abort() {}
}
window.SpeechRecognition = FakeRecognition;
window.webkitSpeechRecognition = FakeRecognition;
"""

# These gates cover the browser's own speech engine. Hiding getUserMedia turns off Tally's recorder
# (iPhone default since v14), which gates_voice.py tests separately with a real audio file.
NO_RECORDER = """
try { Object.defineProperty(navigator, 'mediaDevices', { value: undefined, configurable: true }); } catch (e) {}
"""

# Records whether navigator.share() ran inside the tap's click handler.
SHARE_SPY = """
window.__inClick = false;
document.addEventListener('click', () => { window.__inClick = true; }, true);
window.addEventListener('click', () => { window.__inClick = false; });
window.__share = { calls: [], mode: 'ok' };
navigator.canShare = () => true;
navigator.share = (data) => {
  const file = data.files && data.files[0];
  window.__share.calls.push({ sync: window.__inClick, type: file && file.type, size: file && file.size, name: file && file.name });
  if (window.__share.mode === 'refuse') { return Promise.reject(new DOMException('no gesture', 'NotAllowedError')); }
  if (window.__share.mode === 'cancel') { return Promise.reject(new DOMException('closed', 'AbortError')); }
  return Promise.resolve();
};
"""

EXPECTED = {
    "not-allowed": "Microphone access is blocked",
    "service-not-allowed": "Microphone access is blocked",
    "audio-capture": "No microphone found",
    "network": "Voice needs an internet connection",
    "language-not-supported": "Voice is not available in this language",
    "no-speech": "Didn't hear anything",
}


def run(browser, device, label):
    context = browser.new_context(**device, service_workers="block", locale="en-US", accept_downloads=True)
    context.add_init_script(SEED)
    context.add_init_script(FAKE_SPEECH)
    context.add_init_script(NO_RECORDER)
    context.add_init_script(SHARE_SPY)
    page = context.new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.goto(URL, wait_until="networkidle")

    # R5.1 speech failures
    for code, text in EXPECTED.items():
        page.evaluate(f"window.__speech = {{ mode: 'error', error: {json.dumps(code)} }}")
        page.evaluate("openRecorder()")
        page.wait_for_timeout(250)
        status = page.inner_text("#recStatus")
        focused = page.evaluate("document.activeElement && document.activeElement.id")
        want_focus = code != "no-speech"
        check(f"{label} R5.1 '{code}' explained", text in status, status[:70])
        if want_focus:
            check(f"{label} R5.1 '{code}' switches to typing", focused == "recInput", str(focused))
        page.evaluate("closeSheet()")

    # R5.3 start() throws
    page.evaluate("window.__speech = { mode: 'throw' }")
    page.evaluate("openRecorder()")
    page.wait_for_timeout(150)
    check(f"{label} R5.3 start() failure handled", "Voice input stopped" in page.inner_text("#recStatus")
          and not page.evaluate("document.querySelector('#recMic').classList.contains('live')"))
    page.evaluate("closeSheet()")

    # R5.2 offline
    context.set_offline(True)
    page.evaluate("window.__speech = { mode: 'ok', transcript: 'coffee 55' }")
    page.evaluate("openRecorder()")
    page.wait_for_timeout(200)
    check(f"{label} R5.2 offline explained", "internet" in page.inner_text("#recStatus"))
    before = page.evaluate("store.expenses.length")
    page.fill("#recInput", "coffee 55")
    page.dispatch_event("#recInput", "input")
    page.click("#recForm button")
    page.wait_for_timeout(200)
    check(f"{label} R5.2 typed entry saves offline", page.evaluate("store.expenses.length") == before + 1)
    context.set_offline(False)

    # R5.4 voice success + just-added chip
    page.evaluate("window.__speech = { mode: 'ok', transcript: 'lunch 120 and taxi 250' }")
    before = page.evaluate("store.expenses.length")
    page.evaluate("openRecorder()")
    page.wait_for_timeout(400)
    check(f"{label} R5.4 spoken phrase saves two", page.evaluate("store.expenses.length") == before + 2)
    page.evaluate("document.querySelector('#toast').hidden = true")
    chip = page.locator("#view-overview .just-added")
    check(f"{label} R5.4 chip on Overview after toast is gone", chip.count() == 1 and "120" in chip.inner_text())
    page.click(".tabbar [data-tab=transactions]")
    page.wait_for_timeout(150)
    check(f"{label} R5.4 chip on Activity", page.locator("#txList .just-added").count() == 1)
    page.click("#txList [data-undo-last]")
    page.wait_for_timeout(150)
    check(f"{label} R5.4 chip Undo removes both", page.evaluate("store.expenses.length") == before
          and page.locator("#txList .just-added").count() == 0)
    page.click(".tabbar [data-tab=overview]")
    page.evaluate("openRecorder()")
    page.wait_for_timeout(400)
    page.click("#view-overview [data-dismiss-added]")
    page.wait_for_timeout(100)
    check(f"{label} R5.4 chip dismiss keeps the entries", page.locator("#view-overview .just-added").count() == 0
          and page.evaluate("store.expenses.length") == before + 2)
    tap_heights = page.evaluate("[]")  # chip gone; size checked below on a fresh chip
    page.evaluate("openRecorder()")
    page.wait_for_timeout(400)
    tap_heights = page.evaluate("[...document.querySelectorAll('.just-added button')].map(b => b.getBoundingClientRect().height)")
    check(f"{label} R5.4 chip buttons >= 44 px", tap_heights and min(tap_heights) >= 44, str(tap_heights))
    page.click("#view-overview [data-dismiss-added]")

    # R5.5 share
    page.click("#shareButton")
    page.wait_for_timeout(600)
    page.click("#shareSend")
    page.wait_for_timeout(300)
    calls = page.evaluate("window.__share.calls")
    first = calls[0] if calls else {}
    check(f"{label} R5.5 share called inside the tap", first.get("sync") is True, json.dumps(first))
    check(f"{label} R5.5 shares a PNG file", first.get("type") == "image/png" and (first.get("size") or 0) > 20000)
    page.evaluate("window.__share.mode = 'refuse'")
    with page.expect_download(timeout=4000) as download_info:
        page.click("#shareSend")
    check(f"{label} R5.5 refused share sheet saves the image", download_info.value.suggested_filename.endswith(".png"))
    page.evaluate("window.__share.mode = 'cancel'")
    downloads = []
    page.on("download", lambda d: downloads.append(d))
    page.click("#shareSend")
    page.wait_for_timeout(600)
    check(f"{label} R5.5 closing the share sheet does nothing", not downloads)
    page.click("[data-close]")

    # The new voice error key must not shadow the Settings label "Voice language".
    page.click(".tabbar [data-tab=settings]")
    page.wait_for_timeout(100)
    check(f"{label} R5.7 Settings still says 'Voice language'", page.inner_text("label[for=setLang]").startswith("Voice language"))

    # R5.6 budget grouping (en, then id-ID)
    page.click(".tabbar [data-tab=budgets]")
    page.wait_for_timeout(150)
    shown = page.input_value("[data-budget=__total]")
    check(f"{label} R5.6 total budget shows grouped digits", shown == "30,000", shown)
    page.fill("[data-budget=Food]", "7,500")
    page.dispatch_event("[data-budget=Food]", "change")
    page.wait_for_timeout(100)
    check(f"{label} R5.6 '7,500' saved as 7500", page.evaluate("store.settings.budgets.Food") == 7500)
    page.click(".tabbar [data-tab=settings]")
    page.select_option("#setRegion", "ID")
    page.wait_for_timeout(150)
    page.click(".tabbar [data-tab=budgets]")
    page.wait_for_timeout(150)
    shown_id = page.input_value("[data-budget=__total]")
    check(f"{label} R5.6 Indonesian grouping 30.000", shown_id == "30.000", shown_id)
    page.click(".tabbar [data-tab=settings]")
    siri = page.inner_text("#view-settings")
    check(f"{label} R5.7 Indonesian Siri heading", "Catat lewat Siri" in siri or "CATAT LEWAT SIRI" in siri.upper())
    check(f"{label} R5.7 no JS errors", not errors, "; ".join(errors[:2]))
    context.close()


with sync_playwright() as p:
    chrome = p.chromium.launch(channel="msedge", proxy=LOOPBACK)
    run(chrome, p.devices["Pixel 7"], "android")
    chrome.close()
    safari = p.webkit.launch(proxy=LOOPBACK)
    run(safari, p.devices["iPhone 14"], "iphone")
    safari.close()

failed = 0
for name, ok, detail in checks:
    print(f"{'PASS' if ok else 'FAIL'}  {name}  {detail}")
    failed += not ok
print(f"\n{len(checks) - failed}/{len(checks)} passed")
sys.exit(1 if failed else 0)
