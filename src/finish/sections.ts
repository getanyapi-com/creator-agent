/**
 * The answer in ordered sections (round 4, E1): the single best fit first, then groups of creators
 * that share a reason, and patterns whose members are videos. The model writes them in `finish`; the
 * code checks their members against the final answer and fixes what it can rather than failing it.
 */

export const SECTION_KINDS = ["best", "group", "pattern"] as const;
export type SectionKind = (typeof SECTION_KINDS)[number];

/** One section as the model wrote it, members by evidence id: @handle for a creator, a video id for a pattern. */
export interface FinishSection {
  kind: SectionKind;
  heading: string;
  reason: string;
  members: string[];
}

/** One section of the final answer: creators by handle for best and group, videos by id for a pattern. */
export interface AnswerSection {
  kind: SectionKind;
  heading: string;
  /** One or two sentences, or null when the code added the section or its reason did not hold. */
  reason: string | null;
  handles: string[];
  videoIds: string[];
}

/** Headings the code writes when it builds or repairs a section, or when the model's heading did not hold. */
export const CODE_HEADINGS: Record<SectionKind, string> = { best: "Best fit", group: "Also fit", pattern: "Pattern" };

type Raw = Record<string, unknown>;

const text = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

/** Reads the sections a finish declares; an entry that is not a section is ignored. */
export function parseSections(raw: unknown): FinishSection[] {
  const items = Array.isArray(raw) ? raw.filter((r): r is Raw => typeof r === "object" && r !== null) : [];
  return items.flatMap((r) => {
    const kind = SECTION_KINDS.find((k) => k === r.kind);
    const members = Array.isArray(r.members) ? r.members.map(text).filter(Boolean) : [];
    return kind ? [{ kind, heading: text(r.heading), reason: text(r.reason), members }] : [];
  });
}

const handleOf = (id: string): string => id.replace(/^@/, "").toLowerCase();

/** What the final answer holds that a section may name: its creators in order, and its videos. */
export interface SectionScope {
  handles: string[];
  videoIds: Set<string>;
}

/**
 * The sections of the final answer. A member that is not in the answer is dropped, and a creator
 * already placed is not placed again. Exactly one `best` section with one creator when the answer has
 * creators: a later best becomes a group, the creators after the first in it move to a group without a
 * reason, and with no best at all the first creator placed (or the answer's first) becomes the best,
 * without a reason. Creators no section names close the list as one group without a reason. A
 * section left with no member is dropped.
 */
export function settleSections(written: FinishSection[], scope: SectionScope): AnswerSection[] {
  const inAnswer = new Set(scope.handles);
  const placed = new Set<string>();
  const out: AnswerSection[] = [];
  for (const s of written) {
    if (s.kind === "pattern") {
      const videoIds = [...new Set(s.members.filter((id) => scope.videoIds.has(id)))];
      out.push({ kind: "pattern", heading: s.heading || CODE_HEADINGS.pattern, reason: s.reason || null, handles: [], videoIds });
      continue;
    }
    const handles = [...new Set(s.members.map(handleOf))].filter((h) => inAnswer.has(h) && !placed.has(h));
    handles.forEach((h) => placed.add(h));
    out.push({ kind: s.kind, heading: s.heading || CODE_HEADINGS[s.kind], reason: s.reason || null, handles, videoIds: [] });
  }
  const rest = scope.handles.filter((h) => !placed.has(h));
  if (rest.length) out.push({ kind: "group", heading: CODE_HEADINGS.group, reason: null, handles: rest, videoIds: [] });
  return oneBest(out.filter((s) => s.handles.length > 0 || s.videoIds.length > 0));
}

/** Exactly one best section holding one creator, first among the creator sections, when there are creators. */
function oneBest(sections: AnswerSection[]): AnswerSection[] {
  const creatorSections = sections.filter((s) => s.kind !== "pattern");
  if (creatorSections.length === 0) return sections;
  const best = creatorSections.find((s) => s.kind === "best");
  const chosen = best ?? creatorSections[0];
  const first = chosen?.handles[0];
  if (!chosen || first === undefined) return sections;
  const out: AnswerSection[] = [{ kind: "best", heading: best ? chosen.heading : CODE_HEADINGS.best, reason: best ? chosen.reason : null, handles: [first], videoIds: [] }];
  for (const s of sections) {
    if (s !== chosen) {
      out.push(s.kind === "best" ? { ...s, kind: "group" } : s);
      continue;
    }
    const others = s.handles.slice(1);
    if (others.length) out.push({ kind: "group", heading: best ? CODE_HEADINGS.group : s.heading, reason: best ? null : s.reason, handles: others, videoIds: [] });
  }
  return out;
}
