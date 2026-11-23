/**
 * A request's body as text, or null once it passes `maxBytes`: a declared length over the limit is
 * refused before anything is read, and a body sent without one is read only up to the limit.
 */
export async function readCappedText(request: Request, maxBytes: number): Promise<string | null> {
  if (Number(request.headers.get("content-length") ?? 0) > maxBytes) return null;
  if (request.body === null) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}
