import { copyFile, mkdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { chromium } from "playwright";
import { createMockDemo } from "../dist/demo/mock-demo.js";

const outputDirectory = new URL("../docs/assets/", import.meta.url);
await mkdir(outputDirectory, { recursive: true });
const workDirectory = join(tmpdir(), `orbio-guard-technical-${Date.now()}`);
await mkdir(workDirectory, { recursive: true });
const narration = await readFile(
  new URL("../docs/technical-narration.txt", import.meta.url),
  "utf8",
);
const narrationPath = join(workDirectory, "narration.aiff");
const silentPath = join(workDirectory, "technical-silent.webm");
const outputPath = fileURLToPath(
  new URL("orbio-guard-technical-draft.mp4", outputDirectory),
);
const demo = await createMockDemo();
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  recordVideo: { dir: workDirectory, size: { width: 1440, height: 900 } },
  viewport: { width: 1440, height: 900 },
});
const page = await context.newPage();
const video = page.video();
const browserErrors = [];
page.on("console", (message) => {
  if (message.type() === "error") browserErrors.push(message.text());
});
page.on("pageerror", (error) => browserErrors.push(error.message));

try {
  const technicalUrl = demo.dashboardUrl.replace(/\/dashboard$/, "/technical");
  await page.goto(technicalUrl, { waitUntil: "networkidle" });
  await page.waitForTimeout(6_000);
  for (const selector of [
    "#request-path",
    "#oauth",
    "#budget",
    "#protocols",
    "#recovery",
    "#verification",
  ]) {
    await scrollTo(page, selector);
    await page.waitForTimeout(8_000);
  }
  if (browserErrors.length) {
    throw new Error(browserErrors.join(" | "));
  }
} finally {
  await page.close();
  await context.close();
  await browser.close();
  await demo.close();
}

if (!video) throw new Error("Playwright did not create a technical recording.");
await copyFile(await video.path(), silentPath);
run("say", ["-v", "Samantha", "-r", "170", "-o", narrationPath, narration.trim()]);
run("ffmpeg", [
  "-y",
  "-i",
  silentPath,
  "-i",
  narrationPath,
  "-filter_complex",
  "[0:v]tpad=stop_mode=clone:stop_duration=60[v];[1:a]loudnorm=I=-16:TP=-1.5:LRA=11[a]",
  "-map",
  "[v]",
  "-map",
  "[a]",
  "-c:v",
  "libx264",
  "-preset",
  "medium",
  "-crf",
  "22",
  "-pix_fmt",
  "yuv420p",
  "-c:a",
  "aac",
  "-b:a",
  "160k",
  "-movflags",
  "+faststart",
  "-shortest",
  outputPath,
]);
await rm(workDirectory, { force: true, recursive: true });
console.log(`Narrated technical draft created at ${outputPath}`);

async function scrollTo(pageInstance, selector) {
  await pageInstance.locator(selector).evaluate((element) => {
    element.scrollIntoView({ behavior: "smooth", block: "start" });
  });
  await pageInstance.waitForTimeout(800);
}

function run(command, argumentsValue) {
  const result = spawnSync(command, argumentsValue, { encoding: "utf8" });
  if (result.status !== 0) throw new Error(`${command} failed: ${result.stderr}`);
}
