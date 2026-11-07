# Tally – refine rubric v1 (frozen 2026-11-07, before any changes)

Done = every hard gate passes AND weighted soft score >= 8.5. Scores are labelled with who judged them.

## Hard gates (tool-checked)
- G1  A1–A8 from ~/.vector/skills/refine/app/tools/app_audit.py PROBE, run on EVERY screen:
      overview (month/week/year), activity, budgets, settings, record sheet, edit sheet, share sheet,
      empty state; light + dark; 390 + 1280 px; English, Bahasa Indonesia, 繁體中文.
      A1 no JS/console errors · A2 no overflow · A3 viewport meta · A4 WCAG AA contrast · A5 tap ≥ 32 px (phone)
      · A6 no text < 12 px · A7 img alt · A8 one h1 + title
- G2  no horizontal overflow at 320 px on any tab
- G3  functional suites pass: _check/shoot.py, _check/shoot_share.py
- G4  voice parser suite: 20/20 phrases (EN / ID / ZH)
- G5  PWA: manifest + service worker cache every file the app loads (offline start works)

## Soft criteria (judge from screenshots + behaviour)
| # | Criterion | Weight | 4 | 7 | 10 |
|---|---|---|---|---|---|
| S1 | Visual polish, hierarchy, consistency (light + dark) | 0.25 | uneven spacing, generic | clean, a few rough edges | every screen reads like a shipped finance app |
| S2 | Capture flow: speak → saved, correction, undo | 0.25 | several taps, unclear state | works, minor friction | one tap, live feedback, instant fix/undo |
| S3 | Summaries: answers "how am I doing?" | 0.20 | totals only | totals, trend, categories | + budget pace, comparisons, drill-down |
| S4 | Share card quality | 0.15 | cluttered / breaks | good, minor layout issues | poster-grade in every mode/theme/language |
| S5 | Robustness: empty/error states, offline, data safety | 0.15 | breaks on edge cases | handles common cases | graceful everywhere, data never lost |
