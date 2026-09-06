import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";
import { GuardControlService } from "../../dist/control/service.js";
import { startProxyServer } from "../../dist/proxy/server.js";
import { GuardStateStore } from "../../dist/state/store.js";

const stateDirectory = await mkdtemp(join(tmpdir(), "orbio-dashboard-e2e-"));
const store = new GuardStateStore(stateDirectory);
await new GuardControlService(store).addAgent({
  allowedModels: ["openai/gpt-*"],
  dailyBudgetMicroUsd: "5000000",
  name: "Dashboard QA agent",
  project: "visual-check",
});

const runtime = await startProxyServer({
  defaultReservationMicroUsd: "250000",
  host: "127.0.0.1",
  maxBodyBytes: 1_048_576,
  mcpEndpoint: new URL("https://www.orbio.so/api/mcp"),
  oauthCallbackPort: 4319,
  oauthTimeoutMs: 180_000,
  port: 0,
  requestTimeoutMs: 15_000,
  stateDirectory,
  upstreamBaseUrl: new URL("https://www.orbio.so/api/v1"),
});
const address = runtime.server.address();
if (!address || typeof address === "string") throw new Error("Dashboard server did not bind.");
const baseUrl = `http://127.0.0.1:${address.port}`;
const browser = await chromium.launch({ headless: true });

try {
  for (const viewport of [
    { width: 1440, height: 1000 },
    { width: 390, height: 844 },
  ]) {
    const page = await browser.newPage({ viewport });
    const browserErrors = [];
    page.on("console", (message) => {
      if (message.type() === "error") browserErrors.push(message.text());
    });
    page.on("pageerror", (error) => browserErrors.push(error.message));
    await page.route("**/api/dashboard**", async (route) => {
      const response = await fetch(`${baseUrl}/api/dashboard?live=0`);
      await route.fulfill({
        body: await response.text(),
        contentType: "application/json",
        status: response.status,
      });
    });

    await page.goto(baseUrl, { waitUntil: "networkidle" });
    if ((await page.locator("h1").textContent())?.includes("One wallet") !== true) {
      throw new Error("Landing page heading did not render.");
    }
    if ((await page.evaluate(() => document.documentElement.scrollWidth)) > viewport.width) {
      throw new Error(`Landing page overflows at ${viewport.width}px.`);
    }

    await page.goto(`${baseUrl}/dashboard`, { waitUntil: "networkidle" });
    await page.waitForSelector("#agents-table tr");
    if ((await page.locator("#agents-table tr").count()) !== 1) {
      throw new Error("Dashboard agent row did not render.");
    }
    if ((await page.evaluate(() => document.documentElement.scrollWidth)) > viewport.width) {
      throw new Error(`Dashboard overflows at ${viewport.width}px.`);
    }
    if (browserErrors.length) {
      throw new Error(`Dashboard browser errors: ${browserErrors.join(" | ")}`);
    }
    await page.close();
  }
} finally {
  await browser.close();
  await runtime.close();
}

console.log("Dashboard desktop and mobile render checks passed.");
