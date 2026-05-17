# @yellowkode/suno-mcp-core

> Shared core handlers and tool schemas for Suno MCP servers — by YellowKode Academy

[![npm version](https://badge.fury.io/js/%40yellowkode%2Fsuno-mcp-core.svg)](https://www.npmjs.com/package/@yellowkode/suno-mcp-core)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

---

## What is this?

`@yellowkode/suno-mcp-core` is the shared business logic layer used by both:

- **[`@yellowkode/suno-mcp`](https://npmjs.com/package/@yellowkode/suno-mcp)** — the open-source stdio MCP server (Claude Desktop, Cursor, VSCode)
- **SunoBoard hosted MCP** — `mcp.sunoboard.com` (StreamableHTTP transport)

It provides typed handlers for the Suno API and the standard MCP tool schemas. You can use it to build your own Suno MCP server with any transport.

---

## Installation

```bash
npm install @yellowkode/suno-mcp-core
```

---

## Usage

```typescript
import { createHandlers, toolSchemas } from '@yellowkode/suno-mcp-core';
import type { GenerateMusicParams } from '@yellowkode/suno-mcp-core';

const handlers = createHandlers({
  apiKey: process.env.SUNO_API_KEY!,
  baseUrl: 'https://api.sunoapi.org', // or 'https://api.sunoboard.com' for sb_ keys
  maxPollAttempts: 30,
  pollIntervalMs: 10000,
});

// Use with any MCP server transport
server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: toolSchemas }));

server.setRequestHandler(CallToolRequestSchema, async ({ params }) => {
  const { name, arguments: args } = params;
  switch (name) {
    case 'generate_music':
      return { content: [{ type: 'text', text: JSON.stringify(await handlers.generateMusic(args as GenerateMusicParams)) }] };
    case 'wait_for_music':
      return { content: [{ type: 'text', text: JSON.stringify(await handlers.waitForMusic(args!.taskId as string)) }] };
    // ...
  }
});
```

---

## API

### `createHandlers(config)`

Returns an object with all Suno API handlers.

```typescript
interface HandlerConfig {
  apiKey: string;
  baseUrl: string;
  maxPollAttempts?: number; // default: 30
  pollIntervalMs?: number;  // default: 10000
}
```

**Returned handlers:**

| Handler | Description |
|---------|-------------|
| `generateMusic(params)` | Start generation, returns `{ taskId, status, message }` |
| `getMusicStatus(taskId)` | Check status, returns tracks on SUCCESS |
| `waitForMusic(taskId)` | Poll until SUCCESS or terminal error |
| `listRecentMusic(page, limit)` | List recent generations |
| `getCredits()` | Get remaining credits |

### `toolSchemas`

Array of MCP-compatible tool definitions (name, description, inputSchema) ready to pass to `ListToolsRequestSchema` handler. Includes all 5 tools with full JSON Schema validation.

### Supported models

`V4` · `V4_5` · `V4_5PLUS` · `V4_5ALL` · `V5` · `V5_5`

---

## Key behavior

- **Simple mode** (`customMode: false`): `style` and `title` are NOT sent to the API — Suno generates them automatically from `prompt`
- **Custom mode** (`customMode: true`): `prompt` is used as literal lyrics, `style` and `title` are sent
- **`vocalGender`** is only sent when `instrumental: false`
- **Terminal errors** (`SENSITIVE_WORD_ERROR`, `GENERATE_AUDIO_FAILED`, `CREATE_TASK_FAILED`, `CALLBACK_EXCEPTION`) cause `waitForMusic` to throw immediately

---

## Development

```bash
git clone https://github.com/yellowkode/suno-mcp-core
cd suno-mcp-core
npm install
npm run build
npm test
```

---

## License

MIT © [YellowKode Academy](https://yellowkode.com.br)
