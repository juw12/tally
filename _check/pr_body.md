Refine pass 2 plus the open items it left.

## Refine pass 2 (externally judged, 4 rounds, stopped at plateau)
- Save image / Share stay pinned at the bottom of the share sheet (visible without scrolling 0/9 -> 9/9 phone sizes and languages)
- Settings labels never wrap (6 -> 0, incl. Indonesian at 320 px)
- Amounts below 10,000 shown in full and grouped the same way in every language
- Live "No amount found" hint while typing; fixed a regression that blanked "Listening" while typing
- Budget card projects the month-end total from the pace so far; only the overage is red
- Check badge on the selected share background
- Unset category limits read "Set limit"; category shares read "37% · 6 expenses"

## Open items fixed
- Chart: peak and average value labels, "Tap a bar to see that day" hint
- Top bar casts a shadow once content scrolls under it
- Mic pulses while listening; status counts what it heard ("Listening · 2 found")
- Parsed rows in the record sheet can be edited (category, amount) or removed before saving; the edited rows are what gets saved
- Unset budgets offer "Use suggested $X": average of up to 3 previous fully tracked months, rounded up to 2 significant digits
- Share preview opens full size (tap the card or the expand button; Escape or tap closes)
- New strings in EN / ID / zh-Hant / zh-Hans
- Service worker tally-v11

## Checks
- Accessibility audit: 77/77 screens pass (contrast, tap targets, text size, overflow; light/dark, 390/1280 px, EN/ID/ZH)
- Parser 20/20, PWA gate, share-card gate 24/24, round-2 gate 17/17, new round-3 gate 27/27
- WebKit (Safari engine) smoke test: renders, transparent card exports a PNG with clear corners, full-size preview, typed entry parses

Not covered: live speech recognition and the native share sheet on real phones, and how Instagram treats the transparent sticker.
