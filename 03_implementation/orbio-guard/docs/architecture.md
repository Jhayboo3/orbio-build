# Architecture and trust boundaries

Updated: 2026-09-06

## System overview

```mermaid
flowchart LR
  subgraph Agents[Agent tools]
    Codex[Codex / Responses]
    Claude[Claude Code / Messages]
    SDK[OpenAI SDK / Chat]
  end

  subgraph Guard[Orbio Guard - local trust boundary]
    Proxy[Protocol proxy]
    Identity[Agent identity]
    Policy[Policy engine]
    Budget[Atomic budget service]
    Vault[Upstream key vault]
    Ledger[Metadata ledger]
    Dashboard[Dashboard]
    OAuth[OAuth + MCP client]
  end

  OrbioMCP[Orbio MCP]
  Gateway[Orbio model gateway]
  State[(Owner-only local state)]

  Codex --> Proxy
  Claude --> Proxy
  SDK --> Proxy
  Proxy --> Identity --> Policy --> Budget
  Budget --> Vault --> Gateway
  Proxy --> Ledger
  Identity --> State
  Budget --> State
  Vault --> State
  Ledger --> State
  Dashboard --> State
  Dashboard --> OAuth --> OrbioMCP
  OAuth --> Vault
```

## Trust boundaries

### Untrusted agent clients

Agents may be buggy, compromised, or incorrectly configured. They receive a high-entropy
Guard token that identifies one policy record. They never receive OAuth tokens or the
account-level Orbio gateway key.

### Guard process

The local Guard process is trusted to:

- Authenticate agent tokens.
- Enforce model, status, request, and daily-budget policy.
- Load the upstream key only after authorization succeeds.
- Reconcile provider usage and write metadata events.
- Serve the local dashboard without returning secrets.

### Orbio services

Orbio MCP is trusted for account authentication, balance, key status, and key lifecycle.
The Orbio gateway is trusted for model routing and usage reporting. Guard treats network
errors and missing usage conservatively.

### Local filesystem

OAuth, upstream-key, agent, budget, and ledger files use owner-only permissions. State
updates use an inter-process lock, temporary file, atomic rename, and schema validation.

## Request sequence

```mermaid
sequenceDiagram
  participant A as Agent
  participant P as Guard proxy
  participant S as State/policy
  participant O as Orbio gateway

  A->>P: Request + Guard token
  P->>S: Resolve agent and policy
  S-->>P: Agent + limits
  P->>S: Reserve estimated spend atomically
  S-->>P: Reservation ID
  P->>O: Request + protected Orbio key
  O-->>P: Buffered JSON or SSE + usage.cost
  P->>S: Confirm actual cost / release failure
  P-->>A: Compatible response + Guard request ID
```

## Failure behavior

- Unknown or invalid identity: fail before reading the upstream key.
- Paused/disabled agent: `403` before upstream access.
- Request or daily limit: `429` before upstream access.
- Upstream unpriced error: release reservation and record metadata.
- Successful response without cost: confirm the conservative reservation.
- Process crash with in-flight reservation: recover after TTL; default policy confirms
  the reservation because the provider may have processed it.
- Missing OAuth during dashboard refresh: report remote status unavailable without
  launching an interactive browser.
