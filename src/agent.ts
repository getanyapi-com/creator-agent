import type { DroppedClaim, Tier } from "./answer.ts";
import { verifyFinish } from "./closing.ts";
import { mapLimit } from "./concurrency.ts";
import { intakeStep, toolStep, turnStep, verifyStep } from "./display/steps.ts";
import { forcedFinish } from "./finish/forced.ts";
import { isEmptyFinish, parseFinish, type FinishArgs } from "./finish/parse.ts";
import { readQuestionChecks } from "./intake/intake.ts";
import { MODEL_MAX_TOKENS, MODEL_TIMEOUT_MS, TOOL_PARALLELISM } from "./limits.ts";
import type { ChatMessage, ChatRequest, ToolCall } from "./llm.ts";
import { callModel, type ChatResponse } from "./modelCall.ts";
import { bytesBoundUsd, callBoundUsd, modelBoundUsd } from "./modelCost.ts";
import { cleanUserText } from "./modelText.ts";
import { budgetEndedSearch } from "./finish/budgetNote.ts";
import { lastTurn, MAX_TURNS, NUDGE, progressNote, systemPrompt, userPrompt } from "./prompt.ts";
import { budgetStatus, checkFinish, closeSession, emit, fixQuestionChecks, openSession, sinceStart, type ProgressListener, type Services, type Session } from "./session.ts";
import { canonicalCalls } from "./tools/canonical.ts";
import { runTracedTool } from "./tools/traced.ts";
import { FINISH_TOOL, RESEARCH_TOOLS } from "./tools/schemas.ts";
import type { RunOutput, TraceToolCall, TraceTurn } from "./trace.ts";

interface FinishState {
  accepted: FinishArgs | null;
  dropped: DroppedClaim[];
  /** True once a finish has been sent back to the model; the next one is accepted with its failed claims removed. */
  rejectedOnce: boolean;
  /** The claims that passed in the finish that was rejected; used if the model cannot finish again. */
  fallback: { kept: FinishArgs; failures: DroppedClaim[] } | null;
}

const CONTACT_IN_TEXT: DroppedClaim = {
  claim: "text fields",
  reason: "a text field held a contact detail, link or domain; it was replaced with [removed]. Write none.",
};

/** Why a run ended without a finish, in the code's own words; the forced answer quotes one. */
const STOPPED = {
  turns: `no finish within ${MAX_TURNS} turns`,
  model: "the model service did not answer or the budget has no room for another model call",
  failed: "a step of the research failed",
  question: "the question could not be read",
};

/**
 * Runs the research agent on one question and returns the run's private record. `onProgress` hears
 * one event per model turn and per tool call while the run is in flight; `toDisplay` turns the
 * finished record into what a browser may receive. No failure escapes: any ends in a forced finish.
 */
export async function runAgent(question: string, tier: Tier, services: Services, onProgress?: ProgressListener): Promise<RunOutput> {
  const session = openSession(question, tier, services, onProgress ?? null);
  const state: FinishState = { accepted: null, dropped: [], rejectedOnce: false, fallback: null };
  let stopReason = session.readable ? STOPPED.turns : STOPPED.question;
  try {
    if (session.readable) await readIntake(session);
    const messages: ChatMessage[] = [
      { role: "system", content: systemPrompt(session.ctx.nowSec) },
      { role: "user", content: userPrompt(session.question, tier, session.ctx.budget.limitUsd, session.intake) },
    ];
    for (let turn = 1; session.readable && turn <= MAX_TURNS && !state.accepted; turn += 1) {
      const stop = await runTurn(session, messages, turn, state);
      if (stop) {
        stopReason = stop;
        break;
      }
    }
    if (state.accepted) return await closeSession(session, state.accepted, "model", state.dropped);
    if (state.fallback) {
      const verified = await verifyAccepted(session, state.fallback.kept);
      if (session.verify) emit(session, verifyStep(session.verify));
      return await closeSession(session, verified.kept, "model", [...state.fallback.failures, ...verified.notes]);
    }
  } catch (err) {
    stopReason = STOPPED.failed;
    session.trace.push(failedTurn(session, session.trace.length + 1, cleanUserText(err instanceof Error ? err.message : String(err)).value));
  }
  return closeSession(session, forcedFinish(session.ctx.store, stopReason, session.ctx.nowSec, session.ctx.questionChecks), "forced", []);
}

/** The intake step (round 4, F1): the question's checks, read before the first turn and fixed for the run. */
async function readIntake(session: Session): Promise<void> {
  const { llm, budget } = session.ctx;
  const m = { llm, budget, prices: session.services.modelPrices, model: session.services.verifierModel };
  fixQuestionChecks(session, await readQuestionChecks(m, session.question, sinceStart(session)));
  if (session.intake.call) emit(session, intakeStep(session.intake));
}

/** The verifier on a finish, on the money held for closing; the caller reports its step after the finish's. */
async function verifyAccepted(session: Session, args: FinishArgs): Promise<{ kept: FinishArgs; notes: DroppedClaim[] }> {
  const { budget, llm, store } = session.ctx;
  budget.setModelReserve(0);
  const v = { llm, budget, prices: session.services.modelPrices, model: session.services.verifierModel };
  const done = await verifyFinish(v, store, args, session.question, session.ctx.nowSec, sinceStart(session));
  session.verify = done.call;
  return done;
}

/**
 * The last turn offers only finish at low reasoning effort: at full effort the finish call reasoned
 * until it ran out of tokens and wrote nothing (finish_reason length, q03, 2026-11-20).
 */
function requestFor(services: Services, messages: ChatMessage[], last: boolean): ChatRequest {
  return {
    models: services.agentModels,
    messages,
    tools: last ? [FINISH_TOOL] : RESEARCH_TOOLS,
    maxTokens: MODEL_MAX_TOKENS,
    timeoutMs: MODEL_TIMEOUT_MS,
    ...(last ? { reasoningEffort: "low" as const } : {}),
  };
}

/** One model turn and its tools; returns why the run must stop, or null to go on. */
async function runTurn(session: Session, messages: ChatMessage[], turn: number, state: FinishState): Promise<string | null> {
  const last = turn === MAX_TURNS;
  const { budget } = session.ctx;
  const { modelPrices: prices, agentModels } = session.services;
  if (last) messages.push({ role: "user", content: lastTurn(budgetEndedSearch(budget)) });
  const request = requestFor(session.services, messages, last);
  const startedMs = sinceStart(session);
  budget.setModelReserve(0);
  let res: ChatResponse;
  try {
    res = await callModel(session.services.llm, budget, request, (m) => modelBoundUsd(prices, m, request));
  } catch (err) {
    const failed = failedTurn(session, turn, err instanceof Error ? err.message : String(err), startedMs);
    session.trace.push(failed);
    emit(session, turnStep(failed));
    return STOPPED.model;
  }
  const snapshot = session.ctx.store.snapshot();
  const handles = new Set([...snapshot.creators.map((c) => c.handle), ...snapshot.videos.map((v) => v.author)]);
  const { calls, removedIn } = canonicalCalls(res.toolCalls, request.tools ?? [], handles);
  const content = cleanUserText(res.content, handles).value;
  messages.push({ role: "assistant", content, ...(calls.length ? { tool_calls: calls } : {}) });
  budget.setModelReserve(callBoundUsd(prices, { ...requestFor(session.services, messages, false), models: agentModels }));
  const record: TraceTurn = { turn, model: res.model, startedMs, ms: res.ms, costUsd: res.chargedUsd, finishReason: res.finishReason, attempts: res.attempts, content, toolCalls: [], note: null };
  session.trace.push(record);
  emit(session, turnStep(record));
  const research = calls.filter((c) => c.function.name !== "finish");
  const finishes = calls.filter((c) => c.function.name === "finish");
  const traced: TraceToolCall[] = await mapLimit(research, TOOL_PARALLELISM, async (call) => {
    const done = await runTracedTool(session.ctx, call.function.name, call.function.arguments, sinceStart(session));
    budget.addModelReserve(bytesBoundUsd(prices, agentModels, Buffer.byteLength(JSON.stringify(done.result))));
    emit(session, toolStep(done, (q) => cleanUserText(q).value, (id) => session.ctx.store.getVideo(id)?.author ?? null));
    return done;
  });
  traced.forEach((c, i) => {
    const result = { ...c.result, budget: budgetStatus(session, MAX_TURNS - turn) };
    messages.push({ role: "tool", tool_call_id: research[i]?.id ?? "", content: JSON.stringify(result) });
  });
  for (const [i, call] of finishes.entries()) {
    const at = sinceStart(session);
    const result = i === finishes.length - 1 ? await handleFinish(session, call, removedIn.get(call.id) ?? 0, last, state) : { ignored: "only the last finish counts" };
    const done: TraceToolCall = { name: "finish", args: call.function.arguments, result, startedMs: at, ms: sinceStart(session) - at, costUsd: 0, fetched: [] };
    traced.push(done);
    emit(session, toolStep(done, () => null, () => null));
    if (state.accepted && session.verify) emit(session, verifyStep(session.verify));
    messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(result) });
  }
  record.toolCalls = traced;
  if (calls.length === 0) messages.push({ role: "user", content: NUDGE });
  else if (research.length > 0 && !state.accepted) {
    const inspected = session.ctx.store.snapshot().creators.map((c) => c.handle);
    messages.push({ role: "user", content: progressNote(inspected, Math.max(0, budget.spendableUsd), budget.limitUsd, MAX_TURNS - turn, session.intake.wanted) });
  }
  return null;
}

async function handleFinish(session: Session, call: ToolCall, contactsRemoved: number, noMoreTurns: boolean, state: FinishState): Promise<Record<string, unknown>> {
  const parsed = parseFinish(JSON.parse(call.function.arguments) as Record<string, unknown>);
  const checked = checkFinish(session, parsed);
  if (isEmptyFinish({ ...parsed, close: checked.kept.close })) {
    state.rejectedOnce = true;
    return { accepted: false, error: "the finish was empty: write the answer and call finish again" };
  }
  const failures = contactsRemoved > 0 ? [CONTACT_IN_TEXT, ...checked.failures] : checked.failures;
  if (failures.length > 0 && !state.rejectedOnce && !noMoreTurns) {
    state.rejectedOnce = true;
    state.fallback = { kept: checked.kept, failures: [...failures, ...checked.notes] };
    return { accepted: false, failed_claims: failures, instruction: "Fix or remove these claims and call finish again." };
  }
  const done = await verifyAccepted(session, checked.kept);
  state.accepted = done.kept;
  state.dropped = [...failures, ...checked.notes, ...done.notes];
  return failures.length ? { accepted: true, dropped_claims: failures } : { accepted: true };
}

function failedTurn(session: Session, turn: number, note: string, startedMs = sinceStart(session)): TraceTurn {
  return { turn, model: null, startedMs, ms: 0, costUsd: 0, finishReason: null, attempts: [], content: "", toolCalls: [], note };
}
