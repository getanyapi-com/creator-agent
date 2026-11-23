import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);

/**
 * Re-encodes a video to 360p (short side) at 12 fps with the bitrates of the small copy the proof
 * measured: about 75 kb/s video and 32 kb/s mono audio, 450 KB for 32 s.
 */
const FFMPEG_ARGS = [
  "-vf",
  "scale='if(gt(iw,ih),-2,360)':'if(gt(iw,ih),360,-2)',fps=12",
  "-c:v",
  "libx264",
  "-b:v",
  "75k",
  "-c:a",
  "aac",
  "-b:a",
  "32k",
  "-ac",
  "1",
  "-movflags",
  "+faststart",
];

export async function downscaleVideo(original: Uint8Array): Promise<Uint8Array> {
  const dir = await mkdtemp(join(tmpdir(), "creator-agent-video-"));
  try {
    const input = join(dir, "in.mp4");
    const output = join(dir, "out.mp4");
    await writeFile(input, original);
    await run("ffmpeg", ["-y", "-loglevel", "error", "-i", input, ...FFMPEG_ARGS, output]);
    return new Uint8Array(await readFile(output));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
