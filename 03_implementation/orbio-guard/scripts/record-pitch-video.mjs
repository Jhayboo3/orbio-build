import { copyFile, mkdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { chromium } from "playwright";
import { createMockDemo } from "../dist/demo/mock-demo.js";

const outputDirectory = new URL("../docs/assets/", import.meta.url);
await mkdir(outputDirectory, { recursive: true });
const workDirectory = join(tmpdir(), `orbio-guard-pitch-${Date.now()}`);
await mkdir(workDirectory, { recursive: true });
const narration = await readFile(
  new URL("../docs/pitch-narration.txt", import.meta.url),
  "utf8",
);
const narrationPath = join(workDirectory, "narration.aiff");
const silentPath = join(workDirectory, "pitch-silent.webm");
const outputPath = fileURLToPath(
  new URL("orbio-guard-pitch-draft.mp4", outputDirectory),
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
  const rootUrl = demo.dashboardUrl.replace(/\/dashboard$/, "/");
  await page.goto(rootUrl, { waitUntil: "networkidle" });
  await page.waitForTimeout(4_000);
  await scrollTo(page, ".proof-strip");
  await page.waitForTimeout(4_000);
  await scrollTo(page, ".contest-proof");
  await page.waitForTimeout(8_000);

  await page.goto(demo.dashboardUrl, { waitUntil: "networkidle" });
  await setCaption(page, "Synthetic enforcement demo · two agents, one protected Orbio account");
  await page.waitForTimeout(4_000);

  const captions = [
    "Alpha research · request allowed",
    "Beta coding · first request allowed",
    "Beta coding · daily budget exceeded",
    "Alpha research · fleet continues",
  ];
  for (const caption of captions) {
    const step = await demo.runNext();
    if (!step) throw new Error("Pitch demo ended before all steps completed.");
    await page.reload({ waitUntil: "networkidle" });
    await setCaption(page, `Synthetic enforcement · ${caption} · HTTP ${step.status}`);
    await page.waitForTimeout(4_000);
  }

  await scrollTo(page, ".activity-panel");
  await setCaption(page, "Synthetic enforcement · every decision recorded, no prompt stored");
  await page.waitForTimeout(6_000);

  await page.goto(rootUrl, { waitUntil: "networkidle" });
  await scrollTo(page, ".closing");
  await page.waitForTimeout(6_000);

  if (browserErrors.length) {
    throw new Error(browserErrors.join(" | "));
  }
} finally {
  await page.close();
  await context.close();
  await browser.close();
  await demo.close();
}

if (!video) {
  throw new Error("Playwright did not create a pitch recording.");
}
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
console.log(`Narrated pitch draft created at ${outputPath}`);

async function scrollTo(pageInstance, selector) {
  await pageInstance.locator(selector).evaluate((element) => {
    element.scrollIntoView({ behavior: "smooth", block: "start" });
  });
  await pageInstance.waitForTimeout(800);
}

async function setCaption(pageInstance, text) {
  await pageInstance.locator("#system-label").evaluate((element, caption) => {
    element.textContent = caption;
  }, text);
}

function run(command, argumentsValue) {
  const result = spawnSync(command, argumentsValue, { encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(`${command} failed: ${result.stderr}`);
  }
}
