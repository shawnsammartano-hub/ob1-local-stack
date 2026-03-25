#!/usr/bin/env node

/**
 * Open Brain MCP Server
 * Based on OB1 architecture by Nate B. Jones
 * Multi-transport MCP server with Ollama embeddings and Supabase vector storage
 */

import 'dotenv/config';
import express from 'express';
import { createClient } from '@supabase/supabase-js';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { 
  CallToolRequestSchema,
  ListToolsRequestSchema 
} from '@modelcontextprotocol/sdk/types.js';

// Configuration - Load from environment variables
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://your-project.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_KEY || 'your-supabase-anon-key';
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const API_KEY = process.env.API_KEY || 'your-api-key-here';
const PORT = process.env.PORT || 3101;

// Initialize Supabase client
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const app = express();
app.use(express.json());

// Health check endpoint (no auth required)
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    tools: ['capture_thought', 'search_thoughts', 'browse_thoughts', 'stats'],
    transports: ['sse', 'streamable-http'],
    timestamp: new Date().toISOString()
  });
});

// Authentication middleware
function authenticate(req, res, next) {
  const queryKey = req.query.key;
  const headerKey = req.headers['x-api-key'] || req.headers['x-brain-key'];
  const bearerToken = req.headers.authorization?.replace('Bearer ', '');
  
  const providedKey = queryKey || headerKey || bearerToken;
  
  if (providedKey === API_KEY) {
    next();
  } else {
    res.status(401).json({ error: 'Unauthorized' });
  }
}

// Ollama embedding function
async function getEmbedding(text) {
  try {
    const response = await fetch(`${OLLAMA_URL}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'nomic-embed-text',
        prompt: text
      })
    });
    
    if (!response.ok) {
      throw new Error(`Ollama error: ${response.status}`);
    }
    
    const data = await response.json();
    return data.embedding;
  } catch (error) {
    console.error('Ollama embedding error:', error);
    throw error;
  }
}

// Classify thought type
function classifyThought(content) {
  const lower = content.toLowerCase();
  
  if (lower.match(/\b(todo|task|need to|should|must|action item|reminder)\b/)) {
    return 'action_item';
  }
  if (lower.match(/\b(decided|decision|chose|will|going to|committed)\b/)) {
    return 'decision';
  }
  if (lower.match(/\b(idea|what if|maybe|could|potential|concept)\b/)) {
    return 'idea';
  }
  if (lower.match(/\b(learned|realized|insight|understanding|discovered)\b/)) {
    return 'insight';
  }
  
  return 'note';
}

// Tool implementations
const tools = [
  {
    name: 'capture_thought',
    description: 'Save a thought, note, decision, idea, or action item to your Open Brain',
    inputSchema: {
      type: 'object',
      properties: {
        content: {
          type: 'string',
          description: 'The thought to capture'
        }
      },
      required: ['content']
    }
  },
  {
    name: 'search_thoughts',
    description: 'Semantically search your Open Brain',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query'
        },
        threshold: {
          type: 'number',
          description: 'Similarity threshold (0-1)',
          default: 0.7
        },
        limit: {
          type: 'number',
          description: 'Maximum results',
          default: 10
        }
      },
      required: ['query']
    }
  },
  {
    name: 'browse_thoughts',
    description: 'Browse recent thoughts',
    inputSchema: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'Number of thoughts to retrieve',
          default: 10
        },
        type: {
          type: 'string',
          description: 'Filter by type (action_item, decision, idea, insight, note)',
          enum: ['action_item', 'decision', 'idea', 'insight', 'note']
        }
      }
    }
  },
  {
    name: 'stats',
    description: 'Get Open Brain statistics',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  }
];

// Tool handlers
async function handleCapture(content) {
  console.log('capture_thought called:', content.substring(0, 60));
  
  const type = classifyThought(content);
  console.log('Classified as:', type);
  
  console.log('Calling Ollama embed...');
  const embedding = await getEmbedding(content);
  
  const { data, error } = await supabase
    .from('thoughts')
    .insert({
      content,
      type,
      embedding
    })
    .select()
    .single();
  
  if (error) {
    console.error('Supabase error:', error);
    throw error;
  }
  
  console.log('Saved to Supabase:', data.id);
  
  return {
    content: [{
      type: 'text',
      text: `Captured as ${type}: ${content.substring(0, 100)}${content.length > 100 ? '...' : ''}`
    }]
  };
}

async function handleSearch(query, threshold = 0.7, limit = 10) {
  console.log('search_thoughts called:', query);
  
  const embedding = await getEmbedding(query);
  
  const { data, error } = await supabase.rpc('match_thoughts', {
    query_embedding: embedding,
    match_threshold: threshold,
    match_count: limit
  });
  
  if (error) {
    console.error('Supabase error:', error);
    throw error;
  }
  
  if (!data || data.length === 0) {
    return {
      content: [{
        type: 'text',
        text: 'No matching thoughts found.'
      }]
    };
  }
  
  const results = data.map(t => 
    `[${t.type}] ${t.content} (similarity: ${(t.similarity * 100).toFixed(1)}%)`
  ).join('\n\n');
  
  return {
    content: [{
      type: 'text',
      text: `Found ${data.length} thought(s):\n\n${results}`
    }]
  };
}

async function handleBrowse(limit = 10, type = null) {
  console.log('browse_thoughts called, limit:', limit, 'type:', type);
  
  let query = supabase
    .from('thoughts')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  
  if (type) {
    query = query.eq('type', type);
  }
  
  const { data, error } = await query;
  
  if (error) {
    console.error('Supabase error:', error);
    throw error;
  }
  
  if (!data || data.length === 0) {
    return {
      content: [{
        type: 'text',
        text: 'No thoughts found.'
      }]
    };
  }
  
  const results = data.map(t => 
    `[${t.type}] ${t.content}\n   Created: ${new Date(t.created_at).toLocaleString()}`
  ).join('\n\n');
  
  return {
    content: [{
      type: 'text',
      text: `Recent thoughts:\n\n${results}`
    }]
  };
}

async function handleStats() {
  console.log('stats called');
  
  const { count: total, error: countError } = await supabase
    .from('thoughts')
    .select('*', { count: 'exact', head: true });
  
  if (countError) {
    console.error('Supabase error:', countError);
    throw countError;
  }
  
  const { data: typeData, error: typeError } = await supabase
    .from('thoughts')
    .select('type');
  
  if (typeError) {
    console.error('Supabase error:', typeError);
    throw typeError;
  }
  
  const typeCounts = typeData.reduce((acc, t) => {
    acc[t.type] = (acc[t.type] || 0) + 1;
    return acc;
  }, {});
  
  const stats = `Total thoughts: ${total}\n\nBy type:\n${
    Object.entries(typeCounts)
      .map(([type, count]) => `  ${type}: ${count}`)
      .join('\n')
  }`;
  
  return {
    content: [{
      type: 'text',
      text: stats
    }]
  };
}

// Streamable HTTP endpoint
app.all('/mcp', authenticate, async (req, res) => {
  console.log('🔧 MCP POST request (Streamable HTTP)');
  
  try {
    const request = req.body;
    
    if (request.method === 'tools/list') {
      res.json({
        jsonrpc: '2.0',
        id: request.id,
        result: { tools }
      });
      return;
    }
    
    if (request.method === 'tools/call') {
      const { name, arguments: args } = request.params;
      let result;
      
      switch (name) {
        case 'capture_thought':
          result = await handleCapture(args.content);
          break;
        case 'search_thoughts':
          result = await handleSearch(args.query, args.threshold, args.limit);
          break;
        case 'browse_thoughts':
          result = await handleBrowse(args.limit, args.type);
          break;
        case 'stats':
          result = await handleStats();
          break;
        default:
          throw new Error(`Unknown tool: ${name}`);
      }
      
      res.json({
        jsonrpc: '2.0',
        id: request.id,
        result
      });
      return;
    }
    
    res.status(400).json({
      jsonrpc: '2.0',
      id: request.id,
      error: { code: -32601, message: 'Method not found' }
    });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({
      jsonrpc: '2.0',
      id: req.body.id,
      error: { code: -32603, message: error.message }
    });
  }
});

// SSE endpoint
app.all('/sse', authenticate, async (req, res) => {
  console.log('🔧 SSE request');
  
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  
  const mcpServer = new Server(
    {
      name: 'open-brain',
      version: '1.0.0'
    },
    {
      capabilities: { tools: {} }
    }
  );
  
  mcpServer.setRequestHandler(ListToolsRequestSchema, async () => {
    return { tools };
  });
  
  mcpServer.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    
    switch (name) {
      case 'capture_thought':
        return await handleCapture(args.content);
      case 'search_thoughts':
        return await handleSearch(args.query, args.threshold, args.limit);
      case 'browse_thoughts':
        return await handleBrowse(args.limit, args.type);
      case 'stats':
        return await handleStats();
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  });
  
  const transport = new SSEServerTransport('/sse', res);
  await mcpServer.connect(transport);
  
  req.on('close', () => {
    console.log('SSE connection closed');
  });
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`
🧠 OB1 MCP Server
   Health:      http://localhost:${PORT}/health
   SSE:         http://localhost:${PORT}/sse?key=...
   Streamable:  http://localhost:${PORT}/mcp?key=...
   Ollama:      ${OLLAMA_URL}
   Port:        ${PORT}
  `);
});
