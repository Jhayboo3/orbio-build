import { cp, mkdir, rm, writeFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const output = new URL("../cloudflare/dist/", import.meta.url);
const publicAssets = new URL("../src/dashboard/public/", import.meta.url);

await rm(output, { force: true, recursive: true });
await mkdir(new URL("assets/", output), { recursive: true });
await mkdir(new URL("dashboard/", output), { recursive: true });
await mkdir(new URL("technical/", output), { recursive: true });

await cp(new URL("styles.css", publicAssets), new URL("assets/styles.css", output));
await cp(new URL("dashboard.js", publicAssets), new URL("assets/dashboard.js", output));
await cp(new URL("index.html", publicAssets), new URL("index.html", output));
await cp(new URL("dashboard.html", publicAssets), new URL("dashboard/index.html", output));
await cp(new URL("technical.html", publicAssets), new URL("technical/index.html", output));
await cp(new URL("cloudflare/static/", root), output, { recursive: true });

await writeFile(new URL(".build-complete", output), "orbio-guard-cloudflare\n");
console.log("Cloudflare Pages bundle built at cloudflare/dist.");
