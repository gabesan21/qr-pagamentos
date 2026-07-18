import "server-only";

export const MAX_WEBHOOK_BODY_BYTES = 256 * 1024;

export type BoundedBodyResult = { readonly kind: "ok"; readonly body: Buffer } | { readonly kind: "too-large" };

export function declaredWebhookBodyTooLarge(contentLength: string | null): boolean {
  if (contentLength === null) return false;
  if (!/^[0-9]+$/.test(contentLength)) return false;
  try {
    return BigInt(contentLength) > BigInt(MAX_WEBHOOK_BODY_BYTES);
  } catch {
    return false;
  }
}

export async function readBoundedWebhookBody(body: ReadableStream<Uint8Array> | null): Promise<BoundedBodyResult> {
  if (!body) return { kind: "ok", body: Buffer.alloc(0) };
  const reader = body.getReader();
  const chunks: Buffer[] = [];
  let size = 0;
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) return { kind: "ok", body: Buffer.concat(chunks, size) };
      size += result.value.byteLength;
      if (size > MAX_WEBHOOK_BODY_BYTES) {
        chunks.length = 0;
        await reader.cancel("webhook body too large").catch(() => undefined);
        return { kind: "too-large" };
      }
      chunks.push(Buffer.from(result.value));
    }
  } finally {
    reader.releaseLock();
  }
}
