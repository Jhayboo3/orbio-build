import { copyFile, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { chromium } from "playwright";
import { createMockDemo } from "../dist/demo/mock-demo.js";

const outputDirectory = new URL("../docs/assets/", import.meta.url);
await mkdir(outputDirectory, { recursive: true });
const videoDirectory = join(tmpdir(), `orbio-guard-video-${Date.now()}`);
await mkdir(videoDirectory, { recursive: true });
const demo = await createMockDemo();
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  recordVideo: { dir: videoDirectory, size: { width: 1440, height: 900 } },
  viewport: { width: 1440, height: 900 },
});
const page = await context.newPage();
const browserErrors = [];
page.on("console", (message) => {
  if (message.type() === "error") browserErrors.push(message.text());
});
page.on("pageerror", (error) => browserErrors.push(error.message));

try {
  await page.goto(demo.dashboardUrl, { waitUntil: "networkidle" });
  await setCaption(page, "Demo mode · two agents, one protected wallet");
  await page.waitForTimeout(1_800);

  const captions = [
    "Alpha research · request allowed",
    "Beta coding · first request allowed",
    "Beta coding · daily budget exceeded",
    "Alpha research · fleet continues",
  ];

  for (const caption of captions) {
    const step = await demo.runNext();
    if (!step) throw new Error("Demo ended before every video step was recorded.");
    await page.reload({ waitUntil: "networkidle" });
    await setCaption(page, `Demo mode · ${caption} · HTTP ${step.status}`);
    await page.waitForTimeout(1_800);
  }

  await page.locator(".activity-panel").evaluate((element) => {
    element.scrollIntoView({ behavior: "smooth", block: "start" });
  });
  await page.waitForTimeout(700);
  await setCaption(page, "Demo mode · blocked decision recorded, no prompt stored");
  await page.waitForTimeout(2_200);

  if (browserErrors.length) {
    throw new Error(browserErrors.join(" | "));
  }
} finally {
  await page.close();
  await context.close();
  await browser.close();
  await demo.close();
}

const recordedPath = await page.video().path();
const webmPath = fileURLToPath(new URL("orbio-guard-demo.webm", outputDirectory));
const mp4Path = fileURLToPath(new URL("orbio-guard-demo.mp4", outputDirectory));
await copyFile(recordedPath, webmPath);
const conversion = spawnSync(
  "ffmpeg",
  [
    "-y",
    "-i",
    webmPath,
    "-c:v",
    "libx264",
    "-preset",
    "medium",
    "-crf",
    "22",
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",
    mp4Path,
  ],
  { encoding: "utf8" },
);
if (conversion.status !== 0) {
  throw new Error(`FFmpeg conversion failed: ${conversion.stderr}`);
}
await rm(webmPath, { force: true });
await rm(videoDirectory, { force: true, recursive: true });
console.log(`Demo video recorded at ${mp4Path}`);

async function setCaption(pageInstance, text) {
  await pageInstance.locator("#system-label").evaluate((element, caption) => {
    element.textContent = caption;
  }, text);
}
