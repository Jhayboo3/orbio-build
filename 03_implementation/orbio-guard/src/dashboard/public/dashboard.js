const elements = {
  activity: document.querySelector("#activity-list"),
  agents: document.querySelector("#agents-table"),
  agentsBadge: document.querySelector("#agents-badge"),
  agentCount: document.querySelector("#agent-count"),
  agentDetail: document.querySelector("#agent-detail"),
  agentForm: document.querySelector("#agent-form"),
  agentFilter: document.querySelector("#activity-agent-filter"),
  balance: document.querySelector("#balance-usd"),
  confirmed: document.querySelector("#confirmed-today"),
  connectOrbio: document.querySelector("#connect-orbio"),
  connectionDetail: document.querySelector("#connection-detail"),
  connectionPanel: document.querySelector("#connection-panel"),
  connectionStatus: document.querySelector("#connection-status"),
  connectionTitle: document.querySelector("#connection-title"),
  copyToken: document.querySelector("#copy-token"),
  createdToken: document.querySelector("#created-token"),
  environmentBadge: document.querySelector("#environment-badge"),
  eventFilter: document.querySelector("#activity-event-filter"),
  formStatus: document.querySelector("#form-status"),
  keyDetail: document.querySelector("#key-detail"),
  keyFingerprint: document.querySelector("#key-fingerprint"),
  keyLastUsed: document.querySelector("#key-last-used"),
  keyLocal: document.querySelector("#key-local"),
  keyRemote: document.querySelector("#key-remote"),
  keyState: document.querySelector("#key-state"),
  operatorPanel: document.querySelector("#operator-panel"),
  provisionOrbio: document.querySelector("#provision-orbio"),
  reserved: document.querySelector("#reserved-today"),
  systemLabel: document.querySelector("#system-label"),
  tokenDialog: document.querySelector("#token-dialog"),
  updatedAt: document.querySelector("#updated-at"),
  wallet: document.querySelector("#wallet-label"),
};

let remoteSnapshot = null;
let remoteKeySnapshot = null;
let currentSnapshot = null;

async function loadDashboard(includeRemote) {
  try {
    const response = await fetch(`/api/dashboard?live=${includeRemote ? "1" : "0"}`, {
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`Dashboard API returned ${response.status}`);
    const snapshot = await response.json();
    if (includeRemote) {
      remoteSnapshot = snapshot.remote;
      remoteKeySnapshot = snapshot.key;
    }
    if (!includeRemote && remoteSnapshot) snapshot.remote = remoteSnapshot;
    if (!includeRemote && remoteKeySnapshot) {
      snapshot.key = { ...snapshot.key, ...remoteKeySnapshot };
    }
    render(snapshot);
  } catch (error) {
    elements.systemLabel.textContent = "Guard data unavailable";
    elements.systemLabel.closest(".system-state")?.classList.add("system-error");
    console.error(error);
  }
}

function render(snapshot) {
  currentSnapshot = snapshot;
  const cloud = snapshot.deployment === "cloudflare";
  const connection = snapshot.tenantConnection || { connected: true, provisioned: true };
  const ready = !cloud || connection.provisioned;
  elements.operatorPanel.hidden = !cloud || !ready;
  elements.connectionPanel.hidden = !cloud || ready;
  if (cloud && !ready) renderConnection(connection);
  elements.environmentBadge.textContent = cloud ? "Live Cloudflare" : snapshot.mode === "demo" ? "Demo" : "Local runtime";
  elements.systemLabel.textContent =
    snapshot.mode === "demo"
      ? "Demo mode · mock upstream"
      : snapshot.deployment === "cloudflare"
        ? "Guard online · Cloudflare"
        : "Guard online · local only";
  elements.updatedAt.textContent = new Date(snapshot.generatedAt).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  elements.balance.textContent = snapshot.deployment === "cloudflare" && snapshot.remote.balanceUsd === null
    ? "Managed"
    : snapshot.remote.error
    ? "Offline"
    : money(snapshot.remote.balanceUsd ?? 0);
  elements.wallet.textContent = snapshot.remote.error
    ? snapshot.remote.error
    : snapshot.remote.wallets?.join(" · ") || "No wallet reported";
  elements.agentCount.textContent = String(snapshot.summary.totalAgents).padStart(2, "0");
  elements.agentDetail.textContent = `${snapshot.summary.activeAgents} active · ${snapshot.summary.disabledAgents} disabled`;
  elements.confirmed.textContent = money(snapshot.summary.confirmedTodayUsd);
  elements.reserved.textContent = `Reserved ${money(snapshot.summary.reservedTodayUsd)}`;
  elements.keyState.textContent = snapshot.key.configured ? "Protected" : "Missing";
  elements.keyDetail.textContent = snapshot.key.remoteHasKey
    ? `Remote ${snapshot.key.remotePrefix || "key"}`
    : "No active remote key";
  elements.keyLocal.textContent = snapshot.mode === "demo"
    ? "Synthetic demo"
    : snapshot.deployment === "cloudflare"
      ? "Cloudflare secret"
    : snapshot.key.configured
      ? "Encrypted boundary"
      : "Not configured";
  elements.keyRemote.textContent = snapshot.key.remoteHasKey ? "Active" : "Unavailable";
  elements.keyLastUsed.textContent = snapshot.key.remoteLastUsedAt
    ? relativeTime(snapshot.key.remoteLastUsedAt)
    : "Never";
  elements.keyFingerprint.textContent = snapshot.key.fingerprint || "—";
  renderAgents(snapshot.agents);
  updateActivityFilters(snapshot);
  renderActivity(filteredActivity(snapshot.activity));
}

function renderConnection(connection) {
  if (!connection.connected) {
    elements.connectionTitle.textContent = "Connect Orbio to continue.";
    elements.connectionDetail.textContent = "Sign in to your own Orbio account. Guard will request credit and key-management permission.";
    elements.connectOrbio.hidden = false;
    elements.provisionOrbio.hidden = true;
    return;
  }
  elements.connectionTitle.textContent = "Orbio connected. Protect a gateway key.";
  elements.connectionDetail.textContent = "Guard will create a gateway key and encrypt it inside your isolated tenant vault.";
  elements.connectOrbio.hidden = true;
  elements.provisionOrbio.hidden = false;
}

function renderAgents(agents) {
  elements.agentsBadge.textContent = `${agents.length} configured`;
  if (!agents.length) {
    elements.agents.innerHTML = '<tr><td colspan="5" class="empty-state">No Guard agents configured.</td></tr>';
    return;
  }
  elements.agents.innerHTML = agents
    .map(
      (agent) => `
        <tr>
          <td data-label="Agent"><span class="agent-name">${escapeHtml(agent.name)}</span><span class="agent-project">${escapeHtml(agent.project || agent.tokenFingerprint)}</span></td>
          <td data-label="Status"><span class="status-pill status-${escapeHtml(agent.status)}">${escapeHtml(agent.status)}</span></td>
          <td data-label="Models"><div class="model-list">${agent.allowedModels.map(escapeHtml).join("<br>")}</div></td>
          <td data-label="Daily spend">
            <div class="budget-line"><span>${money(agent.confirmedUsd)}</span><span>${money(agent.dailyBudgetUsd)}</span></div>
            <progress class="progress" max="100" value="${agent.budgetPercent}" aria-label="${agent.budgetPercent}% of budget used"></progress>
          </td>
          <td data-label="Controls">${agentControls(agent)}</td>
        </tr>`,
    )
    .join("");
}

function renderActivity(activity) {
  if (!activity.length) {
    elements.activity.innerHTML = '<li class="empty-state">No activity recorded yet.</li>';
    return;
  }
  elements.activity.innerHTML = activity
    .map((event) => {
      const amount = event.amountMicroUsd
        ? `${event.type === "BUDGET_RESERVED" || event.type === "REQUEST_ALLOWED" ? "Reserved ceiling " : ""}${money(Number(event.amountMicroUsd) / 1_000_000)}`
        : null;
      const detail = [event.model, event.reasonCode, amount]
        .filter(Boolean)
        .join(" · ");
      return `<li class="activity-item">
        <span class="activity-icon">${eventIcon(event.type)}</span>
        <span class="activity-copy"><strong>${eventLabel(event.type)}</strong><span>${escapeHtml(detail || event.agentId || "System event")}</span></span>
        <time class="activity-time" datetime="${event.timestamp}">${relativeTime(event.timestamp)}</time>
      </li>`;
    })
    .join("");
}

function eventIcon(type) {
  if (type.includes("KEY")) return "K";
  if (type.includes("SPEND") || type.includes("BUDGET")) return "$";
  if (type.includes("BLOCKED") || type.includes("ERROR")) return "!";
  if (type.includes("AGENT")) return "A";
  if (type === "REQUEST_ALLOWED") return "✓";
  return "·";
}

function agentControls(agent) {
  if (!currentSnapshot || currentSnapshot.deployment !== "cloudflare") return "";
  const statusAction = agent.status === "active"
    ? '<button data-agent-action="paused">Pause</button>'
    : agent.status === "paused"
      ? '<button data-agent-action="active">Resume</button>'
      : "";
  const disable = agent.status !== "disabled"
    ? '<button class="danger-action" data-agent-action="disabled">Disable</button>'
    : '<button data-agent-action="archive">Archive</button>';
  return `<div class="agent-actions" data-agent-id="${escapeHtml(agent.id)}">${statusAction}${disable}</div>`;
}

function updateActivityFilters(snapshot) {
  const selectedAgent = elements.agentFilter.value;
  const selectedEvent = elements.eventFilter.value;
  const agentNames = new Map(snapshot.agents.map((agent) => [agent.id, agent.name]));
  elements.agentFilter.innerHTML = '<option value="">All agents</option>' + [...agentNames]
    .map(([id, name]) => `<option value="${escapeHtml(id)}">${escapeHtml(name)}</option>`)
    .join("");
  const eventTypes = [...new Set(snapshot.activity.map((event) => event.type))].sort();
  elements.eventFilter.innerHTML = '<option value="">All events</option>' + eventTypes
    .map((type) => `<option value="${escapeHtml(type)}">${escapeHtml(eventLabel(type))}</option>`)
    .join("");
  elements.agentFilter.value = agentNames.has(selectedAgent) ? selectedAgent : "";
  elements.eventFilter.value = eventTypes.includes(selectedEvent) ? selectedEvent : "";
}

function filteredActivity(activity) {
  return activity.filter((event) =>
    (!elements.agentFilter.value || event.agentId === elements.agentFilter.value) &&
    (!elements.eventFilter.value || event.type === elements.eventFilter.value));
}

async function createAgent(event) {
  event.preventDefault();
  elements.formStatus.textContent = "Creating…";
  const form = new FormData(elements.agentForm);
  try {
    const response = await adminRequest("/api/admin/agents", {
      body: JSON.stringify({
        allowedModels: String(form.get("models") || "").split(",").map((value) => value.trim()).filter(Boolean),
        dailyBudgetMicroUsd: usdToMicro(String(form.get("dailyBudgetUsd") || "")),
        maxRequestMicroUsd: usdToMicro(String(form.get("maxRequestUsd") || "")),
        name: String(form.get("name") || ""),
        project: String(form.get("project") || ""),
      }),
      method: "POST",
    });
    elements.createdToken.textContent = response.token;
    elements.tokenDialog.showModal();
    elements.agentForm.reset();
    elements.formStatus.textContent = `${response.agent.name} created.`;
    await loadDashboard(false);
  } catch (error) {
    elements.formStatus.textContent = error.message;
  }
}

async function controlAgent(event) {
  const button = event.target.closest("button[data-agent-action]");
  if (!button) return;
  const container = button.closest("[data-agent-id]");
  const agentId = container?.dataset.agentId;
  const action = button.dataset.agentAction;
  if (!agentId || !action) return;
  button.disabled = true;
  try {
    if (action === "archive") {
      await adminRequest(`/api/admin/agents/${encodeURIComponent(agentId)}/archive`, { method: "PUT" });
    } else {
      await adminRequest(`/api/admin/agents/${encodeURIComponent(agentId)}/status`, {
        body: JSON.stringify({ status: action }),
        method: "PUT",
      });
    }
    await loadDashboard(false);
  } catch (error) {
    elements.formStatus.textContent = error.message;
    button.disabled = false;
  }
}

async function adminRequest(path, options) {
  const response = await fetch(path, {
    ...options,
    headers: { "content-type": "application/json" },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error?.message || `Request failed with ${response.status}.`);
  return body;
}

async function connectOrbio() {
  elements.connectOrbio.disabled = true;
  elements.connectionStatus.textContent = "Preparing secure connection…";
  try {
    const result = await adminRequest("/api/orbio/connect", { body: "{}", method: "POST" });
    window.location.assign(result.authorizationUrl);
  } catch (error) {
    elements.connectionStatus.textContent = error.message;
    elements.connectOrbio.disabled = false;
  }
}

async function provisionOrbio(allowRotation = false) {
  elements.provisionOrbio.disabled = true;
  elements.connectionStatus.textContent = "Provisioning encrypted gateway key…";
  try {
    const result = await adminRequest("/api/orbio/provision", {
      body: JSON.stringify({ allowRotation }),
      method: "POST",
    });
    if (result.conflict) {
      const confirmed = window.confirm(`${result.message}\n\nReplace the existing key? This cannot be undone.`);
      if (confirmed) return provisionOrbio(true);
      elements.connectionStatus.textContent = "Existing key was not changed.";
      elements.provisionOrbio.disabled = false;
      return;
    }
    elements.connectionStatus.textContent = `Gateway key protected (${result.fingerprint}).`;
    await loadDashboard(true);
  } catch (error) {
    elements.connectionStatus.textContent = error.message;
    elements.provisionOrbio.disabled = false;
  }
}

function usdToMicro(value) {
  const match = value.trim().match(/^(\d+)(?:\.(\d{1,6}))?$/);
  if (!match) throw new Error("USD values need up to six decimal places.");
  return (BigInt(match[1]) * 1_000_000n + BigInt((match[2] || "").padEnd(6, "0"))).toString();
}

function eventLabel(type) {
  return type.toLowerCase().replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase());
}

function money(value) {
  const amount = Number(value || 0);
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: amount > 0 && amount < 0.01 ? 4 : 2,
    maximumFractionDigits: 6,
  }).format(amount);
}

function relativeTime(value) {
  const seconds = Math.round((new Date(value).getTime() - Date.now()) / 1000);
  const absolute = Math.abs(seconds);
  const formatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  if (absolute < 60) return formatter.format(seconds, "second");
  if (absolute < 3600) return formatter.format(Math.round(seconds / 60), "minute");
  if (absolute < 86400) return formatter.format(Math.round(seconds / 3600), "hour");
  return formatter.format(Math.round(seconds / 86400), "day");
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

loadDashboard(true);
elements.agentForm?.addEventListener("submit", createAgent);
elements.connectOrbio?.addEventListener("click", connectOrbio);
elements.provisionOrbio?.addEventListener("click", () => provisionOrbio(false));
elements.agents?.addEventListener("click", controlAgent);
elements.agentFilter?.addEventListener("change", () => renderActivity(filteredActivity(currentSnapshot?.activity || [])));
elements.eventFilter?.addEventListener("change", () => renderActivity(filteredActivity(currentSnapshot?.activity || [])));
elements.copyToken?.addEventListener("click", async () => {
  await navigator.clipboard.writeText(elements.createdToken.textContent || "");
  elements.copyToken.textContent = "Copied";
});
setInterval(() => loadDashboard(false), 4_000);
setInterval(() => loadDashboard(true), 60_000);
