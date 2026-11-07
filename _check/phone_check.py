"""Real-phone check for Tally on an Android device over adb (USB or wireless debugging).

Drives the phone's own Chrome through its DevTools socket, so everything runs in the real
mobile browser: voice support, mic permission, native share sheet, transparent PNG export.

    python phone_check.py                 # uses the first authorised device
    python phone_check.py --pair 10.1.2.3:41234 123456 --connect 10.1.2.3:39555
"""
import argparse
import json
import subprocess
import sys
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
ADB = r"C:\Users\juwen_lie\.vector\scratch\session_mvxjc23rlkf1wghu\apps\tether\tools\platform-tools\adb.exe"
URL = "https://juw12.github.io/tally/"
OUT = Path(__file__).resolve().parent / "phone"
OUT.mkdir(exist_ok=True)
checks = []


def check(name, ok, detail=""):
    checks.append((name, bool(ok)))
    print(("PASS " if ok else "FAIL ") + name + (f"  ({detail})" if detail else ""), flush=True)


def adb(*args, serial=None, timeout=30, binary=False):
    command = [ADB] + (["-s", serial] if serial else []) + list(args)
    result = subprocess.run(command, capture_output=True, timeout=timeout)
    return result.stdout if binary else (result.stdout + result.stderr).decode("utf-8", "replace").strip()


def phone_screenshot(serial, name):
    png = adb("exec-out", "screencap", "-p", serial=serial, binary=True, timeout=30)
    path = OUT / f"{name}.png"
    path.write_bytes(png)
    return path


def tap_text(serial, label):
    """Tap the first on-screen element whose text or content-desc contains label (system UI included)."""
    adb("shell", "uiautomator", "dump", "/sdcard/tally_ui.xml", serial=serial)
    xml = adb("shell", "cat", "/sdcard/tally_ui.xml", serial=serial)
    import re
    for node in re.finditer(r'<node [^>]*>', xml):
        attrs = node.group(0)
        if label.lower() in attrs.lower():
            bounds = re.search(r'bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"', attrs)
            if bounds:
                x1, y1, x2, y2 = map(int, bounds.groups())
                adb("shell", "input", "tap", str((x1 + x2) // 2), str((y1 + y2) // 2), serial=serial)
                return True
    return False


parser = argparse.ArgumentParser()
parser.add_argument("--pair", nargs=2, metavar=("HOST:PORT", "CODE"))
parser.add_argument("--connect", metavar="HOST:PORT")
args = parser.parse_args()

if args.pair:
    print(adb("pair", args.pair[0], args.pair[1], timeout=40))
if args.connect:
    print(adb("connect", args.connect, timeout=40))

devices = [line.split()[0] for line in adb("devices").splitlines()[1:] if line.strip().endswith("device")]
if not devices:
    print("No authorised device. Plug in USB (accept the prompt) or pass --pair/--connect.")
    sys.exit(2)
serial = devices[0]
model = adb("shell", "getprop", "ro.product.model", serial=serial)
android = adb("shell", "getprop", "ro.build.version.release", serial=serial)
chrome = adb("shell", "dumpsys", "package", "com.android.chrome", serial=serial)
chrome_version = next((l.split("=")[1] for l in chrome.splitlines() if "versionName=" in l), "?")
print(f"Device {serial}: {model}, Android {android}, Chrome {chrome_version}")
instagram = "package:com.instagram.android" in adb("shell", "pm", "list", "packages", "com.instagram.android", serial=serial)

# Open Tally in the phone's Chrome, then attach to Chrome's DevTools socket.
adb("shell", "am", "start", "-a", "android.intent.action.VIEW", "-d", f"{URL}?demo=1&cb={int(time.time())}",
    "com.android.chrome", serial=serial)
time.sleep(4)
adb("forward", "tcp:9333", "localabstract:chrome_devtools_remote", serial=serial)

with sync_playwright() as playwright:
    browser = playwright.chromium.connect_over_cdp("http://127.0.0.1:9333")
    context = browser.contexts[0]
    page = next((p for p in context.pages if "juw12.github.io/tally" in p.url), None)
    check("Tally open in the phone's Chrome", page is not None, page.url if page else "")
    if page is None:
        sys.exit(1)
    page.wait_for_load_state("networkidle")
    support = page.evaluate("""async () => {
        const blob = await new Promise((r) => { const c = document.createElement('canvas'); c.width = c.height = 4; c.toBlob(r, 'image/png'); });
        const file = new File([blob], 'tally.png', { type: 'image/png' });
        return {
            speech: !!(window.SpeechRecognition || window.webkitSpeechRecognition),
            share: !!navigator.share,
            shareFiles: !!(navigator.canShare && navigator.canShare({ files: [file] })),
            standalone: matchMedia('(display-mode: standalone)').matches,
            sw: !!(await navigator.serviceWorker.getRegistration()),
            width: innerWidth,
            dpr: devicePixelRatio,
        };
    }""")
    check("speech recognition API available", support["speech"])
    check("Web Share with PNG files supported", support["shareFiles"])
    check("service worker registered", support["sw"])
    phone_screenshot(serial, "1-overview")

    # Voice: open the recorder, grant the mic if Chrome asks, confirm it is listening.
    page.evaluate("openRecorder()")
    time.sleep(1.5)
    for label in ["Allow", "While using the app", "Only this time", "Izinkan"]:
        if tap_text(serial, label):
            time.sleep(1.5)
    status = page.inner_text("#recStatus").strip()
    phone_screenshot(serial, "2-listening")
    check("recorder starts listening on the phone", status.startswith("Listening"), status)
    print("SPEAK NOW: 'lunch 120 and taxi 250 yesterday'  (waiting up to 12 s)", flush=True)
    before = page.evaluate("store.expenses.length")
    deadline = time.time() + 12
    while time.time() < deadline and page.evaluate("store.expenses.length") == before:
        time.sleep(0.5)
    added = page.evaluate("store.expenses.length") - before
    heard = page.evaluate("store.expenses.slice(-2).map(e => [e.desc, e.amount])")
    phone_screenshot(serial, "3-after-voice")
    check("spoken phrase saved as expenses", added >= 1, f"added {added}: {heard}")

    # Share: transparent sticker, export alpha, then open the native share sheet.
    page.evaluate("closeSheet && closeSheet()")
    time.sleep(0.5)
    page.click("#shareButton")
    time.sleep(1)
    page.click("[data-bg=transparent]")
    time.sleep(0.8)
    alpha = page.evaluate("""() => new Promise((resolve) => {
        document.querySelector('#shareCanvas').toBlob(async (blob) => {
            const bitmap = await createImageBitmap(blob);
            const c = document.createElement('canvas');
            c.width = bitmap.width;
            c.height = bitmap.height;
            const ctx = c.getContext('2d');
            ctx.drawImage(bitmap, 0, 0);
            resolve({ corner: ctx.getImageData(2, 2, 1, 1).data[3], size: [bitmap.width, bitmap.height], bytes: blob.size });
        }, 'image/png');
    })""")
    check("transparent sticker PNG has clear corners on the phone", alpha["corner"] == 0, json.dumps(alpha))
    phone_screenshot(serial, "4-share-sheet-in-app")
    page.click("#shareSend")
    time.sleep(2.5)
    sheet = phone_screenshot(serial, "5-android-share-sheet")
    adb("shell", "uiautomator", "dump", "/sdcard/tally_ui.xml", serial=serial)
    ui = adb("shell", "cat", "/sdcard/tally_ui.xml", serial=serial)
    native_sheet = "android:id/resolver" in ui or "chooser" in ui.lower() or "com.android.intentresolver" in ui
    check("native Android share sheet opened", native_sheet, sheet.name)
    if instagram and tap_text(serial, "Instagram"):
        time.sleep(4)
        phone_screenshot(serial, "6-instagram")
        print("Instagram opened with the sticker; see phone/6-instagram.png", flush=True)
    adb("shell", "input", "keyevent", "KEYCODE_BACK", serial=serial)
    browser.close()

print(f"\n{sum(ok for _, ok in checks)}/{len(checks)} passed; screenshots in {OUT}")
sys.exit(0 if all(ok for _, ok in checks) else 1)
