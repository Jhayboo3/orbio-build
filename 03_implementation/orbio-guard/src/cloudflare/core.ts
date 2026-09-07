export type CloudAgentStatus = "active" | "paused" | "disabled";

export interface CloudAgent {
  allowedModels: string[];
  archivedAt?: string | null;
  createdAt: string;
  dailyBudgetMicroUsd: string;
  id: string;
  maxRequestMicroUsd: string | null;
  name: string;
  project: string | null;
  status: CloudAgentStatus;
  tokenHash: string;
  updatedAt: string;
}

export function activeCloudAgents(agents: CloudAgent[]): CloudAgent[] {
  return agents.filter((agent) => !agent.archivedAt);
}

export function latestCloudKeyUse(
  events: Array<{ timestamp: string; type: string }>,
): string | null {
  return events.find((event) => event.type === "SPEND_CONFIRMED")?.timestamp ?? null;
}

export function matchesCloudModel(pattern: string, model: string): boolean {
  if (pattern === "*") return true;
  return pattern.endsWith("*")
    ? model.startsWith(pattern.slice(0, -1))
    : model === pattern;
}

export function validateCloudModelPatterns(patterns: string[]): void {
  if (patterns.length === 0) {
    throw new Error("At least one allowed model pattern is required.");
  }
  for (const pattern of patterns) {
    if (!pattern || (pattern.includes("*") && pattern !== "*" && !pattern.endsWith("*"))) {
      throw new Error(`Invalid model pattern "${pattern}".`);
    }
    if (pattern.slice(0, -1).includes("*")) {
      throw new Error(`Invalid model pattern "${pattern}".`);
    }
  }
}

export function evaluateCloudPolicy(
  agent: CloudAgent,
  input: { estimatedCostMicroUsd: string; model: string },
): { allowed: true } | { allowed: false; code: string; message: string } {
  if (agent.status === "disabled") {
    return deny("AGENT_DISABLED", "This agent is disabled.");
  }
  if (agent.status === "paused") {
    return deny("AGENT_PAUSED", "This agent is paused.");
  }
  if (!agent.allowedModels.some((pattern) => matchesCloudModel(pattern, input.model))) {
    return deny("MODEL_NOT_ALLOWED", `Model "${input.model}" is not allowed for this agent.`);
  }
  if (
    agent.maxRequestMicroUsd !== null &&
    BigInt(input.estimatedCostMicroUsd) > BigInt(agent.maxRequestMicroUsd)
  ) {
    return deny("REQUEST_LIMIT_EXCEEDED", "Estimated request cost exceeds the per-request limit.");
  }
  return { allowed: true };
}

export function extractCloudCostMicroUsd(body: string): string | undefined {
  try {
    return findCost(JSON.parse(body));
  } catch {
    return undefined;
  }
}

export function extractCloudStreamCostMicroUsd(body: string): string | undefined {
  let latest: string | undefined;
  for (const line of body.split(/\r?\n/)) {
    if (!line.startsWith("data:")) continue;
    const value = line.slice(5).trim();
    if (!value || value === "[DONE]") continue;
    try {
      latest = findCost(JSON.parse(value)) ?? latest;
    } catch {
      continue;
    }
  }
  return latest;
}

export function responsesToChatRequest(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== "object") throw new Error("Responses request is invalid.");
  const input = raw as Record<string, unknown>;
  if (typeof input.model !== "string" || !Array.isArray(input.input)) {
    throw new Error("Responses request is invalid.");
  }
  const messages: Array<Record<string, unknown>> = [];
  if (typeof input.instructions === "string" && input.instructions) {
    messages.push({ role: "developer", content: input.instructions });
  }
  for (const item of input.input) {
    if (!item || typeof item !== "object") continue;
    const value = item as Record<string, unknown>;
    if (value.type === "message" && typeof value.role === "string") {
      messages.push({ role: value.role, content: responseContentToText(value.content) });
    } else if (value.type === "function_call") {
      messages.push({
        role: "assistant",
        content: null,
        tool_calls: [{
          id: typeof value.call_id === "string" ? value.call_id : crypto.randomUUID(),
          type: "function",
          function: { name: value.name, arguments: value.arguments ?? "{}" },
        }],
      });
    } else if (value.type === "function_call_output" && typeof value.call_id === "string") {
      messages.push({ role: "tool", tool_call_id: value.call_id, content: String(value.output ?? "") });
    }
  }
  const tools = Array.isArray(input.tools)
    ? input.tools.flatMap((tool) => responseToolToChat(tool))
    : [];
  return {
    model: orbioModelId(input.model),
    messages,
    stream: false,
    ...(tools.length ? { tools } : {}),
    ...(input.tool_choice && input.tool_choice !== "auto" ? { tool_choice: input.tool_choice } : {}),
  };
}

export function orbioModelId(model: string): string {
  return model.includes("/") ? model : `openai/${model}`;
}

export function chatResponseToResponsesSse(raw: unknown): string {
  if (!raw || typeof raw !== "object") throw new Error("Chat response is invalid.");
  const chat = raw as Record<string, unknown>;
  const choice = Array.isArray(chat.choices) ? chat.choices[0] as Record<string, unknown> | undefined : undefined;
  const message = choice?.message as Record<string, unknown> | undefined;
  if (!message) throw new Error("Chat response has no assistant message.");
  const responseId = typeof chat.id === "string" ? `resp_${chat.id}` : `resp_${crypto.randomUUID()}`;
  const createdAt = typeof chat.created === "number" ? chat.created : Math.floor(Date.now() / 1_000);
  const model = typeof chat.model === "string" ? chat.model : "unknown";
  const output: Array<Record<string, unknown>> = [];
  if (typeof message.content === "string" && message.content) {
    output.push({
      id: `msg_${crypto.randomUUID()}`,
      type: "message",
      status: "completed",
      role: "assistant",
      content: [{ type: "output_text", text: message.content, annotations: [], logprobs: [] }],
    });
  }
  if (Array.isArray(message.tool_calls)) {
    for (const rawCall of message.tool_calls) {
      const call = rawCall as Record<string, unknown>;
      const fn = call.function as Record<string, unknown> | undefined;
      if (!fn || typeof fn.name !== "string") continue;
      output.push({
        id: `fc_${crypto.randomUUID()}`,
        type: "function_call",
        status: "completed",
        call_id: typeof call.id === "string" ? call.id : `call_${crypto.randomUUID()}`,
        name: fn.name,
        arguments: typeof fn.arguments === "string" ? fn.arguments : "{}",
      });
    }
  }
  const usage = chatUsageToResponses(chat.usage);
  const response = {
    id: responseId,
    object: "response",
    created_at: createdAt,
    status: "completed",
    model,
    output,
    parallel_tool_calls: true,
    tool_choice: "auto",
    usage,
    error: null,
    incomplete_details: null,
  };
  const events: Array<Record<string, unknown>> = [
    { type: "response.created", response: { ...response, status: "in_progress", output: [] } },
  ];
  output.forEach((item, outputIndex) => {
    events.push({ type: "response.output_item.added", output_index: outputIndex, item: { ...item, status: "in_progress" } });
    if (item.type === "message") {
      const part = (item.content as Array<Record<string, unknown>>)[0]!;
      events.push({ type: "response.content_part.added", item_id: item.id, output_index: outputIndex, content_index: 0, part: { ...part, text: "" } });
      events.push({ type: "response.output_text.delta", item_id: item.id, output_index: outputIndex, content_index: 0, delta: part.text, logprobs: [] });
      events.push({ type: "response.output_text.done", item_id: item.id, output_index: outputIndex, content_index: 0, text: part.text, logprobs: [] });
      events.push({ type: "response.content_part.done", item_id: item.id, output_index: outputIndex, content_index: 0, part });
    } else {
      events.push({ type: "response.function_call_arguments.delta", item_id: item.id, output_index: outputIndex, delta: item.arguments });
      events.push({ type: "response.function_call_arguments.done", item_id: item.id, output_index: outputIndex, arguments: item.arguments });
    }
    events.push({ type: "response.output_item.done", output_index: outputIndex, item });
  });
  events.push({ type: "response.completed", response });
  return events.map((event, sequenceNumber) =>
    `event: ${event.type}\ndata: ${JSON.stringify({ ...event, sequence_number: sequenceNumber })}\n\n`,
  ).join("") + "data: [DONE]\n\n";
}

export function formatCloudUsd(microUsd: string): string {
  const value = BigInt(microUsd);
  const whole = value / 1_000_000n;
  const fraction = (value % 1_000_000n).toString().padStart(6, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

function findCost(value: unknown): string | undefined {
  if (Array.isArray(value)) {
    for (const item of value) {
      const cost = findCost(item);
      if (cost !== undefined) return cost;
    }
    return undefined;
  }
  if (!value || typeof value !== "object") return undefined;
  const object = value as Record<string, unknown>;
  if (object.usage && typeof object.usage === "object") {
    const cost = (object.usage as Record<string, unknown>).cost;
    if (typeof cost === "number" && Number.isFinite(cost) && cost >= 0) {
      return Math.round(cost * 1_000_000).toString();
    }
  }
  for (const nested of Object.values(object)) {
    const cost = findCost(nested);
    if (cost !== undefined) return cost;
  }
  return undefined;
}

function responseContentToText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content.map((part) => {
    if (!part || typeof part !== "object") return "";
    const value = part as Record<string, unknown>;
    return typeof value.text === "string" ? value.text : "";
  }).filter(Boolean).join("\n");
}

function responseToolToChat(tool: unknown): Array<Record<string, unknown>> {
  if (!tool || typeof tool !== "object") return [];
  const value = tool as Record<string, unknown>;
  if (value.type !== "function" || typeof value.name !== "string") return [];
  return [{
    type: "function",
    function: {
      name: value.name,
      description: typeof value.description === "string" ? value.description : undefined,
      parameters: value.parameters && typeof value.parameters === "object"
        ? value.parameters
        : { type: "object", properties: {} },
      strict: value.strict === true,
    },
  }];
}

function chatUsageToResponses(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== "object") return null;
  const usage = raw as Record<string, unknown>;
  return {
    input_tokens: typeof usage.prompt_tokens === "number" ? usage.prompt_tokens : 0,
    input_tokens_details: { cached_tokens: 0 },
    output_tokens: typeof usage.completion_tokens === "number" ? usage.completion_tokens : 0,
    output_tokens_details: { reasoning_tokens: 0 },
    total_tokens: typeof usage.total_tokens === "number" ? usage.total_tokens : 0,
    ...(typeof usage.cost === "number" ? { cost: usage.cost } : {}),
  };
}

function deny(code: string, message: string) {
  return { allowed: false as const, code, message };
}
