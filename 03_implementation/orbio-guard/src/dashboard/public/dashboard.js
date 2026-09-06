const elements = {
  activity: document.querySelector("#activity-list"),
  agents: document.querySelector("#agents-table"),
  agentsBadge: document.querySelector("#agents-badge"),
  agentCount: document.querySelector("#agent-count"),
  agentDetail: document.querySelector("#agent-detail"),
  balance: document.querySelector("#balance-usd"),
  confirmed: document.querySelector("#confirmed-today"),
  keyDetail: document.querySelector("#key-detail"),
  keyFingerprint: document.querySelector("#key-fingerprint"),
  keyLastUsed: document.querySelector("#key-last-used"),
  keyLocal: document.querySelector("#key-local"),
  keyRemote: document.querySelector("#key-remote"),
  keyState: document.querySelector("#key-state"),
  reserved: document.querySelector("#reserved-today"),
  systemLabel: document.querySelector("#system-label"),
  updatedAt: document.querySelector("#updated-at"),
  wallet: document.querySelector("#wallet-label"),
};

let remoteSnapshot = null;
let remoteKeySnapshot = null;

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
  elements.systemLabel.textContent =
    snapshot.mode === "demo"
      ? "Demo mode · mock upstream"
      : "Guard online · local only";
  elements.updatedAt.textContent = new Date(snapshot.generatedAt).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  elements.balance.textContent = snapshot.remote.error
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
  elements.keyLocal.textContent = snapshot.key.configured ? "Encrypted boundary" : "Not configured";
  elements.keyRemote.textContent = snapshot.key.remoteHasKey ? "Active" : "Unavailable";
  elements.keyLastUsed.textContent = snapshot.key.remoteLastUsedAt
    ? relativeTime(snapshot.key.remoteLastUsedAt)
    : "Never";
  elements.keyFingerprint.textContent = snapshot.key.fingerprint || "—";
  renderAgents(snapshot.agents);
  renderActivity(snapshot.activity);
}

function renderAgents(agents) {
  elements.agentsBadge.textContent = `${agents.length} configured`;
  if (!agents.length) {
    elements.agents.innerHTML = '<tr><td colspan="4" class="empty-state">No Guard agents configured.</td></tr>';
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
      const detail = [event.model, event.reasonCode, event.amountMicroUsd ? money(Number(event.amountMicroUsd) / 1_000_000) : null]
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
  return "·";
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
setInterval(() => loadDashboard(false), 4_000);
setInterval(() => loadDashboard(true), 60_000);
