import * as p from "@clack/prompts";

/**
 * Thin wrapper around @clack/prompts spinner for consistent
 * usage across all services — no emoji symbols, clean text only.
 */
export function createSpinner() {
  const spin = p.spinner();
  return {
    start(msg: string) {
      spin.start(msg);
    },
    update(msg: string) {
      spin.message(msg);
    },
    stop(msg: string, code: "ok" | "error" = "ok") {
      // Clack's spinner.stop() already renders a stop indicator;
      // we pass the message clean without extra symbols.
      spin.stop(code === "ok" ? msg : `failed: ${msg}`);
    },
  };
}
