Tally - a voice expense logger PWA (phone first). Images: a contact sheet of 12 phone screens at 390 px
(top row: overview light, overview scrolled, activity, budgets, record sheet, share sheet; bottom row: overview dark,
activity dark, record sheet dark, overview in Traditional Chinese, settings in Indonesian, share sheet dark Chinese),
plus one full-size Story share card (1080x1920).

Behaviour the screenshots cannot show (facts, tool-verified):
- Tap the mic and say "lunch 120 and taxi 250 yesterday": both expenses are parsed live and saved when you stop
  talking; a toast offers Edit and Undo. Typed input shows the parsed rows live; each row can be tapped to change
  category or amount, or removed, before Save. Text without an amount says "No amount found" immediately.
  Status reads "Listening - 2 found" while speaking; the mic pulses.
- Tapping a chart bar opens that day's expenses. Peak and average are labelled on the chart.
- Budget card: amount used, % used, per-day allowance for the remaining days, and a month-end projection.
  Unset category budgets offer "Use suggested $X" (average of fully tracked past months).
- Share card for day/week/month, Story or Square, 8 colour backgrounds, a transparent PNG sticker (light or dark
  text, exports with real alpha) or your own photo; "Hide amounts" shows percentages only; tap the preview for full size.
- Works offline (service worker), CSV export, JSON backup/restore, last-backup date, storage-full warning,
  persistent storage request. Region sets currency, number format, voice language and app language (EN/ID/ZH).
- Accessibility audit (WCAG AA contrast, tap targets >= 32 px, text >= 12 px, no overflow) over 77 screens: 0 failures.
- The "127.0.0.1" address in the Siri instructions is the local test server; the live app shows its real address.
