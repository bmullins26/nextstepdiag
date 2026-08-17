// Captures the original Error out-of-band so server.ts can recover the stack
// when h3 has already swallowed the throw into a generic 500 Response.

let lastCapturedError: { error: unknown; at: number } | undefined;
const TTL_MS = 5_000;

// Client disconnects (page reload/navigation while a request is in flight) surface
// as Node http "aborted" / ECONNRESET errors. They are not application faults.
function isBenignClientDisconnect(error: unknown): boolean {
  const err = error as { message?: unknown; code?: unknown; stack?: unknown } | null;
  if (!err || typeof err !== "object") return false;
  const code = typeof err.code === "string" ? err.code : "";
  if (code === "ECONNRESET" || code === "ABORT_ERR" || code === "ERR_STREAM_PREMATURE_CLOSE") {
    return true;
  }
  const message = typeof err.message === "string" ? err.message : "";
  const stack = typeof err.stack === "string" ? err.stack : "";
  return message === "aborted" && stack.includes("abortIncoming");
}

function record(error: unknown) {
  if (isBenignClientDisconnect(error)) return;
  lastCapturedError = { error, at: Date.now() };
}

if (typeof globalThis.addEventListener === "function") {
  globalThis.addEventListener("error", (event) => record((event as ErrorEvent).error ?? event));
  globalThis.addEventListener("unhandledrejection", (event) =>
    record((event as PromiseRejectionEvent).reason),
  );
}

export function consumeLastCapturedError(): unknown {
  if (!lastCapturedError) return undefined;
  if (Date.now() - lastCapturedError.at > TTL_MS) {
    lastCapturedError = undefined;
    return undefined;
  }
  const { error } = lastCapturedError;
  lastCapturedError = undefined;
  return error;
}
