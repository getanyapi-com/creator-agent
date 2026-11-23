import { readFileSync } from "node:fs";
import type { Tier } from "../src/answer.ts";
import type { RunOutput } from "../src/trace.ts";

export interface Question {
  id: string;
  family: string;
  /** What the answer's results are: creators, hook patterns, or the explanation of one video. */
  results: "creators" | "patterns" | "explanation";
  text: string;
  /** How many results the question asks for, or null when it names no number. */
  wanted: number | null;
  /** True when a good answer says the question cannot be answered well as asked. */
  unanswerable: boolean;
  good: string;
}

export type Mode = "agent" | "baseline";

/** One saved run, as `bench run` writes it and `bench score` reads it. */
export interface SavedRun {
  questionId: string;
  mode: Mode;
  tier: Tier;
  repeat: number;
  startedAt: string;
  output: RunOutput | null;
  error: string | null;
}

export const OUT_DIR = new URL("./out/", import.meta.url);

export function loadQuestions(): Question[] {
  return JSON.parse(readFileSync(new URL("./questions.dev.json", import.meta.url), "utf8")) as Question[];
}
