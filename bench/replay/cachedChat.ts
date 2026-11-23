import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import type { ChatModel, ChatRequest, Completion } from "../../src/llm.ts";
import { OUT_DIR } from "../questions.ts";

/** One model call the replay made or read from cache: what was sent and what came back. */
export interface Exchange {
  request: ChatRequest;
  content: string;
}

/**
 * A chat model that answers each request once per replay tag and keeps the answer in
 * `bench/out/closing-replay/cache/`, so a replay of the same code on the same runs costs nothing the
 * second time; a new tag asks again. Records every exchange for the report.
 */
export class CachedChat implements ChatModel {
  readonly exchanges: Exchange[] = [];
  /** Why each call that failed failed, for the report. */
  readonly errors: string[] = [];
  readonly #inner: ChatModel;
  readonly #tag: string;
  readonly #dir = new URL("./closing-replay/cache/", OUT_DIR);
  billedUsd = 0;

  constructor(inner: ChatModel, tag: string) {
    this.#inner = inner;
    this.#tag = tag;
    mkdirSync(this.#dir, { recursive: true });
  }

  async complete(model: string, request: ChatRequest): Promise<Completion> {
    const key = createHash("sha256").update(JSON.stringify([this.#tag, model, request.messages])).digest("hex").slice(0, 24);
    const file = new URL(`${key}.json`, this.#dir);
    let done: Completion;
    if (existsSync(file)) done = JSON.parse(readFileSync(file, "utf8")) as Completion;
    else {
      try {
        done = await this.#inner.complete(model, request);
      } catch (err) {
        this.errors.push(err instanceof Error ? err.message : String(err));
        throw err;
      }
      this.billedUsd += done.costUsd ?? 0;
      writeFileSync(file, JSON.stringify(done));
    }
    this.exchanges.push({ request, content: typeof done.content === "string" ? done.content : "" });
    return done;
  }
}
