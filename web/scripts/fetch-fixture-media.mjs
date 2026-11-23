// Saves the avatar of every creator and the cover of every video the fixtures' display objects show
// into public/fixture-media/, scaled to at most 480 px on the long side, then writes the manifest the
// adapter reads. The display objects' own image links expire within hours: one that has not expired is
// used as it is, and a fresh one is asked for otherwise. Re-runnable: files already on disk are skipped
// and cost nothing.
// Run from web/: `ANYAPI_KEY_FILE=/path/to/key node scripts/fetch-fixture-media.mjs`
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const WEB_DIR = path.resolve(import.meta.dirname, "..");
const FIXTURES = path.join(WEB_DIR, "fixtures");
const MEDIA = path.join(WEB_DIR, "public", "fixture-media");
const MANIFEST = path.join(WEB_DIR, "src", "data", "fixtureMedia.json");
const API = "https://api.getanyapi.com/v1/run/";
const LANE = { source: ["anonymous-bison-cb2f8f3c"], allowFallbacks: false };
const IMAGE_HOSTS = ["tiktokcdn.com", "tiktokcdn-us.com", "tiktokcdn-eu.com", "tiktokv.com"];
const LONG_SIDE = 480;

/** Every creator handle and every video id the fixtures' display objects show, with the image link they carry and the handle that posted a video, when known. */
function citedMedia() {
  const handles = new Map();
  const videos = new Map();
  for (const file of readdirSync(FIXTURES).filter((f) => f.endsWith(".json"))) {
    const display = JSON.parse(readFileSync(path.join(FIXTURES, file), "utf8")).display ?? {};
    const cite = (id, creator, link) => {
      if (typeof id === "string" && (creator || !videos.has(id))) videos.set(id, { handle: creator || undefined, link: link ?? null });
    };
    for (const creator of display.creators ?? []) {
      handles.set(creator.handle, creator.avatarUrl ?? null);
      cite(creator.proofVideo?.id, creator.proofVideo?.creator, creator.proofVideo?.imageUrl);
    }
    for (const video of display.videos ?? []) cite(video.id, video.creator, video.imageUrl);
    for (const section of display.sections ?? []) for (const video of section.videos ?? []) cite(video.id, video.creator, video.imageUrl);
    for (const pattern of display.patterns ?? []) for (const id of pattern.videoIds ?? []) cite(id);
  }
  return { handles, videos };
}

let spentUsd = 0;

/** A saved TikTok image link that has not expired yet, or null. */
function unexpired(link) {
  if (typeof link !== "string") return null;
  const expires = Number(new URL(link).searchParams.get("x-expires"));
  return expires * 1000 > Date.now() ? link : null;
}

async function run(key, endpoint, input) {
  const response = await fetch(API + endpoint, {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({ ...input, ...LANE }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${endpoint} HTTP ${response.status} ${body.error?.code ?? body.code ?? ""}`.trim());
  spentUsd += typeof body.costUsd === "number" ? body.costUsd : 0;
  return body.output?.data ?? {};
}

function allowedImage(link) {
  if (typeof link !== "string") throw new Error("no image link in response");
  const url = new URL(link);
  const ok = url.protocol === "https:" && IMAGE_HOSTS.some((h) => url.hostname === h || url.hostname.endsWith(`.${h}`));
  if (!ok) throw new Error(`image host not allowed: ${url.hostname}`);
  return url;
}

/** Downloads one image and re-encodes it as a small JPEG at `target`. */
async function saveImage(link, target) {
  const response = await fetch(allowedImage(link));
  if (!response.ok) throw new Error(`image HTTP ${response.status}`);
  const scale = `scale=${LONG_SIDE}:${LONG_SIDE}:force_original_aspect_ratio=decrease:force_divisible_by=2`;
  const args = ["-v", "error", "-i", "pipe:0", "-vf", `${scale}`, "-frames:v", "1", "-q:v", "5", "-y", target];
  const result = spawnSync("ffmpeg", args, { input: Buffer.from(await response.arrayBuffer()) });
  if (result.status !== 0) throw new Error(`ffmpeg: ${result.stderr.toString().trim().split("\n")[0]}`);
}

async function main() {
  const keyFile = process.env.ANYAPI_KEY_FILE;
  if (!keyFile) throw new Error("set ANYAPI_KEY_FILE to the file holding the AnyAPI key");
  const key = readFileSync(keyFile, "utf8").trim();
  mkdirSync(MEDIA, { recursive: true });
  const { handles, videos } = citedMedia();
  const jobs = [
    ...[...handles].map(([handle, saved]) => ({
      file: `avatar-${handle}.jpg`,
      link: async () => unexpired(saved) ?? (await run(key, "tiktok.profile", { handle })).avatarUrl,
    })),
    ...[...videos].map(([id, { handle, link: saved }]) => ({
      file: `video-${id}.jpg`,
      link: async () => {
        const url = handle ? `https://www.tiktok.com/@${handle}/video/${id}` : `https://www.tiktok.com/video/${id}`;
        return unexpired(saved) ?? (await run(key, "tiktok.video", { url })).image;
      },
    })),
  ];
  const counts = { fetched: 0, skipped: 0, failed: 0 };
  for (const job of jobs) {
    const target = path.join(MEDIA, job.file);
    if (existsSync(target)) {
      counts.skipped += 1;
      continue;
    }
    try {
      await saveImage(await job.link(), target);
      counts.fetched += 1;
    } catch (error) {
      counts.failed += 1;
      console.error(`failed ${job.file}: ${error.message}`);
    }
  }
  const saved = readdirSync(MEDIA).sort();
  const pick = (prefix) => saved.filter((f) => f.startsWith(prefix)).map((f) => f.slice(prefix.length, -".jpg".length));
  writeFileSync(MANIFEST, `${JSON.stringify({ avatars: pick("avatar-"), videos: pick("video-") }, null, 2)}\n`);
  console.log(`fetched ${counts.fetched}, skipped ${counts.skipped}, failed ${counts.failed}; spent $${spentUsd.toFixed(4)}`);
}

await main();
