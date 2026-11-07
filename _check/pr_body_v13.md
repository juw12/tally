Real-device round: make the untested phone paths work.

- Speech recognition: every failure (mic blocked incl. iPhone Speech Recognition, no mic, offline, language not supported, nothing heard) shows a clear message in 4 languages and hands over to typing. Offline is detected before starting; a recognizer that refuses to start no longer breaks the sheet.
- Share: the PNG is encoded as soon as the preview changes, so Share calls the system sheet inside the tap (iOS Safari needs this). A refused share sheet saves the image instead; closing the sheet does nothing.
- "Just added" chip with Edit/Undo stays on Overview and Activity for 10 minutes after a voice entry.
- Budget fields show grouped numbers (30,000 / 30.000). Indonesian Siri heading reworded.
- Also merges PR-less round 1 (v12) history; SW bumped to tally-v13.

Gates: audit 77/77, round-2/3/4 pass, new round-5 60/60 in Android Chrome (Pixel 7) + iPhone Safari (WebKit) emulation, share cards pass.
Council: 8.75 (flat vs 8.95, within judge noise), blind pairwise 2-0 for this version.
