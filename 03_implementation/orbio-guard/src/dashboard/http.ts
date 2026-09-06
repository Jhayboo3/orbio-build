import { readFile } from "node:fs/promises";
import type { ServerResponse } from "node:http";
import type { DashboardService } from "./service.js";

const ASSETS = new Map([
  ["/", { file: "index.html", type: "text/html; charset=utf-8" }],
  ["/dashboard", { file: "dashboard.html", type: "text/html; charset=utf-8" }],
  ["/technical", { file: "technical.html", type: "text/html; charset=utf-8" }],
  ["/assets/styles.css", { file: "styles.css", type: "text/css; charset=utf-8" }],
  [
    "/assets/dashboard.js",
    { file: "dashboard.js", type: "text/javascript; charset=utf-8" },
  ],
]);

export async function serveDashboardRequest(
  requestUrl: URL,
  response: ServerResponse,
  dashboard: DashboardService,
): Promise<boolean> {
  if (requestUrl.pathname === "/api/dashboard") {
    const snapshot = await dashboard.snapshot(
      requestUrl.searchParams.get("live") !== "0",
    );
    setSecurityHeaders(response);
    response.statusCode = 200;
    response.setHeader("content-type", "application/json");
    response.setHeader("cache-control", "no-store");
    response.end(JSON.stringify(snapshot));
    return true;
  }

  const asset = ASSETS.get(requestUrl.pathname);
  if (!asset) {
    return false;
  }

  const contents = await readFile(
    new URL(`./public/${asset.file}`, import.meta.url),
  );
  setSecurityHeaders(response);
  response.statusCode = 200;
  response.setHeader("content-type", asset.type);
  response.setHeader(
    "cache-control",
    asset.type.startsWith("text/html") ? "no-store" : "public, max-age=300",
  );
  response.end(contents);
  return true;
}

function setSecurityHeaders(response: ServerResponse): void {
  response.setHeader(
    "content-security-policy",
    "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
  );
  response.setHeader("referrer-policy", "no-referrer");
  response.setHeader("x-content-type-options", "nosniff");
  response.setHeader("x-frame-options", "DENY");
}
