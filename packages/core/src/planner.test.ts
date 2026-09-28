import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { FakeHostAdapter, makeInventory, fakeObservation } from "@folio/test-support";
import { stableJson } from "@folio/contracts";
import { compileTemplate } from "../../template/src/index.js";
import { parseArticle } from "./markdown.js";
import { planDocument, respondToObservation } from "./planner.js";
import { publishDocument } from "./publish.js";

describe("publishing planner", () => {
  const template = compileTemplate(makeInventory()).template!;

  it("creates a deterministic initial plan with one continuous main story", () => {
    const article = parseArticle("# Title\n\nFirst paragraph.\n\nSecond paragraph.").document!;
    const result = planDocument(article, template);
    expect(result.diagnostics).toEqual([]);
    expect(result.ir?.pages.map((page) => page.role)).toEqual(["Cover", "Article", "Ending"]);
    expect(result.ir?.stories.main?.blockIds).toEqual(article.blocks.map((block) => block.id));
  });

  it("round trips the planned document IR through canonical JSON", () => {
    const article = parseArticle("# Title\n\n![Alt](figure.png \"Caption\")").document!;
    const planned = planDocument(article, template).ir!;
    expect(JSON.parse(stableJson(planned))).toEqual(planned);
  });

  it("adds an Article page before Ending when InDesign reports overset", () => {
    const article = parseArticle("# Title\n\nBody.").document!;
    const planned = planDocument(article, template).ir!;
    const result = respondToObservation(planned, template, fakeObservation({
      overset: [{ storyId: "main", pageId: "page-article-001", frameRef: "article-flow-frame", remainingCharacters: 90 }]
    }));
    expect(result.addedPages).toBe(1);
    expect(result.complete).toBe(false);
    expect(result.ir.pages.map((page) => page.id)).toEqual(["page-cover", "page-article-001", "page-article-002", "page-ending"]);
  });

  it("stops at a page cap instead of creating pages without bound", () => {
    const article = parseArticle("# Title\n\nBody.").document!;
    const planned = planDocument(article, template).ir!;
    const result = respondToObservation(planned, template, fakeObservation({
      overset: [{ storyId: "main", pageId: "page-article-001", frameRef: "article-flow-frame" }]
    }), { maxPages: 3 });
    expect(result.addedPages).toBe(0);
    expect(result.diagnostics[0]?.code).toBe("Story.PageLimitReached");
  });

  it("reports missing assets and fonts as structured host diagnostics", () => {
    const article = parseArticle("# Title\n\nBody.").document!;
    const planned = planDocument(article, template).ir!;
    const result = respondToObservation(planned, template, fakeObservation({
      missingAssets: ["missing.png"],
      missingFonts: ["Example Font"]
    }));
    expect(result.diagnostics.map((item) => item.code)).toEqual(["Asset.Missing", "Font.Missing"]);
  });

  it("reports a missing-asset render as degraded while keeping the plan publishable", () => {
    const article = parseArticle("# Title\n\nBody.").document!;
    const planned = planDocument(article, template).ir!;
    const result = respondToObservation(planned, template, fakeObservation({ missingAssets: ["missing.png"] }));
    expect(result.complete).toBe(true);
    expect(result.ir).toEqual(planned);
    expect(result.diagnostics[0]?.code).toBe("Asset.Missing");
  });

  it("returns degraded and failed publish statuses without conflating warnings with host failures", async () => {
    const article = parseArticle("# Title\n\nBody.").document!;
    const degradedHost = new FakeHostAdapter(makeInventory(), [fakeObservation({ missingFonts: ["Example Font"] })]);
    const degraded = await publishDocument(degradedHost, {
      templatePath: "template.indd", outputPath: "degraded.indd", document: article, template
    });
    expect(degraded.status).toBe("degraded");
    expect(degraded.complete).toBe(true);

    const failedHost = new FakeHostAdapter(makeInventory());
    failedHost.render = async () => { throw new Error("InDesign timed out"); };
    const failed = await publishDocument(failedHost, {
      templatePath: "template.indd", outputPath: "failed.indd", document: article, template
    });
    expect(failed.status).toBe("failed");
    expect(failed.complete).toBe(false);
    expect(failed.diagnostics).toContainEqual(expect.objectContaining({ code: "Publish.HostOperationFailed", severity: "error" }));
  });

  it("records caption roles separately from the image object role", () => {
    const article = parseArticle("# Title\n\n![Alt](figure.png \"Caption\")").document!;
    const result = planDocument(article, template);
    const image = article.blocks.find((block) => block.type === "image");
    expect(image).toBeDefined();
    expect(result.ir?.stories.main?.blockStyleRoles[image!.id]).toBe("InlineImage");
    expect(result.ir?.stories.main?.captionStyleRoles).toEqual([image!.id]);
  });

  it("publishes by asking InDesign for composition, then adding pages only after overset feedback", async () => {
    const article = parseArticle("# Title\n\nBody.").document!;
    const host = new FakeHostAdapter(makeInventory(), [
      fakeObservation({ overset: [{ storyId: "main", pageId: "page-article-001", frameRef: "article-flow-frame" }] }),
      fakeObservation({ pageCount: 4 })
    ]);
    const result = await publishDocument(host, {
      templatePath: "template.indd",
      outputPath: "output.indd",
      document: article,
      template
    });
    expect(result.complete).toBe(true);
    expect(result.status).toBe("complete");
    expect(result.ir?.pages.map((page) => page.role)).toEqual(["Cover", "Article", "Article", "Ending"]);
    expect(host.operations).toEqual(["render:create:3", "render:appendPages:4"]);
  });

  it("terminates within the configured limit for repeated overset observations", () => {
    fc.assert(fc.property(fc.integer({ min: 3, max: 20 }), (limit) => {
      const article = parseArticle("# Title\n\nBody.").document!;
      let ir = planDocument(article, template).ir!;
      let changes = 0;
      while (changes < limit) {
        const result = respondToObservation(ir, template, fakeObservation({
          overset: [{ storyId: "main", pageId: "page-article-001", frameRef: "article-flow-frame" }]
        }), { maxPages: limit });
        ir = result.ir;
        if (!result.addedPages) break;
        changes += 1;
      }
      return ir.pages.length <= limit;
    }), { numRuns: 30 });
  });
});
