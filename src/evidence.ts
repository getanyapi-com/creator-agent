/** Evidence rows: what the code fetched, cleaned of contact details. Every claim must point at one. */
export interface VideoRow {
  id: string;
  author: string;
  url: string;
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  saves: number | null;
  createdUtc: number | null;
  region: string | null;
  paidLabel: boolean | null;
  isPinned: boolean | null;
  durationSeconds: number | null;
  caption: string;
  hashtags: string[];
  foundBy: string[];
  /** Cover image link on a TikTok media host, for the web app; expires within hours; never sent to a model. */
  image: string | null;
}

export interface CreatorRow {
  handle: string;
  followers: number | null;
  likes: number | null;
  videoCount: number | null;
  verified: boolean | null;
  bio: string;
  /** Profile picture link on a TikTok media host, for the web app; expires within hours; never sent to a model. */
  avatarUrl: string | null;
  hasPublicEmail: boolean;
  sampledVideoIds: string[];
}

export interface TranscriptRow {
  videoId: string;
  text: string | null;
}

export interface Observation {
  at: string;
  what: string;
}

export interface WatchRow {
  videoId: string;
  model: string;
  /** Why the first video model did not answer, when the second one watched; null when the first did. */
  fallbackReason: string | null;
  observations: Observation[];
  onScreenText: Observation[];
  lookedAt: string;
  hypothesis: string;
}

export interface EvidenceSnapshot {
  videos: VideoRow[];
  creators: CreatorRow[];
  transcripts: TranscriptRow[];
  watches: WatchRow[];
}

/** Storage for evidence; the in-memory one below serializes to JSON, a database can replace it later. */
export interface EvidenceStore {
  putVideo(row: VideoRow): VideoRow;
  getVideo(id: string): VideoRow | undefined;
  putCreator(row: CreatorRow): void;
  getCreator(handle: string): CreatorRow | undefined;
  putTranscript(row: TranscriptRow): void;
  getTranscript(videoId: string): TranscriptRow | undefined;
  putWatch(row: WatchRow): void;
  getWatch(videoId: string): WatchRow | undefined;
  videosBy(handle: string): VideoRow[];
  snapshot(): EvidenceSnapshot;
}

export function normalizeHandle(handle: string): string {
  return handle.trim().replace(/^@/, "").toLowerCase();
}

export class MemoryEvidenceStore implements EvidenceStore {
  readonly #videos = new Map<string, VideoRow>();
  readonly #creators = new Map<string, CreatorRow>();
  readonly #transcripts = new Map<string, TranscriptRow>();
  readonly #watches = new Map<string, WatchRow>();

  /** Keeps the newest non-empty value of each field and every query that found the video. */
  putVideo(row: VideoRow): VideoRow {
    const old = this.#videos.get(row.id);
    const merged: VideoRow = old ? mergeVideo(old, row) : { ...row, author: normalizeHandle(row.author) };
    this.#videos.set(row.id, merged);
    return merged;
  }

  getVideo(id: string): VideoRow | undefined {
    return this.#videos.get(id);
  }

  putCreator(row: CreatorRow): void {
    this.#creators.set(normalizeHandle(row.handle), { ...row, handle: normalizeHandle(row.handle) });
  }

  getCreator(handle: string): CreatorRow | undefined {
    return this.#creators.get(normalizeHandle(handle));
  }

  putTranscript(row: TranscriptRow): void {
    this.#transcripts.set(row.videoId, row);
  }

  getTranscript(videoId: string): TranscriptRow | undefined {
    return this.#transcripts.get(videoId);
  }

  putWatch(row: WatchRow): void {
    this.#watches.set(row.videoId, row);
  }

  getWatch(videoId: string): WatchRow | undefined {
    return this.#watches.get(videoId);
  }

  videosBy(handle: string): VideoRow[] {
    const h = normalizeHandle(handle);
    return [...this.#videos.values()].filter((v) => v.author === h);
  }

  snapshot(): EvidenceSnapshot {
    return {
      videos: [...this.#videos.values()],
      creators: [...this.#creators.values()],
      transcripts: [...this.#transcripts.values()],
      watches: [...this.#watches.values()],
    };
  }

  static fromSnapshot(snapshot: EvidenceSnapshot): MemoryEvidenceStore {
    const store = new MemoryEvidenceStore();
    snapshot.videos.forEach((v) => store.putVideo(v));
    snapshot.creators.forEach((c) => store.putCreator(c));
    snapshot.transcripts.forEach((t) => store.putTranscript(t));
    snapshot.watches.forEach((w) => store.putWatch(w));
    return store;
  }
}

function mergeVideo(old: VideoRow, next: VideoRow): VideoRow {
  const merged: VideoRow = { ...old };
  for (const key of Object.keys(next) as (keyof VideoRow)[]) {
    const value = next[key];
    if (value !== null && value !== "" && key !== "foundBy" && key !== "author") {
      Object.assign(merged, { [key]: value });
    }
  }
  merged.foundBy = [...new Set([...old.foundBy, ...next.foundBy])];
  return merged;
}
