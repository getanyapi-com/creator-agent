import { AnyApiClient, type FetchFn } from "../src/anyapi.ts";
import type { Budget } from "../src/budget.ts";
import type { CreatorRow } from "../src/evidence.ts";
import type { ChatModel, ChatRequest, Completion, ToolCall } from "../src/llm.ts";
import { tablePrices } from "../src/prices.ts";
import type { Services } from "../src/session.ts";

export const NOW_SEC = 1_795_000_000;
export const DAY = 86_400;
export const VERIFIER = "fake-verifier";
export const GATE = "fake-gate";

export interface FakeRequest {
  endpoint: string;
  body: Record<string, unknown>;
}

type Reply = (body: Record<string, unknown>) => unknown;

/** An AnyAPI that answers from canned `output.data` per endpoint and records every request body. */
export function fakeAnyApi(data: Record<string, Reply>, costUsd?: number) {
  const requests: FakeRequest[] = [];
  const fetchFn: FetchFn = async (input, init) => {
    const url = String(input);
    const endpoint = url.split("/v1/run/")[1] ?? "";
    const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
    requests.push({ endpoint, body });
    const make = data[endpoint];
    const price = { "tiktok.video_transcript": 0.0011, "tiktok.profile": 0.0004 }[endpoint] ?? 0.0006;
    const envelope = { costUsd: costUsd ?? price, source: { id: (body.source as string[])[0] }, output: { data: make ? make(body) : null } };
    return new Response(JSON.stringify(envelope), { status: 200 });
  };
  return { requests, make: (budget: Budget) => new AnyApiClient("test-key", budget, tablePrices(), fetchFn) };
}

export function toolCall(id: string, name: string, args: Record<string, unknown>): ToolCall {
  return { id, type: "function", function: { name, arguments: JSON.stringify(args) } };
}

type Step = (req: ChatRequest) => ToolCall[] | Partial<Completion>;

type ModelReply = (req: ChatRequest) => string;

/** The verifier's reply when a test does not script it: every claim left unanswered, every sentence shown by the evidence. */
const NO_VERDICTS: ModelReply = (req) => {
  const body = JSON.parse(String(req.messages[1]?.content)) as { sentences?: { id: string }[] };
  return JSON.stringify(body.sentences ? { sentences: body.sentences.map((x) => ({ id: x.id, why: "test", kind: "shown", names: [] })) } : { verdicts: [] });
};

/** The question an intake request carries, or null for any other request. */
export function intakeQuestion(req: ChatRequest): string | null {
  try {
    const body = JSON.parse(String(req.messages[1]?.content)) as { question?: unknown };
    return typeof body.question === "string" ? body.question : null;
  } catch {
    return null;
  }
}

/** Limit phrasings the tests use, each with the check a careful model proposes for it. */
const LIMIT_FORMS: { re: RegExp; kind: string; value: (m: RegExpExecArray) => number | string }[] = [
  { re: /(?:at most|under) ([\d,]+) followers/i, kind: "followers_at_most", value: (m) => Number((m[1] ?? "").replace(/,/g, "")) },
  { re: /(?:at least|over) ([\d,]+) followers/i, kind: "followers_at_least", value: (m) => Number((m[1] ?? "").replace(/,/g, "")) },
  { re: /(?:at least|over) ([\d,]+) views/i, kind: "proof_views_at_least", value: (m) => Number((m[1] ?? "").replace(/,/g, "")) },
  { re: /in the last (\d+) days/i, kind: "proof_posted_within_days", value: (m) => Number(m[1]) },
  { re: /\bUS\b/, kind: "proof_region", value: () => "US" },
];

/** The intake reply a careful model gives: each limit the question states, with its exact words. */
export const PROPOSE_LIMITS: ModelReply = (req) => {
  const question = intakeQuestion(req) ?? "";
  const checks = LIMIT_FORMS.flatMap((f) => {
    const m = f.re.exec(question);
    return m ? [{ kind: f.kind, value: f.value(m), quote: m[0] }] : [];
  });
  return JSON.stringify({ checks, wanted: null });
};

/**
 * A model that plays a script: each agent call returns the next step's tool calls (or a whole
 * completion), recording what it was sent. Calls to the verifier model get `verifier`'s reply, calls
 * to the contact scan `gate`'s (by default, nothing found), and the intake step `intake`'s (by
 * default, the limits a careful model reads from the question).
 */
export class ScriptedModel implements ChatModel {
  readonly requests: ChatRequest[] = [];
  readonly verifierRequests: ChatRequest[] = [];
  readonly gateRequests: ChatRequest[] = [];
  readonly intakeRequests: ChatRequest[] = [];
  readonly #script: Step[];
  readonly #costUsd: number;
  readonly #verifier: ModelReply;
  readonly #gate: ModelReply;
  readonly #intake: ModelReply;

  constructor(script: Step[], costUsd = 0.0002, verifier: ModelReply = NO_VERDICTS, gate: ModelReply = () => '{"found":[]}', intake: ModelReply = PROPOSE_LIMITS) {
    this.#script = script;
    this.#costUsd = costUsd;
    this.#verifier = verifier;
    this.#gate = gate;
    this.#intake = intake;
  }

  async complete(model: string, request: ChatRequest): Promise<Completion> {
    if (model === VERIFIER && intakeQuestion(request) !== null) {
      this.intakeRequests.push(structuredClone(request));
      return { content: this.#intake(request), toolCalls: [], costUsd: this.#costUsd, finishReason: "stop" };
    }
    if (model === VERIFIER || model === GATE) {
      (model === VERIFIER ? this.verifierRequests : this.gateRequests).push(structuredClone(request));
      return { content: (model === VERIFIER ? this.#verifier : this.#gate)(request), toolCalls: [], costUsd: this.#costUsd, finishReason: "stop" };
    }
    this.requests.push(structuredClone(request));
    const step = this.#script[Math.min(this.requests.length - 1, this.#script.length - 1)];
    const out = step ? step(request) : [];
    const base: Completion = { content: "", toolCalls: [], costUsd: this.#costUsd, finishReason: "tool_calls" };
    return Array.isArray(out) ? { ...base, toolCalls: out } : { ...base, ...out };
  }
}

/**
 * A verifier that answers every claim the same way, and calls every sentence of the answer `sentenceKind`
 * (by default one the evidence shows).
 */
export function verifierSaying(answer: string, sentenceKind = "shown"): ModelReply {
  return (req) => {
    const body = JSON.parse(String(req.messages[1]?.content)) as { items?: { id: string }[]; sentences?: { id: string }[] };
    if (body.sentences) return JSON.stringify({ sentences: body.sentences.map((s) => ({ id: s.id, why: "test", kind: sentenceKind, names: [] })) });
    return JSON.stringify({ verdicts: (body.items ?? []).map((i) => ({ id: i.id, why: "test", answer })) });
  };
}


export function services(anyapi: (b: Budget) => AnyApiClient, llm: ChatModel): Services {
  const tiny = { promptUsd: 1e-8, completionUsd: 1e-8 };
  return {
    anyapi,
    llm,
    agentModels: ["fake"],
    videoModels: { primary: "fake-video", fallback: "fake-video-2" },
    verifierModel: VERIFIER,
    contactScanModel: GATE,
    modelPrices: { fake: tiny, [VERIFIER]: tiny, [GATE]: tiny, "fake-video": tiny, "fake-video-2": tiny },
    clockMs: () => NOW_SEC * 1000,
  };
}

export function searchRow(id: string, author: string, views: number, caption = "study app"): Record<string, unknown> {
  return { id, author, views, likes: 1, comments: 0, shares: 0, createdUtc: NOW_SEC - 3 * DAY, region: "US", paidPartnership: false, caption, url: `https://www.tiktok.com/@${author}/video/${id}` };
}

export function postRow(id: string, handle: string, views: number, daysAgo: number): Record<string, unknown> {
  return { id, authorHandle: handle, views, likes: 1, comments: 0, createdUtc: NOW_SEC - daysAgo * DAY, isPinned: false, caption: "post", url: `https://www.tiktok.com/@${handle}/video/${id}` };
}

/** A profile row the test expects ingest to keep. */
export function kept(row: CreatorRow | null): CreatorRow {
  if (!row) throw new Error("ingest dropped the profile");
  return row;
}
