#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { loadConfigFromEnv, loadApiKeyFromEnv } from './config.js';
import { buildServer } from './server.js';

async function main() {
  const config = loadConfigFromEnv();
  const apiKey = loadApiKeyFromEnv();
  const { server, toolNames } = buildServer(config, apiKey);

  console.error(`branor-os-mcp: exposing ${toolNames.length} tool(s): ${toolNames.join(', ')}`);

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error('branor-os-mcp failed to start:', err);
  process.exit(1);
});
