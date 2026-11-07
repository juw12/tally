# Tally â€“ voice expense tracker

Say *"lunch 120 and taxi 250 yesterday"* and both expenses are saved, categorised and dated.
Installable web app (PWA) for iPhone and Android, works offline, data stays on the device.

**Live:** https://juw12.github.io/tally/  ·  **Try it with sample data:** https://juw12.github.io/tally/?demo=1 (nothing is saved)

![Tally](preview.png)

## Features
- **Voice capture** â€“ tap the mic and talk, or use your keyboard's dictation (iOS, Gboard, Wispr Flow).
  Works on iPhone home-screen apps and Firefox too: where the phone's own speech service is missing or silent, Tally records the clip itself and its speech server (Whisper on Cloudflare Workers AI, `api/worker.js`) writes it down. Audio is sent only while you record and is not stored.
  Several expenses per sentence; live preview while you speak; Edit / Undo after saving.
- **Understands English, Bahasa Indonesia and Chinese** â€“ `120`, `$12.50`, `1,250`, `1.250.000`, `50k`, `50rb`,
  `2 juta`, `1.5è¬`, "twenty five"; yesterday / kemarin / æ˜¨å¤©, "3 days ago", å‰å¤© â€¦
- **Overview** â€“ week / month / year totals, change vs the same point last period, per-day average,
  budget pace, daily chart (tap a bar to see that day), categories, top spending, recent.
- **Activity** â€“ search, category filter, grouped by day, tap to edit.
- **Budgets** â€“ monthly total and per category.
- **Regions** â€“ 21 regions set currency, number/date format, voice language, week start and app language
  (English, Bahasa Indonesia, ç¹é«”ä¸­æ–‡, ç®€ä½“ä¸­æ–‡); each can be overridden.
- **Share card** â€“ Strava-style image of your real day / week / month: story or square, 8 colour and gradient backgrounds, a transparent sticker (PNG) or your own photo,
  optional *hide amounts*. Shares through the phone's share sheet.
- **Data** â€“ CSV export, JSON backup / restore, persistent storage request, works offline.

## Install on your phone
- iPhone (Safari): open the link â†’ Share â†’ *Add to Home Screen*.
- Android (Chrome): open the link â†’ menu â†’ *Install app*. Long-press the icon â†’ **Record** opens straight into listening.

## Hands-free with Siri
Shortcuts app â†’ new shortcut "Log expense": **Dictate Text** â†’ **URL Encode** â†’ **Open URLs**
`https://juw12.github.io/tally/?add=` + *URL Encoded Text*. Then say "Hey Siri, log expense".

## Development
Plain HTML/CSS/JS, no build step. Serve the folder with any static server.
Checks live in `_check/` (Playwright, Python): `audit_all.py` (WCAG/tap/overflow gates on 77 screens),
`shoot.py`, `shoot_share.py`, `gates_extra.py` (flows, regions, parser, PWA cache).

## Licence
MIT
