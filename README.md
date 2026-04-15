# Regina - AI Agent Orchestrator for Platformatic Watt

[![CI](https://github.com/platformatic/regina/actions/workflows/ci.yml/badge.svg)](https://github.com/platformatic/regina/actions/workflows/ci.yml)

Regina is a multi-pod AI agent orchestrator for [Platformatic Watt](https://github.com/platformatic/platformatic). It discovers agent definitions from markdown files, spawns each agent as an isolated application thread, and manages the full instance lifecycle including idle suspension, cross-pod migration, and SQLite state backup.

## Packages

| Package                                                    | Description                                 |
| ---------------------------------------------------------- | ------------------------------------------- |
| [`@platformatic/regina`](packages/regina/)                 | Per-pod agent manager stackable             |
| [`@platformatic/regina-agent`](packages/regina-agent/)     | Per-agent runtime stackable                 |
| [`@platformatic/regina-storage`](packages/regina-storage/) | Pluggable storage adapters for state backup |

## Architecture

Regina works standalone as a single pod or scales horizontally with an optional coordinator.

### Single-Pod (default)

A single Watt runtime is fully functional. No Redis, no shared storage, no coordinator needed.

```mermaid
graph TB
    Client([Client]) --> Regina

    subgraph Watt["Watt Runtime"]
        Regina["@platformatic/regina<br/>Agent Manager"]
        A1["Agent Instance<br/>@platformatic/regina-agent"]
        A2["Agent Instance<br/>@platformatic/regina-agent"]

        Regina -->|spawn / proxy| A1
        Regina -->|spawn / proxy| A2
    end

    A1 --- DB1[("SQLite VFS")]
    A2 --- DB2[("SQLite VFS")]
```

## Agent Definition Format

Each agent is a markdown file in `agents/` with YAML frontmatter:

```markdown
---
name: support-agent
description: Customer support assistant
model: claude-sonnet-4-5
provider: anthropic
tools:
  - ./tools/search-docs.ts
temperature: 0.7
maxSteps: 10
---

You are a helpful customer support agent.

## Guidelines

- Always be polite and professional
- Search the documentation before answering questions
```

### Frontmatter Fields

| Field         | Required | Description                                                                           |
| ------------- | -------- | ------------------------------------------------------------------------------------- |
| `name`        | Yes      | Unique agent identifier                                                               |
| `description` | No       | Human-readable description                                                            |
| `model`       | Yes      | Model identifier (e.g., `claude-sonnet-4-5`, `gpt-4o`, `anthropic/claude-sonnet-4-5`) |
| `provider`    | No       | AI provider name (inferred from model if omitted)                                     |
| `tools`       | No       | Array of paths to tool modules (relative to .md file)                                 |
| `mcpServers`  | No       | Array of remote MCP server connections (see below)                                    |
| `temperature` | No       | Model temperature                                                                     |
| `maxSteps`    | No       | Max agentic loop steps (default: 10)                                                  |

### Providers

| Provider         | Env Variable         | Inferred When                                            |
| ---------------- | -------------------- | -------------------------------------------------------- |
| `anthropic`      | `ANTHROPIC_API_KEY`  | Model starts with `claude` or `anthropic`                |
| `openai`         | `OPENAI_API_KEY`     | Model starts with `gpt`, `o1`, `o3`, or `o4`             |
| `vercel-gateway` | `AI_GATEWAY_API_KEY` | Model contains `/` (e.g., `anthropic/claude-sonnet-4-5`) |

The provider is inferred from the model name when omitted. You can always set it explicitly to override inference.

#### Vercel AI Gateway

The [Vercel AI Gateway](https://vercel.com/docs/ai-gateway) provides access to hundreds of models from multiple providers through a single API key. To use it, set the `AI_GATEWAY_API_KEY` environment variable and use the `provider/model` format for the model name:

```markdown
---
name: support-agent
model: anthropic/claude-sonnet-4-5
---

You are a helpful support agent.
```

Or set the provider explicitly:

```markdown
---
name: support-agent
model: anthropic/claude-sonnet-4-5
provider: vercel-gateway
---

You are a helpful support agent.
```

## Request Flow

### Single-Pod Chat Request

```mermaid
sequenceDiagram
    participant C as Client
    participant R as Regina
    participant A as Agent Instance

    C->>R: POST /instances/:id/chat
    R->>R: Lookup instance (local map)
    alt Instance suspended
        R->>R: Resume instance
    end
    R->>A: POST /chat (via thread interceptor)
    A->>A: Load conversation history
    A->>A: Run AI model (generateText)
    A-->>R: { text, usage }
    R-->>C: 200 { text, usage }
```

### Multi-Pod Chat Request (via Coordinator)

```mermaid
sequenceDiagram
    participant C as Client
    participant CO as Coordinator
    participant Redis as Redis
    participant P as Pod (Regina)
    participant A as Agent Instance

    C->>CO: POST /instances/:id/chat
    CO->>Redis: GET regina:instance:<id>
    Redis-->>CO: memberId
    CO->>Redis: GET regina:member:<memberId>
    Redis-->>CO: podAddress

    alt Pod is dead (orphan detected)
        CO->>CO: Pick new pod
        CO->>Redis: SET regina:instance:<id> newMemberId
    end

    CO->>P: POST /instances/:id/chat (HTTP proxy)

    alt Instance not found locally
        P->>P: Restore from shared storage
        P->>P: Spawn instance with existing ID
    end

    P->>A: POST /chat (via thread interceptor)
    A-->>P: { text, usage }
    P-->>CO: 200 { text, usage }
    CO-->>C: 200 { text, usage }
```

## Instance Lifecycle

```mermaid
stateDiagram-v2
    [*] --> Started: POST /agents/:defId/instances
    Started --> Started: chat / heartbeat (reset idle timer)
    Started --> Suspended: Idle timeout / POST /instances/:id/suspend
    Suspended --> Started: Chat request arrives (auto-resume)
    Started --> Removed: DELETE /instances/:id
    Suspended --> Removed: DELETE /instances/:id

    Suspended --> BackedUp: Storage configured
    BackedUp --> Restored: Cross-pod migration
    Restored --> Started: Spawn on new pod

    Removed --> [*]

    note right of BackedUp: State backed up to<br/>shared storage (fs/S3/Redis)
```

## Built-in Tools

Every agent instance gets default tools backed by a per-instance virtual filesystem (SQLite VFS):

| Tool         | Description                                                           |
| ------------ | --------------------------------------------------------------------- |
| `bash`       | Execute bash commands inside the virtual filesystem                   |
| `read_file`  | Read file contents from the virtual filesystem                        |
| `write_file` | Write content to a file, creating parent directories as needed        |
| `edit_file`  | Replace a unique substring in a file (old_string/new_string approach) |

Custom tools defined in the agent definition override built-in tools with the same name. MCP tools sit between defaults and custom tools in priority: `{ ...defaultTools, ...mcpTools, ...userTools, delegate }`.

### MCP Servers

Agents can connect to remote MCP servers via SSE or Streamable HTTP transport:

```yaml
mcpServers:
  - name: web-search
    transport: sse
    url: http://localhost:3001/sse
  - name: api-server
    transport: http
    url: http://localhost:3002/mcp
    headers:
      Authorization: 'Bearer token'
```

Tools are prefixed with the server name (e.g., `web-search_search`). Failed connections are skipped with a warning.

### Custom Tool Definition

Tools are JS/TS modules exporting a Vercel AI SDK `tool()`:

```ts
import { tool } from 'ai'
import { z } from 'zod'

export default tool({
  description: 'Search the documentation',
  parameters: z.object({
    query: z.string().describe('The search query')
  }),
  execute: async ({ query }) => {
    return { results: [] }
  }
})
```

## Multi-Pod Features

These features are all **conditional** -- they activate only when the relevant config is provided. Without them, Regina works as a zero-dependency single-pod system.

### Pod Registration (requires `redis`)

```mermaid
sequenceDiagram
    participant P as Pod (Regina)
    participant R as Redis

    Note over P: Startup
    P->>R: SADD regina:members <memberId>
    P->>R: SET regina:member:<memberId> <address> EX 30
    P->>R: SET regina:member:<memberId>:instances 0 EX 30

    loop Every 10 seconds
        P->>R: EXPIRE regina:member:<memberId> 30
        P->>R: EXPIRE regina:member:<memberId>:instances 30
    end

    Note over P: Instance spawned
    P->>R: SET regina:instance:<instanceId> <memberId>
    P->>R: INCR regina:member:<memberId>:instances

    Note over P: Shutdown
    P->>R: SREM regina:members <memberId>
    P->>R: DEL regina:member:<memberId>
    P->>R: DEL regina:member:<memberId>:instances
```

### Orphan Detection & Cross-Pod Migration

When a pod crashes, its Redis keys expire (TTL 30s). The coordinator detects orphaned instances and transparently reassigns them to live pods.

```mermaid
flowchart TD
    A[Client sends request<br/>for instanceId] --> B{Coordinator:<br/>lookup instance}
    B -->|Address found| C[Proxy to pod]
    B -->|Address null| D{Instance mapping<br/>exists in Redis?}
    D -->|No| E[404 Not Found]
    D -->|Yes: orphan detected| F[Pick a live pod]
    F --> G[Update Redis mapping]
    G --> H[Proxy to new pod]
    H --> I{Pod has instance<br/>locally?}
    I -->|Yes| J[Handle request]
    I -->|No| K[Restore SQLite<br/>from shared storage]
    K --> L[Spawn instance<br/>with existing ID]
    L --> J
```

### Allocation Strategies

The coordinator supports pluggable strategies for choosing which pod receives a new instance:

```mermaid
flowchart LR
    A[Spawn Request] --> B{Strategy}
    B -->|round-robin| C["Cycle through pods<br/>(default)"]
    B -->|least-loaded| D["Pick pod with<br/>fewest instances"]
    B -->|random| E["Uniform random<br/>selection"]
    C --> F[Selected Pod]
    D --> F
    E --> F
```

| Strategy       | Description                             | Best For                            |
| -------------- | --------------------------------------- | ----------------------------------- |
| `round-robin`  | Cycles through pods in order (default)  | Even distribution, predictable      |
| `least-loaded` | Picks pod with fewest running instances | Balanced workload                   |
| `random`       | Uniform random selection                | Avoiding thundering herd on restart |

### Storage Adapters (requires `storage`)

```mermaid
flowchart TD
    IM[Instance Manager] --> SB[StateBackup]
    SB --> SA{Storage Adapter}
    SA -->|fs| FS["Filesystem<br/>(NFS / EFS)"]
    SA -->|s3| S3["S3-Compatible<br/>(AWS / MinIO / R2)"]
    SA -->|redis| RD["Redis / Valkey<br/>(HSET blob)"]
```

All adapters implement the same interface: `put`, `get`, `delete`, `list`, `close`.

## Redis Key Schema

```mermaid
erDiagram
    MEMBERS ||--o{ MEMBER : contains
    MEMBER ||--o{ INSTANCE : hosts
    MEMBER ||--|| INSTANCE_COUNT : tracks

    MEMBERS {
        SET memberIds "regina_members"
    }
    MEMBER {
        STRING address "regina_member_(memberId)"
        int TTL "30 seconds"
    }
    INSTANCE_COUNT {
        STRING count "regina_member_(memberId)_instances"
        int TTL "30 seconds"
    }
    INSTANCE {
        STRING memberId "regina_instance_(instanceId)"
    }
```

| Key                                  | Type   | TTL | Description                      |
| ------------------------------------ | ------ | --- | -------------------------------- |
| `regina:members`                     | SET    | --  | Set of all registered member IDs |
| `regina:member:<memberId>`           | STRING | 30s | Pod's routable address           |
| `regina:member:<memberId>:instances` | STRING | 30s | Running instance count           |
| `regina:instance:<instanceId>`       | STRING | --  | Maps instance to its member      |

## Configuration

### Single-Pod (`platformatic.json`)

```json
{
  "module": "@platformatic/regina",
  "regina": {
    "agentsDir": "./agents"
  }
}
```

### Single-Pod with All Options

```json
{
  "module": "@platformatic/regina",
  "regina": {
    "agentsDir": "./agents",
    "vfsDir": "./vfs",
    "idleTimeout": 300,
    "useProcesses": false,
    "factory": "./factory.mjs",
    "defaults": {
      "provider": "anthropic",
      "model": "claude-sonnet-4-5",
      "maxSteps": 10
    }
  }
}
```

### Multi-Pod: Per-Pod Regina

```json
{
  "module": "@platformatic/regina",
  "regina": {
    "agentsDir": "./agents",
    "redis": "redis://valkey:6379",
    "memberAddress": "{POD_IP}:3001",
    "memberId": "{HOSTNAME}",
    "storage": {
      "type": "s3",
      "bucket": "regina-state",
      "endpoint": "https://s3.amazonaws.com"
    }
  }
}
```

### Custom Factory

You can customize how Regina prepares each spawned application with `regina.factory`.
The module must export `prepareApplication(instanceId, definition)` and return the application arguments passed to Watt management.

```js
export async function prepareApplication (instanceId, definition) {
  return {
    id: instanceId,
    path: '/tmp/custom-app',
    config: `${definition.id}:${instanceId}`,
    env: { FACTORY: '1' }
  }
}
```

If the export is missing, Regina uses the default internal factory.

### Process Mode

Set `regina.useProcesses` to `true` to run each `@platformatic/regina-agent` instance in a separate Node.js process instead of in-process runtime mode.

## REST API

### Agent Definitions

- `GET /agents` -- List all discovered agent definitions
- `GET /agents/:defId` -- Get a specific agent definition

### Agent Instances

- `POST /agents/:defId/instances` -- Spawn a new agent instance
- `GET /agents/:defId/instances` -- List running instances
- `POST /instances/:instanceId/heartbeat` -- Keep instance alive (reset idle timer)
- `POST /instances/:instanceId/suspend` -- Backup and stop an instance
- `DELETE /instances/:instanceId` -- Teardown an instance

### Chat

- `POST /instances/:instanceId/chat` -- Synchronous chat (JSON request/response)
- `POST /instances/:instanceId/chat/stream` -- NDJSON streaming chat (rich events)
- `POST /instances/:instanceId/steer` -- Inject a steering message into the running agent loop
- `GET /instances/:instanceId/messages` -- Get conversation history

All endpoints are available on both the per-pod Regina API and the coordinator gateway (which proxies to the correct pod).

### Streaming Format

The `/chat/stream` endpoint returns `application/x-ndjson` -- one JSON object per line. Event types include:

- `{"type":"text-delta","textDelta":"Hello"}` -- Incremental text
- `{"type":"tool-call","toolCallId":"1","toolName":"search","args":{...}}` -- Tool invocation
- `{"type":"tool-result","toolCallId":"1","result":{...}}` -- Tool result
- `{"type":"step-finish","finishReason":"tool-calls",...}` -- Step boundary

### Steering

While an agent is running an agentic loop (multi-step tool use), the client can send steering messages that get injected between steps:

```mermaid
sequenceDiagram
    participant C as Client
    participant A as Agent

    C->>A: POST /chat/stream { message }
    A-->>C: text-delta events
    A-->>C: tool-call event
    Note over A: Agent executes tool
    C->>A: POST /steer { message: "focus on X" }
    Note over A: onStepFinish drains queue
    A-->>C: tool-result event
    A-->>C: step-finish event
    Note over A: Model sees steering message
    A-->>C: text-delta events (adjusted)
```

The steering message is pushed to an in-memory queue and drained into the conversation as a user message at the next step boundary. The model sees it on the subsequent iteration.

## Session Persistence

Agent conversations are automatically persisted to the VFS as JSONL at `/.session/messages.jsonl`. On restart, the conversation history is restored so sessions survive across agent restarts. New messages are appended incrementally; a full rewrite occurs only after context compaction.

## Context Compaction

Long agent conversations are automatically compacted to stay within model context limits. When the estimated token count exceeds a threshold, older messages are summarized using the model itself, while recent messages are preserved verbatim.

| Option      | Default   | Description                                    |
| ----------- | --------- | ---------------------------------------------- |
| `threshold` | `100,000` | Estimated token count that triggers compaction |
| `keepLastN` | `10`      | Number of recent messages preserved verbatim   |

## Development

```bash
pnpm install
pnpm run build
pnpm run test
pnpm run lint
```

### Local Multi-Pod Development

The root `watt.json` starts a coordinator + pod for local development:

```bash
npx wattpm start
```

This requires a local Redis/Valkey instance running on `localhost:6379`.

## License

Apache-2.0
