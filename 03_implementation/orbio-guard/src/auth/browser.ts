import { spawn } from "node:child_process";

export async function openAuthorizationUrl(url: URL): Promise<void> {
  const { command, arguments: commandArguments } = browserCommand(url);

  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, commandArguments, {
      detached: true,
      stdio: "ignore",
    });
    child.once("error", reject);
    child.once("spawn", () => {
      child.unref();
      resolve();
    });
  });
}

function browserCommand(url: URL): { command: string; arguments: string[] } {
  if (process.platform === "darwin") {
    return { command: "open", arguments: [url.toString()] };
  }

  if (process.platform === "win32") {
    return {
      command: "cmd",
      arguments: ["/c", "start", "", url.toString()],
    };
  }

  return { command: "xdg-open", arguments: [url.toString()] };
}
