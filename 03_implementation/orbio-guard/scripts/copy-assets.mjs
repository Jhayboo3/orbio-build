import { cp, mkdir } from "node:fs/promises";

await mkdir(new URL("../dist/dashboard/", import.meta.url), { recursive: true });
await cp(
  new URL("../src/dashboard/public/", import.meta.url),
  new URL("../dist/dashboard/public/", import.meta.url),
  { recursive: true },
);
