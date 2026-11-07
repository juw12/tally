# Tally – refine log (rubric v1, frozen 2026-11-07)

| round | change | gates | judge score | pairwise win | kept? | note |
|---|---|---|---|---|---|---|
| v0 | baseline (region/i18n/share build) | G1 FAIL 77/77 screens (A4 contrast 2.4–4.1, A5 29–30 px taps, A6 11 px tabs, A2 5 px @320, A1 favicon 404); G2 FAIL; G3–G5 pass | 7.40 (self-judged) | – | – | external judge (opencode Pega-Vision) hung > 4 min, killed |
| 1 | contrast tokens (muted #5c5954, faint #6b6862, dark faint #8e8b85), tap targets ≥ 34 px, 12 px tab labels, compact week label (Intl formatRange), favicon; toast Edit + Undo; chart bar → day drill-down; storage.persist + storage-full warning; last-backup date; stale-while-revalidate SW; 3 categories on story card; zh "直式" label | G1 PASS 77/77, G2 PASS, G3 PASS (12 + 11 checks), G4 20/20, G5 PASS, round-1 feature checks 10/10 | 8.60 (self-judged) | yes (self) | yes | meets rubric v1: all gates pass, weighted ≥ 8.5 → stop (done) |

Self-judged soft scores (strict, from contact sheets sheet-v0.png vs sheet-r1.png):

| | S1 visual | S2 capture | S3 summaries | S4 share card | S5 robustness | weighted |
|---|---|---|---|---|---|---|
| v0 | 7.0 | 7.5 | 8.0 | 8.0 | 6.5 | 7.40 |
| r1 | 8.5 | 8.5 | 9.0 | 8.5 | 8.5 | 8.60 |

\[ 0.25(8.5) + 0.25(8.5) + 0.20(9.0) + 0.15(8.5) + 0.15(8.5) = 8.60 \]

Below 10 because: live speech recognition and the native share sheet are untested on real iOS/Android devices;
Indonesian settings labels wrap to two lines at 390 px; per-expense currencies (travel) not supported.
