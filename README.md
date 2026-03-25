# Open Brain: Multi-Client MCP Deployment

A complete Model Context Protocol (MCP) server deployment enabling semantic memory across multiple AI platforms (Perplexity Comet, Claude Desktop) through a single remote server with Cloudflare tunnel and client-specific authentication strategies.

## Overview

**Open Brain** is a personal semantic memory system that captures thoughts, decisions, ideas, and action items with vector embeddings for intelligent retrieval. This repository documents the **complete deployment architecture** of the [Open Brain (OB1)](https://github.com/NateBJones-Projects/OB1) architecture by **Nate B. Jones** and includes:

- Remote MCP server (Node.js, Ollama embeddings, Supabase vector storage)
- Cloudflare Tunnel for secure public HTTPS access (For Perplexity Comet)
- Perplexity Comet integration (direct API key auth)
- Claude Desktop integration (local stdio proxy to bypass OAuth requirement)

> **Full credit:** The OB1 protocol, architecture, and concept were created by [Nate B. Jones](https://natesnewsletter.substack.com/). This project adapts his work. Please star and follow the [original OB1 repository](https://github.com/NateBJones-Projects/OB1).

## Architecture

**Two Node.js Servers:**
1. **Remote MCP Server** (`server.mjs`) - Port 3101, handles all MCP requests, embeddings, database  
2. **Local Proxy Server** (`proxy-server.js`) - Claude Desktop only, runs locally, forwards to server.mjs

**Two Different Paths:**
- **Perplexity Comet:** Direct HTTPS → Cloudflare Tunnel → server.mjs (remote)
- **Claude Desktop:** stdio → proxy-server.js (local) → server.mjs (local OR remote, no Cloudflare)

```
┌──────────────────────────────────────────────────────────────────┐
│                         CLIENT LAYER                             │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Claude Desktop                    Perplexity Comet              │
│  (stdio MCP client)                 (Direct HTTPS)               │
│         │                                    │                   │
│         │                                    │                   │
│  ┌────────────────────────┐                  │                   │
│  │ Local Proxy Server     │                  │                   │
│  │ proxy-server.js        │                  │                   │
│  │ Node.js (localhost)    │                  │                   │
│  │ stdio ↔ HTTP(S) bridge │                  │                   │
│  └──────┬─────────────────┘                  │                   │
│         │                                    │                   │
│         │Direct HTTP(S)                      │                   │
│         │(no Cloudflare)                     │                   │
│         │                                    ↓                   │
├─────────│────────────────────────────────────────────────────────┤
│         │    Cloudflare Tunnel (Perplexity ONLY)                 │
│         │    https://your-subdomain.your-domain.com              │
│         │    - Access Policy: Bypass for /mcp path               │
│         │    - WAF: Skip security for PerplexityBot UA           │
│         │    - IP Whitelist: ASN AS16509 (AWS/Perplexity)        │
│         │                                           │            │
│─────────│───────────────────────────────────────────│────────────┤
│         ↓         YOUR COMPUTER/SERVER (Port 3101)  ↓            │
│  ┌───────────────────────────────────────────────────────────┐   │
│  │          Remote MCP Server (server.mjs)                   │   │
│  │          Node.js Express Server                           │   │
│  │          - Streamable HTTP: /mcp                          │   │
│  │          - SSE: /sse                                      │   │
│  │          - Health: /health                                │   │
│  │          - Multi-auth: query param, header, Bearer token  │   │
│  └────────────────────────┬──────────────────────────────────┘   │
│                           │                                      │
│              ┌────────────┴────────────┐                         │
│              ↓                         ↓                         │
│  ┌────────────────────┐   ┌────────────────────┐                 │
│  │ Ollama             │   │ Supabase           │                 │
│  │ Port: 11434        │   │ (Cloud PostgreSQL) │                 │
│  │ Model:             │   │ - pgvector ext     │                 │
│  │ nomic-embed-text   │   │ - thoughts table   │                 │
│  │ Embeddings (768d)  │   │ - 768-dim vectors  │                 │
│  └────────────────────┘   └────────────────────┘                 │
└──────────────────────────────────────────────────────────────────┘
```

**Claude Desktop Proxy Configuration:**
```javascript
// proxy-server.js can point to:
const REMOTE_URL = 'http://localhost:3101/mcp';  // Local server
// OR
const REMOTE_URL = 'https://your-domain.com/mcp';  // Remote via Cloudflare
// OR  
const REMOTE_URL = 'https://direct-ip:3101/mcp';  // Remote direct (no Cloudflare)
```

## The Challenge: Multi-Client MCP Deployment

### Problem 1: Remote MCP Server Access
Most MCP implementations assume **local stdio servers**. Deploying a **remote MCP server** accessible to multiple clients requires:
- Public HTTPS endpoint
- Authentication that works across different client capabilities
- Security hardening (Cloudflare Access, WAF rules)
- Multiple transport support (Streamable HTTP, SSE)

### Problem 2: Claude Desktop's OAuth Requirement
Claude Desktop **only supports OAuth for remote MCP servers** configured via UI. It doesn't support:
- Simple API key authentication in `claude_desktop_config.json`
- Direct HTTPS URLs with auth in config file
- The `npx mcp-remote` wrapper (Windows path issues)

### Solution: Client-Specific Integration Strategies

**Perplexity Comet**: Direct connection via Settings → Integrations
- URL: `https://your-domain.com/mcp`
- Auth: API Key field (sent as header)
- Transport: Streamable HTTP

**Claude Desktop**: Local stdio proxy (this repository)
- Runs locally as stdio MCP server
- Forwards requests to remote server with API key
- Bypasses OAuth requirement entirely

## Repository Contents

This repository contains the **complete Open Brain deployment**:

```
ob1-local-stack/
├── server.mjs                 # Open Brain MCP server (main)
├── proxy-server.js            # Claude Desktop stdio proxy
├── schema.sql                 # Supabase database schema
├── package-server.json        # Server dependencies
├── package.json               # Proxy dependencies
├── .env.server.example        # Server configuration template
├── .env.example               # Proxy configuration template
├── DEPLOYMENT.md              # Complete deployment guide
├── README.md                  # This file
├── .gitignore                 # Secrets exclusion
└── LICENSE                    # MIT License
```

## Quick Start

### Prerequisites
- Node.js 18+ installed
- Claude Desktop installed (for proxy integration)
- Supabase account (for full deployment)
- Ollama installed (for full deployment)

**Two deployment options:**
1. **Use existing Open Brain server** - Just run the Claude Desktop proxy (Quick Start below)
2. **Deploy your own server** - See **[DEPLOYMENT.md](DEPLOYMENT.md)** for complete setup guide

### Installation

1. **Clone this repository:**

```bash
git clone https://github.com/shawnsammartano-hub/ob1-local-stack.git
cd ob1-local-stack
```

2. **Install dependencies:**

```bash
npm install
```

3. **Configure your remote server:**

Edit `proxy-server.js` lines 10-11:

```javascript
const REMOTE_URL = 'https://your-openbrain-domain.com/mcp';
const API_KEY = 'your-api-key-here';
```

**SECURITY WARNING:** Never commit your actual API key or domain to Git. Keep credentials local only.

4. **Configure Claude Desktop:**

Edit `claude_desktop_config.json`:

**Windows:** `%APPDATA%\Claude\claude_desktop_config.json`  
**macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "open-brain": {
      "command": "node",
      "args": ["C:\\path\\to\\ob1-local-stack\\proxy-server.js"]
    }
  }
}
```

**Important for Windows:** Use double backslashes `\\` in the path.

5. **Restart Claude Desktop:**

- **Windows:** Task Manager → End Task on Claude → Reopen
- **macOS:** Cmd+Q to quit completely → Reopen

6. **Verify connection:**

Click the hammer icon (🔨) in Claude Desktop. You should see "open-brain" with 4 tools:
- `capture_thought`
- `search_thoughts`
- `browse_thoughts`
- `stats`

## Testing

### Manual Proxy Test

```bash
node proxy-server.js
```

Send this JSON-RPC request (press Enter twice after pasting):

```json
{"jsonrpc":"2.0","method":"tools/list","params":{},"id":1}

```

**Expected output:**

```
[Proxy] Forwarding tools/list request
[Proxy] Received 4 tools
{"result":{"tools":[...]}}
```

Press Ctrl+C to stop.

### In Claude Desktop

Test with:

```
Save this to my Open Brain: Testing Claude Desktop proxy connection
```

**Expected behavior:**
1. Claude calls `capture_thought` tool
2. Proxy terminal shows `[Proxy] Forwarding tool call: capture_thought`
3. Remote server processes via Ollama embeddings
4. Thought saved to Supabase
5. Claude confirms success

## Technical Deep Dive

### Why a Local Proxy?

Claude Desktop's remote server support has three critical limitations:

1. **OAuth-only authentication** - Doesn't support API keys in config
2. **Windows path quoting issues** - `npx mcp-remote` fails with spaces in paths
3. **Unreliable HTTPS handling** - Connection errors with direct URLs

The stdio proxy bypasses all three:
- Acts as a **local stdio server** (fully supported by Claude Desktop)
- Forwards requests to **remote HTTPS server** with API key auth
- Handles both **JSON-RPC and SSE** response formats

### MCP SDK Implementation

Uses `@modelcontextprotocol/sdk` v1.27.1 with **schema-based request handlers**:

```javascript
import { 
  ListToolsRequestSchema, 
  CallToolRequestSchema 
} from '@modelcontextprotocol/sdk/types.js';

server.setRequestHandler(ListToolsRequestSchema, async () => {
  // Forward to remote server, parse response
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  // Forward tool execution, return result
});
```

**Key pattern:**
- SDK v1.x uses schema objects, not string method names
- Handlers must return exact structure expected by protocol
- SSE responses require parsing `data:` lines before JSON decode

### Request Flow

1. **Claude Desktop** sends JSON-RPC via stdio to proxy
2. **Proxy** receives via `StdioServerTransport`
3. **Proxy** forwards to remote via HTTPS POST with API key
4. **Remote server** processes (Ollama embedding, Supabase query)
5. **Response parsing**:
   - SSE format: Extract `data: {...}` line → parse JSON
   - JSON format: Parse directly
6. **Return to Claude Desktop** via stdio

### Error Handling

All errors logged to stderr (visible in Claude Desktop logs):

**Windows:** `%APPDATA%\Claude\logs\mcp-server-open-brain.log`  
**macOS:** `~/Library/Logs/Claude/mcp-server-open-brain.log`

Common errors:
- `HTTP 401`: Invalid API key
- `Connection refused`: Remote server down
- `JSON parse error`: SSE format mismatch

## Troubleshooting

### Proxy won't start

- **Check Node.js version:** `node --version` (need 18+)
- **Verify dependencies:** `npm install`
- **Check paths:** Windows paths must use `\\` not `\` in config file

### Tools don't appear in Claude Desktop

1. Check Claude Desktop logs in `%APPDATA%\Claude\logs\`
2. Verify proxy is configured correctly in `claude_desktop_config.json`
3. Ensure Claude Desktop was fully restarted (Task Manager → End Task)
4. Test proxy manually: `node proxy-server.js` then send test JSON

### "Server disconnected" error

- Verify API key is correct in `proxy-server.js`
- Check remote server is running and accessible
- Test remote endpoint: `curl https://your-domain.com/health`
- Look for errors in proxy stderr output

### Windows "Cannot find module" errors

- Ensure you ran `npm install` in the proxy directory
- Check that `node_modules` folder exists
- Verify `package.json` is in the same directory as `proxy-server.js`

## Full Deployment Stack

Want to deploy your own Open Brain server? Here's the complete architecture:

### 1. Open Brain MCP Server

**Stack:**
- Node.js MCP server with multi-transport support
- Ollama (nomic-embed-text for 768-dim embeddings)
- Supabase (pgvector for semantic search)
- Express.js for HTTP/SSE endpoints

**Key endpoints:**
- `/mcp` - Streamable HTTP (POST)
- `/sse` - Server-Sent Events (GET/POST)
- `/health` - Health check (GET)

**Authentication:**
- Query parameter: `?key=...`
- Header: `X-API-Key: ...` or `Authorization: Bearer ...`

### 2. Cloudflare Tunnel

**Setup:**

```bash
cloudflared tunnel create open-brain
cloudflared tunnel route dns open-brain your-domain.com
cloudflared tunnel run open-brain
```

**Or as Windows service:**

```bash
cloudflared service install <TOKEN>
```

**Dashboard config:**
- Public Hostname: `your-domain.com`
- Service: `http://localhost:3101`
- Path: Leave blank for all traffic

### 3. Cloudflare Security Configuration

**Access Policy (critical - order matters):**

1. **Path `/mcp`**: Bypass policy
   - Action: Bypass
   - Include: Everyone
   - DO NOT add Country requirement
   - **Must be ordered ABOVE domain-wide policy**

2. **Domain-wide**: Email OTP
   - Action: Allow
   - Include: Email domain / OTP

**WAF Custom Rules:**

Rule: "Perplexity Bot Bypass"
- Field: User Agent
- Operator: contains
- Value: `PerplexityBot`
- Action: Skip → All remaining custom rules

**IP Access Rules (optional):**
- Whitelist ASN AS16509 (AWS - Perplexity backend)

### 4. Perplexity Comet Integration

**Settings → Integrations → MCP Servers:**

- **Name:** Open Brain
- **URL:** `https://your-domain.com/mcp`
- **Authentication:** API Key
- **Key:** (paste your API key in the auth field)
- **Transport:** Streamable HTTP

### 5. Claude Desktop Integration

This repository (the proxy you just installed).

## What This Demonstrates

This project showcases:

- **MCP Protocol Expertise**: Multi-transport server, stdio proxy, schema-based handlers
- **Full-Stack Deployment**: Remote server, tunnel, security hardening, multi-client integration
- **Problem-Solving**: Working around platform limitations (Claude's OAuth requirement)
- **Security Architecture**: Cloudflare Access policies, WAF rules, API key management
- **Node.js Patterns**: Async/await, fetch API, JSON-RPC, SSE parsing
- **Documentation**: Clear problem statements, architecture diagrams, deployment guides

## Open Brain Tools

Once connected, you have access to:

### capture_thought
Save notes, decisions, ideas, action items with automatic semantic classification.

**Auto-detects type:**
- `action_item` - Tasks, TODOs
- `decision` - Choices made, commitments
- `idea` - Brainstorms, concepts
- `insight` - Learnings, realizations
- `note` - General information

### search_thoughts
Semantic search across all saved content using vector similarity.

**Parameters:**
- `query` (required): Search text
- `threshold` (default 0.7): Similarity cutoff (0-1)
- `limit` (default 10): Max results

### browse_thoughts
View recent thoughts chronologically.

**Parameters:**
- `limit` (default 10): Number to retrieve
- `type` (optional): Filter by type

### stats
Get database statistics: total thoughts, type breakdown, recent activity.

## Performance Characteristics

- **Capture latency**: ~2-3 seconds (Ollama embedding + Supabase insert)
- **Search latency**: ~500ms (Supabase vector similarity query)
- **Proxy overhead**: <50ms (local stdio to remote HTTPS)
- **Concurrent clients**: Unlimited (stateless server architecture)

## License

MIT License - see LICENSE file for details

## Author

**Shawn Sammartano**
- [LinkedIn](https://linkedin.com/in/shawnsammartano) · [GitHub](https://github.com/shawnsammartano-hub)
- AI Enablement
- Areas of Study: AI Enablement, Enterprise AI Strategy, MCP Architecture

## Acknowledgments

- **Anthropic** - Claude Desktop, MCP specification
- **Perplexity AI** - Comet custom instructions, MCP client support
- **Cloudflare** - Tunnel infrastructure, Access security
- **Supabase** - Vector database (pgvector)
- **Ollama** - Local embedding models

This project is a **complete deployment architecture** of:

> **Open Brain (OB1)** by Nate B. Jones
> 🔗 https://github.com/NateBJones-Projects/OB1
> 📰 https://natesnewsletter.substack.com/

OB1 is the original architecture, protocol design, MCP tool schema, and concept. The `thoughts` table schema, `match_thoughts` function, and four-tool MCP design (`capture_thought`, `search_thoughts`, `browse_thoughts`, `stats`) are derived from OB1's original work.

## Related Repositories

- `enterprise-rag-system` - ChromaDB + Ollama RAG implementation

## Contributing

Issues and pull requests welcome. For major changes, please open an issue first to discuss what you would like to change.

## Roadmap

- [ ] Add authentication token rotation
- [ ] Implement conversation threading (link related thoughts)
- [ ] Add export functionality (Markdown, JSON)
- [ ] Multi-user support with user-scoped embeddings
- [ ] Web UI for browsing/searching thoughts
- [ ] Integration with additional AI platforms (ChatGPT, Cursor)
