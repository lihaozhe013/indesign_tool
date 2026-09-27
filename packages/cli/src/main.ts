#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import type { CompiledTemplate, TemplateInventory, TemplateRoleAssignments, TemplateScan } from "@folio/contracts";
import { stableJson, validateSemanticDocument, validateTemplateInventory } from "@folio/contracts";
import { parseArticle, planDocument, validateAssetReferences } from "@folio/core";
import { compileTemplate, createTemplateInventory, deriveRoleAssignments } from "@folio/template";

const cliArgs = process.argv.slice(2);
const [command, subcommand, ...args] = cliArgs[0] === "--" ? cliArgs.slice(1) : cliArgs;

if (command === "--help" || command === "help" || !command) {
  printHelp();
} else if (command === "article" && subcommand === "parse") {
  await parseCommand(args[0]);
} else if (command === "template" && subcommand === "validate") {
  await validateTemplateCommand(args[0]);
} else if (command === "template" && subcommand === "compile") {
  await compileTemplateCommand(args[0], args[1]);
} else if (command === "plan") {
  await planCommand([subcommand, ...args].filter((argument): argument is string => argument !== undefined));
} else if (["render", "dump", "export"].includes(command) || (command === "template" && subcommand === "inspect")) {
  unavailable(command === "template" ? "template inspect" : command);
} else {
  console.error("Unknown command. Run folio --help.");
  process.exitCode = 2;
}

async function parseCommand(filePath: string | undefined): Promise<void> {
  if (!filePath) return usageError("folio article parse <article.md>");
  const source = await readText(filePath);
  const result = parseArticle(source, { sourceId: basename(filePath) });
  if (result.document) {
    result.diagnostics.push(...validateAssetReferences(result.document, (assetPath) => existsSync(resolve(dirname(filePath), assetPath))));
    const schemaDiagnostics = validateSemanticDocument(result.document);
    result.diagnostics.push(...schemaDiagnostics);
  }
  process.stdout.write(stableJson(result));
  if (!result.document || result.diagnostics.some((item) => item.severity === "error")) process.exitCode = 1;
}

async function validateTemplateCommand(filePath: string | undefined): Promise<void> {
  if (!filePath) return usageError("folio template validate <inventory.json>");
  const raw = await readJson(filePath);
  const schemaDiagnostics = validateTemplateInventory(raw);
  if (schemaDiagnostics.some((item) => item.severity === "error")) {
    process.stdout.write(stableJson({ diagnostics: schemaDiagnostics }));
    process.exitCode = 1;
    return;
  }
  const result = compileTemplate(raw as TemplateInventory);
  process.stdout.write(stableJson(result));
  if (!result.template) process.exitCode = 1;
}

async function compileTemplateCommand(scanPath: string | undefined, assignmentsPath: string | undefined): Promise<void> {
  if (!scanPath) return usageError("folio template compile <scan.json> [roles.json]");
  const scan = (await readJson(scanPath)) as TemplateScan;
  // Roles come from designer labels unless an explicit assignments file is
  // supplied, so the compiled manifest is generated rather than hand-authored.
  const assignments = assignmentsPath
    ? (await readJson(assignmentsPath)) as TemplateRoleAssignments
    : deriveAssignmentsFromScan(scan, scanPath);
  if (!assignments) {
    process.exitCode = 1;
    return;
  }
  const inventory = createTemplateInventory(scan, assignments);
  if (!inventory.inventory) {
    process.stdout.write(stableJson({ diagnostics: inventory.diagnostics }));
    process.exitCode = 1;
    return;
  }
  const compiled = compileTemplate(inventory.inventory);
  const diagnostics = [...inventory.diagnostics, ...compiled.diagnostics];
  process.stdout.write(stableJson({ inventory: inventory.inventory, compiledTemplate: compiled.template, diagnostics }));
  if (!compiled.template || diagnostics.some((item) => item.severity === "error")) process.exitCode = 1;
}

function deriveAssignmentsFromScan(scan: TemplateScan, scanPath: string): TemplateRoleAssignments | undefined {
  const templateName = typeof scan.document?.name === "string" && scan.document.name
    ? scan.document.name
    : basename(scanPath);
  const derived = deriveRoleAssignments(scan, { templateId: templateName, name: templateName });
  if (!derived.assignments) {
    process.stdout.write(stableJson({ diagnostics: derived.diagnostics }));
    return undefined;
  }
  return derived.assignments;
}

async function planCommand(args: string[]): Promise<void> {
  const articlePath = args[0];
  const templateIndex = args.indexOf("--template");
  const templatePath = templateIndex >= 0 ? args[templateIndex + 1] : undefined;
  if (!articlePath || !templatePath) return usageError("folio plan <article.md> --template <inventory.json>");

  const [source, raw] = await Promise.all([readText(articlePath), readJson(templatePath)]);
  const article = parseArticle(source, { sourceId: basename(articlePath) });
  const templateSchemaDiagnostics = validateTemplateInventory(raw);
  const compiled = templateSchemaDiagnostics.some((item) => item.severity === "error")
    ? { diagnostics: templateSchemaDiagnostics }
    : compileTemplate(raw as TemplateInventory);
  if (!article.document || !compiled.template) {
    process.stdout.write(stableJson({ diagnostics: [...article.diagnostics, ...compiled.diagnostics] }));
    process.exitCode = 1;
    return;
  }
  const assetDiagnostics = validateAssetReferences(article.document, (assetPath) =>
    existsSync(resolve(dirname(articlePath), assetPath))
  );
  const planned = planDocument(article.document, compiled.template as CompiledTemplate);
  const diagnostics = [...article.diagnostics, ...assetDiagnostics, ...compiled.diagnostics, ...planned.diagnostics];
  process.stdout.write(stableJson({ document: article.document, template: compiled.template, ir: planned.ir, diagnostics }));
  if (!planned.ir || diagnostics.some((item) => item.severity === "error")) process.exitCode = 1;
}

async function readText(filePath: string): Promise<string> {
  return await readFile(filePath, "utf8");
}

async function readJson(filePath: string): Promise<unknown> {
  try {
    return JSON.parse(await readText(filePath)) as unknown;
  } catch (error) {
    console.error(stableJson({
      diagnostics: [{
        code: "Input.InvalidJson",
        message: error instanceof Error ? error.message : String(error),
        severity: "error",
        path: filePath
      }]
    }));
    process.exit(1);
  }
}

function unavailable(operation: string): void {
  console.error(stableJson({
    diagnostics: [{
      code: "HostUnavailable",
      message: "Cannot run " + operation + ": connect the UXP panel runner to InDesign first.",
      severity: "error"
    }]
  }));
  process.exitCode = 2;
}

function usageError(usage: string): void {
  console.error("Usage: " + usage);
  process.exitCode = 2;
}

function printHelp(): void {
  process.stdout.write([
    "Folio CLI",
    "",
    "Commands:",
    "  folio article parse <article.md>",
    "  folio template validate <inventory.json>",
    "  folio template compile <scan.json> [roles.json]",
    "  folio plan <article.md> --template <inventory.json>",
    "  folio template inspect <template.indd>   Requires a connected InDesign host",
    "  folio render <article.md>                Requires a connected InDesign host",
    "  folio dump <document.indd>                Requires a connected InDesign host",
    "  folio export <document.indd>              Requires a connected InDesign host",
    ""
  ].join("\n"));
}
