import { describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { buildServer } from '../server.js';
import type { ServerConfig } from '../config.js';

const config: ServerConfig = {
  apiBaseUrl: 'http://api.test',
  apiPrefix: '/api/v1',
};

function fetchRecording(recorder: { calls: { url: string; init?: RequestInit }[] }): typeof fetch {
  return (async (input: string | URL, init?: RequestInit) => {
    const url = String(input);
    recorder.calls.push({ url, init });
    return new Response(JSON.stringify({ items: [], limit: 20, page: 1 }), { status: 200 });
  }) as unknown as typeof fetch;
}

async function connectedClient(fetchImpl: typeof fetch, apiKey = 'ak_test_secret') {
  const { server, toolNames } = buildServer(config, apiKey, fetchImpl);
  const client = new Client({ name: 'test-client', version: '0.0.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
  return { client, toolNames };
}

describe('MCP server smoke test', () => {
  it('registers every tool and list_creative_assets appears in the catalog', async () => {
    const recorder = { calls: [] };
    const { client, toolNames } = await connectedClient(fetchRecording(recorder));
    const { tools } = await client.listTools();

    expect(recorder.calls).toHaveLength(0);
    expect(tools.length).toBe(toolNames.length);
    expect(tools.map((t) => t.name)).toContain('list_creative_assets');
  });

  it('injects workspace_public_id as a required input on every tool', async () => {
    const { client } = await connectedClient(fetchRecording({ calls: [] }));
    const { tools } = await client.listTools();
    const tool = tools.find((t) => t.name === 'list_creative_assets')!;

    const props = tool.inputSchema.properties as Record<string, unknown>;
    const required = tool.inputSchema.required as string[];
    expect(props).toHaveProperty('workspace_public_id');
    expect(required).toContain('workspace_public_id');
  });

  it('strips workspace_public_id before it reaches the tool handler, and scopes the call URL to that workspace', async () => {
    const recorder: { calls: { url: string; init?: RequestInit }[] } = { calls: [] };
    const { client } = await connectedClient(fetchRecording(recorder));

    const result = (await client.callTool({
      name: 'list_creative_assets',
      arguments: { workspace_public_id: 'ws_pub_9', type: 'VIDEO' },
    })) as { content: { type: string; text: string }[]; isError?: boolean };

    expect(result.isError).toBeFalsy();
    expect(recorder.calls).toHaveLength(1);
    expect(recorder.calls[0].url).toContain('/workspaces/ws_pub_9/creative-assets');
    expect(recorder.calls[0].url).toContain('type=VIDEO');
    const headers = recorder.calls[0].init?.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer ak_test_secret');

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed).toEqual({ items: [], limit: 20, page: 1 });
  });

  it('surfaces an ApiError from the API verbatim as an isError result', async () => {
    const fetchImpl = (async () =>
      new Response(
        JSON.stringify({
          statusCode: 403,
          error: 'Forbidden',
          message: 'workspace not accessible with this API key',
          timestamp: '2026-07-10T00:00:00Z',
          path: '/x',
        }),
        { status: 403 },
      )) as unknown as typeof fetch;
    const { client } = await connectedClient(fetchImpl);

    const result = (await client.callTool({
      name: 'list_creative_assets',
      arguments: { workspace_public_id: 'ws_pub_9' },
    })) as { content: { type: string; text: string }[]; isError?: boolean };

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('workspace not accessible with this API key');
  });

  it('two concurrent calls scoped to different workspaces do not leak state into each other', async () => {
    const recorder: { calls: { url: string; init?: RequestInit }[] } = { calls: [] };
    const { client } = await connectedClient(fetchRecording(recorder));

    await Promise.all([
      client.callTool({ name: 'list_creative_assets', arguments: { workspace_public_id: 'ws_1' } }),
      client.callTool({ name: 'list_creative_assets', arguments: { workspace_public_id: 'ws_2' } }),
    ]);

    const urls = recorder.calls.map((c) => c.url).sort();
    expect(urls[0]).toContain('/workspaces/ws_1/creative-assets');
    expect(urls[1]).toContain('/workspaces/ws_2/creative-assets');
  });
});
