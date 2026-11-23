import { signInRequired, viewerId } from "@/auth/session";
import { accountTier, WALLET_ENDED, WALLET_UNFUNDED, WALLET_UNREACHABLE } from "@/auth/tier";
import { HOUSE_CAP } from "@/auth/tierCopy";
import { config } from "@/server/config";
import { readCappedText } from "@/server/readCapped";
import { startRun } from "@/server/liveRun";

/**
 * The largest body a question of `maxChars` characters can be: the JSON this app's ask box sends,
 * `{"question":"..."}`, with every character written in the longest form JSON allows, a pair of
 * `\uXXXX` escapes (12 bytes) for a character outside the Basic Multilingual Plane.
 */
function maxBodyBytes(maxChars: number): number {
  return JSON.stringify({ question: "" }).length + 12 * maxChars;
}

/** The `question` field of a JSON body, or null. */
function questionIn(text: string): unknown {
  try {
    const body: unknown = JSON.parse(text);
    return typeof body === "object" && body !== null ? (body as { question?: unknown }).question : null;
  } catch {
    return null;
  }
}

const BUSY = "Too many questions are being researched right now. Try again in a few minutes.";

/**
 * Starts a real question for the signed-in account, on the tier the server grants it (`accountTier`; the dev
 * bar's override is for looking only and never reaches a run, and no tier the browser sends is read); the browser
 * goes to /t/<id> and follows it there. A 409 means the account's wallet connection has just ended and it is now free;
 * a 402 that its wallet holds too little for one question.
 */
export async function POST(request: Request) {
  const userId = await viewerId();
  if (userId === null) return signInRequired();
  const maxChars = config().MAX_QUESTION_CHARS;
  const tooLong = Response.json({ error: `Questions can be at most ${maxChars} characters.` }, { status: 400 });
  const text = await readCappedText(request, maxBodyBytes(maxChars));
  if (text === null) return tooLong;
  const question = questionIn(text);
  if (typeof question !== "string" || question.trim() === "") {
    return Response.json({ error: "Write a question first." }, { status: 400 });
  }
  if ([...question.trim()].length > maxChars) return tooLong;
  const tier = await accountTier(userId);
  if (tier === "unreachable") return Response.json({ error: WALLET_UNREACHABLE }, { status: 503 });
  // Asked as a private wallet question; run as free it would be public, so it is refused and counts nothing (ruled 2026-11-22).
  if (tier === "ended") return Response.json({ error: WALLET_ENDED }, { status: 409 });
  // The wallet cannot pay for one question; refused before anything is counted or run, and the connection stays.
  if (tier === "unfunded") return Response.json({ error: WALLET_UNFUNDED }, { status: 402 });
  const started = await startRun(question, userId, tier);
  if (!("refused" in started)) return Response.json(started);
  // The page words this message from `allowance`, in the reader's own clock.
  if (started.refused === "none-left") return Response.json({ error: "No questions left today.", allowance: started.allowance }, { status: 429 });
  return Response.json({ error: started.refused === "busy" ? BUSY : HOUSE_CAP[started.tier] }, { status: 503 });
}
