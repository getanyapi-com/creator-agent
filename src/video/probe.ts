import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);

/** The length of a video file in seconds, read by ffprobe; null when it cannot be read. */
export async function probeSeconds(bytes: Uint8Array): Promise<number | null> {
  const dir = await mkdtemp(join(tmpdir(), "creator-agent-probe-"));
  try {
    const input = join(dir, "in.mp4");
    await writeFile(input, bytes);
    const { stdout } = await run("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", input]);
    const seconds = Number(stdout.trim());
    return Number.isFinite(seconds) && seconds > 0 ? seconds : null;
  } catch {
    return null;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
