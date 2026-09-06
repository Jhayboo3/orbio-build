import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";

const strict = process.argv.includes("--strict");
const checks = [];
const appResult = runJson("node", ["dist/cli.js", "submission-check", "--json"]);
checks.push(...appResult.checks);

const gitStatus = run("git", ["status", "--porcelain"], { cwd: "../.." });
checks.push(
  gitStatus.trim()
    ? block("git_clean", "The repository has uncommitted changes.")
    : pass("git_clean", "The repository working tree is clean."),
);

const version = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8")).version;
const tag = run("git", ["tag", "--points-at", "HEAD"], { cwd: "../.." })
  .split(/\r?\n/)
  .find((candidate) => candidate === `v${version}`);
checks.push(
  tag
    ? pass("release_tag", `HEAD is tagged v${version}.`)
    : block("release_tag", `HEAD is not tagged v${version}.`),
);

try {
  const repository = runJson("gh", [
    "repo",
    "view",
    "Jhayboo3/orbio-build",
    "--json",
    "visibility",
  ]);
  checks.push(
    repository.visibility === "PUBLIC"
      ? pass("repository_visibility", "The GitHub repository is public.")
      : block("repository_visibility", "The GitHub repository is still private."),
  );

  const release = runJson("gh", [
    "release",
    "view",
    `v${version}`,
    "--repo",
    "Jhayboo3/orbio-build",
    "--json",
    "isDraft,isPrerelease",
  ]);
  checks.push(
    release.isDraft
      ? block("release_published", "The GitHub release is still a draft.")
      : pass("release_published", "The GitHub release is published."),
  );
} catch (error) {
  checks.push(warn("github", `GitHub release status unavailable: ${error.message}`));
}

for (const file of [
  "docs/assets/orbio-guard-pitch-draft.mp4",
  "docs/assets/orbio-guard-technical-draft.mp4",
]) {
  const duration = Number.parseFloat(
    run("ffprobe", [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      file,
    ]),
  );
  checks.push(
    duration > 0 && duration <= 180
      ? pass(`media_${file}`, `${file} is ${duration.toFixed(1)} seconds.`)
      : block(`media_${file}`, `${file} exceeds the three-minute limit or is invalid.`),
  );
}

const report = {
  checks,
  generatedAt: new Date().toISOString(),
  ready: checks.every((check) => check.status !== "block"),
};
console.log(JSON.stringify(report, null, 2));
if (strict && !report.ready) process.exitCode = 1;

function run(command, argumentsValue, options = {}) {
  const result = spawnSync(command, argumentsValue, {
    cwd: options.cwd,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error(`${command} failed: ${result.stderr || result.stdout}`);
  }
  return result.stdout.trim();
}

function runJson(command, argumentsValue, options) {
  return JSON.parse(run(command, argumentsValue, options));
}

function pass(id, message) {
  return { id, message, status: "pass" };
}

function warn(id, message) {
  return { id, message, status: "warn" };
}

function block(id, message) {
  return { id, message, status: "block" };
}
