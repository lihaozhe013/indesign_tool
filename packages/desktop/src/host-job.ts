import type { TFunction } from "i18next";
import type { HostJob, HostJobResult } from "@folio/contracts";
import { runHostJob } from "./bridge.js";

export async function invokeHost(action: HostJob["action"], payload: Record<string, unknown>, t: TFunction): Promise<Record<string, unknown>> {
  const job: HostJob = { schemaVersion: 1, jobId: crypto.randomUUID(), action, payload };
  const result: HostJobResult = await runHostJob(job);
  if (result.status !== "succeeded") {
    const messages = result.diagnostics.map((item) => item.message).filter(Boolean);
    throw new Error(messages.join("\n") || t("app.error.publishFailed", { action }));
  }
  return result.payload ?? {};
}
