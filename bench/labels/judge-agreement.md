# Judge agreement with hand labels (round 2, Part B, 2026-11-20)

Labels: `creators.jsonl`, 45 creator results from three saved passes (agent 15-49-25 and 16-47-36,
baseline 17-14-37), spread over all 12 dev questions; each has a fit (yes 21, partly 15, no 9),
a right/wrong mark for each of its 94 stated criteria (15 wrong), and one line of reason. Labelled by
reading the bio, captions, transcripts, watched-video observations and computed figures in the run.

Reproduce: `pnpm bench judge-eval --judge-model <model>... [--reasoning]` (verdicts cached in
`bench/out/judge-eval/`). Rubric: `bench/score/judge.ts`, final version (third).

| judge | settings | judged | fit agrees (3-way) | yes-or-not agrees | criteria agree | cost for 45 |
|---|---|---|---|---|---|---|
| gemini-3-5-flash-lite (old judge, first rubric) | low reasoning | 45 | 28/45 (62%) | 32/45 | 83/94 | $0.00031 |
| gemini-3-5-flash-lite | low reasoning | 45 | 35/45 (78%) | 36/45 | 85/94 (90%) | $0.00034 |
| deepseek-v4.1-flash | low reasoning | 45 | 36/45 (80%) | 37/45 | 86/94 (91%) | $0.00134 |
| **gemini-3.8-flash (chosen)** | low reasoning | 45 | **38/45 (84%)** | 38/45 | **86/94 (91%)** | $0.00640 |
| glm-5.3 | low reasoning | 45 | 34/45 (76%) | 35/45 | 78/83 | $0.00018 |
| glm-5.3 | reasoning | 33 (12 replies cut off, not JSON) | 25/33 | 28/33 | 45/47 | $0.00076 |
| glm-5.3-flash | reasoning | 45 | 39/45 (87%) | 39/45 | 84/94 (89%) | $0.00053 |
| qwen3.8-flash | reasoning | 45 | 34/45 (76%) | 35/45 | 84/94 (89%) | $0.00094 |

Chosen: gemini-3.8-flash. glm-5.3-flash agrees on one more fit but on two fewer criteria, and it is
the agent's own model, which would judge its own answers.

Where gemini-3.8-flash disagrees (all seven fit disagreements are one step more generous than the
label; it never calls a labelled "yes" anything else):
- fit yes, label partly: @animalwalamunda (q02, a news page that mentions Claude in an IPO story),
  @xosquishypeach (q04, a blind-box skit with a paper squishy), @leonalearnsspanish (q06, 235 views),
  @hallogabyx (q06, no app shown), @90milesforlacey (q08, charity walker), @askcatgpt (q10, 120 days ago).
- fit yes, label no: @viralanatomyhq (q11, an account that breaks down viral videos, not the video asked about).
- criteria marked right, label wrong: "in the UK" from the bio of two GB-region creators whose bios do
  not say UK (q08); "audience influences CFO decisions" (q09, three creators); one "promote payroll
  software"; "partnership within recent window" at 120 days (q10); "language learning app content"
  where no app appears (q06).

So the judge leans generous on "partly" cases and on inferred claims; scores from it are an upper
bound on fit, not exact.

The score fails the three cases the contract names (`bench/out/judge-check`, scored with this judge):
the forced q03 answer padded with 17 off-topic creators fails as "padded"; a q01 answer cut to one
creator fails as "short: 1 of 10 asked, not explained"; a q12 answer listing creators without saying
the question is underspecified fails as "creators returned without saying the question cannot be
answered well" (the same answer with its statement kept does not). Unit test: `test/rubric.test.ts`.
