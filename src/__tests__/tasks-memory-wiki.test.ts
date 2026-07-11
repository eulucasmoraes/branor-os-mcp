import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { allTools } from '../tools/index.js';
import { taskTools, getTask } from '../tools/tasks.js';
import { memoryTools, memorySearch } from '../tools/memory.js';
import { wikiTools, wikiSearch } from '../tools/wiki.js';
import { BranorOsClient } from '../client/http.js';
import { createEndpoints } from '../client/endpoints.js';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('tasks/memory/wiki tools registry', () => {
  it('registers all 9 tools (4 tasks + 2 memory + 3 wiki) in the global registry', () => {
    const names = new Set([...taskTools, ...memoryTools, ...wikiTools].map((t) => t.name));
    expect(names.size).toBe(9);
    for (const name of names) {
      expect(allTools.some((t) => t.name === name)).toBe(true);
    }
  });
});

describe('tasks/memory/wiki tools build the right request', () => {
  it('get_task builds GET /workspaces/{ws}/spaces/{spaceId}/lists/{listId}/tasks/{id}', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { id: 't_1' }));
    const client = new BranorOsClient(
      { apiBaseUrl: 'http://api.test', apiPrefix: '/api/v1', apiKey: 'ak_test' },
      fetchMock as unknown as typeof fetch,
    );
    const endpoints = createEndpoints(client, { workspaceId: 'ws_pub_1' });

    const schema = z.object(getTask.inputSchema);
    const parsed = schema.parse({ spaceId: 'sp_1', listId: 'ls_1', taskId: 'tk_1' });
    const result = await getTask.handler(parsed, endpoints);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      'http://api.test/api/v1/workspaces/ws_pub_1/spaces/sp_1/lists/ls_1/tasks/tk_1',
    );
    expect(init.method).toBe('GET');
    expect(result).toEqual({ id: 't_1' });
  });

  it('memory_search builds POST /workspaces/{ws}/memories/search with the query body', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { items: [] }));
    const client = new BranorOsClient(
      { apiBaseUrl: 'http://api.test', apiPrefix: '/api/v1', apiKey: 'ak_test' },
      fetchMock as unknown as typeof fetch,
    );
    const endpoints = createEndpoints(client, { workspaceId: 'ws_pub_1' });

    const schema = z.object(memorySearch.inputSchema);
    const parsed = schema.parse({ query: 'meta budget rule', topK: 5 });
    await memorySearch.handler(parsed, endpoints);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://api.test/api/v1/workspaces/ws_pub_1/memories/search');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({
      query: 'meta budget rule',
      clientSlug: undefined,
      agentId: undefined,
      topK: 5,
    });
  });

  it('wiki_search builds POST /workspaces/{ws}/wikis/{wikiId}/search with the query body', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { results: [] }));
    const client = new BranorOsClient(
      { apiBaseUrl: 'http://api.test', apiPrefix: '/api/v1', apiKey: 'ak_test' },
      fetchMock as unknown as typeof fetch,
    );
    const endpoints = createEndpoints(client, { workspaceId: 'ws_pub_1' });

    const schema = z.object(wikiSearch.inputSchema);
    const parsed = schema.parse({ wikiId: 'wk_1', query: 'realtime cache' });
    await wikiSearch.handler(parsed, endpoints);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://api.test/api/v1/workspaces/ws_pub_1/wikis/wk_1/search');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({
      query: 'realtime cache',
      tags: undefined,
      pathPrefix: undefined,
      kind: undefined,
      topK: undefined,
    });
  });
});
