#!/usr/bin/env node

import { Command } from "commander";
import { ZodError } from "zod";
import { loadConfig } from "./config/schema.js";
import {
  discoverOrbioOAuth,
  probeOrbioMcpAuthentication,
} from "./orbio/discovery.js";
import { ORBIO_TOOL_NAMES } from "./orbio/types.js";
import { redactValue } from "./shared/redaction.js";

const program = new Command();

program
  .name("orbio-guard")
  .description("Local-first credit controls for Orbio-powered AI agents.")
  .version("0.1.0");

program
  .command("doctor")
  .description("Validate configuration and inspect the public Orbio MCP metadata.")
  .option("--json", "Print machine-readable output.")
  .action(async ({ json }: { json?: boolean }) => {
    const config = loadConfig();
    const [discovery, authentication] = await Promise.all([
      discoverOrbioOAuth(config.mcpEndpoint),
      probeOrbioMcpAuthentication(config.mcpEndpoint),
    ]);
    const result = redactValue({
      authentication,
      config: {
        host: config.host,
        mcpEndpoint: config.mcpEndpoint.toString(),
        port: config.port,
        requestTimeoutMs: config.requestTimeoutMs,
        stateDirectory: config.stateDirectory,
      },
      oauth: discovery,
      plannedTools: ORBIO_TOOL_NAMES,
    });

    if (json) {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return;
    }

    console.log("Orbio Guard doctor");
    console.log(`MCP endpoint: ${config.mcpEndpoint.toString()}`);
    console.log(`OAuth issuer: ${discovery.authorizationServer.issuer}`);
    console.log(`Required scope: ${authentication.requiredScope ?? "unknown"}`);
    console.log(
      authentication.authenticated
        ? "MCP probe: authenticated"
        : `MCP probe: authentication required (HTTP ${authentication.status})`,
    );
    console.log(`Tool contract: ${ORBIO_TOOL_NAMES.join(", ")}`);
  });

program.parseAsync().catch((error: unknown) => {
  if (error instanceof ZodError) {
    console.error("Invalid Orbio Guard configuration:");
    console.error(error.issues.map((issue) => `- ${issue.message}`).join("\n"));
    process.exitCode = 1;
    return;
  }

  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
