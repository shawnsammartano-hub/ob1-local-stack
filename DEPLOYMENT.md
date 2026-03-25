# Open Brain: Complete Deployment Guide

**100% complete, step-by-step guide** based on the actual implementation. Every detail, every bug fix, every configuration setting documented. All credentials and personal information anonymized.

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Architecture Overview](#architecture-overview)
3. [Part 1: Supabase Setup](#part-1-supabase-setup)
4. [Part 2: Ollama Installation](#part-2-ollama-installation)
5. [Part 3: Open Brain Server](#part-3-open-brain-server)
6. [Part 4: Cloudflare Tunnel](#part-4-cloudflare-tunnel)
7. [Part 5: Cloudflare Security](#part-5-cloudflare-security)
8. [Part 6: Perplexity Comet](#part-6-perplexity-comet)
9. [Part 7: Claude Desktop](#part-7-claude-desktop)
10. [Troubleshooting](#troubleshooting)
11. [Production Deployment](#production-deployment)

---

## Prerequisites

**Required:**
- Windows 10/11, macOS, or Linux
- Node.js 18+ installed
- 8GB RAM minimum (for Ollama)
- 10GB free disk space
- Stable internet connection

**Accounts Needed:**
- Supabase account (free tier works)
- Cloudflare account (free tier works) - *only for Perplexity*
- Perplexity Pro subscription - *optional*
- Claude Desktop - *optional*

**Skills:**
- Basic terminal/PowerShell usage
- Understanding of environment variables
- Basic JSON editing

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│              CLIENT APPLICATIONS                         │
│  ┌──────────────────┐    ┌───────────────────┐         │
│  │ Perplexity Comet │    │ Claude Desktop    │         │
│  │ (Direct HTTPS)   │    │ (Local Proxy)     │         │
│  └────────┬─────────┘    └────────┬──────────┘         │
│           │                       │                     │
│           │  ┌───────────────────┘                     │
│           │  │                                          │
└───────────┼──┼──────────────────────────────────────────┘
            │  │
            ↓  ↓
┌─────────────────────────────────────────────────────────┐
│      CLOUDFLARE TUNNEL (Public HTTPS Gateway)            │
│      https://your-subdomain.your-domain.com              │
│      - Cloudflare Access: Bypass /mcp path              │
│      - WAF: Skip security for PerplexityBot             │
│      - IP Whitelist: ASN AS16509 (AWS/Perplexity)       │
└───────────────────────┬─────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────┐
│          YOUR COMPUTER / SERVER (Port 3101)              │
│                                                          │
│  ┌────────────────────────────────────────────┐         │
│  │   Open Brain MCP Server (server.mjs)       │         │
│  │   - Streamable HTTP: /mcp                  │         │
│  │   - SSE: /sse                               │         │
│  │   - Health: /health                         │         │
│  │   - Auth: API Key (query/header/bearer)    │         │
│  └───────────┬────────────────────────────────┘         │
│              │                                           │
│    ┌─────────┴──────────┐                               │
│    ↓                    ↓                               │
│  ┌──────────────┐   ┌─────────────────┐                │
│  │   Ollama     │   │  Claude Proxy   │                │
│  │ Port 11434   │   │ proxy-server.js │                │
│  │ nomic-embed  │   │ (stdio→HTTPS)   │                │
│  └──────────────┘   └─────────────────┘                │
└─────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────┐
│            SUPABASE (Cloud PostgreSQL)                   │
│            - pgvector extension                          │
│            - thoughts table (768-dim vectors)            │
│            - match_thoughts() function                   │
└─────────────────────────────────────────────────────────┘
```

**Data Flow:**
1. User asks Perplexity/Claude to save thought
2. Request → Cloudflare Tunnel → Your server (port 3101)
3. Server → Ollama (generate 768-dim embedding)
4. Server → Supabase (store content + embedding)
5. Response back through chain

---

## Part 1: Supabase Setup

### Step 1.1: Create Project

1. **Sign up:** https://supabase.com/dashboard
2. Click **"New Project"**
3. **Project Settings:**
   - **Name:** `open-brain` (or your choice)
   - **Database Password:** Click generate → **SAVE THIS PASSWORD**
   - **Region:** Choose closest to you (e.g., `us-west-1`)
   - **Pricing Plan:** Free

4. Click **"Create new project"**
5. **Wait 2-3 minutes** for provisioning

### Step 1.2: Enable pgvector Extension

1. Go to **Database** → **Extensions**
2. Search for `vector`
3. Click **Enable** on `vector`
4. Wait for confirmation message

### Step 1.3: Run Database Schema

1. Go to **SQL Editor**
2. Click **"New Query"**
3. Copy the entire contents of `schema.sql` from this repo
4. Paste into editor
5. Click **Run** (bottom-right, or Ctrl+Enter)

**Expected Output:**
```
Success. No rows returned
```

**What this creates:**
- `thoughts` table with 768-dimensional vector column
- `match_thoughts()` function for semantic search
- Indexes for performance
- Auto-update trigger for `updated_at`

### Step 1.4: Get API Credentials

1. Go to **Settings** → **API**
2. **Copy these values** (you'll need them in Part 3):
   - **Project URL:** `https://xxxxxxxxxxxxx.supabase.co`
   - **Project API keys** → **anon** → **public** key (starts with `eyJhbGci...`)

**Save both values securely.** You'll add them to `.env` later.

### Step 1.5: Verify Database

1. Go to **Table Editor**
2. You should see `thoughts` table
3. Click on it - columns should be:
   - `id` (uuid)
   - `content` (text)
   - `type` (text)
   - `embedding` (vector)
   - `created_at` (timestamptz)
   - `updated_at` (timestamptz)

---

## Part 2: Ollama Installation

### Step 2.1: Install Ollama

**Windows:**
1. Download: https://ollama.com/download/windows
2. Run installer (`OllamaSetup.exe`)
3. Ollama starts automatically as system service
4. Verify: System tray icon appears

**Linux:**
```bash
curl -fsSL https://ollama.com/install.sh | sh
```

**macOS:**
1. Download: https://ollama.com/download/mac
2. Drag to Applications
3. Open Ollama app

### Step 2.2: Pull Embedding Model

Open **PowerShell** (Windows) or **Terminal** (Mac/Linux):

```bash
ollama pull nomic-embed-text
```

**Expected Output:**
```
pulling manifest
pulling 970aa74c0a90... 100% ████████████████
pulling c71d239df917... 100% ████████████████
verifying sha256 digest
writing manifest
success
```

**This downloads:**
- Model size: ~274 MB
- Embedding dimensions: 768
- Context length: 8192 tokens

### Step 2.3: Verify Ollama

Test the embedding API:

```bash
curl http://localhost:11434/api/embeddings -d "{\"model\":\"nomic-embed-text\",\"prompt\":\"test\"}"
```

**Expected Response:**
```json
{
  "embedding": [0.123, -0.456, 0.789, ...]
}
```

**If this fails:**
- Windows: Check Services → "Ollama Service" is running
- Linux: `sudo systemctl status ollama`
- macOS: Check Ollama app is open

### Step 2.4: Test Embedding Performance

```bash
# Windows PowerShell
Measure-Command {
  curl http://localhost:11434/api/embeddings -d "{\"model\":\"nomic-embed-text\",\"prompt\":\"test sentence for embedding\"}"
}
```

**Expected Performance:**
- **CPU-only:** 2-3 seconds per embedding
- **GPU (NVIDIA):** 200-500ms per embedding

---

## Part 3: Open Brain Server

### Step 3.1: Clone Repository

```bash
git clone https://github.com/shawnsammartano-hub/ob1-local-stack.git
cd ob1-local-stack
```

### Step 3.2: Install Dependencies

```bash
npm install express @supabase/supabase-js @modelcontextprotocol/sdk dotenv
```

**Packages installed:**
- `express` - HTTP server
- `@supabase/supabase-js` - Supabase client
- `@modelcontextprotocol/sdk` - MCP protocol
- `dotenv` - Environment variables

### Step 3.3: Generate API Key

```bash
node generate-keys.mjs
```

**Output:**
```
🔑 Open Brain API Key Generator

Generated API Key:
────────────────────────────────────────────────────────────────────────────────
*********************redacted***********************************
────────────────────────────────────────────────────────────────────────────────

💡 Add this to your .env file as API_KEY=<key>

⚠️  NEVER commit this key to Git!
```

**Copy the generated key.**

### Step 3.4: Create Environment File

```bash
# Copy template
cp .env.server.example .env

# Edit .env
notepad .env   # Windows
nano .env      # Linux/macOS
```

**Paste your actual values:**

```env
# Supabase Configuration (from Part 1, Step 1.4)
SUPABASE_URL=https://xxxxxxxxxxxxx.supabase.co
SUPABASE_KEY=........redacted.......................

# Ollama Configuration
OLLAMA_URL=http://localhost:11434

# API Key (from Step 3.3)
API_KEY=.....................redacted...................................

# Server Port
PORT=3101
```

**Save the file.**

**Security Check:**
```bash
# Verify .env is in .gitignore
git status

# Should NOT show .env in untracked files
# If it does, add to .gitignore
echo ".env" >> .gitignore
```

### Step 3.5: Load Environment Variables

**Option A: Manual load (recommended for testing)**

Windows PowerShell:
```powershell
$env:SUPABASE_URL="https://xxxxx.supabase.co"
$env:SUPABASE_KEY="..........."
$env:OLLAMA_URL="http://localhost:11434"
$env:API_KEY="........."
$env:PORT="3101"
```

Linux/macOS:
```bash
export SUPABASE_URL="https://xxxxx.supabase.co"
export SUPABASE_KEY="..........."
export OLLAMA_URL="http://localhost:11434"
export API_KEY="........"
export PORT="3101"
```

**Option B: Use dotenv (automatic)**

Edit `server.mjs` - add this at the top:
```javascript
import dotenv from 'dotenv';
dotenv.config();
```

### Step 3.6: Start Server

```bash
node server.mjs
```

**Expected Output:**
```
🧠 OB1 MCP Server
   Health:      http://localhost:3101/health
   SSE:         http://localhost:3101/sse?key=.........
   Streamable:  http://localhost:3101/mcp?key=.........
   Ollama:      http://localhost:11434
   Port:        3101
```

**If you see this, the server is running!**

### Step 3.7: Test Server - Health Check

Open new terminal:

```bash
curl http://localhost:3101/health
```

**Expected Response:**
```json
{
  "status": "ok",
  "tools": ["capture_thought", "search_thoughts", "browse_thoughts", "stats"],
  "transports": ["sse", "streamable-http"],
  "timestamp": "2026-03-25T14:30:00.000Z"
}
```

### Step 3.8: Test Server - Capture Thought

```bash
curl http://localhost:3101/mcp?key=YOUR_API_KEY \
  -X POST \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"capture_thought","arguments":{"content":"Testing Open Brain server deployment"}},"id":1}'
```

**Expected Response:**
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "content": [{
      "type": "text",
      "text": "Captured as note: Testing Open Brain server deployment"
    }]
  }
}
```

**In your server terminal, you should see:**
```
🔧 MCP POST request (Streamable HTTP)
capture_thought called: Testing Open Brain server deployment
Classified as: note
Calling Ollama embed...
Saved to Supabase: ........-....-....-....-............
```

**If this works, your server is fully operational!**

### Step 3.9: Verify in Supabase

1. Go to Supabase dashboard
2. **Table Editor** → **thoughts**
3. You should see your test thought
4. Note the `embedding` column has `[768]` indicating vector was stored

---

## Part 4: Cloudflare Tunnel

**⚠️ SKIP THIS PART if you're only using Claude Desktop.** Cloudflare tunnel is only needed for Perplexity Comet's remote access.

### Step 4.1: Install cloudflared

**Windows:**
1. Download: https://github.com/cloudflare/cloudflared/releases/latest
2. Get `cloudflared-windows-amd64.exe`
3. Rename to `cloudflared.exe`
4. Move to `C:\Program Files\cloudflared\cloudflared.exe`
5. Add to PATH:
   ```powershell
   $env:Path += ";C:\Program Files\cloudflared"
   [Environment]::SetEnvironmentVariable("Path", $env:Path, "Machine")
   ```

**Linux:**
```bash
curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb -o cloudflared.deb
sudo dpkg -i cloudflared.deb
```

**macOS:**
```bash
brew install cloudflared
```

**Verify installation:**
```bash
cloudflared --version
```

### Step 4.2: Authenticate with Cloudflare

```bash
cloudflared tunnel login
```

**What happens:**
1. Browser opens to Cloudflare dashboard
2. Select your domain (or create one)
3. Authorize cloudflared
4. Terminal shows: "Successfully authenticated"

**Certificate saved to:**
- Windows: `%USERPROFILE%\.cloudflared\cert.pem`
- Linux/macOS: `~/.cloudflared/cert.pem`

### Step 4.3: Create Tunnel

```bash
cloudflared tunnel create open-brain
```

**Output:**
```
Tunnel credentials written to: C:\Users\YourName\.cloudflared\UUID.json
Created tunnel open-brain with id UUID
```

**Save the UUID** - you'll need it next.

### Step 4.4: Create DNS Record

```bash
cloudflared tunnel route dns open-brain your-subdomain.your-domain.com
```

Replace:
- `your-subdomain` - e.g., `openbrain`, `mcp`, `brain`
- `your-domain.com` - your Cloudflare domain

**Example:**
```bash
cloudflared tunnel route dns open-brain openbrain.example.com
```

**Output:**
```
Created CNAME record: openbrain.example.com → UUID.cfargotunnel.com
```

### Step 4.5: Create Tunnel Config

**Windows:** Create `C:\Users\YourName\.cloudflared\config.yml`  
**Linux/macOS:** Create `~/.cloudflared/config.yml`

```yaml
tunnel: YOUR-TUNNEL-UUID
credentials-file: C:\Users\YourName\.cloudflared\YOUR-TUNNEL-UUID.json

ingress:
  - hostname: your-subdomain.your-domain.com
    service: http://localhost:3101
  - service: http_status:404
```

**Replace:**
- `YOUR-TUNNEL-UUID` - the UUID from Step 4.3
- `your-subdomain.your-domain.com` - your chosen domain
- Path to credentials file (check actual location from Step 4.3)

### Step 4.6: Test Tunnel

**Terminal 1:** Make sure your server is running
```bash
node server.mjs
```

**Terminal 2:** Start tunnel
```bash
cloudflared tunnel run open-brain
```

**Output:**
```
INFO Connection registered  connIndex=0
INFO Route propagating  url=https://your-subdomain.your-domain.com
```

**Terminal 3:** Test public access
```bash
curl https://your-subdomain.your-domain.com/health
```

**Should return same JSON as localhost test.**

**If this works, your tunnel is operational!**

### Step 4.7: Install as Windows Service

**CRITICAL:** Don't run tunnel manually. Install as service for 24/7 operation.

```powershell
# Install service
cloudflared service install

# Start service
net start cloudflared

# Verify
Get-Service cloudflared
```

**Expected:**
```
Status   Name               DisplayName
------   ----               -----------
Running  cloudflared        Cloudflare Tunnel
```

**Or use token method (easier):**

1. Go to Cloudflare Dashboard → Zero Trust → Networks → Tunnels
2. Click your tunnel → Configure
3. Copy the token (starts with `eyJ...`)
4. Install:
   ```powershell
   cloudflared service install eyJ...YOUR_TOKEN...
   ```

**Verify tunnel in dashboard:**
- Status should show "HEALTHY"
- Connectors: 4 (default)

---

## Part 5: Cloudflare Security

**CRITICAL SECTION:** These configurations are required for Perplexity Comet to work. Missing any step will cause authentication failures.

### Step 5.1: Create Access Application for /mcp Path

1. Go to **Zero Trust** → **Access** → **Applications**
2. Click **"Add an application"**
3. Select **"Self-hosted"**

**Application Configuration:**
- **Application name:** `Open Brain MCP`
- **Session Duration:** `24 hours`
- **Application domain:** `your-subdomain.your-domain.com`
- **Path:** `/mcp` ← **CRITICAL: Must include path**

**Identity providers:**
- Leave default (Cloudflare will manage)

Click **Next**

### Step 5.2: Configure Bypass Policy

**Policy Configuration:**
- **Policy name:** `MCP Bypass`
- **Action:** `Bypass` ← **CRITICAL: Must be Bypass, not Allow**
- **Session duration:** `24 hours`

**Configure rules:**
- **Include:** `Everyone`
- **DO NOT** add "Require" rules
- **DO NOT** add "Country" requirement

**Why no Country requirement?**
Perplexity's infrastructure is global (AWS regions worldwide). A Country requirement will block requests from Perplexity's servers in other regions.

Click **Add application**

### Step 5.3: CRITICAL - Reorder Access Policies

**This is the #1 cause of Perplexity connection failures.**

1. Go to **Access** → **Applications**
2. You should see TWO applications:
   - `Open Brain MCP` (Path: /mcp)
   - Your domain-wide policy (if any)

3. **Drag** the `Open Brain MCP` application **ABOVE** any domain-wide policies

**Correct order:**
```
1. Open Brain MCP (/mcp) - Bypass
2. Domain-wide policy - Allow/Block
```

**Why?** Cloudflare evaluates policies top-to-bottom. If domain-wide is first, it blocks before /mcp bypass is checked.

### Step 5.4: Configure WAF Custom Rule

**Required for Perplexity bot to bypass security.**

1. Go to **Security** → **WAF** → **Custom rules**
2. Click **"Create rule"**

**Rule configuration:**
- **Rule name:** `Perplexity Bot Bypass`
- **Field:** `User Agent`
- **Operator:** `contains` ← **NOT equals**
- **Value:** `PerplexityBot`
- **Then:** `Skip` → Select `All remaining custom rules`

Click **Deploy**

**Why contains?** Perplexity's User-Agent is `PerplexityBot/1.0` - the version number changes.

### Step 5.5: IP Access Rules (Optional but Recommended)

Whitelist Perplexity's infrastructure:

1. Go to **Security** → **WAF** → **Tools**
2. Click **"IP Access Rules"**
3. Click **"Create"**

**Configuration:**
- **Value:** `AS16509` ← AWS ASN (Perplexity backend)
- **Action:** `Whitelist`
- **Zone:** `This website`
- **Notes:** `Perplexity infrastructure`

Click **Add**

### Step 5.6: Test Security Configuration

**Test 1: Health endpoint (should work without auth)**
```bash
curl https://your-subdomain.your-domain.com/health
```

**Test 2: MCP endpoint (should work with API key)**
```bash
curl https://your-subdomain.your-domain.com/mcp?key=YOUR_API_KEY \
  -X POST \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","method":"tools/list","params":{},"id":1}'
```

**Test 3: MCP endpoint without key (should return 401)**
```bash
curl https://your-subdomain.your-domain.com/mcp \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"tools/list","params":{},"id":1}'
```

**Expected:** `{"error":"Unauthorized"}`

---

## Part 6: Perplexity Comet

### Step 6.1: Access Integrations

1. Open Perplexity Pro
2. Click Settings (gear icon)
3. Go to **Integrations** → **MCP Servers**
4. Click **"Add Server"** or **"+"**

### Step 6.2: Configure Server

**CRITICAL: Common mistakes in this step cause 90% of connection failures.**

**Server Configuration:**
- **Name:** `Open Brain`
- **URL:** `https://your-subdomain.your-domain.com/mcp` ← **NO `/sse`, NO query params**
- **Authentication:** Select `API Key` from dropdown
- **API Key field:** Paste your actual key (from Part 3, Step 3.3)
- **Transport:** `Streamable HTTP` ← **NOT SSE**

**Common Mistakes to Avoid:**
❌ **DON'T** put key in URL: `https://domain.com/mcp?key=...`  
❌ **DON'T** select SSE transport  
❌ **DON'T** use `/sse` endpoint  
✅ **DO** put key in "API Key" field  
✅ **DO** use "Streamable HTTP" transport  
✅ **DO** use `/mcp` endpoint  

Click **Connect** or **Save**

### Step 6.3: Verify Connection

**Status should show:**
- ✅ Connected
- 4 tools available

**If you see "Connecting..." for >10 seconds:**
- Check Cloudflare Access policy order (Part 5, Step 5.3)
- Check WAF rule for PerplexityBot (Part 5, Step 5.4)
- Check tunnel is running (Part 4, Step 4.7)

### Step 6.4: Test Integration

Ask Perplexity:

```
Save this to my Open Brain: Testing Perplexity Comet integration on March 25, 2026
```

**Expected behavior:**
1. Perplexity shows tool call: `capture_thought`
2. Parameters: `{"content":"Testing Perplexity Comet integration on March 25, 2026"}`
3. Response: "Captured as note: Testing Perplexity..."
4. Your server terminal shows:
   ```
   🔧 MCP POST request (Streamable HTTP)
   capture_thought called: Testing Perplexity...
   Classified as: note
   Calling Ollama embed...
   Saved to Supabase: <uuid>
   ```

## Part 7: Claude Desktop

### Step 7.1: Verify Prerequisites

**Check Claude Desktop version:**
- Windows: Help → About Claude Desktop
- Need version that supports MCP (late 2024+)

**Check Node.js:**
```bash
node --version
```

Should be `v18.0.0` or higher.

### Step 7.2: Configure Proxy

Edit `proxy-server.js`:

```javascript
// Line 10-11
const REMOTE_URL = 'https://your-subdomain.your-domain.com/mcp';
const API_KEY = 'your-api-key-here';
```

**Replace with your actual values from previous steps.**

**For local-only setup (no Cloudflare):**
```javascript
const REMOTE_URL = 'http://localhost:3101/mcp';
const API_KEY = 'your-api-key-here';
```

### Step 7.3: Test Proxy

```bash
node proxy-server.js
```

**Expected Output:**
```
[Proxy] Starting Open Brain MCP Proxy...
[Proxy] Remote URL configured, API key loaded
[Proxy] Connected and ready
```

**In new terminal, test with JSON-RPC:**

```bash
echo '{"jsonrpc":"2.0","method":"tools/list","params":{},"id":1}' | node proxy-server.js
```

**Wait 2 seconds, then press Enter twice.**

**Expected Response:**
```
[Proxy] Forwarding tools/list request
[Proxy] Received 4 tools
{"result":{"tools":[{"name":"capture_thought",...}]}}
```

Press Ctrl+C to stop.

### Step 7.4: Configure Claude Desktop

**Find config file:**

Windows:
```powershell
notepad %APPDATA%\Claude\claude_desktop_config.json
```

macOS:
```bash
nano ~/Library/Application\ Support/Claude/claude_desktop_config.json
```

**If file doesn't exist, create it with:**
```json
{
  "mcpServers": {}
}
```

**Add your Open Brain server:**

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

**Replace path with actual location:**
- Windows: Use `\\` double backslashes
- macOS/Linux: Use regular `/` slashes

**Example (Windows):**
```json
{
  "mcpServers": {
    "open-brain": {
      "command": "node",
      "args": ["C:\\Users\\YourName\\Documents\\ob1-local-stack\\proxy-server.js"]
    }
  }
}
```

**Example (macOS):**
```json
{
  "mcpServers": {
    "open-brain": {
      "command": "node",
      "args": ["/Users/YourName/Documents/ob1-local-stack/proxy-server.js"]
    }
  }
}
```

**Save the file.**

### Step 7.5: Restart Claude Desktop

**IMPORTANT:** Must fully quit Claude, not just close window.

**Windows:**
1. Open Task Manager (Ctrl+Shift+Esc)
2. Find "Claude" process
3. Right-click → End Task
4. Reopen Claude Desktop from Start menu

**macOS:**
1. Press Cmd+Q (or Claude menu → Quit)
2. Reopen from Applications

### Step 7.6: Verify Connection

1. Look for **hammer icon (🔨)** in bottom-right of chat input
2. Click the hammer icon
3. You should see:
   - **open-brain** (your server name)
   - 4 tools listed:
     - capture_thought
     - search_thoughts
     - browse_thoughts
     - stats

**If you don't see hammer icon:**
- Check Claude Desktop logs (see Troubleshooting)
- Verify proxy path in config file
- Ensure proxy-server.js has correct credentials

### Step 7.7: Test Integration

Ask Claude:

```
Save this to my Open Brain: Successfully connected Claude Desktop via local proxy on March 25, 2026
```

**Expected behavior:**
1. Claude shows tool call: `capture_thought`
2. Shows parameters being sent
3. Returns: "Captured as note: Successfully connected..."
4. Your server terminal shows the request

**Check Supabase:**
- Table Editor → thoughts
- Should see the new entry

---

## Troubleshooting

### General Issues

#### Server Won't Start

**Error: `Cannot find module 'express'`**

Solution:
```bash
npm install express @supabase/supabase-js @modelcontextprotocol/sdk dotenv
```

**Error: `ECONNREFUSED` connecting to Supabase**

Solutions:
1. Check SUPABASE_URL in .env
2. Verify project is active in Supabase dashboard
3. Test: `curl https://your-project.supabase.co`
4. Check SUPABASE_KEY is anon public key, not service role key

**Error: `ECONNREFUSED` connecting to Ollama**

Solutions:
1. Check Ollama is running:
   ```bash
   curl http://localhost:11434
   ```
2. Windows: Services → "Ollama Service" → Start
3. Linux: `sudo systemctl start ollama`
4. macOS: Open Ollama app

**Error: `Model 'nomic-embed-text' not found`**

Solution:
```bash
ollama pull nomic-embed-text
ollama list  # Verify it's installed
```

#### Cloudflare Issues

**Error: `401 Unauthorized` from Cloudflare**

**Cause:** Access policies blocking /mcp path.

**Solution:**
1. Zero Trust → Access → Applications
2. Find "Open Brain MCP" (/mcp path)
3. **Drag it ABOVE all other policies**
4. Verify Action is "Bypass" (not "Allow")
5. Verify NO Country requirement

**Test:**
```bash
curl https://your-domain.com/mcp?key=YOUR_KEY -X POST -H "Content-Type: application/json" -d '{"jsonrpc":"2.0","method":"tools/list","params":{},"id":1}'
```

**Error: `FETCHER_NO_STATUS_CODE_ERROR` (Perplexity)**

**Cause:** WAF or Bot Fight Mode blocking Perplexity bot.

**Solutions:**
1. Security → WAF → Custom Rules
2. Verify "Perplexity Bot Bypass" rule exists
3. Check:
   - Field: User Agent
   - Operator: **contains** (NOT equals)
   - Value: `PerplexityBot`
   - Action: Skip all rules
4. Turn OFF "Bot Fight Mode" if enabled

**Test with Perplexity User-Agent:**
```bash
curl -H "User-Agent: PerplexityBot/1.0" https://your-domain.com/health
```

**Tunnel shows "Disconnected"**

Solutions:
1. Check tunnel service:
   ```powershell
   Get-Service cloudflared
   ```
2. Restart service:
   ```powershell
   Restart-Service cloudflared
   ```
3. Check logs:
   ```powershell
   Get-EventLog -LogName Application -Source cloudflared -Newest 20
   ```

**Cannot reach domain**

Solutions:
1. Verify DNS: `nslookup your-subdomain.your-domain.com`
2. Should return: `*.cfargotunnel.com`
3. Check tunnel route: `cloudflared tunnel info open-brain`
4. Verify config.yml hostname matches

#### Perplexity Connection Issues

**"Connecting..." never resolves**

**Checklist:**
1. ✅ Cloudflare Access: /mcp Bypass policy is FIRST
2. ✅ WAF Rule: PerplexityBot bypass exists
3. ✅ API Key: In "API Key" field, NOT URL
4. ✅ Transport: "Streamable HTTP" selected
5. ✅ Endpoint: `/mcp` (NOT `/sse`)
6. ✅ Server: Running and accessible

**Test endpoint manually:**
```bash
curl https://your-domain.com/mcp?key=YOUR_KEY \
  -X POST \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","method":"tools/list","params":{},"id":1}'
```

Should return tools list.

**"Wrong API key" in Perplexity**

**Causes:**
1. API key has typo
2. Key in URL instead of auth field
3. Server restarted with different key

**Solution:**
1. Generate new key: `node generate-keys.mjs`
2. Update server .env
3. Restart server
4. Update Perplexity integration (click edit, paste new key)

#### Claude Desktop Issues

**Hammer icon doesn't appear**

**Solutions:**
1. Check Claude Desktop logs:
   ```
   %APPDATA%\Claude\logs\mcp-server-open-brain.log
   ```
2. Common errors in logs:
   - `Cannot find module` → Run npm install
   - `ENOENT` → Check proxy path in config
   - `SyntaxError` → Check JSON syntax in config

**Validate JSON syntax:**
```bash
# Python
python -m json.tool claude_desktop_config.json

# Node.js
node -e "require('./claude_desktop_config.json')"
```

**"Server disconnected" error**

**Causes:**
1. proxy-server.js has wrong credentials
2. Server not running
3. Cloudflare tunnel down (if using remote)

**Solutions:**
1. Test proxy manually: `node proxy-server.js`
2. Send test JSON (see Step 7.3)
3. Check REMOTE_URL and API_KEY match server
4. For remote: verify tunnel is running

**Tools appear but calls fail**

**Check logs in Claude Desktop:**
```
%APPDATA%\Claude\logs\mcp-server-open-brain.log
```

**Common issues:**
- `401 Unauthorized` → Wrong API key
- `ECONNREFUSED` → Server/tunnel down
- `Timeout` → Network/firewall issue

#### Database Issues

**"Relation 'thoughts' does not exist"**

Solution:
1. Go to Supabase SQL Editor
2. Re-run schema.sql
3. Verify "Success. No rows returned"

**"Function 'match_thoughts' does not exist"**

Solution:
1. Re-run schema.sql
2. Check Database → Functions
3. Should see `match_thoughts`

**Slow searches (>5 seconds)**

**Causes:**
1. No index (first ~1000 records)
2. Wrong vector operator

**Check index:**
```sql
-- In Supabase SQL Editor
SELECT * FROM pg_indexes WHERE tablename = 'thoughts';
```

Should see `thoughts_embedding_idx`.

**Force index rebuild:**
```sql
DROP INDEX thoughts_embedding_idx;
CREATE INDEX thoughts_embedding_idx ON thoughts 
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);
```

---

## Production Deployment

### Running as Windows Service

**For the server (not tunnel - tunnel already runs as service):**

**Option A: NSSM (Recommended)**

1. Download NSSM: https://nssm.cc/download
2. Extract nssm.exe to `C:\nssm\`
3. Install service:

```powershell
cd C:\nssm
.\nssm install OpenBrainServer "C:\Program Files\nodejs\node.exe" "C:\path\to\server.mjs"
.\nssm set OpenBrainServer AppDirectory "C:\path\to\ob1-local-stack"
.\nssm set OpenBrainServer AppEnvironmentExtra "API_KEY=your-key" "SUPABASE_URL=https://..." "SUPABASE_KEY=..." "OLLAMA_URL=http://localhost:11434"
.\nssm start OpenBrainServer
```

**Verify:**
```powershell
Get-Service OpenBrainServer
```

**Option B: PM2 (Cross-platform)**

```bash
npm install -g pm2

# Start server
pm2 start server.mjs --name open-brain

# Save configuration
pm2 save

# Setup startup
pm2 startup
# Follow instructions to enable startup
```

**Verify:**
```bash
pm2 list
pm2 logs open-brain
```

### Running on Linux (systemd)

Create `/etc/systemd/system/open-brain.service`:

```ini
[Unit]
Description=Open Brain MCP Server
After=network.target ollama.service

[Service]
Type=simple
User=yourusername
WorkingDirectory=/home/yourusername/ob1-local-stack
Environment="NODE_ENV=production"
Environment="SUPABASE_URL=https://xxxxx.supabase.co"
Environment="SUPABASE_KEY=eyJhbGci..."
Environment="OLLAMA_URL=http://localhost:11434"
Environment="API_KEY=your-key-here"
Environment="PORT=3101"
ExecStart=/usr/bin/node server.mjs
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
```

**Enable and start:**
```bash
sudo systemctl daemon-reload
sudo systemctl enable open-brain
sudo systemctl start open-brain
sudo systemctl status open-brain
```

**View logs:**
```bash
sudo journalctl -u open-brain -f
```

### Security Hardening

**1. Rotate API Keys Monthly**

```bash
# Generate new key
node generate-keys.mjs

# Update server .env
# Update all clients (Perplexity, proxy-server.js)
# Restart server
```

**2. Enable Supabase RLS (Multi-user)**

```sql
-- Enable Row Level Security
ALTER TABLE thoughts ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see their own thoughts
CREATE POLICY "Users can view own thoughts"
ON thoughts FOR SELECT
USING (auth.uid() = user_id);

-- Add user_id column
ALTER TABLE thoughts ADD COLUMN user_id UUID REFERENCES auth.users(id);
```

**3. Rate Limiting**

Add to server.mjs:

```javascript
import rateLimit from 'express-rate-limit';

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});

app.use('/mcp', authenticate, limiter, async (req, res) => {
  // ... existing code
});
```

**4. HTTPS Only (Remove HTTP)**

Force HTTPS in server:

```javascript
app.use((req, res, next) => {
  if (req.headers['x-forwarded-proto'] !== 'https' && process.env.NODE_ENV === 'production') {
    return res.redirect('https://' + req.headers.host + req.url);
  }
  next();
});
```

**5. Monitor Logs**

**Cloudflare:**
- Dashboard → Analytics → Security Events
- Watch for unusual patterns

**Server:**
```bash
# Windows
Get-Content C:\path\to\server.log -Wait

# Linux
tail -f /var/log/open-brain/server.log
```

### Backup Strategy

**1. Supabase Automated Backups**

Free tier: Daily backups (7 day retention)  
Paid tier: Point-in-time recovery

**Manual backup:**
1. Dashboard → Database → Backups
2. Click "Create backup"

**2. Export Thoughts to JSON**

Create backup script `backup.sh`:

```bash
#!/bin/bash
curl http://localhost:3101/mcp?key=$API_KEY \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"browse_thoughts","arguments":{"limit":999999}},"id":1}' \
  > backup-$(date +%Y%m%d).json
```

**Schedule with cron:**
```bash
crontab -e
# Add: Daily at 2 AM
0 2 * * * /path/to/backup.sh
```

**3. Configuration Backup**

```bash
# Backup all configs
tar -czf ob1-config-backup.tar.gz \
  .env \
  ~/.cloudflared/config.yml \
  %APPDATA%\Claude\claude_desktop_config.json
```

### Monitoring

**1. Health Check Script**

Create `healthcheck.sh`:

```bash
#!/bin/bash
HEALTH=$(curl -s http://localhost:3101/health | jq -r '.status')
if [ "$HEALTH" != "ok" ]; then
  echo "Server unhealthy!" | mail -s "Open Brain Alert" you@example.com
  systemctl restart open-brain
fi
```

**Run every 5 minutes:**
```bash
*/5 * * * * /path/to/healthcheck.sh
```

**2. Stats Dashboard**

Query Supabase for analytics:

```sql
-- Thoughts per day
SELECT 
  DATE(created_at) as date,
  COUNT(*) as count
FROM thoughts
WHERE created_at > NOW() - INTERVAL '30 days'
GROUP BY DATE(created_at)
ORDER BY date DESC;

-- By type
SELECT type, COUNT(*) as count
FROM thoughts
GROUP BY type
ORDER BY count DESC;

-- Recent activity
SELECT 
  DATE_TRUNC('hour', created_at) as hour,
  COUNT(*) as count
FROM thoughts
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY hour
ORDER BY hour DESC;
```

**3. Performance Metrics**

Add to server.mjs:

```javascript
let requestCount = 0;
let totalLatency = 0;

app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const latency = Date.now() - start;
    requestCount++;
    totalLatency += latency;
    console.log(`[Metrics] Requests: ${requestCount}, Avg latency: ${(totalLatency/requestCount).toFixed(2)}ms`);
  });
  next();
});
```

---

## Performance Optimization

### Ollama GPU Acceleration

**Windows (NVIDIA):**
Ollama auto-detects GPU. Verify:
```bash
ollama ps
```

Should show GPU usage.

**Linux (NVIDIA):**
```bash
# Install CUDA toolkit
sudo apt install nvidia-cuda-toolkit

# Verify
nvidia-smi

# Ollama will auto-use GPU
ollama run nomic-embed-text
```

**Performance gain:**
- CPU: 2-3 seconds per embedding
- GPU: 200-500ms per embedding

### Supabase Optimization

**Index tuning:**

```sql
-- For large datasets (>10,000 thoughts)
DROP INDEX thoughts_embedding_idx;
CREATE INDEX thoughts_embedding_idx ON thoughts 
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 200);  -- Increased from 100

VACUUM ANALYZE thoughts;
```

**Connection pooling:**

Edit server.mjs:

```javascript
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  db: {
    pool: {
      max: 20,
      idleTimeoutMillis: 30000
    }
  }
});
```

### Concurrent Requests

Current server: ~10 concurrent clients

**For higher load:**

1. **Enable clustering:**

```javascript
import cluster from 'cluster';
import os from 'os';

if (cluster.isPrimary) {
  const numCPUs = os.cpus().length;
  for (let i = 0; i < numCPUs; i++) {
    cluster.fork();
  }
} else {
  // Your server code here
  app.listen(PORT, () => {
    console.log(`Worker ${process.pid} started`);
  });
}
```

2. **Load balancer:**

```bash
npm install -g pm2
pm2 start server.mjs -i max
```

---

## Next Steps

After completing this guide:

- [ ] Server running and tested locally
- [ ] Supabase configured with test data
- [ ] Cloudflare tunnel operational (if using Perplexity)
- [ ] Perplexity Comet connected and tested
- [ ] Claude Desktop connected and tested
- [ ] Configured as system service
- [ ] Backups configured
- [ ] Monitoring enabled

**Recommended Workflow:**
1. Use Perplexity for research → auto-captures findings
2. Use Claude Desktop for writing/coding → references past context
3. Both platforms share same semantic memory
4. Search works across all captured thoughts

**Questions?** Check troubleshooting section or open GitHub issue.

---

**END OF DEPLOYMENT GUIDE**
