# Qwen against GLM as the video watcher (round 4, B3, 2026-11-21)

`pnpm bench video-compare` (bench/videoCompare.ts), two batches on 2026-11-21. The command writes
raw replies, transcripts and frame sheets under `bench/out/video-compare/`; this run's are not in the
repository.
Same prompt for every call (`WATCH_PROMPT`). Qwen (`qwen3.8-omni-flash`) watched the downscaled copy
(360p, 12 fps); GLM (`glm-5.3-flash`) the original as a `video_url` part with `max_tokens` 6000,
alone and with the video's transcript in the same call. Every call had the agent's model-call
limit (180 s). I checked each readable answer against the transcript and two frame sheets per video.
Columns: time, output tokens, billed dollars, then hook / on-screen text / spoken words / product
timing (y right, n wrong, - nothing to check), and how useful "why it did well" is.

## Videos both models could take (original under the 7 MB input limit)

| video (length, hook) | Qwen on the small copy | GLM on the original | GLM with the transcript |
|---|---|---|---|
| duolingo (12 s, written) | 39 s, 2,795, $0.000001; y/y/y/-; useful | 21 s: did not receive the video (119 input tokens), said so | 55 s: no video; wrote "observations" from the transcript only |
| jordynnehahn (15 s, written) | 50 s, 4,249, $0.000003; y/y/no captions to check/-; useful | 26 s: did not receive the video | 38 s: did not receive the video |
| tooned.ai (30 s, spoken), run 1 | 39 s, 2,548, $0.000002; y/y/y (also the flat synthetic voice)/y; useful | 74 s, 2,423, $0.000098; y/y/from on-screen text only/y (saw the crying filter); useful | HTTP 400 request_rejected |
| tooned.ai, run 2 | 53 s, 3,078, $0.000002; y/y/y/y; useful | 34 s, 2,045, $0.000096; y/y/text only/y; useful | 102 s: ran out at 6,000 tokens, unreadable |
| madisonspeaksspanish (32 s, spoken), run 1 | 32 s, 1,745, $0.000002; y/y/y/y (app screenshot card at 0:14); useful | HTTP 400 request_rejected | HTTP 400 request_rejected |
| madisonspeaksspanish, run 2 | 48 s, 2,858: reply not readable JSON | fetch failed | 26 s, 943, $0.000064; y/y/y (from transcript)/y; useful |
| numbersgirldaja (59 s, spoken) | 70 s, 4,393, $0.000004; y/y (bracket table)/y/-; useful | 52 s: did not receive the video; wrote "No video content was accessible" as an observation | 163 s: empty reply |
| hershygoldstein (60 s, spoken) | 111 s, 8,437, $0.000006; y/y (exact card text)/y (and the music)/y ("Friday" end card at 0:59); useful | 72 s, 3,199, $0.000278; y/y/y/y (0:57); useful | 107 s: ran out at 6,000, unreadable |
| viralex.aii (84 s, spoken) | 104 s, 7,439, $0.000006; y/y/y/y (each setup step timed); useful | 102 s: ran out at 6,000, unreadable | 106 s, 5,764, $0.000201; y/y/y/y; useful |
| michelann_ (122 s, spoken) | 103 s, 6,160, $0.000007; y/y (naira captions)/y/y; useful | 76 s, 2,543, $0.000350; two observations for the whole video, text y, closing ad card y, speech not reported; thin | 51 s, 1,475, $0.000775; y/y/y/y; useful |

## Videos only Qwen could take (original over 7 MB)

| video (length) | Qwen |
|---|---|
| dallasstudydiaries (64 s) | 127 s, 8,129, $0.000006; matches the transcript and the paper-strip demo |
| askcatgpt (64 s) | 72 s, 5,662, $0.000005; matches |
| shinygirlxoxo (85 s) | 80 s, 5,445, $0.000006; matches |
| addystudys (85 s) | 138 s, 9,478, $0.000007; matches |
| curv_lab (89 s) | 169 s, 12,159, $0.000009; matches, with the marker and typing sounds |
| willfrancis24 (132 s) | 125 s, 8,821, $0.000008; matches |
| algerianenglishman (145 s) | cut at 180 s, no answer |
| worstcase.stories1 (157 s) | 122 s, 9,868: stopped at its length limit, unreadable |
| hunnyygirll (177 s) | 124 s, 5,631, $0.000009; matches |

## What it shows

- Qwen: 21 calls on 19 videos; 18 readable, every one right on hook and on-screen text where I could
  check; 1 cut at 180 s (145 s video); 2 unreadable. 32 to 169 s, median 103 s. It hears: it reports
  synthetic voices, background music and sounds that only the audio carries.
- GLM alone: 10 calls on 9 videos; 4 readable answers from the video, 3 times it did not receive the
  video at all, 2 refused or failed, 1 ran out of tokens. 18 to 102 s. It never reported anything only
  the audio carries; on spoken hooks it read the on-screen text. Billed 15 to 50 times Qwen per call.
- GLM with the transcript: 3 readable answers from the video in 10 calls; it often spends its 6,000
  tokens and stops mid-reply.
- So Qwen stays first, as decided; the table does not show it doing a worse job. GLM is the
  fallback, and a GLM reply billed no video tokens now counts as a failure (`src/video/watch.ts`).
- Qwen's longest output, 12,159 tokens, is the new hold (`QWEN_OUTPUT_HOLD_TOKENS`); GLM's rate of up
  to 1,217 input tokens per second of video bounds the fallback (`GLM_VIDEO_TOKENS_PER_SECOND`).
- 8 of the 17 originals were over the video path's 7 MB file limit (64 to 177 s). In the agent those
  are reported as "too long to watch" and never watched, though Qwen watches the small copy and took
  7 of those 8 here. Raising that limit for Qwen's path is the owner's call.

Spent: $0.0426 of AnyAPI credit (downloads and transcripts), $0.0026 of model calls.
