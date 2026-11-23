/**
 * What the video path takes (round 4, D4), each from the measurement of 2026-11-21 in
 * bench/video-compare.md (17 real TikTok videos of 12 to 177 s; per-video sizes in
 * bench/out/video-compare/<pass>/<id>-meta.json).
 *
 * Qwen watches the downscaled copy, which is 13.2 to 15.0 KB per second of video on every one of the
 * 17, so its size and the video's length track each other and one bound covers both. Qwen answered
 * on every video up to the longest measured (177 s, answered in 124 s) except two, a 145 s video cut
 * at the 180 s call limit and a 157 s video whose reply ran out of room; neither length nor size
 * separates those from the 177 s one it answered. Nothing longer was measured, so the bound is the
 * longest video measured.
 */
export const MAX_WATCH_SECONDS = 177;

/** The most bytes per second of video an original file had in the measurement (64 s, 12.0 MB). */
const MAX_ORIGINAL_BYTES_PER_SECOND = 186_612;

/**
 * The original is downloaded only to be downscaled, which needs the whole file in memory: at the
 * highest measured rate a video of the longest length watched is 33.0 MB. The download's own time
 * limit (120 s) needs 275 KB/s for that; with ten tools at a time a question holds at most 330 MB.
 */
export const MAX_ORIGINAL_BYTES = MAX_ORIGINAL_BYTES_PER_SECOND * MAX_WATCH_SECONDS;

/**
 * GLM, the fallback watcher, is sent the original file itself: Surplus Intelligence takes inputs up
 * to about 7.5 MB and the spec sends originals under 7 MB. A video only Qwen can take has no fallback.
 */
export const GLM_MAX_ORIGINAL_BYTES = 7_000_000;
