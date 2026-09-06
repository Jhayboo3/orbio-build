#!/usr/bin/env node

import { Command } from "commander";
import { ZodError } from "zod";
import { loadConfig } from "./config/schema.js";
import { OAuthStateStore } from "./auth/oauth-store.js";
import { GuardControlService } from "./control/service.js";
import { formatMicroUsd, parseUsdToMicroUsd } from "./domain/money.js";
import { LedgerService } from "./domain/ledger.js";
import { BudgetService } from "./domain/budget.js";
import { createMockDemo } from "./demo/mock-demo.js";
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
import { OrbioKeyLifecycleService } from "./orbio/key-lifecycle.js";
import {
  orbioBalanceSchema,
  orbioKeyStatusSchema,
  parseStructuredToolResult,
} from "./orbio/results.js";
import { redactValue } from "./shared/redaction.js";
import { GuardStateStore } from "./state/store.js";
import { UpstreamKeyStore } from "./upstream/key-store.js";
import { startProxyServer } from "./proxy/server.js";
import {
  generateSetupGuide,
  type SetupTarget,
} from "./setup/generator.js";
import { SubmissionReadinessService } from "./submission/readiness.js";

const program = new Command();

program
  .name("orbio-guard")
  .description("Local-first credit controls for Orbio-powered AI agents.")
  .version("0.1.0-rc.2");

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
        oauthCallbackBindHost: config.oauthCallbackBindHost,
        oauthCallbackHost: config.oauthCallbackHost,
        oauthCallbackPort: config.oauthCallbackPort,
        oauthTimeoutMs: config.oauthTimeoutMs,
        port: config.port,
        requestTimeoutMs: config.requestTimeoutMs,
        reservationTtlMs: config.reservationTtlMs,
        stateDirectory: config.stateDirectory,
        staleReservationPolicy: config.staleReservationPolicy,
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
  .option("--no-open", "Print the authorization URL instead of opening a browser.")
  .action(async ({ open }: { open: boolean }) => {
    const config = loadConfig();
    const session = await connectOrbioMcp(
      config,
      open
        ? {}
        : {
            launchAuthorization: async (url) => {
              console.log(`Open this authorization URL:\n${url.toString()}`);
            },
          },
    );

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

const budgetCommand = program
  .command("budget")
  .description("Inspect and recover local budget reservations.");

budgetCommand
  .command("recover")
  .description("Recover reservations left behind by interrupted requests.")
  .option("--policy <policy>", "confirm or release")
  .action(async ({ policy }: { policy?: string }) => {
    const config = loadConfig();
    const selectedPolicy = policy ?? config.staleReservationPolicy;
    if (selectedPolicy !== "confirm" && selectedPolicy !== "release") {
      throw new Error("Recovery policy must be confirm or release.");
    }
    const result = await new BudgetService(
      new GuardStateStore(config.stateDirectory),
    ).recoverStaleReservations({
      maxAgeMs: config.reservationTtlMs,
      policy: selectedPolicy,
    });
    console.log(
      `Recovered ${result.recovered} reservation(s), $${formatMicroUsd(result.amountMicroUsd)} using ${selectedPolicy}.`,
    );
  });

const keyCommand = program
  .command("key")
  .description("Manage the upstream Orbio gateway key owned by Guard.");

keyCommand
  .command("import")
  .description("Store ORBIO_GUARD_UPSTREAM_KEY in the owner-only local key vault.")
  .action(async () => {
    const config = loadConfig();
    const key = process.env.ORBIO_GUARD_UPSTREAM_KEY;
    if (!key) {
      throw new Error(
        "Set ORBIO_GUARD_UPSTREAM_KEY for this command. The key is never accepted as a command-line argument.",
      );
    }

    const store = new UpstreamKeyStore(config.stateDirectory);
    await store.save(key, config.upstreamBaseUrl);
    const status = await store.status();
    if (status.configured) {
      await new LedgerService(new GuardStateStore(config.stateDirectory)).record({
        keyFingerprint: status.fingerprint,
        type: "KEY_IMPORTED",
      });
    }
    console.log(`Upstream key stored securely at ${store.filePath}.`);
  });

keyCommand
  .command("status")
  .option("--json", "Print machine-readable output.")
  .action(async ({ json }: { json?: boolean }) => {
    const config = loadConfig();
    const status = await new UpstreamKeyStore(config.stateDirectory).status();
    if (json) {
      process.stdout.write(`${JSON.stringify(status, null, 2)}\n`);
      return;
    }

    console.log(
      status.configured
        ? `Upstream key configured (${status.fingerprint}).`
        : "No upstream key configured.",
    );
  });

keyCommand
  .command("clear")
  .description("Remove the locally stored upstream key.")
  .action(async () => {
    const config = loadConfig();
    await new UpstreamKeyStore(config.stateDirectory).clear();
    console.log("Upstream key removed.");
  });

keyCommand
  .command("create")
  .description("Create and securely store the account Orbio key through MCP.")
  .option("--label <label>", "Optional Orbio key label.", "Orbio Guard")
  .option("--rotate", "Replace an existing account key.")
  .action(async ({ label, rotate }: { label?: string; rotate?: boolean }) => {
    const service = keyLifecycleService();
    const result = await service.createOrRotate({
      allowRotation: rotate ?? false,
      ...(label ? { label } : {}),
    });
    console.log(
      `${result.rotated ? "Orbio key rotated" : "Orbio key created"} and stored securely (${result.fingerprint}).`,
    );
  });

keyCommand
  .command("revoke")
  .description("Revoke the account Orbio key and remove the local copy.")
  .option("--yes", "Confirm the destructive operation.")
  .action(async ({ yes }: { yes?: boolean }) => {
    if (!yes) {
      throw new Error("Re-run with --yes to revoke the account Orbio key.");
    }
    await keyLifecycleService().revoke();
    console.log("Orbio key revoked and local copy removed.");
  });

program
  .command("serve")
  .description("Start the local OpenAI-compatible Guard proxy.")
  .action(async () => {
    const config = loadConfig();
    const runtime = await startProxyServer(config);
    console.log(`Orbio Guard dashboard: http://${config.host}:${config.port}/dashboard`);
    console.log(`OpenAI-compatible base: http://${config.host}:${config.port}/v1`);

    await new Promise<void>((resolve) => {
      const stop = () => resolve();
      process.once("SIGINT", stop);
      process.once("SIGTERM", stop);
    });
    await runtime.close();
  });

program
  .command("activity")
  .description("Show metadata-only Guard activity events.")
  .option("--limit <count>", "Maximum events to return.", "50")
  .option("--json", "Print machine-readable output.")
  .action(async ({ json, limit }: { json?: boolean; limit: string }) => {
    const count = Number.parseInt(limit, 10);
    if (!Number.isInteger(count) || count < 1 || count > 1_000) {
      throw new Error("Activity limit must be between 1 and 1000.");
    }
    const config = loadConfig();
    const events = await new LedgerService(
      new GuardStateStore(config.stateDirectory),
    ).list(count);
    if (json) {
      process.stdout.write(`${JSON.stringify(events, null, 2)}\n`);
      return;
    }
    for (const event of events) {
      console.log(
        [event.timestamp, event.type, event.agentId, event.model, event.reasonCode]
          .filter(Boolean)
          .join("  "),
      );
    }
  });

program
  .command("setup <target>")
  .description("Generate Guard configuration for codex, claude, or cursor.")
  .requiredOption("--agent <agentId>", "Guard agent identity to configure.")
  .requiredOption("--model <model>", "Provider model ID allowed by the agent policy.")
  .action(
    async (
      target: string,
      options: { agent: string; model: string },
    ) => {
      if (!isSetupTarget(target)) {
        throw new Error("Setup target must be codex, claude, or cursor.");
      }
      const config = loadConfig();
      const agent = await controlService().getAgent(options.agent);
      const guide = generateSetupGuide({
        agent,
        baseUrl: new URL(`http://${config.host}:${config.port}`),
        model: options.model,
        target,
      });

      console.log(`Orbio Guard setup for ${guide.target}`);
      for (const note of guide.notes) {
        console.log(`- ${note}`);
      }
      console.log("\nConfiguration:\n");
      console.log(guide.snippet);
    },
  );

program
  .command("demo")
  .description("Run the repeatable two-agent Guard demo with a mock upstream.")
  .option("--hold", "Keep the dashboard open until interrupted.")
  .option("--json", "Print machine-readable results.")
  .action(async ({ hold, json }: { hold?: boolean; json?: boolean }) => {
    const demo = await createMockDemo();
    try {
      const result = await demo.run();
      if (json) {
        process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      } else {
        console.log("Orbio Guard demo (mock upstream)");
        for (const step of result.steps) {
          console.log(`${step.agent}: HTTP ${step.status} — ${step.expected}`);
        }
        console.log(`Dashboard: ${result.dashboardUrl}`);
      }

      if (hold) {
        console.log("Press Ctrl+C to stop the demo.");
        await new Promise<void>((resolve) => {
          process.once("SIGINT", resolve);
          process.once("SIGTERM", resolve);
        });
      }
    } finally {
      await demo.close();
    }
  });

program
  .command("submission-check")
  .description("Report live submission blockers without exposing account values.")
  .option("--json", "Print machine-readable output.")
  .action(async ({ json }: { json?: boolean }) => {
    const result = await new SubmissionReadinessService(loadConfig()).check();
    if (json) {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return;
    }
    console.log(`Submission readiness: ${result.ready ? "READY" : "BLOCKED"}`);
    for (const check of result.checks) {
      const marker =
        check.status === "pass" ? "PASS" : check.status === "warn" ? "WARN" : "BLOCK";
      console.log(`[${marker}] ${check.message}`);
    }
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

function controlService(): GuardControlService {
  const config = loadConfig();
  return new GuardControlService(new GuardStateStore(config.stateDirectory));
}

function keyLifecycleService(): OrbioKeyLifecycleService {
  const config = loadConfig();
  const stateStore = new GuardStateStore(config.stateDirectory);
  return new OrbioKeyLifecycleService(
    config,
    new UpstreamKeyStore(config.stateDirectory),
    new LedgerService(stateStore),
  );
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

function isSetupTarget(value: string): value is SetupTarget {
  return value === "codex" || value === "claude" || value === "cursor";
}
