# Tuning log (round 2, Part C)

Method (contract, Part C): one round is a set of changes, then one full agent pass over the 12 dev
questions on the free tier, scored by the Part B judge and the automatic checks, compared with the
round before. A change is kept only if the table improves and nothing that was passing fails. At most
three rounds; stop early when a round brings no improvement.

Fixed and not tuned: the budget rule, the contact rule, the pinned sources, the model ids, the
8-turn limit, the tiers, the dev questions.

## Round 0: before tuning (Part A and B code, commit 614158d)

Pass `2026-11-20T19-09-32-719Z-agent-free`.

| question | finished | creators (fit / partly) | automatic checks | valid results | criterion accuracy | claim support | fails | cost | wall |
|---|---|---|---|---|---|---|---|---|---|
| q01-ai-study-us | model | 4 (1 / 3) | ids ok fig ok budget ok turns ok contact ok | 10% | 100% | n/a | - | $0.0236 | 213s |
| q02-claude-sub10k | model | 8 (6 / 2) | ids ok fig ok budget ok turns ok contact FAIL | 0% | 96% | n/a | FAIL: contact detail | $0.0396 | 196s |
| q03-nyu-1500 | model | 10 (8 / 2) | ids ok fig ok budget ok turns ok contact FAIL | 0% | n/a | n/a | FAIL: contact detail | $0.0545 | 227s |
| q04-toy-unboxing | model | 7 (4 / 2) | ids ok fig ok budget ok turns ok contact FAIL | 0% | 100% | 100% | FAIL: contact detail; padded with @birdy.bee | $0.0273 | 336s |
| q05-pingo-ai | model | 6 (6 / 0) | ids ok fig ok budget ok turns ok contact ok | 60% | 100% | 100% | - | $0.0080 | 84s |
| q06-hooks-language | model | 0 (0 / 0) | ids ok fig ok budget ok turns ok contact ok | 100% | n/a | 100% | - | $0.0095 | 127s |
| q07-compare-three | model | 3 (3 / 0) | ids ok fig ok budget ok turns ok contact ok | 100% | 80% | n/a | - | $0.0103 | 96s |
| q08-uk-walking | model | 3 (3 / 0) | ids ok fig ok budget ok turns ok contact ok | 30% | 100% | n/a | - | $0.0069 | 53s |
| q09-b2b-payroll-cfo | model | 8 (0 / 8) | ids ok fig ok budget ok turns ok contact ok | 0% | 90% | n/a | FAIL: creators returned without saying the question cannot be answered well | $0.0331 | 151s |
| q10-partnered-anthropic | model | 2 (2 / 0) | ids ok fig ok budget ok turns ok contact ok | 20% | 40% | n/a | - | $0.0064 | 105s |
| q11-why-video | model | 1 (1 / 0) | ids ok fig ok budget ok turns ok contact ok | 100% | 50% | 100% | - | $0.0070 | 153s |
| q12-my-app | model | 6 (0 / 0) | ids ok fig ok budget ok turns ok contact ok | 0% | 56% | n/a | FAIL: padded with @improvewithkate, @brbrryeu, @everythingebbie, @365_to_happiness, @rita.havis6, @jill_justine | $0.0074 | 58s |
| **overall** | 12/12 by model | 58 (34 / 17) | 9/12 all ok | 35% | 81% | 100% | 5 failed | $0.2336 total | median 139s |

judge gemini-3.8-flash, judge cost $0.010801


What it did badly (read from the saved answers):
- Wrote numbers anyway ("10,000", "four", "thousand"); the no-figures rule then deleted those
  sentences: q01's direct answer was emptied, q03's cut to one sentence.
- Named creators without the @, so a dotted handle read as a domain and was removed (q02).
- Invented check values from the evidence ("followers at least 5,689", q07) instead of the question.
- Wrote "creator was inspected" as free text, which the verifier then set to unknown (q10, q11, q12).
- Stopped early with most of the budget unspent: q05 $0.008, q08 $0.007, q10 $0.006, q12 $0.007 of $0.10.
- q09 listed eight adjacent creators without saying TikTok reaches CFOs poorly; q12 padded with six.
- Three contact flags came from cleaner gaps ("name dot com"; "Instagram bio @x") and from an error
  message printing byte counts. Those are contact-rule defects, fixed in commit 17aaf7d before round 1,
  not tuning.

## Round 1

Changes (commit below):
- System prompt: use the budget and turns while results are short of what was asked (up to ten when
  no number); no digits or number words anywhere in finish text, with wordings to use instead; every
  creator as @handle; check values only from the question or stated assumptions, "inspected" only as
  the creator_inspected check; cite only evidence fetched (t:, w:, @); a poor fit said in the first
  sentence; a question too vague to tell who fits gets no creators and says what is needed.
- After each turn of tools the code adds a progress note: creators inspected so far, money left of
  the limit, turns left, and to keep going in parallel while short.

Scoring fix in the same round: the bench detector read `ponytail@ponytail. I` (a package spec ending
a sentence) as an email. Its email rule now needs a real ending (glued dot plus two or more letters,
or a spaced or written-out dot before a mail ending). Re-scored: round 0 is unchanged (its three
contact flags are real and still caught); round 1's q02 passes.

Pass `2026-11-20T19-51-24-508Z-agent-free`.

| question | finished | creators (fit / partly) | automatic checks | valid results | criterion accuracy | claim support | fails | cost | wall |
|---|---|---|---|---|---|---|---|---|---|
| q01-ai-study-us | model | 3 (2 / 1) | ids ok fig ok budget ok turns ok contact ok | 20% | 100% | n/a | - | $0.0368 | 188s |
| q02-claude-sub10k | model | 15 (15 / 0) | ids ok fig ok budget ok turns ok contact ok | 100% | 100% | n/a | - | $0.0452 | 240s |
| q03-nyu-1500 | model | 12 (6 / 6) | ids ok fig ok budget ok turns ok contact ok | 60% | 97% | n/a | - | $0.0472 | 186s |
| q04-toy-unboxing | model | 10 (10 / 0) | ids ok fig ok budget ok turns ok contact ok | 100% | 100% | 100% | - | $0.0366 | 242s |
| q05-pingo-ai | model | 10 (10 / 0) | ids ok fig ok budget ok turns ok contact ok | 100% | 100% | 33% | - | $0.0177 | 172s |
| q06-hooks-language | model | 7 (7 / 0) | ids ok fig ok budget ok turns ok contact ok | 100% | 100% | 100% | - | $0.0199 | 108s |
| q07-compare-three | model | 3 (3 / 0) | ids ok fig ok budget ok turns ok contact ok | 100% | 67% | 100% | - | $0.0117 | 209s |
| q08-uk-walking | model | 10 (10 / 0) | ids ok fig ok budget ok turns ok contact ok | 100% | 100% | n/a | - | $0.0243 | 147s |
| q09-b2b-payroll-cfo | model | 4 (1 / 3) | ids ok fig ok budget ok turns ok contact ok | 100% | 100% | 100% | - | $0.0344 | 261s |
| q10-partnered-anthropic | model | 4 (4 / 0) | ids ok fig ok budget ok turns ok contact ok | 40% | 100% | 100% | - | $0.0152 | 113s |
| q11-why-video | model | 0 (0 / 0) | ids ok fig ok budget ok turns ok contact ok | 100% | n/a | 50% | - | $0.0064 | 128s |
| q12-my-app | model | 0 (0 / 0) | ids ok fig ok budget ok turns ok contact ok | 100% | n/a | n/a | - | $0.0000 | 16s |
| **overall** | 12/12 by model | 78 (68 / 10) | 12/12 all ok | 85% | 96% | 83% | 0 failed | $0.2955 total | median 179s |

judge gemini-3.8-flash, judge cost $0.016140


Compared with round 0: valid results 35% to 85%, creators that fit 34 to 68, runs failing 5 to 0,
criterion accuracy 81% to 96%. Every run that passed in round 0 still passes. Cost $0.234 to $0.296;
median wall time 139 s to 179 s. Kept.

Still weak: q01 found 2 that fit of 10 asked (it ran 37 searches but inspected only 15 creators, a
few per turn, and left $0.063 unspent); q10 wrote "@claude" for the brand, so the handles rule deleted
the sentences listing its creators; number words still slipped in ("ten", "half", "hundreds").

## Round 2 (discarded)

Changes tried (reverted; patch not kept):
- The progress note also listed authors seen in searches but not inspected, highest views first, as
  many as a search page shows.
- Prompt: search rows carry no follower counts, inspect up to ten creators at once; never put @ on a
  brand, app or company; the number words that slipped through named explicitly.

Pass `2026-11-20T20-31-47-509Z-agent-free`.

| question | finished | creators (fit / partly) | automatic checks | valid results | criterion accuracy | claim support | fails | cost | wall |
|---|---|---|---|---|---|---|---|---|---|
| q01-ai-study-us | model | 1 (1 / 0) | ids ok fig ok budget ok turns ok contact ok | 10% | 100% | 100% | - | $0.0357 | 148s |
| q02-claude-sub10k | model | 14 (13 / 1) | ids ok fig ok budget ok turns ok contact ok | 100% | 100% | 50% | - | $0.0208 | 155s |
| q03-nyu-1500 | model | 10 (8 / 2) | ids ok fig ok budget ok turns ok contact ok | 80% | 93% | n/a | - | $0.0501 | 213s |
| q04-toy-unboxing | model | 16 (14 / 2) | ids ok fig ok budget ok turns ok contact ok | 100% | 70% | 67% | - | $0.0393 | 290s |
| q05-pingo-ai | model | 10 (10 / 0) | ids ok fig ok budget ok turns ok contact ok | 100% | 97% | 0% | - | $0.0272 | 484s |
| q06-hooks-language | model | 10 (8 / 1) | ids ok fig ok budget ok turns ok contact ok | 0% | 89% | 100% | FAIL: padded with @ta3alom_espaniya | $0.0304 | 457s |
| q07-compare-three | model | 3 (3 / 0) | ids ok fig ok budget ok turns ok contact ok | 100% | 100% | n/a | - | $0.0066 | 83s |
| q08-uk-walking | model | 9 (9 / 0) | ids ok fig ok budget ok turns ok contact ok | 90% | 100% | n/a | - | $0.0362 | 282s |
| q09-b2b-payroll-cfo | model | 8 (0 / 7) | ids ok fig ok budget ok turns ok contact ok | 0% | 100% | 100% | FAIL: padded with @employeevshrhub | $0.0387 | 248s |
| q10-partnered-anthropic | model | 3 (2 / 1) | ids ok fig ok budget ok turns ok contact ok | 20% | 100% | n/a | - | $0.0267 | 149s |
| q11-why-video | model | 1 (1 / 0) | ids ok fig ok budget ok turns ok contact ok | 100% | 100% | 75% | - | $0.0074 | 172s |
| q12-my-app | model | 0 (0 / 0) | ids ok fig ok budget ok turns ok contact ok | 100% | n/a | n/a | - | $0.0000 | 9s |
| **overall** | 12/12 by model | 85 (69 / 14) | 12/12 all ok | 67% | 95% | 70% | 2 failed | $0.3191 total | median 193s |

judge gemini-3.8-flash, judge cost $0.018251


Compared with round 1: valid results 85% to 67%, runs failing 0 to 2. q06 and q09 passed in round 1
and now fail as padded (@ta3alom_espaniya; @employeevshrhub); q01 fell from two creators that fit to
one; q05 and q06 took 484 s and 457 s (more video watching). It did help some questions (q03 60% to
80%, q04 ten to sixteen returned with fourteen that fit). By the rule, not kept.

Caveat: each round is one pass per question, and the same code returns different creators from run to
run, so a one- or two-question swing may be noise rather than the change. Repeats would separate the
two; the contract's spend and round limits did not allow them.

## Stop

Round 2 brought no improvement, so tuning stops after it (contract: "stop after three rounds or when a
round brings no improvement"). The agent stays at round 1.

## Read by hand: round 1 answers (the kept code)

Best:
- q08 UK walking: ten creators under the follower limit, every one posting walking or step-challenge
  videos (a steps-challenge diary, London and Manchester walking clubs, a charity walker), GB-region
  proof videos, one threshold for all. Judge: ten of ten fit.
- q05 Pingo AI: ten creators whose videos are Pingo AI skits, Spanish learners first, then the same
  format in other languages; ambassadors flagged from bios; says almost none carry a paid label.
- q09 payroll to CFOs: opens "TikTok is a weak channel for reaching CFOs", then four finance and
  payroll creators as adjacent options, which is the honest answer the question needs.

Still bad:
- q01 AI study app, US, under 10K, 100K+ views: three creators of ten asked, with $0.063 of $0.10
  unspent; one (@study.withderin) rests on a single hashtag (#aistote). It ran 37 searches but
  inspected only 15 creators.
- q03 NYU around 1,500: twelve creators, but the model moved its own band per creator ("followers at
  least 800" for some, "at least 400" for five others at 401 to 793 followers), so five sit far from
  1,500; @gabrielle.licayan is NYU London. The band cannot be stated in words because free text may
  hold no figure.
- q10 partnered with Anthropic: @zoeatk's proof video (183 views) does not name Anthropic, and the
  answer's own limits note says that link is weaker; @rpn has 497K followers and only a #ClaudePartner
  tag. The judge called all four a fit.

Next changes I would make:
- One threshold per check kind for the whole answer (a top-level field in finish the code applies to
  every creator), so the model cannot pick a looser value for the creators that would fail. q04 has
  the same fault (10,000 for some creators, 100,000 for others).
- A code-written sentence stating the thresholds used, so a band like q03's is shown without letting
  the model write numbers.
- Repeat passes (three per question) before keeping or discarding a change; one pass cannot tell a
  change from run-to-run variation.
- Qwen is past its 60 s limit on most videos over 30 s (measured in Part A); watching with the
  fallback first for files it takes would cut wall time (q05 and q06 took 450 s+ in round 2).


# Round 3 (2026-11-21)

Part A changed the agent core (commits ea038d8 to 4e06997); Part B tuned it, measured on three passes per question.

Method. A measurement is three passes of the 12 dev questions on the free tier, run as three
concurrent `bench run --question all` processes (three pass directories, one repeat each), scored by
`bench score --pass a --pass b --pass c` with the round 2 judge (gemini-3.8-flash). The three-pass
table gives, per question, the mean and spread (highest minus lowest) of valid results over its three
runs and how many runs passed (did not fail outright); overall, the mean of the three per-pass means
and the spread between them. A change is kept only when the overall mean improves by more than the
spread between passes and no question goes from passing in most of its runs to failing in most.
Steps in the contract's order, stopping when two in a row bring nothing.

Scoring changes made before the first measurement and shared by all three: the judge also reads the
code-written criteria line; the figure check re-derives figures and checked criteria and keeps content
criteria as saved (commit d9bb3eb; without it, a content claim the verifier set to unknown was
flagged as a figure not from evidence).

## Step 1: baseline after Part A (commit ec2b50c)

Passes `2026-11-21T04-44-40-395Z`, `04-44-40-460Z`, `04-44-41-394Z`.

| question | runs | valid results mean | spread | runs passing | fit (mean) | fit + partly (mean) | cost (mean) | wall (median) |
|---|---|---|---|---|---|---|---|---|
| q01-ai-study-us | 3 | 13% | 40% | 3/3 | 1.3 | 2.0 | $0.0422 | 199s |
| q02-claude-sub10k | 3 | 83% | 50% | 3/3 | 10.0 | 10.3 | $0.0310 | 162s |
| q03-nyu-1500 | 3 | 57% | 40% | 3/3 | 5.7 | 8.0 | $0.0419 | 124s |
| q04-toy-unboxing | 3 | 83% | 40% | 3/3 | 8.3 | 8.7 | $0.0285 | 286s |
| q05-pingo-ai | 3 | 97% | 10% | 3/3 | 10.3 | 10.3 | $0.0150 | 102s |
| q06-hooks-language | 3 | 56% | 100% | 2/3 | 5.7 | 5.7 | $0.0224 | 140s |
| q07-compare-three | 3 | 100% | 0% | 3/3 | 3.0 | 3.0 | $0.0130 | 157s |
| q08-uk-walking | 3 | 70% | 30% | 3/3 | 7.0 | 8.3 | $0.0221 | 154s |
| q09-b2b-payroll-cfo | 3 | 100% | 0% | 3/3 | 0.0 | 5.3 | $0.0229 | 175s |
| q10-partnered-anthropic | 3 | 13% | 20% | 2/3 | 2.0 | 2.3 | $0.0173 | 145s |
| q11-why-video | 3 | 67% | 100% | 2/3 | 0.7 | 1.0 | $0.0073 | 108s |
| q12-my-app | 3 | 100% | 0% | 3/3 | 0.0 | 0.0 | $0.0000 | 20s |
| **overall** | 36 | 70% | 8% between passes (71%, 73%, 66%) | 33/36 | 4.5 | 5.4 | $0.7909 total | 149s |

Returned 199 creators over 36 runs: 162 fit, 33 partly, 4 no (81% fit). The three failing runs are
padding: @teddywang86 (q06), @bri.buildss and @hackswithnele (q10, Composio partners, not
Anthropic), @girly.studytips (q11). Every run left most of the budget: median $0.081 of $0.10
unspent. No creator was left out by a check from the question (`excluded` was zero in every run):
the model returned only creators meeting the checks it declared.

## Step 2: leads note after each search turn (commit 794a017, dropped, reverted in 15dd086)

`declare_checks` (free) let the model set the answer's checks in its first turn; after each turn
with a search, the progress note named how many creators seen in searches and not inspected already
had a video meeting the declared checks a search row settles (views, recency, region), the top ones
by views, and said inspecting is not including.

Passes `2026-11-21T05-24-14-986Z`, `05-24-15-007Z`, `05-24-15-018Z`.

| question | runs | valid results mean | spread | runs passing | fit (mean) | fit + partly (mean) | cost (mean) | wall (median) |
|---|---|---|---|---|---|---|---|---|
| q01-ai-study-us | 3 | 3% | 10% | 3/3 | 0.3 | 1.0 | $0.0255 | 195s |
| q02-claude-sub10k | 3 | 100% | 0% | 3/3 | 11.3 | 11.3 | $0.0267 | 213s |
| q03-nyu-1500 | 3 | 27% | 40% | 2/3 | 5.3 | 6.7 | $0.0423 | 114s |
| q04-toy-unboxing | 3 | 33% | 20% | 3/3 | 3.3 | 3.3 | $0.0204 | 124s |
| q05-pingo-ai | 3 | 93% | 20% | 3/3 | 9.3 | 9.3 | $0.0162 | 137s |
| q06-hooks-language | 3 | 100% | 0% | 3/3 | 6.7 | 8.0 | $0.0142 | 106s |
| q07-compare-three | 3 | 100% | 0% | 3/3 | 3.0 | 3.0 | $0.0140 | 209s |
| q08-uk-walking | 3 | 47% | 60% | 3/3 | 4.7 | 6.3 | $0.0209 | 159s |
| q09-b2b-payroll-cfo | 3 | 67% | 100% | 2/3 | 0.7 | 5.0 | $0.0371 | 192s |
| q10-partnered-anthropic | 3 | 23% | 20% | 3/3 | 2.3 | 2.3 | $0.0177 | 137s |
| q11-why-video | 3 | 100% | 0% | 3/3 | 1.7 | 1.7 | $0.0072 | 120s |
| q12-my-app | 3 | 100% | 0% | 3/3 | 0.0 | 0.0 | $0.0000 | 7s |
| **overall** | 36 | 66% | 6% between passes (70%, 64%, 64%) | 34/36 | 4.1 | 4.8 | $0.7268 total | 136s |

Mean 66% against 70%, inside the spread: no improvement; dropped. The round 2 padding did not
recur (one padded run, q03; 175 returned, 1 judged no), so round 2's two padded questions look like
noise, not this change. It did not cure under-inspection either: q01 inspected 5 or 6 creators per
run against 12 to 15 in the baseline, returned 0, 0 and 3, and still left $0.073 to $0.075 unspent;
q04 returned 2 to 4 creators against 6 to 11. The q09 contact flag is a cleaner gap, not this
change: a caption wrote an email as `name@https://domain`, and the cleaner kept `name@https://`.
Fixed in commit 17d5403 with a test.

## Step 3: the proof video must carry the subject, quoted (commit dceafa0, dropped, reverted)

finish took per creator a `topic`: the exact words from the proof video's own caption, transcript or
watched observations; the code checked the words are there and left out a creator whose quote failed
(after one rejection).

Passes `2026-11-21T06-00-09-912Z`, `06-00-09-921Z`, `06-00-09-957Z`.

| question | runs | valid results mean | spread | runs passing | fit (mean) | fit + partly (mean) | cost (mean) | wall (median) |
|---|---|---|---|---|---|---|---|---|
| q01-ai-study-us | 3 | 3% | 10% | 3/3 | 0.3 | 0.3 | $0.0202 | 152s |
| q02-claude-sub10k | 3 | 73% | 50% | 3/3 | 7.3 | 7.3 | $0.0194 | 96s |
| q03-nyu-1500 | 3 | 37% | 60% | 2/3 | 4.7 | 8.7 | $0.0392 | 158s |
| q04-toy-unboxing | 3 | 73% | 50% | 3/3 | 7.3 | 8.0 | $0.0205 | 138s |
| q05-pingo-ai | 3 | 97% | 10% | 3/3 | 10.0 | 10.0 | $0.0143 | 59s |
| q06-hooks-language | 3 | 78% | 67% | 3/3 | 5.0 | 6.0 | $0.0237 | 208s |
| q07-compare-three | 3 | 67% | 100% | 3/3 | 2.0 | 2.0 | $0.0140 | 110s |
| q08-uk-walking | 3 | 43% | 60% | 3/3 | 4.3 | 6.0 | $0.0231 | 187s |
| q09-b2b-payroll-cfo | 3 | 100% | 0% | 3/3 | 0.3 | 5.0 | $0.0247 | 123s |
| q10-partnered-anthropic | 3 | 23% | 20% | 3/3 | 2.3 | 2.3 | $0.0165 | 130s |
| q11-why-video | 3 | 100% | 0% | 3/3 | 1.3 | 1.3 | $0.0074 | 91s |
| q12-my-app | 3 | 100% | 0% | 3/3 | 0.0 | 0.0 | $0.0000 | 11s |
| **overall** | 36 | 66% | 14% between passes (72%, 69%, 58%) | 35/36 | 3.8 | 4.8 | $0.6689 total | 127s |

Mean 66% against 70%: no improvement; dropped. Padding fell (35 of 36 runs pass), but precision did
not rise (135 of 172 returned fit, 78%, against 81%) and results fell: q02 7.3 creators that fit
against 10.0, q07 in one run compared the three named creators in text only and listed none in finish. The model quoted transcripts as joined fragments
("... upload any lecture notes ... make a study guide"), which failed the exact-words check and,
because it finishes on its last turn, cost the creator with no chance to fix it.

## Stop

Steps 2 and 3 in a row brought nothing, so tuning stops (contract). The agent stays at the step 1
code, plus the cleaner fix.

## Beside round 1

Round 1 was one pass on the round 2 code with per-creator checks; step 1 is three passes on the
Part A code.

| question | round 1 valid (one pass) | now: mean over three passes (spread) |
|---|---|---|
| q01-ai-study-us | 20% | 13% (40%) |
| q02-claude-sub10k | 100% | 83% (50%) |
| q03-nyu-1500 | 60% | 57% (40%) |
| q04-toy-unboxing | 100% | 83% (40%) |
| q05-pingo-ai | 100% | 97% (10%) |
| q06-hooks-language | 100% | 56% (100%) |
| q07-compare-three | 100% | 100% (0%) |
| q08-uk-walking | 100% | 70% (30%) |
| q09-b2b-payroll-cfo | 100% | 100% (0%) |
| q10-partnered-anthropic | 40% | 13% (20%) |
| q11-why-video | 100% | 67% (100%) |
| q12-my-app | 100% | 100% (0%) |
| **overall** | 85% (12/12 runs passing) | 70% (passes 71%, 73%, 66%; 33/36 runs passing) |

The round 1 figure was one pass; its own question rows swing as much as the spreads above (q06 and
q11 each have a run at 0% and one at 100% here), so 85% was likely a high draw rather than a level the
Part A code lost. Part A was not meant to raise this score: it makes the thresholds one per answer and
visible, and adds media links, video order and the evidence index.

## Read by hand: step 1 answers

Best:
- q05 Pingo AI (pass 04-44-40-395Z): ten creators making Pingo AI skits, Spanish learners first, then
  French and German; four patterns each cited on two to four videos (the tutor misunderstands a word,
  AI-vs-AI glitch skits). Judge: ten of ten fit.
- q09 payroll to CFOs (04-44-41-394Z): opens "TikTok reaches CFOs poorly as a direct audience", then
  five finance and accounting creators as adjacent options, each judged partly, which is the honest
  answer.
- q02 Claude under 10K (04-44-40-460Z): twelve creators, every one under the limit by the code's check
  ("Checked on every creator: at most 10,000 followers"), proof videos about Claude. Weak spot: one has
  a single follower.

Still bad:
- q01 AI study app, US, under 10K, 100K+ views (04-44-41-394Z): one creator of ten asked, $0.065 of
  $0.10 unspent, 40 searches and 12 inspections. The answer calls @lawrence.studiez "a US account", but
  the proof video's region is unknown (the check stayed unknown, correctly kept); the free text claims
  more than the evidence.
- q10 partnered with Anthropic (04-44-40-395Z): two real Anthropic-sponsored creators, then two
  Composio partners as a "second tier" (judged padding), and @curv_lab's sponsored video is 63 days old
  for "recently".
- q03 NYU around 1,500 (04-44-40-395Z): the per-creator loosening is gone, but the model declared one
  assumed check, "at most 4,000 followers", and no floor, so creators at 404, 622 and 764 followers
  stay in. The criteria line now shows this plainly, which is what A2 is for.

## Next changes I would make

- Under-inspection is the main gap and neither step fixed it: every run leaves about $0.08 of $0.10.
  The model spends its turns on searches and finishes on turn 8. I would have the code inspect,
  without asking, the top search authors that meet the knowable checks, in parallel with the model's
  own calls, until a share of the budget is used, rather than asking the model to.
- A two-sided band for "around N" questions: when the question gives one target, a check pair from
  the question rather than one assumed ceiling.
- Free text that states a checked fact the evidence left unknown ("a US account" with no region):
  have the verifier read the direct answer against the checked criteria.
- If the topic quote is tried again: accept fragments joined by "..." in order, and leave room for one
  rejection before the last turn.


# Round 4 (2026-11-21): display gate, review findings, the model choice

Parts A to C of the round 4 contract. No tuning. Scoring changed in ways that apply to
every table below: the contact check scans only the display object (the independent detector and a
second scan on deepseek-v4.1-flash; a hit fails the run), free text is re-checked with this round's
rules (digits of every script, "one" counting things), and the judge is glm-5.3-flash with reasoning.
Round 3's runs were re-scored with the same checks, so its numbers here differ from round 3's own.

## Round 3's final passes, scored once with each judge (C3)

Passes `2026-11-21T04-44-40-395Z`, `04-44-40-460Z`, `04-44-41-394Z`. The Gemini verdicts are round
3's own, read from cache (no Gemini call was made). The two judges' scores are not comparable with
each other; GLM is stricter (q03, q07).

| question | gemini-3.8-flash:low: valid (spread) | runs passing | fit (mean) | glm-5.3-flash: valid (spread) | runs passing | fit (mean) |
|---|---|---|---|---|---|---|
| q01-ai-study-us | 13% (40%) | 3/3 | 1.3 | 3% (10%) | 2/3 | 1.0 |
| q02-claude-sub10k | 83% (50%) | 3/3 | 10.0 | 83% (50%) | 3/3 | 9.3 |
| q03-nyu-1500 | 57% (40%) | 3/3 | 5.7 | 13% (40%) | 1/3 | 2.7 |
| q04-toy-unboxing | 83% (40%) | 3/3 | 8.3 | 77% (40%) | 3/3 | 7.7 |
| q05-pingo-ai | 97% (10%) | 3/3 | 10.3 | 80% (30%) | 3/3 | 8.0 |
| q06-hooks-language | 56% (100%) | 2/3 | 5.7 | 33% (100%) | 2/3 | 5.3 |
| q07-compare-three | 100% (0%) | 3/3 | 3.0 | 78% (67%) | 3/3 | 2.3 |
| q08-uk-walking | 40% (60%) | 2/3 | 7.0 | 37% (60%) | 2/3 | 6.0 |
| q09-b2b-payroll-cfo | 67% (100%) | 2/3 | 0.0 | 67% (100%) | 2/3 | 0.0 |
| q10-partnered-anthropic | 13% (20%) | 2/3 | 2.0 | 20% (0%) | 3/3 | 2.0 |
| q11-why-video | 67% (100%) | 2/3 | 0.7 | 67% (100%) | 2/3 | 0.7 |
| q12-my-app | 100% (0%) | 3/3 | 0.0 | 100% (0%) | 3/3 | 0.0 |
| **overall** | 65% (passes 71%, 66%, 57%) | 31/36 | 4.5 | 55% (passes 53%, 58%, 53%) | 29/36 | 3.8 |

## Round 4: three passes after Parts A to C, GLM judge

Passes `2026-11-21T15-50-14-575Z`, `15-50-15-590Z`, `15-50-17-469Z`. Data $0.7107, model $0.0230,
house cost $0; the contact scan ran and was used in all 36 runs, the verifier answered in all 36.

| question | runs | valid results mean | spread | runs passing | fit (mean) | fit + partly (mean) | cost (mean) | wall (median) |
|---|---|---|---|---|---|---|---|---|
| q01-ai-study-us | 3 | 0% | 0% | 3/3 | 0.0 | 0.0 | $0.0293 | 132s |
| q02-claude-sub10k | 3 | 70% | 40% | 3/3 | 7.0 | 7.7 | $0.0197 | 138s |
| q03-nyu-1500 | 3 | 0% | 0% | 0/3 FAILS | 4.0 | 7.7 | $0.0443 | 212s |
| q04-toy-unboxing | 3 | 83% | 30% | 3/3 | 8.7 | 10.0 | $0.0339 | 231s |
| q05-pingo-ai | 3 | 97% | 10% | 3/3 | 10.7 | 11.0 | $0.0165 | 136s |
| q06-hooks-language | 3 | 67% | 67% | 3/3 | 3.3 | 6.0 | $0.0207 | 427s |
| q07-compare-three | 3 | 100% | 0% | 3/3 | 3.0 | 3.0 | $0.0115 | 259s |
| q08-uk-walking | 3 | 50% | 30% | 3/3 | 5.0 | 8.3 | $0.0208 | 173s |
| q09-b2b-payroll-cfo | 3 | 100% | 0% | 3/3 | 0.0 | 5.7 | $0.0259 | 238s |
| q10-partnered-anthropic | 3 | 20% | 40% | 3/3 | 2.0 | 2.3 | $0.0159 | 118s |
| q11-why-video | 3 | 100% | 0% | 3/3 | 0.7 | 0.7 | $0.0061 | 227s |
| q12-my-app | 3 | 67% | 100% | 3/3 | 0.0 | 0.0 | $0.0000 | 19s |
| **overall** | 36 | 63% | 16% between passes (54%, 70%, 65%) | 33/36 | 3.7 | 5.2 | $0.7337 total | 183s |

Beside round 3 under the same judge: overall 55% (passes 53%, 58%, 53%; 29/36 passing) to 63%
(54%, 70%, 65%; 33/36). No question went from passing in most runs to failing in most. Lower: q01
(3% to 0%: in all three runs the agent itself returned no creator, saying none it found met every
requirement; the code left none out), q02 (83% to 70%, inside its 50% spread), q12 (one run judged
as not answering, on a refusal the sentence check kept whole and the same judge passed twice).
q03 still fails (padded or short), as in two of round 3's three runs.

Scoring fixes made while measuring: the second scan reads handle fields as TikTok @handles and does
not count naming an app or "link in bio" as a contact (it had failed four runs on such captions);
the detector no longer reads a full stop before "AI" as a spaced domain; the judge gets GLM's listed
output allowance (with reasoning it ran out at 4,000 tokens with no answer on some creators).


# Round 4, Parts F, D and E (2026-11-21)

The round 4 contract's Parts F (the third review), D (spend where it buys answers) and E (the answer
in sections), in that order. Judge: glm-5.3-flash with reasoning, as in every round 4
table. Measurement rule as in round 3: three passes; a change is kept only when the mean improves by
more than the spread between passes and no question goes from passing to failing in most passes.

## F1: the intake step on the 12 dev questions (model cost only)

`pnpm bench intake-live`, against checks written by hand from each question (`bench/intakeLive.ts`).

| question | read by the code | written by hand | time |
|---|---|---|---|
| q01-ai-study-us | at most 10,000 followers; proof video at least 100,000 views; posted in the last 30 days; region United States; wanted 10 | same | 12.7s |
| q02-claude-sub10k | at most 10,000 followers | same | 2.2s |
| q03-nyu-1500 | wanted 10 ("around 1,500" is not a limit) | same | 8.7s |
| q04-toy-unboxing | posted in the last 30 days | same | 7.3s |
| q05-pingo-ai | none | none | 8.6s |
| q06-hooks-language | none | posted in the last 7 days ("this week") | 3.2s |
| q07 to q12 | none | none | 1.8 to 16.7s |

11 of 12 match; the one mismatch is q06, where the model did not propose "this week" as a recency
limit (the question asks about hooks, not creators, so it changes no result). No proposal was
refused. Model cost $0.000013 for the 12.

## D2: the paid probe (run by the previous worker on 2026-11-21, read from its saved files)

20 queries from saved traces of the size-limited questions; `tiktok.search_users` on Bison and
`tiktok.search_top` on Flamingo, the two anonymous AnyAPI sources the agent pins (`src/endpoints.ts`).
Nothing was paid again.

| | Bison `search_users` | Flamingo `search_top` |
|---|---|---|
| calls | 20, no errors | 20 first tries: 14 refused `429 provider_rate_limited`; 14 retried one by one: 13 answered |
| rows per call | 10 | 13 to 20 |
| rows with a follower count | 200 of 200 | 367 of 369 |
| rows under 10,000 followers | 159 of 200 (80%) | 237 of 369 (64%) |
| bio / region on rows | 165 / 200 of 200 | (not returned) |
| overlap with what `search_keyword` found for the same query | 1 creator of 491 | 1 to 9 videos, 1 to 11 creators per query |
| time per call | 2.0 to 3.5 s | 2.5 to 5.6 s |

So Bison's account search finds a different population (people who name the topic in their name
or bio), and Flamingo's video search carries followers but was rate limited on 70% of first tries
with three probes running at once. The agent was given Bison's account search (`search_accounts`)
and, instead of Flamingo's video search, code-bought `tiktok.profile` reads on every search with a
follower limit.

## D2: measured, not kept

q01, q02 and q08: the questions whose own follower limit drives the profile reads (q03 and q04 state
no follower limit, so the change touches them only through the model's own assumptions). Passes
`2026-11-21T18-11-20-895Z`, `18-11-21-920Z`, `18-11-22-934Z` on commit 95384ba.

| question | baseline (round 4) valid, spread, passing | with D2 valid, spread, passing | creators returned (mean) | wall (median) |
|---|---|---|---|---|
| q01-ai-study-us | 0%, 0%, 3/3 | 13%, 20%, 3/3 | 1.3 (was 0) | 263s (was 132s) |
| q02-claude-sub10k | 70%, 40%, 3/3 | 27%, 80%, 1/3 | 10 (was 7.7) | 52s (was 138s) |
| q08-uk-walking | 50%, 30%, 3/3 | 37%, 30%, 3/3 | 7.3 (was 8.3) | 179s (was 173s) |
| **these three** | 40% | 26% (passes 20%, 40%, 17%) | | |

Not kept: the mean fell, and q02 went from passing in 3 of 3 runs to 1 of 3 (one run judged padded
with an off-topic creator, one failed by the bench's second contact scan on a caption ending
"Credit:guipaulinooo"). q02 finished in two to six turns: with every row already sized, the model
stopped at ten creators that fit the size and judged topic less carefully. Reverted in e0e7475:
searches no longer buy profiles and `search_accounts` is gone. What stays: search rows that already
miss a question's view, recency or region limit are left out (they buy nothing), and
`inspect_creator` reads size before posts (D1).

Calls per question (mean of three runs), round 4 baseline, then with D2:
- q01: Bison 54.7 (search 27.3, profile 13.7, posts 13.7), then 60.3 (search 35.3, profile 21.7, posts 2.0, account search 0.7); Flamingo 0.3, then 4.0
- q02: Bison 37.7 (search 5.0, profile 16.3, posts 16.3), then 41.3 (search 2.7, profile 36.7, posts 2.0); Flamingo 0.3, then 0.7
- q08: Bison 40.7 (search 10.0, profile 15.3, posts 15.3), then 66.7 (search 14.3, profile 36.3, posts 13.3, account search 2.7); Flamingo 0, then 1.7

## D3: 8 against 16 turns, not kept

The 16-turn arm ran the same code (95384ba, with D2) from a snapshot with only the turn limit
changed. Passes `2026-11-21T18-32-13-831Z`, `-840Z`, `-867Z`.
Same three questions: they used all 8 turns in most of their saved round 4 passes (q01 3 of 3, q02
and q08 2 of 3), and their 8-turn arm is the D2 measurement above.

| question | 8 turns: valid, spread, passing | 16 turns: valid, spread, passing | creators returned / asked | turns used at 16 | wall at 8 / 16 (median, max) | cost at 8 / 16 (mean) |
|---|---|---|---|---|---|---|
| q01-ai-study-us | 13%, 20%, 3/3 | 3%, 10%, 2/3 | 1.3 / 10, then 1.0 / 10 | 16, 16, 13 | 263s, 280s / 210s, 408s | $0.0347 / $0.0324 |
| q02-claude-sub10k | 27%, 80%, 1/3 | 97%, 10%, 3/3 | 10 / 10 both | 3, 4, 4 | 52s, 194s / 78s, 129s | $0.0180 / $0.0279 |
| q08-uk-walking | 37%, 30%, 3/3 | 57%, 40%, 3/3 | 7.3, then 7.7 (none asked) | 8, 14, 15 | 179s, 203s / 173s, 409s | $0.0328 / $0.0356 |
| **overall** | 26% (20%, 40%, 17%) | 52% (40%, 60%, 57%) | | | | |

Kept at 8. On the numbers alone the mean rose by 26 points against spreads of 23 and 20, but the
whole rise is q02, which used at most 6 turns at 8 and at most 4 at 16, so the limit cannot have
caused it: it is run-to-run variation. On the two questions the limit can reach, q01 fell (13% to
3%; at 16 turns the model spread fewer calls over more turns) and q08 rose by less than its spread.
This is a judgment on an ambiguous result; the owner can reverse it. Both arms ran on D2 code, which was
then reverted.

## D4: video limits from the measurement

`src/video/limits.ts`, from bench/video-compare.md and its per-video files:
- Qwen watches the downscaled copy, 13.2 to 15.0 KB per second of video on all 17 videos, so size and
  length track together. It answered on every video up to the longest measured (177 s) except a
  145 s one (cut at the 180 s call limit) and a 157 s one (reply ran out of room); neither length nor
  size separates those from the 177 s video it answered. Bound: 177 s, the longest measured.
- The original is fetched only to be downscaled: the highest measured rate (186,612 bytes a second)
  times 177 s, 33.0 MB. The download's 120 s limit needs 275 KB/s for that; ten tools at once hold at
  most 330 MB.
- GLM, the fallback, keeps its 7 MB input limit; a video only Qwen can take has no fallback.
Every video in that table that was over the old 7 MB limit (64 to 177 s, up to 21.7 MB) is now within the limits.
Measured in the final passes (q06, q11), not separately.

## Final: three passes of all 12 questions

Passes `2026-11-21T19-09-34-268Z`, `19-09-34-363Z`, `19-09-34-390Z` on commit cf91a9f (F, D1, D4 and
E; D2 reverted; 8 turns). Beside the round 4 baseline (passes 15-50, same judge).

| question | baseline valid (spread), passing | final valid (spread), passing | fit (mean) | wall (median) | cost (mean) |
|---|---|---|---|---|---|
| q01-ai-study-us | 0% (0%), 3/3 | 0% (0%), 2/3 | 0.0 (returned 0 to 1 of 10) | 128s | $0.0179 |
| q02-claude-sub10k | 70% (40%), 3/3 | 97% (10%), 3/3 | 10.3 | 172s | $0.0234 |
| q03-nyu-1500 | 0% (0%), 0/3 | 23% (40%), 2/3 | 3.3 | 171s | $0.0320 |
| q04-toy-unboxing | 83% (30%), 3/3 | 77% (10%), 3/3 | 7.7 | 213s | $0.0247 |
| q05-pingo-ai | 97% (10%), 3/3 | 93% (20%), 3/3 | 10.0 | 148s | $0.0181 |
| q06-hooks-language | 67% (67%), 3/3 | 89% (33%), 3/3 | 11.3 | 688s | $0.0316 |
| q07-compare-three | 100% (0%), 3/3 | 100% (0%), 3/3 | 3.0 | 222s | $0.0089 |
| q08-uk-walking | 50% (30%), 3/3 | 53% (20%), 3/3 | 5.3 | 133s | $0.0182 |
| q09-b2b-payroll-cfo | 100% (0%), 3/3 | 67% (100%), 2/3 | 0.0 | 111s | $0.0303 |
| q10-partnered-anthropic | 20% (40%), 3/3 | 10% (20%), 2/3 | 1.7 | 99s | $0.0181 |
| q11-why-video | 100% (0%), 3/3 | 67% (100%), 2/3 | 0.7 | 234s | $0.0079 |
| q12-my-app | 67% (100%), 3/3 | 0% (0%), 0/3 | 0.0 | 156s | $0.0263 |
| **overall** | 63% (54%, 70%, 65%), 33/36 | 56% (57%, 57%, 55%), 28/36 | 4.4 | 171s | $0.7721 total |

Where it fell and why:
- q12 failed in all three runs, a regression of this round: the new prompt line "the question states
  no limit; any you use is an assumption" read as leave to go ahead, and the agent listed app
  promoters instead of asking which app. Fixed in 66b1668; re-measured three times: 100%, 3 of 3
  passing, no data call, 12 to 20 s (passes `2026-11-21T20-36-22-467Z`, `20-36-23-386Z`,
  `20-36-23-917Z`). With q12 at its re-measured value the twelve-question mean would be 65%
  (passes 65%, 65%, 63%); that is a splice of two measurements, not a measurement of all twelve on
  the final code.
- q09, q10 and q11 each lost one run (padded with @masterycfo, padded with @40built, and q11 judged
  not to answer once), inside the 100% spreads those questions show in every round.
- q06 now takes about 690 s: D4 lets the agent watch the long videos it used to skip, and Qwen takes
  up to its 180 s limit on each.
- q01 still returns 0 or 1 of the 10 asked; its four limits together leave almost nothing in search.

Fixed after the final measurement, as regressions of this round, and re-measured on q07 (three
writes sections in every run, costs a cent): section reasons reached the verifier without the
creators they describe and without the code's figures, so 7 of 8 were dropped (66b1668, 763572b);
after the fixes 8 of 9 sections kept their reason, q07 stayed at 100%, 3 of 3. The summary above the
sections may no longer list the creators even when the model wrote no sections (66b1668).

## Read by hand (final passes)

Best:
- q02 Claude under 10K (19-09-34-268Z): twelve creators, every one at most 10,000 followers by the
  code's check, Claude Code tutorials and Anthropic guidance; judge 10 fit, 2 partly. Weak: the
  summary listed eleven handles (now dropped by 66b1668).
- q06 hooks (19-09-34-390Z): six named hook formats as sections (AI tutor roasting the learner,
  ask-the-natives comment bait, difficulty overload, meme payoff, musical earworms, brand mascots),
  most with a reason drawn from what the watched videos show; 15 examples. Took 815 s.
- q05 Pingo AI (19-09-34-390Z): a Pingo-built Spanish account as best fit, then Spanish learners built
  around Pingo, then the same format in other languages, plus a pattern section of seven videos.

Worst:
- q01 (19-09-34-268Z): one creator of ten; the summary says plainly that big recent AI-study videos
  come from creators over the follower limit, which is the truth, but it is still one of ten.
- q10 (19-09-34-390Z): two creators, one at 59,920 followers whose sponsored video is weakly tied to
  Anthropic; no criteria line, because "recently partnered" states no number.
- q03 (19-09-34-363Z): four of ten, though the band is now honest and visible ("Assumed, not asked:
  at least 1,000 followers; at most 2,000 followers"); judged short without explaining why.

## Spend for this part

AnyAPI data $1.34 over 63 runs (D2 at 8 turns $0.25, at 16 turns $0.28, final $0.75, re-runs
$0.07); the D2 probe was the previous worker's and was not paid again. Model calls about $0.07
(agent runs $0.055, judge and second scan $0.015, intake pass $0.00001). House cost $0.


# Round 5 (2026-11-21): the closing check, the code-written fallbacks, intake

Why: a held-out evaluation (not read here) found the closing check marking criteria the evidence shows
as unknown in 26 of 30 answers and cutting the pick sentence or a whole comparison in 7 of 30, and
the intake step not accepting a limit the question stated. Work from development data only.

## Part 1: measuring the closing check offline

`pnpm bench closing-replay --tag <name>` rebuilds, for each saved run, the finish the closing check
read (the last accepted finish, validated with the question's checks in force) and replays the check
as the code now builds it: model calls only, cached per tag in `bench/out/closing-replay/`. It scores
against `bench/labels/closing.jsonl`: 365 items labelled by hand from the evidence in 24 runs of the
final passes (`19-09-34-*`, `20-36-*`), all 12 questions: 146 content criteria (10 not shown), 176
answer, note, assumption, limits and section-reason sentences (15 not shown), 43 pattern videos (13
not shown). "Shown" means the run's evidence shows it, code-computed figures and the code's checks
included; a limit, assumption or advice sentence is labelled shown when it is a fair statement of one.
`pnpm bench closing-dump` writes per-run sheets for labelling (private: they hold bios).

The old check (commit 734cf4a), replayed three times:

| items | labelled shown, kept | labelled not shown, dropped |
|---|---|---|
| criteria | 99, 104, 107 of 136 (73%, 76%, 79%) | 2, 4, 1 of 10 |
| sentences | 152, 150, 153 of 161 (94%, 93%, 95%) | 3, 3, 4 of 15 |
| pattern videos | 16, 18, 20 of 30 (53%, 60%, 67%) | 11, 11, 9 of 13 |
| all | 82%, 83%, 86% | 42%, 47%, 37% |

What it was missing, from its own reasons on the 60 shown items it dropped in the first replay:
26 needed a figure or check the code computed and never sent (views against usual views, days since
posting, the view floor, posts a week, paid label, public email; each criterion was sent with one
cited text only, often the bio); 16 were whole runs voided because the reply used an id it was not
given ("c1.1" for "c0.1"; strict parsing, B7, then drops everything); 10 were pattern videos lost
because fewer than two videos confirmed the whole pattern text, so the pattern vanished; 6 lacked the
caption, bio or other videos beside the one cited text; 2 named a creator who was not in what it was
sent (a creator outside the answer, or the one the question names).

## Part 2: what changed

- `src/finish/subjects.ts`: for each claim or sentence, the creator or video it is about, with bio,
  code-computed figures (followers, usual views, times usual views, days ago, region, paid label,
  public email, found by search), the checks the code applied and their results, and videos: in full
  (caption, what is said, what was seen) for proof, cited and named ones, short for the recent posts
  the usual views come from and those searches found. Transcripts lose their cue timings.
- `src/finish/verify.ts`, `narrative.ts`: items and sentences carry `about`; creators named by
  @handle in a sentence or the question are in the digest; plain sequential ids; the instructions say
  figures and checks are facts, comparison words must agree with them, a region is where a video was
  posted, an audience claim is not shown unless stated, a bare recommendation is general, and to name
  the weakest part first. One verdict per item, strict parsing kept.
- `src/finish/askReadable.ts`: a reply that cannot be read is asked once more (10 of 216 run replays
  had an unreadable reply); a failed or timed-out call is not.
- Closing hold (`src/closing.ts`), re-derived as before from the largest request over the 208 saved
  agent runs: claims 105,410 bytes, sentences 103,021, scan 12,561; $0.0130 at GLM's list price,
  was $0.0063. The second try is not held; it runs only if the money left can reserve it.

The new check, replayed three times (tags final-a..c):

| items | labelled shown, kept | labelled not shown, dropped |
|---|---|---|
| criteria | 126, 129, 133 of 136 (93%, 95%, 98%) | 8, 8, 6 of 10 |
| sentences | 147, 144, 149 of 161 (91%, 89%, 93%) | 11, 8, 7 of 15 |
| pattern videos | 22, 20, 23 of 30 (73%, 67%, 77%) | 12, 13, 11 of 13 |
| all | 90%, 90%, 93% | 82%, 76%, 63% |

Criteria and patterns kept rose; everything labelled not shown is dropped more often in every kind.
Sentences labelled shown are kept slightly less often (91% mean against 94%): most of those cut carry
a clause the evidence does not state (who the audience is, "cheap", "strongest example", "reliably
breaks out" where most videos sit at usual views) that my labels let through; I did not relabel after
seeing results. Intermediate prompt versions measured on the way (tags after-1..3, v4-*, v5-*) sit
between these. One reply in the final replays was still unreadable twice in a row.

## Part 3: an answer the check cut is never left broken

`src/finish/fallbacks.ts`, run after the check: when no sentence of the answer is left but creators
remain, "N creators meet every check the question set; the reasons are in the sections below." (or
"The answer lists N creators ..." with no question checks; "The answer found N patterns ..." for
patterns alone); when the question links a video and a sentence was cut and what is left names
neither it nor its creator, "This answer is about the video <id> by @<creator>."; when the question
compares @handles and a sentence was cut and what is left does not name the best fit, "Of the
creators compared, the answer's best fit is @<handle>." They are labelled facts and listed in the new
`Answer.codeSentences` so the bench's figure check does not read them as model text. A pattern fewer
than two of whose videos confirm it keeps its videos under its label ("Secret pulls: ..." keeps
"Secret pulls", else "Pattern"), so its section keeps its members.

## Part 4: intake

Live, the intake step alone over the 12 dev questions and 33 written phrasings (`bench/intakePhrasings.ts`):
21 of 45 differed from the hand-written checks on the old code, 1 of 45 now. Before, the model did
not propose "this month" (q04), "this week" (q06), or countries given as "in Italy", "from Brazil",
"Canadian creators"; and the code refused ranges ("between 5K and 20K", "10k-50k", "2k–20k"), "50K or
fewer", "20,000 or more", "over half a million", "in the last 24 hours". The one left: "German fitness
creators" is refused by design, since the code reads a country adjective only right before a word
for people ("Italian food creators", "Spanish learning creators" name topics). Nothing was invented
in any of the 45; "around 5k", "roughly 10k", "recently", "small", "big" read as no limit.

## One live pass on the final code (7da5e65)

Pass `2026-11-21T23-07-50-362Z`: valid results 71%, 11 of 12 runs passing (q03 padded with
@kaleoknight, 2,518 followers against the agent's own assumed 2,500, which an assumed check shows as
contradicted rather than removing). Beside the last three passes: 56% (28 of 36 passing), about 65%
with q12's fix. One pass cannot show an improvement in the score; this round's measured result is the
replay's two rates above. In the pass 13 of 169 content criteria became unknown, every answer kept its
own summary (no code-written sentence was needed), and intake read q04's 30 days and q06's 7.
q08 fell to 30% (two creators the agent never inspected, followers unknown, judged partly).

Spend: AnyAPI $0.245 (the live pass). Models about $0.032 (replays $0.026, intake passes $0.0004,
live pass $0.0036, judge and second scan $0.0016).


# Round 7 (2026-11-22): the code runs the wide search, the agent judges topic

Measured and **not kept**: reverted in 24edb85. The last-turn
change (item 7, e180dbb) is kept.

## What was built (679b2ac, 6679476, 0faef38; reverted)

- The rule: intake read the limits, and one is a follower limit or a view threshold. On the twelve
  development questions (hand-written checks in `bench/intakeLive.ts`) it selects q01, q02 and q08;
  none is a hooks or pattern question.
- One agent-model call (low effort, JSON, reserved) proposes search phrases; the code runs them
  through `search_videos` breadth first, 10 at a time (most-liked order under a view threshold, the
  question's recency window), pages on the phrases that produced a passing row, reads each creator
  of a passing row through `inspect_creator` by best views (posts only inside the follower limits),
  and stops at twice the creators asked for (twenty when no number), at no more pages, or when the
  money left is the agent's hold. Traced as turn 0 with the existing step kinds ("think", "search",
  "creator"). The agent's first message lists the creators that meet every limit and asks it to
  judge topic.
- The agent's hold, from 70 saved agent runs at the 8-turn limit (`pnpm bench sweep-hold`, all
  twelve questions): its model turns billed at most $0.000868, its transcript reads and watches at
  most $0.014431, its largest request 138,435 bytes (all q06), so $0.000868 + $0.014431 + the bound
  of a 138,435-byte request with 4,000 output tokens on the dearest agent model (deepseek-v4.1-flash,
  $0.011984) = **$0.0273**, beside the closing hold ($0.0130). The sweep could spend about $0.059.
- Two changes after live trials on q01 (before the measurement, no prompt changed): paging followed
  only phrases whose last page had a passing row and stopped after 13 searches (6679476); and
  most-liked order, because on q01's saved runs with its limits applied most-liked searches showed
  0.50 passing rows per call (59 over 119) against 0.26 for relevance (78 over 299) (0faef38).

## Proof 1: the selected questions, three passes before and after

Before: passes `2026-11-21T23-07-50-362Z` (commit 7da5e65, the same code as 70abd23),
`2026-11-22T06-14-03-699Z`, `06-19-23-942Z` (70abd23). After: `2026-11-22T06-36-36-190Z`,
`07-09-18-631Z`, `07-42-42-209Z` (0faef38). Judge glm-5.3-flash with reasoning.

| question | valid (spread), passing | fit (mean) | returned / asked (mean) | published cost (mean) | wall (median) | how the runs ended |
|---|---|---|---|---|---|---|
| q01 before | 3% (10%), 3/3 | 0.3 | 0.7 / 10 | $0.0183 | 115s | finish on turn 8, all three |
| q01 after | 0% (0%), 0/3 FAILS | 0.3 | 1.7 / 10 | $0.0290 | 178s | finish on turn 8, all three |
| q02 before | 97% (10%), 3/3 | 9.7 | 10.7 / up to 10 | $0.0183 | 110s | turns 6, 8, 8 |
| q02 after | 33% (100%), 1/3 FAILS | 11.3 | 11.7 / up to 10 | $0.0437 | 174s | turns 3, 4, 3 |
| q08 before | 40% (20%), 3/3 | 4.0 | 5.7 / up to 10 | $0.0161 | 102s | turn 8, all three |
| q08 after | 40% (20%), 3/3 | 4.0 | 7.7 / up to 10 | $0.0303 | 140s | turns 1, 5, 4 |
| **three, before** | **47%** (passes 43%, 50%, 47%) | | | | | no call refused |
| **three, after** | **24%** (passes 43%, 17%, 13%) | | | | | no call refused |

Three of the after failures are contact flags that are not a way to contact anyone: in q01 (06-36)
the bench detector read "(or even a YouTube video)" as a network handle; in q02 (07-09, 07-42) the
second scan read a GitHub repository name in a caption. Read by hand as passing, the after mean is
47% (passes 47%, 50%, 43%), the same as before; q01 is then 3% (10%), 1 of 3 passing (one run padded
with @getcub3d, one short without saying why). Either way the mean does not move beyond the spread:
not kept. The scorers were not changed.

What the sweeps did (turn 0): q01 15 to 18 searches and 3 to 5 creators read for $0.010 to $0.013,
handing over 2 creators that met every limit each time; it stopped because no phrase had another
page (US, 100,000 views and 30 days together leave about one passing row per ten searches, and a
phrase with none on page one is never paged). q02 10 searches and 52 to 57 creators read for $0.041
to $0.044, handing over 23 to 26; q08 8 to 18 searches and 11 to 34 creators for $0.018 to $0.034,
handing over 8 to 26. On q02 and q08 every returned creator came from the handover, and the agent
finished in 1 to 5 turns, reading transcripts or watching in 4 of 6 runs; the judge found no more on
topic (q08 fit 4.0 both; q02 9.7 to 11.3), only more creators judged partly.

A swept question cost, per run (mean) at published prices: q02 $0.044, 174 s; q01 $0.029, 178 s;
q08 $0.030, 140 s, against $0.016 to $0.018 before.

## Proof 2: all twelve, three passes after, against round 4's final table

| question | round 4 final valid (spread), passing | after valid (spread), passing |
|---|---|---|
| q01-ai-study-us | 0% (0%), 2/3 | 0% (0%), 0/3 FAILS |
| q02-claude-sub10k | 97% (10%), 3/3 | 33% (100%), 1/3 FAILS |
| q03-nyu-1500 | 23% (40%), 2/3 | 20% (40%), 2/3 |
| q04-toy-unboxing | 77% (10%), 3/3 | 63% (40%), 3/3 |
| q05-pingo-ai | 93% (20%), 3/3 | 70% (30%), 3/3 |
| q06-hooks-language | 89% (33%), 3/3 | 89% (33%), 3/3 |
| q07-compare-three | 100% (0%), 3/3 | 100% (0%), 3/3 |
| q08-uk-walking | 53% (20%), 3/3 | 40% (20%), 3/3 |
| q09-b2b-payroll-cfo | 67% (100%), 2/3 | 67% (100%), 2/3 |
| q10-partnered-anthropic | 10% (20%), 2/3 | 10% (20%), 2/3 |
| q11-why-video | 67% (100%), 2/3 | 100% (0%), 3/3 |
| q12-my-app | 0% (0%), 0/3 (fixed after in 66b1668) | 100% (0%), 3/3 |
| **overall** | 56% (57%, 57%, 55%), 28/36 | 58% (57%, 55%, 61%), 28/36, $0.6866 total |

q01 and q02 went from passing in most runs to failing in most (q02's two are the GitHub-name flag
above; q01's are one detector flag, one padded, one short). No question the sweep does not run on
changed its path; their moves are within the spreads these questions show in every round.

## Item 7: the last turn says why the research stops (kept)

The last turn's message now says the turn limit, not the budget, ends the research when money is
left. In the 36 after runs no answer said the budget ran out; 13 said the turns ran out, every one
with 8 turns used and no call refused. In the six new before runs one did (q01, 06-14, "before budget
ran out", 8 turns, none refused), as nine earlier saved runs had.

## Spend

AnyAPI: $0.851 of data over 45 runs (two before passes of three questions $0.095, three q01
trials $0.084, three after passes of twelve $0.673). Models about $0.019 (runs $0.016, judge and
second scan $0.003).

## Second attempt: the sweep covers the day-one script's ground (f430bbc on the restored sweep; reverted)

Measured on q01 and **not kept**:
the four commits (9558b06, 47a63ae, 292694e restoring the first attempt, f430bbc changing it) are
reverted in the commit after this section's runs; the tree is again `ab88e6b`.

What f430bbc changed:
- Paging: breadth first by depth, every open search's next page with the fewest pages first, whatever
  its earlier pages held; a search leaves when it has no further page or an empty one.
- Sort: most-liked under a view threshold, the other sort not run. On q01's 15 saved runs since intake
  (limits applied) a phrase's first page found 0.50 new creators with a passing row per call by
  most-liked (135 calls) against 0.28 by relevance (263); the other sort's first page after one sort
  found 0.29 per call after most-liked (7 calls) and 0.00 after relevance (4), too few to show it earns
  its calls. Second pages: 0.07 (most-liked, 15 calls), 0.12 (relevance, 25).
- Phrases: the call asks for 24 (the day-one script's count), most likely first; the model gave 20, 24, 24.
- Second wave, from the rows, no model call: once every phrase has two pages, tags on near rows (at most
  one row check missed) of two creators reached by two phrases, leaving out tags on the rows of more
  than half the phrases searched ("generic") and tags already searched, most near creators first. On
  the first attempt's saved q01 rows this rule marked studytok, studytips, studyhacks, aitools, study,
  ai and fyp generic and kept app names (aistote, quizai, notebooklm, studyfetch).
- Size checks after each level; a search launches only while the inspections of creators found and not
  read, and those the searches in flight are expected to add at the sweep's own rate, stay held.

### q01, three passes after (pass `2026-11-22T08-41-48-947Z`, r1 to r3), beside the before passes

| q01 | valid (spread), passing | fit (mean) | returned / asked | published cost (mean) | wall (median) | how the runs ended |
|---|---|---|---|---|---|---|
| before (23-07-50, 06-14-03, 06-19-23) | 3% (10%), 3/3 | 0.3 | 1, 0, 1 / 10 | $0.0183 | 114s | finish on turn 8, all three |
| first attempt (06-36-36, 07-09-18, 07-42-42) | 0% (0%), 0/3 as scored | 0.3 | 1, 2, 2 / 10 | $0.0290 | 177s | finish on turn 8, all three |
| **second attempt (08-41-48)** | **7% (10%), 3/3** (runs 10%, 0%, 10%) | 0.7 | 2, 3, 2 / 10 | $0.0628 | 159s | finish on turn 8, all three |

Judge glm-5.3-flash with reasoning, scorers unchanged; no contact flag in these three runs. The mean
moved 3% to 7% with a spread of 10%: not beyond the spread, so per the contract the wider measurement
(q02, q08, all twelve) was not run.

### What the sweeps did (turn 0), beside the day-one script

| | searches (distinct) | profiles | post lists | data cost | in-limit creators found |
|---|---|---|---|---|---|
| day-one script | 89 | 31 | 12 | $0.068 | 12 (about half on topic) |
| first attempt, per run | 15 to 18 | 3 to 5 | | $0.010 to $0.013 | 2 |
| r1 | 52 (36: 20 phrases, 16 tags) | 33 | 14 | $0.0522 | 14 |
| r2 | 55 (35: 24 phrases, 11 tags) | 33 | 14 | $0.0522 | 14 |
| r3 | 53 (40: 24 phrases, 16 tags) | 33 | 13 | $0.0516 | 13 |

Whole runs, calls by kind: r1 68 searches, 33 profiles, 14 post lists, 10 transcripts, 2 video
downloads; r2 65, 33, 14, 6, 0; r3 62, 33, 13, 11, 0.

- Every sweep stopped on room: $0.052 of searching and reading, with the closing hold ($0.0130) and the
  agent's hold ($0.0273) kept back, against the day-one script's $0.068. It reached the wave's first
  page and never its second. The agent's turns then spent $0.008 to $0.015 of the $0.0273 held; the
  runs ended at $0.060 to $0.067 of $0.10.
- The breadth now matches the day-one script (13 to 14 creators inside all four limits, against its 12),
  but topic does not. Of the 41 handed over, 34 came only from wave tags, and the tags that passed the
  generic rule were broad: studying, studymotivation, collegestudent, collegelife, school, university,
  finals, viral, chatgpt, and "1". With narrow AI-note-app phrases these tags reached fewer than half the
  phrases, so the rule measured on the first attempt's broader phrases did not mark them generic. They
  brought memes, a Russian motivation video, police clips, calculus and FAFSA posts.
- The agent judged topic as asked: it read 6 to 12 transcripts, searched 9 to 16 more times, and
  returned only the 2 to 3 it judged on topic (dallasstudydiaries, studywithhuze, studyingwalexaa,
  studywithzj; three of these are also in the day-one script's twelve). The judge rated 2 of the 7 fit
  and 5 partly. All three runs still used all 8 turns.

### Spend

AnyAPI: $0.188 of data (three q01 runs; $0.0672, $0.0609, $0.0597). Models about $0.0008
(runs $0.0006, judge and second scan $0.0002). Round 7 so far: $1.039 of data.
