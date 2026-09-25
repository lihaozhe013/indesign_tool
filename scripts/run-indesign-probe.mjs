#!/usr/bin/env node
// Development-time host probe runner. Not part of the publishing product or the
// adapter boundary: it uses macOS AppleScript (`do script ... language
// uxpscript`) to execute UXP .idjs probes inside InDesign and harvests their
// console.log evidence from the newest UXP log. Product host code must stay
// in packages/indesign.

import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

function usage() {
  console.error("usage: node scripts/run-indesign-probe.mjs <probe.idjs> --tag TAG [--app NAME] [--timeout SECONDS] [--out FILE] [--cleanup PATH]...");
  process.exit(2);
}

const argv = process.argv.slice(2);
if (argv.length === 0 || argv[0] === "--help") usage();
const probePath = argv[0];
if (!probePath.endsWith(".idjs")) {
  console.error("probe file must end with .idjs");
  process.exit(2);
}

let tag;
let outPath;
let timeoutSeconds = 90;
let appName = "Adobe InDesign 2026";
const cleanupPaths = [];
for (let i = 1; i < argv.length; i += 1) {
  const flag = argv[i];
  const value = argv[i + 1];
  if (flag === "--tag" && value !== undefined) tag = value;
  else if (flag === "--out" && value !== undefined) outPath = value;
  else if (flag === "--timeout" && value !== undefined) timeoutSeconds = Number(value);
  else if (flag === "--app" && value !== undefined) appName = value;
  else if (flag === "--cleanup" && value !== undefined) cleanupPaths.push(value);
  else {
    console.error("unexpected argument: " + flag);
    usage();
  }
  i += 1;
}
if (!tag) {
  console.error("--tag is required so the runner can find the probe record");
  usage();
}

// do script executes a UXP script from any POSIX path; the Scripts Panel
// folder is not required. Probes therefore run straight from the repository.
const probeSource = probePath.startsWith("/") ? probePath : join(process.cwd(), probePath);
if (!existsSync(probeSource)) {
  console.error("probe file not found: " + probeSource);
  process.exit(1);
}

// Persistence probes must start from a known-absent target: a re-run that has
// to overwrite or race a previous scratch file makes the evidence ambiguous,
// so callers pass the disposable target here.
for (const target of cleanupPaths) {
  if (existsSync(target)) {
    rmSync(target);
    console.error("removed stale target " + target);
  }
}

function newestUxpLog() {
  const logRoot = process.env.ID_UXP_LOG_DIR ?? join(homedir(), "Library", "Logs", "Adobe", "Adobe InDesign 2024");
  const logs = readdirSync(logRoot)
    .filter((name) => name.startsWith("UXPLogs_") && name.endsWith(".log"))
    .map((name) => join(logRoot, name))
    .sort((left, right) => statSync(right).mtimeMs - statSync(left).mtimeMs);
  if (logs.length === 0) throw new Error("no UXP logs found under " + logRoot);
  return logs[0];
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

const logBefore = newestUxpLog();
// Offset in decoded characters so it matches String.slice below; the log
// contains multibyte console output, so byte size is not usable here.
const offsetBefore = readFileSync(logBefore, "utf8").length;

execFileSync("osascript", [
  "-e",
  `tell application ${JSON.stringify(appName)} to do script POSIX file ${JSON.stringify(probeSource)} language uxpscript`
], { stdio: "inherit" });

const deadline = Date.now() + timeoutSeconds * 1000;
let record;
while (!record) {
  if (Date.now() > deadline) {
    console.error(`timeout after ${timeoutSeconds}s waiting for ${tag} in UXP logs`);
    process.exit(1);
  }
  await sleep(1000);
  const logNow = newestUxpLog();
  const content = readFileSync(logNow, "utf8");
  const tail = logNow === logBefore ? content.slice(offsetBefore) : content;
  for (const line of tail.split("\n")) {
    if (!line.includes(tag)) continue;
    const jsonStart = line.indexOf("{");
    if (jsonStart < 0) continue;
    try {
      record = JSON.parse(line.slice(jsonStart));
    } catch {
      console.error("probe tag found but record is not parseable JSON:\n" + line);
      process.exit(1);
    }
  }
}

console.log(JSON.stringify(record, null, 2));
if (outPath) {
  writeFileSync(outPath, JSON.stringify(record, null, 2) + "\n");
  console.error("saved " + outPath);
}
