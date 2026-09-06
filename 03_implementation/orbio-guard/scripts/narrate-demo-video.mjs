import { readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const narration = await readFile(
  new URL("../docs/demo-narration.txt", import.meta.url),
  "utf8",
);
const temporaryAudio = join(tmpdir(), `orbio-guard-narration-${Date.now()}.aiff`);
const silentVideo = fileURLToPath(
  new URL("../docs/assets/orbio-guard-demo.mp4", import.meta.url),
);
const narratedVideo = fileURLToPath(
  new URL("../docs/assets/orbio-guard-demo-narrated.mp4", import.meta.url),
);

const speech = spawnSync(
  "say",
  ["-v", "Samantha", "-r", "160", "-o", temporaryAudio, narration.trim()],
  { encoding: "utf8" },
);
if (speech.status !== 0) {
  throw new Error(`Narration generation failed: ${speech.stderr}`);
}

const conversion = spawnSync(
  "ffmpeg",
  [
    "-y",
    "-i",
    silentVideo,
    "-i",
    temporaryAudio,
    "-filter_complex",
    "[0:v]tpad=stop_mode=clone:stop_duration=30[v];[1:a]loudnorm=I=-16:TP=-1.5:LRA=11[a]",
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
    narratedVideo,
  ],
  { encoding: "utf8" },
);
await rm(temporaryAudio, { force: true });
if (conversion.status !== 0) {
  throw new Error(`Narrated video conversion failed: ${conversion.stderr}`);
}

console.log(`Narrated demo draft created at ${narratedVideo}`);
