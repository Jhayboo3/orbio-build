#!/usr/bin/env node

import { Command } from "commander";
import { ZodError } from "zod";
import { loadConfig } from "./config/schema.js";
import { OAuthStateStore } from "./auth/oauth-store.js";
import { GuardControlService } from "./control/service.js";
import { formatMicroUsd, parseUsdToMicroUsd } from "./domain/money.js";
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
import { GuardStateStore } from "./state/store.js";

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

program
  .command("init")
  .description("Create and validate the local Guard state file.")
  .action(async () => {
    const config = loadConfig();
    const store = new GuardStateStore(config.stateDirectory);
    await store.update(() => undefined);
    console.log(`Guard state initialized at ${store.filePath}`);
  });

const agentCommand = program
  .command("agent")
  .description("Manage Guard-side agent identities.");

agentCommand
  .command("add")
  .requiredOption("--name <name>", "Human-readable agent name.")
  .requiredOption("--daily-budget <usd>", "Daily budget in USD.")
  .requiredOption(
    "--models <patterns>",
    "Comma-separated exact model IDs or suffix wildcards.",
  )
  .option("--max-request <usd>", "Optional per-request USD ceiling.")
  .option("--project <project>", "Optional project or repository label.")
  .action(
    async (options: {
      dailyBudget: string;
      maxRequest?: string;
      models: string;
      name: string;
      project?: string;
    }) => {
      const service = controlService();
      const created = await service.addAgent({
        allowedModels: commaList(options.models),
        dailyBudgetMicroUsd: parseUsdToMicroUsd(options.dailyBudget),
        ...(options.maxRequest
          ? { maxRequestMicroUsd: parseUsdToMicroUsd(options.maxRequest) }
          : {}),
        name: options.name,
        ...(options.project ? { project: options.project } : {}),
      });

      console.log(`Agent created: ${created.agent.name} (${created.agent.id})`);
      console.log("Save this Guard token now; it will not be shown again:");
      console.log(created.token);
    },
  );

agentCommand
  .command("list")
  .option("--json", "Print machine-readable output.")
  .action(async ({ json }: { json?: boolean }) => {
    const agents = (await controlService().listAgents()).map(safeAgentView);
    if (json) {
      process.stdout.write(`${JSON.stringify(agents, null, 2)}\n`);
      return;
    }

    if (agents.length === 0) {
      console.log("No Guard agents configured.");
      return;
    }

    for (const agent of agents) {
      console.log(
        `${agent.id}  ${agent.name}  ${agent.status}  $${agent.dailyBudgetUsd}/day  ${agent.allowedModels.join(",")}`,
      );
    }
  });

for (const status of ["active", "paused", "disabled"] as const) {
  const commandName =
    status === "active" ? "resume" : status === "paused" ? "pause" : "disable";
  agentCommand
    .command(`${commandName} <agentId>`)
    .description(`Set an agent's status to ${status}.`)
    .action(async (agentId: string) => {
      const agent = await controlService().setStatus(agentId, status);
      console.log(`${agent.name} is now ${agent.status}.`);
    });
}

agentCommand
  .command("rotate-token <agentId>")
  .description("Invalidate an agent token and issue a replacement.")
  .action(async (agentId: string) => {
    const result = await controlService().rotateToken(agentId);
    console.log(`Token rotated for ${result.agent.name}. Save the replacement now:`);
    console.log(result.token);
  });

const policyCommand = program
  .command("policy")
  .description("Inspect and update per-agent policies.");

policyCommand
  .command("show <agentId>")
  .option("--json", "Print machine-readable output.")
  .action(async (agentId: string, { json }: { json?: boolean }) => {
    const agent = safeAgentView(await controlService().getAgent(agentId));
    if (json) {
      process.stdout.write(`${JSON.stringify(agent, null, 2)}\n`);
      return;
    }

    console.log(`${agent.name} (${agent.id})`);
    console.log(`Status: ${agent.status}`);
    console.log(`Daily budget: $${agent.dailyBudgetUsd}`);
    console.log(`Max request: ${agent.maxRequestUsd ? `$${agent.maxRequestUsd}` : "none"}`);
    console.log(`Allowed models: ${agent.allowedModels.join(", ")}`);
  });

policyCommand
  .command("set <agentId>")
  .option("--daily-budget <usd>", "Daily budget in USD.")
  .option("--max-request <usd>", 'Per-request USD ceiling or "none".')
  .option("--models <patterns>", "Comma-separated model patterns.")
  .action(
    async (
      agentId: string,
      options: { dailyBudget?: string; maxRequest?: string; models?: string },
    ) => {
      if (!options.dailyBudget && !options.maxRequest && !options.models) {
        throw new Error("Provide at least one policy option to update.");
      }

      const agent = await controlService().updatePolicy(agentId, {
        ...(options.dailyBudget
          ? { dailyBudgetMicroUsd: parseUsdToMicroUsd(options.dailyBudget) }
          : {}),
        ...(options.maxRequest
          ? {
              maxRequestMicroUsd:
                options.maxRequest === "none"
                  ? null
                  : parseUsdToMicroUsd(options.maxRequest),
            }
          : {}),
        ...(options.models ? { allowedModels: commaList(options.models) } : {}),
      });
      console.log(`Policy updated for ${agent.name}.`);
    },
  );

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

function controlService(): GuardControlService {
  const config = loadConfig();
  return new GuardControlService(new GuardStateStore(config.stateDirectory));
}

function commaList(value: string): string[] {
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function safeAgentView(agent: {
  allowedModels: string[];
  createdAt: string;
  dailyBudgetMicroUsd: string;
  id: string;
  maxRequestMicroUsd: string | null;
  name: string;
  project: string | null;
  status: string;
  tokenHash: string;
  updatedAt: string;
}) {
  return {
    id: agent.id,
    name: agent.name,
    project: agent.project,
    status: agent.status,
    dailyBudgetUsd: formatMicroUsd(agent.dailyBudgetMicroUsd),
    maxRequestUsd:
      agent.maxRequestMicroUsd === null
        ? null
        : formatMicroUsd(agent.maxRequestMicroUsd),
    allowedModels: agent.allowedModels,
    tokenFingerprint: agent.tokenHash.slice(0, 12),
    createdAt: agent.createdAt,
    updatedAt: agent.updatedAt,
  };
}
