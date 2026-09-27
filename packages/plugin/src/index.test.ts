// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { mountFolioPanel } from "./index.js";

const panelSource = readFileSync(resolve(process.cwd(), "packages/plugin/index.html"), "utf8");
const panelMarkup = panelSource.replace(/\s*<script defer[^>]*><\/script>/, "");

describe("publishing panel", () => {
  it("defers its compiled entrypoint until the panel DOM is ready", () => {
    expect(panelSource).toMatch(/<script defer src="\.\/dist\/index\.js"><\/script>/);
  });

  beforeEach(() => {
    document.body.innerHTML = panelMarkup;
    mountFolioPanel(document as unknown as Document);
  });

  it("validates the example and displays a semantic outline rather than raw JSON", () => {
    document.querySelector("#validate-article")?.dispatchEvent(new Event("click"));

    expect(document.querySelector("#validation-status")?.textContent).toBe("Structure looks good");
    expect(document.querySelector("#block-count")?.textContent).toBe("3");
    expect(document.querySelector("#issue-count")?.textContent).toBe("None");
    expect(document.querySelectorAll("#article-outline > li")).toHaveLength(3);
    expect(document.querySelector("#article-outline")?.textContent).toContain("Keep the source semantic");
    expect(document.querySelector("pre")).toBeNull();
  });

  it("shows parser errors with their paths and clears stale results after edits", () => {
    const input = document.querySelector("#article-input") as HTMLTextAreaElement;
    input.value = "# Article\n\n| Name | Value |\n|---|---|\n| one | two |";
    input.dispatchEvent(new Event("input"));
    document.querySelector("#validate-article")?.dispatchEvent(new Event("click"));

    expect(document.querySelector("#validation-status")?.getAttribute("data-state")).toBe("error");
    expect(document.querySelector("#diagnostic-list")?.textContent).toContain("Article.BlockUnsupported");
    expect(document.querySelectorAll("#diagnostic-list [data-severity='error']")).toHaveLength(1);

    input.value = "# Repaired article\n\nA valid paragraph.";
    input.dispatchEvent(new Event("input"));
    expect(document.querySelector("#validation-status")?.textContent).toBe("Changes not validated");
    expect(document.querySelector("#diagnostic-list")?.children).toHaveLength(0);
    expect(document.querySelector("#block-count")?.textContent).toBe("—");
  });

  it("switches accessible tabs and loads the example into the outline", () => {
    document.querySelector("#load-example")?.dispatchEvent(new Event("click"));

    expect(document.querySelector("#tab-outline")?.getAttribute("aria-selected")).toBe("true");
    expect(document.querySelector("#panel-outline")?.hasAttribute("hidden")).toBe(false);
    expect(document.querySelector("#article-title")?.textContent).toBe("A better publishing workflow");
    expect(document.querySelectorAll("#article-outline > li")).toHaveLength(4);

    document.querySelector("#tab-diagnostics")?.dispatchEvent(new Event("click"));
    expect(document.querySelector("#panel-diagnostics")?.hasAttribute("hidden")).toBe(false);
    expect(document.querySelector("#tab-diagnostics")?.getAttribute("aria-selected")).toBe("true");
  });

  it("renders article text as text content, not executable markup", () => {
    const input = document.querySelector("#article-input") as HTMLTextAreaElement;
    input.value = "# Safe title\n\n&lt;img src=x onerror=alert(1)&gt;";
    document.querySelector("#validate-article")?.dispatchEvent(new Event("click"));

    expect(document.querySelector("#article-outline img")).toBeNull();
    expect(document.querySelector("#article-outline")?.textContent).toContain("<img src=x onerror=alert(1)>");
  });
});
