import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { createMockDemo } from "../dist/demo/mock-demo.js";

const outputDirectory = new URL("../docs/assets/", import.meta.url);
await mkdir(outputDirectory, { recursive: true });
const demo = await createMockDemo();
const browser = await chromium.launch({ headless: true });

try {
  await demo.run();
  const rootUrl = demo.dashboardUrl.replace(/\/dashboard$/, "/");
  const targets = [
    {
      file: "landing-desktop.png",
      url: rootUrl,
      viewport: { width: 1440, height: 1000 },
    },
    {
      file: "dashboard-desktop.png",
      url: demo.dashboardUrl,
      viewport: { width: 1440, height: 1100 },
    },
    {
      file: "dashboard-mobile.png",
      url: demo.dashboardUrl,
      viewport: { width: 390, height: 844 },
    },
  ];

  for (const target of targets) {
    const page = await browser.newPage({ viewport: target.viewport });
    const browserErrors = [];
    page.on("console", (message) => {
      if (message.type() === "error") browserErrors.push(message.text());
    });
    page.on("pageerror", (error) => browserErrors.push(error.message));
    await page.goto(target.url, { waitUntil: "networkidle" });
    if (target.url.endsWith("/dashboard")) {
      await page.waitForFunction(
        () => document.querySelector("#system-label")?.textContent?.includes("Demo mode"),
      );
    }
    if (browserErrors.length) {
      throw new Error(`${target.file}: ${browserErrors.join(" | ")}`);
    }
    await page.screenshot({
      fullPage: true,
      path: fileURLToPath(new URL(target.file, outputDirectory)),
    });
    await page.close();
  }
} finally {
  await browser.close();
  await demo.close();
}

console.log("Submission screenshots captured with synthetic demo data.");
