#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { 
  ListToolsRequestSchema, 
  CallToolRequestSchema 
} from '@modelcontextprotocol/sdk/types.js';
import fetch from 'node-fetch';

// CONFIGURATION - Replace with your actual values
const REMOTE_URL = 'https://your-openbrain-domain.com/mcp';
const API_KEY = 'your-api-key-here';

console.error('[Proxy] Starting Open Brain MCP Proxy...');
console.error('[Proxy] Remote URL configured, API key loaded');

const server = new Server(
  {
    name: 'open-brain-proxy',
    version: '1.0.0'
  },
  {
    capabilities: {
      tools: {}
    }
  }
);

// Handle tool listing
server.setRequestHandler(ListToolsRequestSchema, async () => {
  console.error('[Proxy] Forwarding tools/list request');
  
  try {
    const response = await fetch(`${REMOTE_URL}?key=${API_KEY}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream'
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'tools/list',
        params: {},
        id: 1
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const contentType = response.headers.get('content-type');
    let result;
    
    if (contentType?.includes('text/event-stream')) {
      const text = await response.text();
      const lines = text.split('\n');
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = JSON.parse(line.substring(6));
          result = data.result;
          break;
        }
      }
    } else {
      const data = await response.json();
      result = data.result;
    }
    
    console.error(`[Proxy] Received ${result.tools.length} tools`);
    return result;
  } catch (error) {
    console.error(`[Proxy] Error: ${error.message}`);
    throw error;
  }
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  console.error(`[Proxy] Forwarding tool call: ${request.params.name}`);
  
  try {
    const response = await fetch(`${REMOTE_URL}?key=${API_KEY}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream'
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'tools/call',
        params: request.params,
        id: 1
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const contentType = response.headers.get('content-type');
    let result;
    
    if (contentType?.includes('text/event-stream')) {
      const text = await response.text();
      const lines = text.split('\n');
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = JSON.parse(line.substring(6));
          result = data.result;
          break;
        }
      }
    } else {
      const data = await response.json();
      result = data.result;
    }
    
    console.error(`[Proxy] Tool call successful`);
    return result;
  } catch (error) {
    console.error(`[Proxy] Error: ${error.message}`);
    throw error;
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);

console.error('[Proxy] Connected and ready');
