import type { Answer, DroppedClaim, Tier } from "./answer.ts";
import type { AnyApiClient, DataClient } from "./anyapi.ts";
import { Budget } from "./budget.ts";
import { closingHoldUsd } from "./closing.ts";
import { limiter } from "./concurrency.ts";
import { MemoryContactStore } from "./contactStore.ts";
import type { DisplayStep, ProgressEvent } from "./display/types.ts";
import { runGate } from "./display/gate.ts";
import { gateStep, unconfirmedStep } from "./display/steps.ts";
import { MemoryEvidenceStore } from "./evidence.ts";
import { evidenceIndex } from "./evidenceIndex.ts";
import { budgetNote } from "./finish/budgetNote.ts";
import { isEmptyAnswer, nothingConfirmed } from "./finish/empty.ts";
import type { FinishArgs } from "./finish/parse.ts";
import { renderAnswer } from "./finish/render.ts";
import { NO_INTAKE, type Intake } from "./intake/intake.ts";
import { withQuestionChecks } from "./intake/merge.ts";
import { TOOL_PARALLELISM } from "./limits.ts";
import { validateFinish, type Validation } from "./finish/validate.ts";
import type { ChatModel } from "./llm.ts";
import type { ModelPrices } from "./modelCost.ts";
import { cleanUserText } from "./modelText.ts";
import type { ToolContext, VideoModels } from "./tools/context.ts";
import type { ClosingCall, RunOutput, TraceTurn } from "./trace.ts";

/** The free tier's limit per question, data and model cost together (spec, Tiers). */
export const FREE_BUDGET_USD = 0.1;

/** What the question becomes when it cannot be read; the run then ends in a forced finish (round 4, B4). */
export const UNREADABLE_QUESTION = "(the question could not be read)";

/** The services a run uses; tests pass fakes, the bench passes live clients. */
export interface Services {
  anyapi: (budget: Budget) => AnyApiClient;
  llm: ChatModel;
  agentModels: string[];
  videoModels: VideoModels;
  /** The model that reads each content claim and each sentence of the answer beside the evidence. */
  verifierModel: string;
  /** The model that scans the display object's free text for a way to contact a person. */
  contactScanModel: string;
  /** List prices of every model above, so each model call is bounded before it runs. */
  modelPrices: ModelPrices;
  clockMs: () => number;
}

export type ProgressListener = (event: ProgressEvent) => void;

export interface Session {
  /** The question as the user asked it, with any contact detail already replaced by [removed]. */
  question: string;
  /** False when the question could not be read; the run then ends in a forced finish. */
  readable: boolean;
  tier: Tier;
  ctx: ToolContext;
  trace: TraceTurn[];
  startedMs: number;
  services: Services;
  onProgress: ProgressListener | null;
  /** The verifier's calls, once they have run. */
  verify: ClosingCall | null;
  /** The question's checks as the intake step read them (round 4, F1). */
  intake: Intake;
}

export function budgetFor(tier: Tier): number {
  return tier.kind === "free" ? FREE_BUDGET_USD : tier.budgetUsd;
}

function readQuestion(raw: string): { question: string; readable: boolean } {
  try {
    return { question: cleanUserText(raw).value, readable: true };
  } catch {
    return { question: UNREADABLE_QUESTION, readable: false };
  }
}

/** The closing calls' hold; when a closing model has no list price, everything is held, so no agent call runs. */
function closingHold(services: Services): number {
  try {
    return closingHoldUsd(services.modelPrices, services.verifierModel, services.contactScanModel);
  } catch {
    return Infinity;
  }
}

/**
 * The question's data client with at most `TOOL_PARALLELISM` calls in flight, however many tools run
 * at once and however many calls each makes (a search reads profiles in parallel, round 4, D2).
 */
function limitedClient(client: AnyApiClient): DataClient {
  const run = limiter(TOOL_PARALLELISM);
  return { calls: client.calls, run: (endpoint, input, spender) => run(() => client.run(endpoint, input, spender)) };
}

/** Opens a run: the question is cleaned here, before it is sent to a model or stored, and the closing calls' money is held. */
export function openSession(rawQuestion: string, tier: Tier, services: Services, onProgress: ProgressListener | null = null): Session {
  const budget = new Budget(budgetFor(tier));
  budget.holdForClosing(closingHold(services));
  const startedMs = services.clockMs();
  return {
    ...readQuestion(rawQuestion),
    tier,
    trace: [],
    startedMs,
    services,
    onProgress,
    verify: null,
    intake: NO_INTAKE,
    ctx: {
      anyapi: limitedClient(services.anyapi(budget)),
      llm: services.llm,
      budget,
      spend: budget,
      store: new MemoryEvidenceStore(),
      contacts: new MemoryContactStore(),
      nowSec: Math.floor(startedMs / 1000),
      videoModels: services.videoModels,
      modelPrices: services.modelPrices,
      lookedFor: new Set(),
      searchCursors: new Map(),
      shownVideos: new Set(),
      questionChecks: null,
    },
  };
}

/** Milliseconds since the run began, by the services' clock. */
export function sinceStart(session: Session): number {
  return session.services.clockMs() - session.startedMs;
}

/** Reports one step to the caller of `runAgent`, with the money spent so far. */
export function emit(session: Session, step: DisplayStep): void {
  const { budget } = session.ctx;
  session.onProgress?.({ step, spentUsd: budget.spentUsd, limitUsd: budget.limitUsd, elapsedMs: sinceStart(session) });
}

export function budgetStatus(session: Session, turnsLeft: number): Record<string, number> {
  const b = session.ctx.budget;
  return {
    spent_usd: Number(b.spentUsd.toFixed(4)),
    left_usd: Number(Math.max(0, b.spendableUsd).toFixed(4)),
    turns_left: turnsLeft,
  };
}

/** Handles the agent asked to inspect and never got a profile for. */
export function notFound(session: Session): string[] {
  const { lookedFor, store } = session.ctx;
  return [...lookedFor].filter((h) => !store.getCreator(h)).sort();
}

/** Sets the question's checks for the run; the tools and every finish apply them from now on (round 4, F1). */
export function fixQuestionChecks(session: Session, intake: Intake): void {
  session.intake = intake;
  session.ctx.questionChecks = intake.status === "read" ? intake.checks : null;
}

/** A finish with the question's checks in force: it cannot omit, loosen or change them; its other checks are assumptions. */
export function withFixedChecks(session: Session, args: FinishArgs): FinishArgs {
  const fixed = session.ctx.questionChecks;
  return { ...args, checks: withQuestionChecks(fixed, args.checks), checksReadBy: fixed ? "code" : "agent" };
}

/** Checks a finish against the evidence, with the question's checks in force. */
export function checkFinish(session: Session, args: FinishArgs): Validation {
  return validateFinish(session.ctx.store, withFixedChecks(session, args), { nowSec: session.ctx.nowSec, notFound: notFound(session) });
}

function searchStats(session: Session): { searches: number; creatorsChecked: number } {
  const calls = session.ctx.anyapi.calls;
  return {
    searches: calls.filter((c) => c.endpoint === "tiktok.search_keyword").length,
    creatorsChecked: session.ctx.store.snapshot().creators.length,
  };
}

/** Builds the private record from a finish, then has the contact gate rule on what the display object will show. */
export async function closeSession(session: Session, args: FinishArgs, finishedBy: Answer["finishedBy"], dropped: DroppedClaim[]): Promise<RunOutput> {
  const { budget, store, contacts, anyapi, nowSec } = session.ctx;
  const answer = renderAnswer({
    question: session.question,
    tier: session.tier,
    args,
    store,
    contacts,
    nowSec,
    budgetNote: budgetNote(session.tier, budget, searchStats(session)),
    notFound: notFound(session),
    finishedBy,
    dropped,
  });
  const record: RunOutput = {
    answer,
    evidence: store.snapshot(),
    trace: session.trace,
    evidenceIndex: evidenceIndex(session.trace),
    costs: { limitUsd: budget.limitUsd, dataUsd: 0, modelUsd: 0, totalUsd: 0, houseUsd: 0, dataCalls: 0, refusedCalls: 0 },
    calls: anyapi.calls,
    wallMs: 0,
    nowSec,
    modelTurns: session.trace.filter((t) => t.model !== null).length,
    contactsFound: contacts.count(),
    contacts: contacts.snapshot(),
    verify: session.verify,
    intake: session.intake,
    gate: { path: "patterns", reason: null, removed: [], call: null },
  };
  const startedMs = sinceStart(session);
  record.gate = await runGate({ llm: session.ctx.llm, budget, prices: session.services.modelPrices, model: session.services.contactScanModel }, record, startedMs);
  if (record.gate.call) emit(session, gateStep(record.gate.call));
  record.costs = {
    limitUsd: budget.limitUsd,
    dataUsd: budget.dataUsd,
    modelUsd: budget.modelUsd,
    totalUsd: budget.spentUsd,
    houseUsd: budget.houseUsd,
    dataCalls: anyapi.calls.length,
    refusedCalls: budget.refusedCalls,
  };
  record.wallMs = sinceStart(session);
  if (isEmptyAnswer(record.answer)) {
    record.answer = nothingConfirmed(record.answer, record.costs);
    emit(session, unconfirmedStep(record.wallMs));
  }
  return record;
}
