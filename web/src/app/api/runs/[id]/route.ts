import { signInRequired, viewerId } from "@/auth/session";
import { readRun, removeRun } from "@/server/liveRun";

interface Params {
  params: Promise<{ id: string }>;
}

/** Where a live question stands, with the core's display object once it is done; the thread page asks again while it is running. */
export async function GET(_request: Request, { params }: Params) {
  const run = await readRun((await params).id, await viewerId());
  if (run === null) return Response.json({ error: "No such question." }, { status: 404 });
  return Response.json(run, { headers: { "Cache-Control": "no-store" } });
}

/** Remove, accepted only from the account that asked. */
export async function DELETE(_request: Request, { params }: Params) {
  const userId = await viewerId();
  if (userId === null) return signInRequired();
  const outcome = await removeRun((await params).id, userId);
  if (outcome === "missing") return Response.json({ error: "No such question." }, { status: 404 });
  if (outcome === "not-asker") return Response.json({ error: "Only the account that asked can remove this." }, { status: 403 });
  return new Response(null, { status: 204 });
}
