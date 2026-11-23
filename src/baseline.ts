import type { Tier } from "./answer.ts";
import { mapLimit } from "./concurrency.ts";
import { INSPECT_CREATOR_USD } from "./endpoints.ts";
import type { VideoRow } from "./evidence.ts";
import { forcedFinish } from "./finish/forced.ts";
import { parseFinish } from "./finish/parse.ts";
import { MODEL_MAX_TOKENS, MODEL_TIMEOUT_MS, TOOL_PARALLELISM } from "./limits.ts";
import type { ChatRequest } from "./llm.ts";
import { callModel, type ChatResponse } from "./modelCall.ts";
import { bytesBoundUsd, callBoundUsd, modelBoundUsd } from "./modelCost.ts";
import { cleanUserText } from "./modelText.ts";
import { systemPrompt, userPrompt } from "./prompt.ts";
import { verifyFinish } from "./closing.ts";
import { checkFinish, closeSession, openSession, sinceStart, type Services, type Session } from "./session.ts";
import { canonicalCalls } from "./tools/canonical.ts";
import { runTracedTool } from "./tools/traced.ts";
import { FINISH_TOOL } from "./tools/schemas.ts";
import { videoForModel } from "./tools/searchVideos.ts";
import type { RunOutput, TraceToolCall } from "./trace.ts";

const PLAN_PROMPT = `Plan TikTok searches for the question below. Reply with JSON only:
{"searches":[{"query":"...","sort":"relevance|most-liked|date-posted","days":0|1|7|30|90|180}],
"min_views":null or a number,"max_followers":null or a number,"region":null or a two-letter country code}
Use phrases creators actually write or say. Set a filter only when the question asks for it.`;

interface Plan {
  searches: Record<string, unknown>[];
  minViews: number | null;
  maxFollowers: number | null;
  region: string | null;
}

/** The plain baseline: one model call plans searches, a fixed pipeline runs them, one model call answers. */
export async function runBaseline(question: string, tier: Tier, services: Services): Promise<RunOutput> {
  const session = openSession(question, tier, services);
  const { budget, store } = session.ctx;
  const planned = await call(session, 1, request(session, `${PLAN_PROMPT}\n\n${userPrompt(session.question, tier, budget.limitUsd, session.intake)}`, false));
  if (!planned) return closeSession(session, forcedFinish(store, "the planning call did not answer", session.ctx.nowSec, null), "forced", []);
  const plan = parsePlan(cleanUserText(planned.content).value, session.question);
  const holdModels = services.agentModels;
  budget.setModelReserve(callBoundUsd(services.modelPrices, { ...answerRequest(session, plan, []), models: holdModels }));
  const searchCalls = await mapLimit(plan.searches, TOOL_PARALLELISM, (s) => tool(session, "search_videos", s));
  const ranked = rankCreators(store.snapshot().videos, plan);
  const inspectCalls = await mapLimit(ranked, TOOL_PARALLELISM, async (handle) => {
    if (budget.spendableUsd < INSPECT_CREATOR_USD) return null;
    const done = await tool(session, "inspect_creator", { handle });
    budget.addModelReserve(bytesBoundUsd(services.modelPrices, holdModels, Buffer.byteLength(JSON.stringify(done.result))));
    return done;
  });
  const inspected = inspectCalls.filter((c): c is TraceToolCall => c !== null);
  session.trace[0]?.toolCalls.push(...searchCalls, ...inspected);
  const candidates = inspected
    .map((c) => c.result)
    .filter((r) => !r.error && (plan.maxFollowers === null || (typeof r.followers === "number" && r.followers <= plan.maxFollowers)));
  budget.setModelReserve(0);
  // The verifier's calls are held for closing; the answer call must fit in what is spendable.
  while (candidates.length && callBoundUsd(services.modelPrices, answerRequest(session, plan, candidates)) > budget.spendableUsd) candidates.pop();
  const answered = await call(session, 2, answerRequest(session, plan, candidates));
  const finishCall = answered ? canonicalCalls(answered.toolCalls, [FINISH_TOOL]).calls[0] : undefined;
  if (!finishCall) return closeSession(session, forcedFinish(store, "the answer call did not finish", session.ctx.nowSec, null), "forced", []);
  const { failures, kept } = checkFinish(session, parseFinish(JSON.parse(finishCall.function.arguments) as Record<string, unknown>));
  const v = { llm: services.llm, budget, prices: services.modelPrices, model: services.verifierModel };
  const verified = await verifyFinish(v, store, kept, session.question, session.ctx.nowSec, sinceStart(session));
  session.verify = verified.call;
  return closeSession(session, verified.kept, "model", [...failures, ...verified.notes]);
}

function request(session: Session, content: string, finish: boolean): ChatRequest {
  const messages: ChatRequest["messages"] = finish
    ? [{ role: "system", content: systemPrompt(session.ctx.nowSec) }, { role: "user", content }]
    : [{ role: "user", content }];
  return {
    models: session.services.agentModels,
    messages,
    maxTokens: MODEL_MAX_TOKENS,
    timeoutMs: MODEL_TIMEOUT_MS,
    ...(finish ? { tools: [FINISH_TOOL] } : {}),
  };
}

/** The answer call: the question, the inspected candidates and the videos the searches found by them. */
function answerRequest(session: Session, plan: Plan, candidates: Record<string, unknown>[]): ChatRequest {
  const handles = new Set(candidates.map((r) => r.handle));
  const videos = [...handles]
    .flatMap((h) => session.ctx.store.videosBy(String(h)).filter((v) => v.foundBy.length > 0 && passes(v, plan)))
    .map((v) => videoForModel(v, session.ctx.nowSec));
  const { question, tier, ctx } = session;
  const content = `${userPrompt(question, tier, ctx.budget.limitUsd, session.intake)}\n\nCandidate creators (inspected):\n${JSON.stringify(candidates)}\n\nMatching videos:\n${JSON.stringify(videos)}\n\nCall finish now.`;
  // At its own limit, reasoning used every token on about 40 candidates and wrote no answer
  // (finish_reason length, 2026-11-20); at low effort the same call finished in 1,722 tokens.
  return { ...request(session, content, true), reasoningEffort: "low" };
}

/** Makes one model call if its most possible cost fits what is left, and traces it. */
async function call(session: Session, turn: number, req: ChatRequest): Promise<ChatResponse | null> {
  const startedMs = sinceStart(session);
  const trace = (note: string): null => {
    session.trace.push({ turn, model: null, startedMs, ms: 0, costUsd: 0, finishReason: null, attempts: [], content: "", toolCalls: [], note });
    return null;
  };
  const prices = session.services.modelPrices;
  try {
    const res = await callModel(session.services.llm, session.ctx.budget, req, (m) => modelBoundUsd(prices, m, req));
    const content = cleanUserText(res.content).value;
    session.trace.push({ turn, model: res.model, startedMs, ms: res.ms, costUsd: res.chargedUsd, finishReason: res.finishReason, attempts: res.attempts, content, toolCalls: [], note: null });
    return res;
  } catch (err) {
    return trace(err instanceof Error ? err.message : String(err));
  }
}

function tool(session: Session, name: string, args: Record<string, unknown>): Promise<TraceToolCall> {
  return runTracedTool(session.ctx, name, JSON.stringify(args), sinceStart(session));
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function parsePlan(content: string, question: string): Plan {
  const start = content.indexOf("{");
  const end = content.lastIndexOf("}");
  let raw: Record<string, unknown>;
  try {
    raw = start >= 0 && end > start ? (JSON.parse(content.slice(start, end + 1)) as Record<string, unknown>) : {};
  } catch {
    raw = {};
  }
  const searches = Array.isArray(raw.searches)
    ? raw.searches.filter((s): s is Record<string, unknown> => typeof s === "object" && s !== null)
    : [];
  return {
    searches: searches.length ? searches : [{ query: question }],
    minViews: num(raw.min_views),
    maxFollowers: num(raw.max_followers),
    region: typeof raw.region === "string" && /^[A-Za-z]{2}$/.test(raw.region) ? raw.region.toUpperCase() : null,
  };
}

function passes(v: VideoRow, plan: Plan): boolean {
  return (plan.minViews === null || (v.views ?? 0) >= plan.minViews) && (plan.region === null || v.region === plan.region);
}

/** Creators with a video that passes the filters, best video first. */
export function rankCreators(videos: VideoRow[], plan: Plan): string[] {
  const best = new Map<string, number>();
  for (const v of videos) {
    if (passes(v, plan)) best.set(v.author, Math.max(best.get(v.author) ?? 0, v.views ?? 0));
  }
  return [...best.entries()].sort((a, b) => b[1] - a[1]).map(([h]) => h);
}
