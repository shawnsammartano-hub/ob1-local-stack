#!/usr/bin/env node

/**
 * Generate secure API keys for Open Brain MCP Server
 * Creates cryptographically secure random keys
 */

import crypto from 'crypto';

function generateApiKey(length = 64) {
  return crypto.randomBytes(length).toString('hex');
}

console.log('\n🔑 Open Brain API Key Generator\n');
console.log('Generated API Key:');
console.log('─'.repeat(80));
console.log(generateApiKey(32)); // 64 hex characters
console.log('─'.repeat(80));
console.log('\n💡 Add this to your .env file as API_KEY=<key>\n');
console.log('⚠️  NEVER commit this key to Git!');
console.log('⚠️  Keep it secure and rotate regularly.\n');
