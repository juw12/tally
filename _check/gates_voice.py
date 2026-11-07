"""Voice gates (v14): Tally's own recorder + speech server, for phones where browser speech fails.

V1  No SpeechRecognition (Firefox-like): tapping Record captures the mic, auto-stops on silence,
    the speech server transcribes it and the expenses are saved (coffee 25,000 + taxi 50,000, yesterday).
V2  Browser speech that starts but never delivers audio (iPhone home-screen app) switches to the recorder
    within the 4.5 s watchdog and still saves the expenses.
V3  Browser speech error "service-not-allowed" switches to the recorder too.
V4  Browser speech that works is unchanged (fake engine result is saved, no upload made).
V5  Speech server down: a clear message, focus moves to the text field, typed entry still saves.
V6  iPhone (WebKit, iPhone 14): Tally's recorder is used even though the browser offers speech recognition.

Chromium plays a real WAV file through a fake microphone; the real speech server transcribes it.
"""
import functools
import http.server
import json
import sys
import threading
import wave
from pathlib import Path

from playwright.sync_api import sync_playwright

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
APP = Path(__file__).resolve().parent.parent
SOURCE_WAV = APP.parent / "stt_test_en.wav"
PADDED_WAV = APP.parent / "stt_test_en_padded.wav"
PROXY = {"server": "http://localhost:3128", "bypass": "127.0.0.1,localhost,<-loopback>"}
checks = []
ONLY = {arg.upper() for arg in sys.argv[1:]}


def want(label):
    return not ONLY or label in ONLY


def check(name, ok, detail=""):
    checks.append((name, bool(ok), detail))
    print(("PASS " if ok else "FAIL ") + name + (f"  [{detail}]" if detail and not ok else ""), flush=True)


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


def pad_wav():
    """0.8 s of silence before the speech and 4 s after, so voice-activity detection can stop by itself."""
    with wave.open(str(SOURCE_WAV)) as source:
        params = source.getparams()
        frames = source.readframes(source.getnframes())
    rate = params.framerate
    lead = b"\x00\x00" * int(rate * 0.8)
    tail = b"\x00\x00" * int(rate * 4)
    with wave.open(str(PADDED_WAV), "wb") as target:
        target.setparams(params)
        target.writeframes(lead + frames + tail)


SETTINGS = (
    "if (!sessionStorage.getItem('seeded')) {"
    "localStorage.setItem('tally.expenses.v1', '[]');"
    "localStorage.setItem('tally.settings.v1', JSON.stringify({currency:'IDR', lang:'en-US', weekStart:1, budgetTotal:3000000, budgets:{}}));"
    "localStorage.removeItem('tally.voice.engine');"
    "sessionStorage.setItem('seeded','1'); }"
)

NO_SPEECH_API = "delete window.SpeechRecognition; delete window.webkitSpeechRecognition;"

# Speech engines that misbehave the way real phones do.
FAKE_SPEECH = """
window.__speechMode = '%s';
class FakeRecognition {
  start() {
    window.__speechStarted = true;
    const mode = window.__speechMode;
    if (mode === 'silent') { return; }
    setTimeout(() => {
      if (mode === 'denied') {
        this.onerror && this.onerror({ error: 'service-not-allowed' });
        this.onend && this.onend();
        return;
      }
      this.onaudiostart && this.onaudiostart();
      const result = [{ transcript: 'lunch 40000' }];
      result.isFinal = true;
      this.onresult && this.onresult({ results: [result] });
      this.onend && this.onend();
    }, 300);
  }
  stop() { this.onend && this.onend(); }
  abort() {}
}
window.SpeechRecognition = FakeRecognition;
window.webkitSpeechRecognition = FakeRecognition;
"""


def saved(page):
    return page.evaluate("JSON.parse(localStorage.getItem('tally.expenses.v1') || '[]')")


def wait_saved(page, count, timeout_ms):
    try:
        page.wait_for_function(
            f"JSON.parse(localStorage.getItem('tally.expenses.v1') || '[]').length >= {count}",
            timeout=timeout_ms,
        )
    except Exception:
        pass
    return saved(page)


def new_page(browser, *scripts):
    context = browser.new_context(viewport={"width": 390, "height": 844}, service_workers="block")
    context.grant_permissions(["microphone"], origin=URL_ORIGIN)
    context.route("**/transcribe**", forward_transcribe)
    context.add_init_script(SETTINGS)
    for script in scripts:
        context.add_init_script(script)
    page = context.new_page()
    page.set_default_timeout(90000)
    page.errors = []
    page.uploads = []
    page.on("pageerror", lambda e: page.errors.append(str(e)))
    page.on("console", lambda m: print("   console:", m.text, flush=True) if m.type in ("error", "warning") else None)
    page.on("request", lambda r: page.uploads.append(r.url) if "transcribe" in r.url else None)
    page.goto(URL, wait_until="load")
    return context, page


def expect_coffee_taxi(label, rows, page=None):
    if page is not None and len(rows) != 2:
        status = page.locator("#recStatus").inner_text() if page.locator("#recStatus").count() else "(sheet closed)"
        heard = page.locator("#recText").inner_text() if page.locator("#recText").count() else ""
        print(f"   {label} status: {status!r} heard: {heard!r} uploads: {page.uploads}", flush=True)
    descs = " ".join(row["desc"].lower() for row in rows)
    amounts = sorted(row["amount"] for row in rows)
    dates = {row["date"] for row in rows}
    check(f"{label}: two expenses saved", len(rows) == 2, json.dumps(rows)[:300])
    check(f"{label}: coffee + taxi", "coffee" in descs and "taxi" in descs, descs)
    check(f"{label}: amounts 25,000 and 50,000", amounts == [25000, 50000], str(amounts))
    check(f"{label}: dated yesterday", dates == {YESTERDAY}, str(dates))


pad_wav()
server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), functools.partial(Quiet, directory=str(APP)))
threading.Thread(target=server.serve_forever, daemon=True).start()
URL_ORIGIN = f"http://127.0.0.1:{server.server_port}"
URL = f"{URL_ORIGIN}/index.html"
# The speech server only accepts juw12.github.io and port 8765 (shared with other local tools), so the test
# serves on a free port and forwards uploads to the real server under the allowed dev origin.
ALLOWED_DEV_ORIGIN = "http://127.0.0.1:8765"
CORS_HEADERS = {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-headers": "content-type",
}


def forward_transcribe(route):
    request = route.request
    if request.method == "OPTIONS":
        route.fulfill(status=204, headers=CORS_HEADERS)
        return
    headers = {**request.headers, "origin": ALLOWED_DEV_ORIGIN}
    response = route.fetch(headers=headers, timeout=30000)
    route.fulfill(
        status=response.status,
        headers={**response.headers, **CORS_HEADERS},
        body=response.body(),
    )

from datetime import date, timedelta  # noqa: E402

YESTERDAY = (date.today() - timedelta(days=1)).isoformat()

with sync_playwright() as p:

    def launch_chromium():
        """A fresh browser per scenario, so each recording starts the WAV from the beginning."""
        return p.chromium.launch(
            proxy=PROXY,
            args=[
                "--use-fake-ui-for-media-stream",
                "--use-fake-device-for-media-stream",
                f"--use-file-for-fake-audio-capture={PADDED_WAV.as_posix()}",
                "--autoplay-policy=no-user-gesture-required",
            ],
        )

    if want("V1"):
        # V1: no speech API at all.
        browser = launch_chromium()
        context, page = new_page(browser, NO_SPEECH_API)
        page.click("#recordButton")
        page.wait_for_timeout(600)
        check("V1: mic shows live while recording", page.locator("#recMic.live").count() == 1)
        rows = wait_saved(page, 2, 40000)
        expect_coffee_taxi("V1 no speech API", rows, page)
        check("V1: exactly one upload", len(page.uploads) == 1, str(page.uploads))
        check("V1: no JS errors", not page.errors, "; ".join(page.errors))
        context.close()
        browser.close()

    if want("V2"):
        # V2: browser speech accepts start() but stays silent (iPhone home-screen app).
        browser = launch_chromium()
        context, page = new_page(browser, FAKE_SPEECH % "silent")
        page.click("#recordButton")
        rows = wait_saved(page, 2, 45000)
        expect_coffee_taxi("V2 silent browser speech", rows, page)
        remembered = page.evaluate("localStorage.getItem('tally.voice.engine')")
        check("V2: recorder remembered for next time", remembered == "cloud", str(remembered))
        check("V2: no JS errors", not page.errors, "; ".join(page.errors))
        context.close()
        browser.close()

    if want("V3"):
        # V3: browser speech refused by the service.
        browser = launch_chromium()
        context, page = new_page(browser, FAKE_SPEECH % "denied")
        page.click("#recordButton")
        rows = wait_saved(page, 2, 40000)
        expect_coffee_taxi("V3 service-not-allowed", rows, page)
        check("V3: no JS errors", not page.errors, "; ".join(page.errors))
        context.close()
        browser.close()

    if want("V4"):
        # V4: working browser speech is unchanged.
        browser = launch_chromium()
        context, page = new_page(browser, FAKE_SPEECH % "ok")
        page.click("#recordButton")
        rows = wait_saved(page, 1, 8000)
        check("V4: browser speech result saved", len(rows) == 1 and rows[0]["amount"] == 40000, json.dumps(rows)[:200])
        check("V4: nothing uploaded", not page.uploads, str(page.uploads))
        check("V4: no JS errors", not page.errors, "; ".join(page.errors))
        context.close()
        browser.close()

    if want("V5"):
        # V5: speech server unreachable.
        browser = launch_chromium()
        context, page = new_page(browser, NO_SPEECH_API)
        page.route("**/transcribe**", lambda route: route.abort("connectionrefused"))
        page.click("#recordButton")
        try:
            page.wait_for_selector("#recStatus.warn", timeout=45000)
        except Exception:
            pass
        status = page.locator("#recStatus").inner_text() if page.locator("#recStatus").count() else ""
        check("V5: clear network message", page.locator("#recStatus.warn").count() == 1, status)
        focused = page.evaluate("document.activeElement && document.activeElement.id")
        check("V5: focus moves to the text field", focused == "recInput", str(focused))
        page.fill("#recInput", "parking 5000")
        page.keyboard.press("Enter")
        rows = wait_saved(page, 1, 3000)
        check("V5: typed entry still saves", len(rows) == 1 and rows[0]["amount"] == 5000, json.dumps(rows)[:200])
        check("V5: no JS errors", not page.errors, "; ".join(page.errors))
        page.screenshot(path=str(APP / "_check" / "voice_v5.png"))
        context.close()
        browser.close()

    if want("V6"):
        # V6: iPhone goes straight to the recorder, never to the browser's speech engine.
        # Playwright's Windows WebKit has no microphone or Web Audio API, so emulate iOS Safari's (mic refused here).
        webkit = p.webkit.launch(proxy=PROXY)
        context = webkit.new_context(**p.devices["iPhone 14"], service_workers="block")
        context.add_init_script(SETTINGS)
        context.add_init_script(FAKE_SPEECH % "ok")
        context.add_init_script(
            "window.__gumCalls = 0;"
            "if (!window.AudioContext && !window.webkitAudioContext) {"
            "  window.AudioContext = class { constructor() { this.state = 'running'; this.sampleRate = 48000; }"
            "    resume() { return Promise.resolve(); } close() { return Promise.resolve(); } };"
            "}"
            "Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: {"
            "  getUserMedia: () => { window.__gumCalls += 1; return Promise.reject(new DOMException('no', 'NotAllowedError')); }"
            "} });"
        )
        page = context.new_page()
        page.set_default_timeout(90000)
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.goto(URL, wait_until="load")
        page.tap("#recordButton")
        try:
            page.wait_for_selector("#recStatus.warn", timeout=15000)
        except Exception:
            pass
        started = page.evaluate("Boolean(window.__speechStarted)")
        mic_requests = page.evaluate("window.__gumCalls")
        status = page.locator("#recStatus").inner_text() if page.locator("#recStatus").count() else ""
        check("V6 iPhone: browser speech engine not used", not started, status)
        check("V6 iPhone: Tally's recorder asked for the microphone", mic_requests == 1, str(mic_requests))
        check("V6 iPhone: blocked mic is explained", "blocked" in status.lower(), status)
        check("V6 iPhone: no JS errors", not errors, "; ".join(errors))
        context.close()
        webkit.close()

server.shutdown()
failed = [c for c in checks if not c[1]]
print(f"\n{len(checks) - len(failed)}/{len(checks)} passed")
sys.exit(1 if failed else 0)

