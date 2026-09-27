import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../../../");

describe("package architecture", () => {
  it("keeps runtime APIs out of contracts, core, and template compilation", async () => {
    const sourceFiles = await Promise.all(["contracts", "core", "template"].map((name) => collect(resolve(root, "packages", name, "src"))))
      .then((groups) => groups.flat());
    const sources = await Promise.all(sourceFiles.map((file) => readFile(file, "utf8")));
    const pureSource = sources.join("\n");
    expect(pureSource).not.toMatch(/(?:from\s*|require\s*\()(["'])indesign\1/);
    expect(pureSource).not.toMatch(/(?:from\s*|require\s*\()(["'])uxp\1/);
    expect(pureSource).not.toMatch(/(?:from\s*|require\s*\()(["'])node:/);
    expect(pureSource).not.toMatch(/(?:from\s*|require\s*\()(["'])(?:fs|path)\1/);
  });

  it("keeps direct InDesign DOM mounting inside the adapter package", async () => {
    const packages = await readdir(resolve(root, "packages"), { withFileTypes: true });
    const outsideAdapter = await Promise.all(packages
      .filter((entry) => entry.isDirectory() && entry.name !== "indesign")
      .map((entry) => collect(resolve(root, "packages", entry.name, "src"))));
    const files = outsideAdapter.flat();
    const sources = await Promise.all(files.map((file) => readFile(file, "utf8")));
    for (const source of sources) expect(source).not.toMatch(/(?:from\s*|require\s*\()(["'])indesign\1/);
  });

  it("keeps runtime APIs within the declared library while compiling TypeScript to ESNext", async () => {
    const packageSources = await Promise.all(["contracts", "core", "template", "desktop"]
      .map((name) => collect(resolve(root, "packages", name, "src"))));
    const files = packageSources.flat();
    const sources = await Promise.all(files.map((file) => readFile(file, "utf8")));
    const bundle = await readFile(resolve(root, "packages/desktop/src/App.tsx"), "utf8");
    const tsconfig = JSON.parse(await readFile(resolve(root, "tsconfig.base.json"), "utf8")) as {
      compilerOptions: { target?: string; lib?: string[] };
    };
    const unsupportedRuntimeApi = /\.(?:at|toSorted|toReversed|findLast|findLastIndex|replaceAll)\s*\(/;

    expect(tsconfig.compilerOptions.target).toBe("ESNext");
    expect(tsconfig.compilerOptions.lib).toEqual(["ES2020"]);
    for (const source of sources) expect(source).not.toMatch(unsupportedRuntimeApi);
    expect(bundle).not.toMatch(unsupportedRuntimeApi);
  });
});

async function collect(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) files.push(...await collect(path));
    else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts")) files.push(path);
  }
  return files;
}
