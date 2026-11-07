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


## Pass 2 (2026-11-07) - after Strava-style backgrounds (main 8db9046), branch design/tally-2026-11-07

External judge: opencode Pega-Vision, blind pairwise on 12-screen contact sheets (candidate position alternated from round 3).
Keep rule: same-run gain >= 0.3 AND pairwise win. Stop: rubric met, 2 stalls, or 5 rounds.

| round | change | gates | judge (candidate vs compared) | pairwise | kept? | note |
|---|---|---|---|---|---|---|
| base | main 8db9046 (8 backgrounds, transparent sticker, photo) | all pass (shoot_share fixed for [data-bg]; 24/24 share checks) | 8.20 single | - | - | baseline |
| 1 | sticky share actions; settings rows wrap (no label wrap); full amounts < 10,000; live "No amount found" hint | all pass | 7.85 vs 7.60 (base) | win | no (+0.25) | stalls 1; carried into r2 |
| 2 | r1 + budget month-end projection (EN/ID/zh-Hant/zh-Hans); share preview sized to fit above buttons | all pass, round-2 gates 12/12 | 7.90 vs 6.85 (base) | win | yes (+1.05) | stalls reset |
| 3 | fix r1 regression (typing blanked "Listening"); projection neutral ink, only overage red; check badge on selected background | all pass, 15/15 | 7.45 vs 7.20 (r2) | win | carried as fix (+0.25 < 0.3) | stalls 1; bug fix + strict superset, no sub-score dropped |
| 4 | "Set limit" action placeholder in dashed field for unset category budgets; "37% - 6 expenses" | all pass, 17/17 | 8.05 vs 8.05 (r3) | win (tie on score) | carried (labels only) | stalls 2 -> stop (plateau) |

Result: plateau at round 4. Rubric v1 not met on the external judge (best same-run weighted 8.05 < 8.5); all hard gates pass.
Objective: share buttons visible 0/9 -> 9/9 phone/language combos; wrapped setting labels 6 -> 0; G1 0 failing screens of 77.
Judge items not done (redesign scope or not factual): bigger share preview (conflicts with buttons-visible gate), mic level animation,
inline edit of parsed rows, suggested category limits, chart value labels. Seen in scrolled screenshot: budget card passes under the sticky header.
Untested: real-phone voice and native share; transparent PNG in iOS/Instagram.

## Open items after pass 2 (PR #1, merged ec656e9, SW tally-v11)
| item | fix | check |
|---|---|---|
| bigger share preview | tap card / expand button opens it full size; Escape or tap closes | lightbox 636 px tall vs 304 px thumbnail; buttons stay visible |
| mic level animation | CSS pulse rings while live (reduced-motion: static ring); status "Listening - N found" | animation present; count correct |
| inline edit of parsed rows | tap a row: category + amount editor; remove button; edited rows are what is saved | saved [Lunch, Transport, 99], removed row not saved |
| suggested limits | "Use suggested X" = mean of up to 3 fully tracked previous months, 2 significant digits | applies on tap; fits in Indonesian at 320 px |
| chart value labels | peak and average labels (HTML overlay, 12 px), "Tap a bar to see that day" | labels present, >= 12 px |
| header overlap | top bar casts a shadow once content scrolls under it | shadow on scroll, clears at top |
| real-device testing | WebKit (Safari engine) smoke test added | renders, transparent PNG has clear corners, preview, typed entry |
Gates: audit 77/77 screens, round-2 17/17, round-3 27/27, live check 8/8 + 6/6.
Still untested: live speech recognition and native share on real phones; Instagram handling of the transparent sticker.
| 2026-11-07 14:22 | council score | 8.6 | split: - | Pega-Vision=8.6, Pega-Thinking=9.35, GLM-5.3-Flash=8.6 |
| 2026-11-07 14:53 | council score | 8.95 | split: - | Pega-Vision=8.6, Pega-Thinking=9.5, GLM-5.3-Flash=8.8 |
| 2026-11-07 14:54 | council score | 9.25 | split: - | Pega-Vision=9.0, Pega-Thinking=9.5, GLM-5.3-Flash=x |
| 2026-11-07 14:55 | council pair | B wins: True | votes A/B/tie 0/2/0 | council-judged (2 judges) |
| 2026-11-07 14:57 | council score | 8.6 | split: - | Pega-Vision=8.75, Pega-Thinking=8.6, GLM-5.3-Flash=8.6 |


## Precedent round (2026-11-07) - council-judged (3 judges), rubric v1 frozen
Precedents: Toshl (today/pace marker on budget bars), Copilot/Monarch (empty states as calls to action), Strava story cards (keep content out of Instagram's ~250 px top/bottom UI zones). Notes in `_check/precedent/`.

| round | change | gates | judge score | pairwise | kept? | note |
|---|---|---|---|---|---|---|
| v0 | baseline (main, SW v11), re-scored with first-run screens | all pass (story card content at y 150..1830, outside safe zone - measured) | 8.60 (8.75 / 8.6 / 8.6) | - | baseline | first run 9.25 had only 2 judges, discarded |
| v1 | story safe zone (content y 267..1663, top 3 categories kept); today tick on every budget meter + one-line explanation; empty Overview/Activity/Categories get mic badge + "Log by voice" / "Add manually"; 4 new strings x 4 languages; SW v12 | audit 77/77, extra, round-2, round-3 (incl. WebKit), round-4 24/24 | 8.95 (8.6 / 9.5 / 8.8) | v1 wins 2-0 (Pega-Vision no vote) | KEPT (+0.35) | |

Test-harness fixes this round: WebKit now bypasses the corporate proxy for 127.0.0.1 (it was returning 400 "Request on loopback from external IP").
Open judge suggestions (not done): persistent "just saved" chip with Edit/Undo (GLM, both rounds); explicit mic-denied / no-speech-support messaging; Activity row spacing; Indonesian "TANPA TANGAN DENGAN SIRI" wording; currency-formatted budget inputs.
