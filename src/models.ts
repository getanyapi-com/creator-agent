/**
 * The models a run uses, as chosen on 2026-11-21 (round 4, Part C): no Gemini model anywhere.
 * The agent model, then its fallback when no seller offers it at the discount floor.
 */
export const AGENT_MODELS = ["glm-5.3-flash", "deepseek-v4.1-flash"];
/** Qwen watches first and is waited for; GLM watches the original only when Qwen fails or passes its limit (round 4, B3). */
export const VIDEO_MODELS = { primary: "qwen3.8-omni-flash", fallback: "glm-5.3-flash" };
/** Reads each content claim and each sentence of the answer beside its evidence (round 4, C1). */
export const VERIFIER_MODEL = "glm-5.3-flash";
/** Scans every free-text string of the display object for a way to contact a person (round 4, A2 and C1). */
export const CONTACT_SCAN_MODEL = "glm-5.3-flash";
