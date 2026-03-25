# Open Brain: Complete Troubleshooting Guide

**Every bug we encountered during actual deployment and how we fixed it.**

This guide documents real issues from production deployment, not theoretical problems. Each entry includes symptoms, root cause, and exact solution.

---

## Table of Contents

1. [Cloudflare Issues](#cloudflare-issues)
2. [Perplexity Connection Issues](#perplexity-connection-issues)
3. [Server Issues](#server-issues)
4. [Claude Desktop Issues](#claude-desktop-issues)
5. [Database Issues](#database-issues)
6. [Network Issues](#network-issues)

---

## Cloudflare Issues

### Issue 1: 401 Unauthorized from Cloudflare Access

**Symptoms:**
- Perplexity shows "Connection failed"
- `curl` to /mcp endpoint returns 401
- Cloudflare Access login page appears

**Root Cause:**
Domain-wide Cloudflare Access policy evaluating before /mcp Bypass policy.

**What We Learned:**
Cloudflare Access policies are evaluated **top-to-bottom**. If a domain-wide "Allow" or "Deny" policy is listed before a path-specific "Bypass" policy, the domain-wide policy catches the request first.

**Solution:**
1. Go to Zero Trust → Access → Applications
2. Find your `/mcp` path application
3. **Drag it to the TOP** of the list (above any domain-wide policies)
4. Verify `/mcp` policy Action is "Bypass" (not "Allow")

**Test:**
```bash
curl https://your-domain.com/mcp?key=YOUR_KEY \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"tools/list","params":{},"id":1}'
```

Should return tools list, not 401.

---

### Issue 2: FETCHER_NO_STATUS_CODE_ERROR (Perplexity)

**Symptoms:**
- Perplexity integration stuck on "Connecting..."
- Never resolves to connected state
- No error message in Perplexity UI
- Server logs show no incoming requests

**Root Cause:**
Cloudflare Bot Fight Mode or WAF blocking Perplexity's User-Agent (`PerplexityBot/1.0`).

**What We Learned:**
Perplexity's requests come from AWS infrastructure (ASN AS16509) with a specific User-Agent. Cloudflare's security features (Bot Fight Mode, WAF) treat this as a bot and block it silently.

**Solution:**
1. **Disable Bot Fight Mode** (if enabled):
   - Security → Bots → Configure
   - Turn OFF "Bot Fight Mode"

2. **Create WAF bypass rule:**
   - Security → WAF → Custom Rules
   - Create rule: "Perplexity Bot Bypass"
   - Field: `User Agent`
   - Operator: `contains` (NOT equals)
   - Value: `PerplexityBot`
   - Action: `Skip` → Select "All remaining custom rules"

**Why "contains"?**
Perplexity's User-Agent is `PerplexityBot/1.0` - the version number changes. Using "contains" makes it version-agnostic.

**Test with Perplexity's User-Agent:**
```bash
curl -H "User-Agent: PerplexityBot/1.0" \
  https://your-domain.com/health
```

Should return JSON, not be blocked.

---

### Issue 3: Country Requirement Blocking Global Traffic

**Symptoms:**
- Perplexity connection fails intermittently
- Works sometimes, fails other times
- No pattern to failures

**Root Cause:**
Cloudflare Access policy had "Require: Country = United States" rule. Perplexity's infrastructure is global (AWS regions worldwide), so requests from non-US regions were blocked.

**What We Learned:**
Cloud services route traffic through their nearest data center. Requiring a specific country blocks legitimate traffic from distributed infrastructure.

**Solution:**
1. Zero Trust → Access → Applications
2. Edit your `/mcp` Bypass policy
3. **Remove** any "Require" rules, especially Country
4. Keep only "Include: Everyone"

**Test from different regions:**
Use a VPN or proxy to test from different countries - all should work.

---

### Issue 4: Path Configuration - 404 on /mcp

**Symptoms:**
- `/health` endpoint works
- `/mcp` endpoint returns 404
- Server logs show no incoming requests

**Root Cause:**
Cloudflare Access application configured for entire domain, not specific `/mcp` path.

**Solution:**
1. Zero Trust → Access → Applications
2. Edit application
3. **Path** field must be: `/mcp` (not blank, not `/*`)
4. This creates path-specific policy

---

## Perplexity Connection Issues

### Issue 5: API Key in URL Query Parameter

**Symptoms:**
- Perplexity shows "Wrong API key"
- Server logs show 401 Unauthorized
- curl with same URL works fine

**Root Cause:**
Perplexity was configured with API key in URL:
```
https://your-domain.com/mcp?key=YOUR_KEY
```

This doesn't work because Perplexity's MCP client doesn't append the key properly.

**What We Learned:**
Perplexity's MCP integration has two fields:
- **URL** - Just the endpoint (no query params)
- **API Key** - Separate authentication field

When you put the key in the URL field, Perplexity ignores it and sends unauthenticated requests.

**Solution:**
1. Perplexity Settings → Integrations → MCP Servers
2. Edit Open Brain integration
3. **URL:** `https://your-domain.com/mcp` (NO query params)
4. **Authentication:** Select "API Key" from dropdown
5. **API Key field:** Paste your actual key
6. Save

**What happens:**
Perplexity sends the key as `X-API-Key` header, which our server checks.

---

### Issue 6: SSE vs Streamable HTTP Transport

**Symptoms:**
- Perplexity connects but tool calls fail
- Server logs show connection but no requests
- Tools appear grayed out in Perplexity

**Root Cause:**
Perplexity configured to use SSE transport, but our server's SSE implementation had issues with Perplexity's request format.

**What We Learned:**
MCP supports two transports:
- **SSE (Server-Sent Events):** Endpoint at `/sse`, persistent connection
- **Streamable HTTP:** Endpoint at `/mcp`, request-response

Perplexity works more reliably with Streamable HTTP.

**Solution:**
1. Perplexity Settings → Integrations → MCP Servers
2. Edit Open Brain
3. **Transport:** Select "Streamable HTTP" (NOT SSE)
4. **URL:** Must be `/mcp` (NOT `/sse`)
5. Save

---

## Server Issues

### Issue 7: Server Returns 404 "Cannot GET /mcp"

**Symptoms:**
- curl POST to /mcp returns 404
- Error message: "Cannot GET /mcp"
- Server is running, other endpoints work

**Root Cause:**
Server was configured with `app.post('/mcp', ...)` which only accepts POST requests. However, some clients (including our testing) were sending GET requests or OPTIONS preflight requests.

**What We Learned:**
Express route handlers only respond to the specified HTTP method. Using `app.post()` ignores GET, OPTIONS, etc.

**Solution:**
Change `app.post` to `app.all`:

```javascript
// Before (wrong)
app.post('/mcp', authenticate, async (req, res) => { ... });

// After (correct)
app.all('/mcp', authenticate, async (req, res) => { ... });
```

**Why app.all?**
- Handles POST (primary), GET (health checks), OPTIONS (CORS preflight)
- More resilient to different client implementations

**Applied to both endpoints:**
```javascript
app.all('/mcp', authenticate, async (req, res) => { ... });
app.all('/sse', authenticate, async (req, res) => { ... });
```

---

### Issue 8: Accept Header Required

**Symptoms:**
- curl without Accept header fails
- Returns 400 or empty response
- Server logs show request received but no response

**Root Cause:**
MCP Streamable HTTP transport requires specific Accept header to identify transport type.

**Solution:**
Always include Accept header in requests:
```bash
-H "Accept: application/json, text/event-stream"
```

**What this does:**
Tells server client supports both JSON responses and SSE streams.

---

### Issue 9: Environment Variables Not Loading

**Symptoms:**
- Server starts but uses placeholder values
- `console.log(process.env.SUPABASE_URL)` shows undefined
- Error: "ECONNREFUSED" to Supabase

**Root Cause:**
`dotenv` not imported or `.env` file in wrong location.

**Solution:**

**Option 1: Import dotenv (preferred)**

Add to top of `server.mjs`:
```javascript
import 'dotenv/config';
```

**Option 2: Manual environment variables**

Windows PowerShell:
```powershell
$env:SUPABASE_URL="https://xxxxx.supabase.co"
$env:SUPABASE_KEY="eyJhbGci..."
$env:API_KEY="........."
node server.mjs
```

Linux/macOS:
```bash
export SUPABASE_URL="https://xxxxx.supabase.co"
export SUPABASE_KEY="..........."
export API_KEY="........."
node server.mjs
```

**Verify loading:**
```javascript
console.log('Loaded env:', {
  supabase: process.env.SUPABASE_URL?.substring(0, 30) + '...',
  ollama: process.env.OLLAMA_URL,
  port: process.env.PORT
});
```

---

## Claude Desktop Issues

### Issue 10: Hammer Icon Not Appearing

**Symptoms:**
- Claude Desktop opens normally
- No hammer icon in chat input
- No MCP servers visible

**Root Cause:**
Usually one of:
1. Config file has syntax error (invalid JSON)
2. Path to proxy-server.js is wrong
3. Node.js not in PATH
4. Claude Desktop not fully restarted

**Solutions:**

**1. Validate JSON syntax:**
```bash
# Python
python -m json.tool claude_desktop_config.json

# Node.js
node -e "console.log(JSON.parse(require('fs').readFileSync('claude_desktop_config.json')))"
```

**2. Check path:**
Windows requires double backslashes:
```json
"args": ["C:\\Users\\Name\\Documents\\proxy-server.js"]
```

**3. Verify Node.js:**
```bash
where node  # Windows
which node  # Linux/macOS
```

**4. Fully restart Claude:**
- Windows: Task Manager → End Task
- macOS: Cmd+Q (not just close window)

**5. Check logs:**
```
Windows: %APPDATA%\Claude\logs\mcp-server-open-brain.log
macOS: ~/Library/Logs/Claude/mcp-server-open-brain.log
```

---

### Issue 11: "Server Disconnected" Error

**Symptoms:**
- Hammer icon appears
- Tools listed
- Clicking tool shows "Server disconnected"
- Error in Claude Desktop

**Root Cause:**
Proxy can't reach remote server due to:
1. Wrong API key in proxy-server.js
2. Wrong URL in proxy-server.js
3. Server not running
4. Cloudflare tunnel down

**Solutions:**

**1. Test proxy manually:**
```bash
node proxy-server.js
```

Send test JSON (press Enter twice):
```json
{"jsonrpc":"2.0","method":"tools/list","params":{},"id":1}

```

Should return tools list.

**2. Verify credentials in proxy-server.js:**
```javascript
const REMOTE_URL = 'https://your-actual-domain.com/mcp';
const API_KEY = 'your-actual-key-here';
```

**3. Test remote endpoint:**
```bash
curl https://your-domain.com/health
```

Should return JSON.

**4. Check tunnel status:**
```powershell
Get-Service cloudflared  # Windows
sudo systemctl status cloudflared  # Linux
```

---

### Issue 12: Windows Path with Spaces

**Symptoms:**
- Config file has path with spaces
- Hammer icon doesn't appear
- Logs show "Cannot find module"

**Root Cause:**
Windows paths with spaces need proper escaping in JSON.

**Solution:**

**Correct:**
```json
{
  "mcpServers": {
    "open-brain": {
      "command": "node",
      "args": ["C:\\Users\\John Doe\\Documents\\ob1-local-stack\\proxy-server.js"]
    }
  }
}
```

Spaces are fine in JSON strings - just use double backslashes.

**What DOESN'T work:**
- Single backslashes: `C:\Users\...`
- Forward slashes on Windows: `C:/Users/...`
- Quotes around path: `"C:\\Users\\..."`

---

## Database Issues

### Issue 13: "Extension 'vector' Does Not Exist"

**Symptoms:**
- schema.sql fails to run
- Error: `extension "vector" does not exist`
- Supabase shows error in SQL Editor

**Root Cause:**
pgvector extension not enabled in Supabase project.

**Solution:**
1. Supabase Dashboard → Database → Extensions
2. Search: `vector`
3. Click **Enable** next to `vector`
4. Wait for confirmation
5. Re-run schema.sql

**Verify:**
```sql
SELECT * FROM pg_extension WHERE extname = 'vector';
```

Should return one row.

---

### Issue 14: Slow Similarity Search (>5 seconds)

**Symptoms:**
- `search_thoughts` tool takes >5 seconds
- Small dataset (<1000 records)
- Supabase shows high query time

**Root Cause:**
IVFFlat index requires ~1000 vectors minimum to build. Below that, it does sequential scan.

**What We Learned:**
pgvector's IVFFlat index needs sufficient data to partition effectively. With <1000 records, Postgres ignores the index and scans every record.

**Solution:**

**For <1000 records (accept slower speed):**
Sequential scan is normal. 1-2 second searches are expected.

**For >1000 records (optimize index):**
```sql
-- Drop and recreate with more lists
DROP INDEX thoughts_embedding_idx;
CREATE INDEX thoughts_embedding_idx ON thoughts 
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 200);  -- Increase from default 100

-- Rebuild stats
VACUUM ANALYZE thoughts;
```

**Verify index usage:**
```sql
EXPLAIN ANALYZE
SELECT * FROM match_thoughts(
  '[0.1, 0.2, ...]'::vector,
  0.7,
  10
);
```

Look for "Index Scan using thoughts_embedding_idx" in output.

---

## Network Issues

### Issue 15: Port 3101 Already in Use

**Symptoms:**
- Server won't start
- Error: `EADDRINUSE: address already in use :::3101`

**Root Cause:**
Another process using port 3101, or previous server instance still running.

**Solution:**

**Windows:**
```powershell
# Find process
netstat -ano | findstr :3101

# Kill process (replace PID)
taskkill /PID <PID> /F
```

**Linux/macOS:**
```bash
# Find process
lsof -i :3101

# Kill process
kill -9 <PID>
```

**Or change port in .env:**
```env
PORT=3102
```

---

### Issue 16: Ollama Not Accessible

**Symptoms:**
- Server starts but capture_thought fails
- Error: `ECONNREFUSED` to Ollama
- `fetch` to localhost:11434 fails

**Root Cause:**
Ollama service not running or listening on different interface.

**Solutions:**

**1. Check Ollama status:**

Windows:
```powershell
Get-Service Ollama
```

Linux:
```bash
sudo systemctl status ollama
```

macOS:
Check if Ollama app is running in menu bar.

**2. Test Ollama:**
```bash
curl http://localhost:11434
```

Should return: `Ollama is running`

**3. Check Ollama binding:**
Ollama might be bound to 127.0.0.1 only. Try both:
```bash
curl http://127.0.0.1:11434
curl http://localhost:11434
```

**4. Restart Ollama:**

Windows:
```powershell
Restart-Service Ollama
```

Linux:
```bash
sudo systemctl restart ollama
```

macOS:
Quit and reopen Ollama app.

---

### Issue 17: Firewall Blocking Connections

**Symptoms:**
- Server works on localhost
- Cloudflare tunnel can't connect
- Remote connections fail

**Root Cause:**
Windows Firewall or antivirus blocking Node.js.

**Solution:**

**Windows Firewall:**
1. Windows Security → Firewall & network protection
2. Allow an app through firewall
3. Click "Change settings"
4. Find "Node.js"
5. Check both Private and Public
6. If not listed, click "Allow another app" → Browse to Node.js

**Create manual rule:**
```powershell
New-NetFirewallRule -DisplayName "Open Brain Server" -Direction Inbound -LocalPort 3101 -Protocol TCP -Action Allow
```

**Test:**
```powershell
Test-NetConnection -ComputerName localhost -Port 3101
```

---

## Debugging Tools

### Server Debug Mode

Add to server.mjs:
```javascript
// After imports
const DEBUG = process.env.DEBUG === 'true';

function debug(...args) {
  if (DEBUG) console.log('[DEBUG]', ...args);
}

// Use in code
debug('Request received:', req.method, req.url);
debug('Headers:', req.headers);
debug('Body:', req.body);
```

**Run with debug:**
```bash
DEBUG=true node server.mjs
```

### Request Tracing

Add request ID tracking:
```javascript
import crypto from 'crypto';

app.use((req, res, next) => {
  req.id = crypto.randomBytes(4).toString('hex');
  console.log(`[${req.id}] ${req.method} ${req.url}`);
  next();
});
```

### Log MCP Protocol

```javascript
app.all('/mcp', authenticate, async (req, res) => {
  console.log('📥 MCP Request:', JSON.stringify(req.body, null, 2));
  
  // ... process request ...
  
  console.log('📤 MCP Response:', JSON.stringify(result, null, 2));
  res.json(result);
});
```

### Check Cloudflare Logs

1. Cloudflare Dashboard
2. Analytics → Traffic
3. Filter by your domain
4. Look for 401, 403, 404 errors

---

## Common Gotchas

### JSON-RPC ID Mismatch

**Wrong:**
```javascript
// Server returns different ID than request
req.body.id = 1;  // Request has id=1
res.json({ jsonrpc: '2.0', id: 2, result: ... });  // Returns id=2
```

**Correct:**
```javascript
const requestId = req.body.id;
res.json({ jsonrpc: '2.0', id: requestId, result: ... });
```

### Case-Sensitive Headers

HTTP headers are case-insensitive in spec, but Express lowercases them:

```javascript
// Wrong
const key = req.headers['X-API-Key'];

// Correct
const key = req.headers['x-api-key'];
```

### Embedding Dimension Mismatch

```sql
-- If you change embedding model, update table
ALTER TABLE thoughts ALTER COLUMN embedding TYPE vector(768);  -- nomic-embed-text
```

Different models have different dimensions:
- nomic-embed-text: 768
- text-embedding-ada-002: 1536
- all-MiniLM-L6-v2: 384

---

## Getting Help

**Before opening an issue:**

1. ✅ Check this troubleshooting guide
2. ✅ Review relevant deployment section
3. ✅ Test each component individually
4. ✅ Collect logs from all components

**What to include in issue:**

```markdown
**Problem:** Brief description

**Environment:**
- OS: Windows 11 / Ubuntu 22.04 / macOS 14
- Node.js version: 
- Component: Server / Tunnel / Perplexity / Claude

**Steps to reproduce:**
1. ...
2. ...

**Logs:**
```
[paste relevant logs]
```

**What I tried:**
- ...
```

**Common solutions to try first:**
1. Restart all services
2. Regenerate API key and update everywhere
3. Verify Cloudflare Access policy order
4. Check all credentials match

---

**END OF TROUBLESHOOTING GUIDE**
