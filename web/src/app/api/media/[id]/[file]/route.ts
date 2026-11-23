import { viewerId } from "@/auth/session";
import { readMedia } from "@/server/liveRun";

/** A live question's saved avatar or cover, served by the app because TikTok's own links expire. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string; file: string }> }) {
  const { id, file } = await params;
  const media = await readMedia(id, file, await viewerId());
  if (media === null) return new Response(null, { status: 404 });
  return new Response(new Uint8Array(media.bytes), { headers: { "Content-Type": media.type } });
}
