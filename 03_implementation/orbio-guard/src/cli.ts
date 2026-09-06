#!/usr/bin/env node

import { Command } from "commander";
import { ZodError } from "zod";
import { loadConfig } from "./config/schema.js";
import { OAuthStateStore } from "./auth/oauth-store.js";
import {
  discoverOrbioOAuth,
  probeOrbioMcpAuthentication,
} from "./orbio/discovery.js";
import {
  compareOrbioToolContract,
  ORBIO_TOOL_NAMES,
  PUBLIC_DOCUMENTED_ORBIO_TOOL_NAMES,
} from "./orbio/types.js";
import { connectOrbioMcp } from "./orbio/mcp-client.js";
import {
  orbioBalanceSchema,
  orbioKeyStatusSchema,
  parseStructuredToolResult,
} from "./orbio/results.js";
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
        oauthCallbackPort: config.oauthCallbackPort,
        oauthTimeoutMs: config.oauthTimeoutMs,
        port: config.port,
        requestTimeoutMs: config.requestTimeoutMs,
        stateDirectory: config.stateDirectory,
      },
      oauth: discovery,
      publicDocumentedTools: PUBLIC_DOCUMENTED_ORBIO_TOOL_NAMES,
      runtimeExpectedTools: ORBIO_TOOL_NAMES,
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
    console.log(`Runtime tool contract: ${ORBIO_TOOL_NAMES.join(", ")}`);
  });

program
  .command("auth")
  .description("Authenticate with Orbio and verify the live MCP tool contract.")
  .action(async () => {
    const config = loadConfig();
    const session = await connectOrbioMcp(config);

    try {
      const tools = await session.listTools();
      const comparison = compareOrbioToolContract(
        tools.map((tool) => tool.name),
      );
      console.log(`Authenticated with Orbio. ${tools.length} tools available.`);
      for (const tool of tools) {
        console.log(`- ${tool.name}`);
      }
      if (comparison.missing.length || comparison.unexpected.length) {
        console.warn("Warning: the live Orbio tool contract has changed.");
        if (comparison.missing.length) {
          console.warn(`Missing: ${comparison.missing.join(", ")}`);
        }
        if (comparison.unexpected.length) {
          console.warn(`Unexpected: ${comparison.unexpected.join(", ")}`);
        }
      }
    } finally {
      await session.close();
    }
  });

program
  .command("tools")
  .description("List the authenticated Orbio MCP tools and their input schemas.")
  .option("--json", "Print machine-readable output.")
  .action(async ({ json }: { json?: boolean }) => {
    const config = loadConfig();
    const session = await connectOrbioMcp(config);

    try {
      const tools = redactValue(await session.listTools());
      if (json) {
        process.stdout.write(`${JSON.stringify(tools, null, 2)}\n`);
        return;
      }

      for (const tool of tools as Array<{ description?: string; name: string }>) {
        console.log(tool.name);
        if (tool.description) {
          console.log(`  ${tool.description}`);
        }
      }
    } finally {
      await session.close();
    }
  });

program
  .command("status")
  .description("Read the current Orbio balance and account-key status.")
  .option("--json", "Print machine-readable output.")
  .action(async ({ json }: { json?: boolean }) => {
    const config = loadConfig();
    const session = await connectOrbioMcp(config);

    try {
      const balance = await session.callTool("orbio_get_balance");
      const keyStatus = await session.callTool("orbio_get_key_status");
      const status = redactValue({
        balance: parseStructuredToolResult(balance, orbioBalanceSchema),
        keyStatus: parseStructuredToolResult(keyStatus, orbioKeyStatusSchema),
      });

      if (json) {
        process.stdout.write(`${JSON.stringify(status, null, 2)}\n`);
        return;
      }

      console.log("Balance");
      printToolContent(balance);
      console.log("\nKey status");
      printToolContent(keyStatus);
    } finally {
      await session.close();
    }
  });

program
  .command("logout")
  .description("Remove locally stored Orbio OAuth credentials.")
  .action(async () => {
    const config = loadConfig();
    await new OAuthStateStore(config.stateDirectory).clear("all");
    console.log("Local Orbio OAuth credentials removed.");
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

function printToolContent(result: unknown): void {
  if (!result || typeof result !== "object" || !("content" in result)) {
    console.log(JSON.stringify(redactValue(result), null, 2));
    return;
  }

  const content = (result as { content?: unknown }).content;
  if (!Array.isArray(content)) {
    console.log(JSON.stringify(redactValue(result), null, 2));
    return;
  }

  for (const item of content) {
    if (
      item &&
      typeof item === "object" &&
      "type" in item &&
      item.type === "text" &&
      "text" in item &&
      typeof item.text === "string"
    ) {
      console.log(redactValue(item.text));
    }
  }
}
