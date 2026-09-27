import { describe, expect, it } from "vitest";
import type { DocumentDump, HostJob, HostJobQueue, HostJobResult } from "@folio/contracts";
import { canonicalizeDocumentDump, createIndesignAdapter, processPendingJobs } from "./index.js";
import type { HostOperationError } from "./index.js";

describe("InDesign adapter boundary", () => {
  it("canonicalizes volatile ordering and measurement precision", () => {
    const dump: DocumentDump = {
      schemaVersion: 1,
      pages: [{ id: "p2", index: 1 }, { id: "p1", index: 0 }],
      stories: [{ id: "z", overset: false, paragraphs: [] }, { id: "a", overset: true, paragraphs: [] }],
      frames: [{ semanticRole: "flow", pageIndex: 0, bounds: [1.234, 2, 3, 4] }],
      missingAssets: ["z.png", "a.png", "a.png"],
      missingFonts: []
    };
    const normalized = canonicalizeDocumentDump(dump);
    expect(normalized.pages.map((page) => page.id)).toEqual(["p1", "p2"]);
    expect(normalized.stories.map((story) => story.id)).toEqual(["a", "z"]);
    expect(normalized.frames[0]?.bounds).toEqual([1.23, 2, 3, 4]);
    expect(normalized.missingAssets).toEqual(["a.png", "z.png"]);
  });

  it("wraps host exceptions with the failing operation", async () => {
    const adapter = createIndesignAdapter({
      inspectTemplate: async () => { throw new Error("invalid object"); },
      render: async () => ({ pageCount: 0, overset: [], missingAssets: [], missingFonts: [] }),
      dump: async () => ({ schemaVersion: 1, pages: [], stories: [], frames: [], missingAssets: [], missingFonts: [] }),
      export: async () => undefined
    });
    await expect(adapter.inspectTemplate("template.indd")).rejects.toMatchObject({
      name: "HostOperationError",
      operation: "inspectTemplate"
    } satisfies Partial<HostOperationError>);
  });

  it("writes job results before removing completed jobs from the queue", async () => {
    const job: HostJob = { schemaVersion: 1, jobId: "job-1", action: "dump", payload: { path: "output.indd" } };
    const pending = [job];
    const results: HostJobResult[] = [];
    const events: string[] = [];
    const queue: HostJobQueue = {
      async listPending() { return pending; },
      async writeResult(result) { events.push("write:" + result.status); results.push(result); },
      async removePending(jobId) { events.push("remove:" + jobId); pending.splice(0, pending.length); }
    };

    const processed = await processPendingJobs(queue, async () => ({ pages: 4 }));

    expect(processed).toEqual(results);
    expect(processed[0]).toMatchObject({ jobId: "job-1", status: "succeeded", payload: { pages: 4 } });
    expect(events).toEqual(["write:succeeded", "remove:job-1"]);
    expect(pending).toEqual([]);
  });

  it("records handler failures as job results", async () => {
    const job: HostJob = { schemaVersion: 1, jobId: "job-2", action: "export", payload: {} };
    const results: HostJobResult[] = [];
    const queue: HostJobQueue = {
      async listPending() { return [job]; },
      async writeResult(result) { results.push(result); },
      async removePending() {}
    };

    const [result] = await processPendingJobs(queue, async () => { throw new Error("Export failed"); });

    expect(result).toMatchObject({
      status: "failed",
      diagnostics: [{ code: "HostJob.ExecutionFailed", message: "Export failed", severity: "error" }]
    });
    expect(results).toEqual([result]);
  });

  it("leaves a job pending when result persistence fails", async () => {
    const job: HostJob = { schemaVersion: 1, jobId: "job-3", action: "probe", payload: {} };
    let acknowledged = false;
    const queue: HostJobQueue = {
      async listPending() { return [job]; },
      async writeResult() { throw new Error("Disk unavailable"); },
      async removePending() { acknowledged = true; }
    };

    await expect(processPendingJobs(queue, async () => ({}))).rejects.toThrow("Disk unavailable");
    expect(acknowledged).toBe(false);
  });

  it("rejects duplicate job IDs before running either handler", async () => {
    const job: HostJob = { schemaVersion: 1, jobId: "duplicate", action: "probe", payload: {} };
    const queue: HostJobQueue = {
      async listPending() { return [job, job]; },
      async writeResult() {},
      async removePending() {}
    };
    let handled = false;

    await expect(processPendingJobs(queue, async () => { handled = true; return {}; }))
      .rejects.toThrow("Queue contains duplicate job ID: duplicate");
    expect(handled).toBe(false);
  });
});
