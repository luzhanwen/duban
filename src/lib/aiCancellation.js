export function isAiAbortError(error) {
  return (
    error?.name === "AbortError" ||
    error?.code === "AI_REQUEST_CANCELLED" ||
    error?.kind === "cancelled"
  );
}
