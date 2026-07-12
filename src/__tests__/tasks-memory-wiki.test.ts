import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { allTools } from '../tools/index.js';
import { taskTools, getTask } from '../tools/tasks.js';
import {
  memoryTools,
  memorySearch,
  memoryBootstrap,
  memoryAdd,
  memoryUpdate,
  memoryConsolidate,
  memoryLinkAdd,
  memoryLinksList,
  memoryLinkDelete,
  memoryList,
} from '../tools/memory.js';
import {
  wikiTools,
  wikiSearch,
  wikiNodeWrite,
  wikiList,
  wikiTree,
  wikiNodeDelete,
  wikiGraph,
} from '../tools/wiki.js';
import { BranorOsClient } from '../client/http.js';
import { createEndpoints } from '../client/endpoints.js';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('tasks/memory/wiki tools registry', () => {
  it('registers all 23 tools (4 tasks + 12 memory + 7 wiki) in the global registry', () => {
    const names = new Set([...taskTools, ...memoryTools, ...wikiTools].map((t) => t.name));
    expect(names.size).toBe(23);
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
      sessionId: undefined,
      projectSlug: undefined,
      topK: 5,
    });
  });

  it('memory_search forwards sessionId/projectSlug in the request body', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { items: [] }));
    const client = new BranorOsClient(
      { apiBaseUrl: 'http://api.test', apiPrefix: '/api/v1', apiKey: 'ak_test' },
      fetchMock as unknown as typeof fetch,
    );
    const endpoints = createEndpoints(client, { workspaceId: 'ws_pub_1' });

    const schema = z.object(memorySearch.inputSchema);
    const parsed = schema.parse({
      query: 'meta budget rule',
      sessionId: 'sess-1',
      projectSlug: 'proj-1',
    });
    await memorySearch.handler(parsed, endpoints);

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual(
      expect.objectContaining({
        sessionId: 'sess-1',
        projectSlug: 'proj-1',
      }),
    );
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

  it('memory_add builds POST /workspaces/{ws}/memories with new fields (retrieval/slug/eventDate/metadata)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(201, { publicId: 'mem_1' }));
    const client = new BranorOsClient(
      { apiBaseUrl: 'http://api.test', apiPrefix: '/api/v1', apiKey: 'ak_test' },
      fetchMock as unknown as typeof fetch,
    );
    const endpoints = createEndpoints(client, { workspaceId: 'ws_pub_1' });

    const schema = z.object(memoryAdd.inputSchema);
    const parsed = schema.parse({
      scope: 'CLIENT',
      memoryType: 'FACT',
      content: 'FACT: cliente prefere reunião às sextas',
      sourceType: 'MANUAL',
      slug: 'cliente-x-reuniao-sexta',
      eventDate: '2026-07-01T00:00:00.000Z',
      metadata: { origem: 'call' },
      retrieval: {
        exactSearchKeys: ['reuniao'],
        priority: 'high',
      },
    });
    await memoryAdd.handler(parsed, endpoints);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://api.test/api/v1/workspaces/ws_pub_1/memories');
    expect(init.method).toBe('POST');
    const body = JSON.parse(init.body as string);
    expect(body.slug).toBe('cliente-x-reuniao-sexta');
    expect(body.eventDate).toBe('2026-07-01T00:00:00.000Z');
    expect(body.metadata).toEqual({ origem: 'call' });
    expect(body.retrieval).toEqual({ exactSearchKeys: ['reuniao'], priority: 'high' });
  });

  it('memory_update builds PATCH /workspaces/{ws}/memories/{id} with isActive/confidence/retrieval', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { publicId: 'mem_1' }));
    const client = new BranorOsClient(
      { apiBaseUrl: 'http://api.test', apiPrefix: '/api/v1', apiKey: 'ak_test' },
      fetchMock as unknown as typeof fetch,
    );
    const endpoints = createEndpoints(client, { workspaceId: 'ws_pub_1' });

    const schema = z.object(memoryUpdate.inputSchema);
    const parsed = schema.parse({
      id: 'mem_1',
      isActive: true,
      confidence: 'SYNTHETIC',
      retrieval: { priority: 'low' },
    });
    await memoryUpdate.handler(parsed, endpoints);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://api.test/api/v1/workspaces/ws_pub_1/memories/mem_1');
    expect(init.method).toBe('PATCH');
    const body = JSON.parse(init.body as string);
    expect(body.isActive).toBe(true);
    expect(body.confidence).toBe('SYNTHETIC');
    expect(body.retrieval).toEqual({ priority: 'low' });
  });

  it('memory_consolidate builds POST /workspaces/{ws}/memories/consolidate', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(202, { accepted: true }));
    const client = new BranorOsClient(
      { apiBaseUrl: 'http://api.test', apiPrefix: '/api/v1', apiKey: 'ak_test' },
      fetchMock as unknown as typeof fetch,
    );
    const endpoints = createEndpoints(client, { workspaceId: 'ws_pub_1' });

    const schema = z.object(memoryConsolidate.inputSchema);
    const parsed = schema.parse({ material: 'transcript...', sessionId: 'sess_1' });
    await memoryConsolidate.handler(parsed, endpoints);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://api.test/api/v1/workspaces/ws_pub_1/memories/consolidate');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({
      material: 'transcript...',
      sessionId: 'sess_1',
      agentId: undefined,
      clientSlug: undefined,
    });
  });

  it('memory_link_add builds POST /workspaces/{ws}/memories/{id}/links', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(201, { id: 'link_1' }));
    const client = new BranorOsClient(
      { apiBaseUrl: 'http://api.test', apiPrefix: '/api/v1', apiKey: 'ak_test' },
      fetchMock as unknown as typeof fetch,
    );
    const endpoints = createEndpoints(client, { workspaceId: 'ws_pub_1' });

    const schema = z.object(memoryLinkAdd.inputSchema);
    const parsed = schema.parse({
      id: 'mem_1',
      targetType: 'MEMORY',
      targetMemoryId: 'mem_2',
      linkType: 'SUPERSEDES',
    });
    await memoryLinkAdd.handler(parsed, endpoints);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://api.test/api/v1/workspaces/ws_pub_1/memories/mem_1/links');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({
      targetType: 'MEMORY',
      targetMemoryId: 'mem_2',
      targetNodeId: undefined,
      targetRef: undefined,
      linkType: 'SUPERSEDES',
      reason: undefined,
    });
  });

  it('memory_links_list builds GET /workspaces/{ws}/memories/{id}/links', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { items: [] }));
    const client = new BranorOsClient(
      { apiBaseUrl: 'http://api.test', apiPrefix: '/api/v1', apiKey: 'ak_test' },
      fetchMock as unknown as typeof fetch,
    );
    const endpoints = createEndpoints(client, { workspaceId: 'ws_pub_1' });

    const schema = z.object(memoryLinksList.inputSchema);
    const parsed = schema.parse({ id: 'mem_1' });
    await memoryLinksList.handler(parsed, endpoints);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://api.test/api/v1/workspaces/ws_pub_1/memories/mem_1/links');
    expect(init.method).toBe('GET');
  });

  it('memory_link_delete builds DELETE /workspaces/{ws}/memories/links/{linkId}', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { ok: true }));
    const client = new BranorOsClient(
      { apiBaseUrl: 'http://api.test', apiPrefix: '/api/v1', apiKey: 'ak_test' },
      fetchMock as unknown as typeof fetch,
    );
    const endpoints = createEndpoints(client, { workspaceId: 'ws_pub_1' });

    const schema = z.object(memoryLinkDelete.inputSchema);
    const parsed = schema.parse({ linkId: 'link_1' });
    await memoryLinkDelete.handler(parsed, endpoints);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://api.test/api/v1/workspaces/ws_pub_1/memories/links/link_1');
    expect(init.method).toBe('DELETE');
  });

  it('memory_list builds GET /workspaces/{ws}/memories with query', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { items: [] }));
    const client = new BranorOsClient(
      { apiBaseUrl: 'http://api.test', apiPrefix: '/api/v1', apiKey: 'ak_test' },
      fetchMock as unknown as typeof fetch,
    );
    const endpoints = createEndpoints(client, { workspaceId: 'ws_pub_1' });

    const schema = z.object(memoryList.inputSchema);
    const parsed = schema.parse({ clientSlug: 'acme' });
    await memoryList.handler(parsed, endpoints);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://api.test/api/v1/workspaces/ws_pub_1/memories?clientSlug=acme');
    expect(init.method).toBe('GET');
  });

  it('memory_list accepts agentId only as a uuid', () => {
    const schema = z.object(memoryList.inputSchema);
    expect(() => schema.parse({ agentId: 'not-a-uuid' })).toThrow();
    expect(() =>
      schema.parse({ agentId: '11111111-1111-1111-1111-111111111111' }),
    ).not.toThrow();
  });

  it('memory_list builds GET with memoryType/scope/visibility/limit/cursor query params', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(200, { items: [], nextCursor: null, hasMore: false }),
    );
    const client = new BranorOsClient(
      { apiBaseUrl: 'http://api.test', apiPrefix: '/api/v1', apiKey: 'ak_test' },
      fetchMock as unknown as typeof fetch,
    );
    const endpoints = createEndpoints(client, { workspaceId: 'ws_pub_1' });

    const schema = z.object(memoryList.inputSchema);
    const parsed = schema.parse({
      memoryType: ['FACT', 'DECISION'],
      scope: 'CLIENT',
      visibility: 'WORKSPACE',
      limit: 25,
      cursor: 'opaque-cursor',
    });
    await memoryList.handler(parsed, endpoints);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const parsedUrl = new URL(url);
    expect(parsedUrl.pathname).toBe(
      '/api/v1/workspaces/ws_pub_1/memories',
    );
    expect(parsedUrl.searchParams.get('memoryType')).toBe('FACT,DECISION');
    expect(parsedUrl.searchParams.get('scope')).toBe('CLIENT');
    expect(parsedUrl.searchParams.get('visibility')).toBe('WORKSPACE');
    expect(parsedUrl.searchParams.get('limit')).toBe('25');
    expect(parsedUrl.searchParams.get('cursor')).toBe('opaque-cursor');
    expect(init.method).toBe('GET');
  });

  it('memory_list forwards sessionId/projectSlug as query params', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(200, { items: [], nextCursor: null, hasMore: false }),
    );
    const client = new BranorOsClient(
      { apiBaseUrl: 'http://api.test', apiPrefix: '/api/v1', apiKey: 'ak_test' },
      fetchMock as unknown as typeof fetch,
    );
    const endpoints = createEndpoints(client, { workspaceId: 'ws_pub_1' });

    const schema = z.object(memoryList.inputSchema);
    const parsed = schema.parse({ sessionId: 'sess-1', projectSlug: 'proj-1' });
    await memoryList.handler(parsed, endpoints);

    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    const parsedUrl = new URL(url);
    expect(parsedUrl.searchParams.get('sessionId')).toBe('sess-1');
    expect(parsedUrl.searchParams.get('projectSlug')).toBe('proj-1');
  });

  it('memory_bootstrap forwards sessionId/projectSlug as query params', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, []));
    const client = new BranorOsClient(
      { apiBaseUrl: 'http://api.test', apiPrefix: '/api/v1', apiKey: 'ak_test' },
      fetchMock as unknown as typeof fetch,
    );
    const endpoints = createEndpoints(client, { workspaceId: 'ws_pub_1' });

    const schema = z.object(memoryBootstrap.inputSchema);
    const parsed = schema.parse({ sessionId: 'sess-1', projectSlug: 'proj-1' });
    await memoryBootstrap.handler(parsed, endpoints);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const parsedUrl = new URL(url);
    expect(parsedUrl.pathname).toBe(
      '/api/v1/workspaces/ws_pub_1/memories/bootstrap',
    );
    expect(parsedUrl.searchParams.get('sessionId')).toBe('sess-1');
    expect(parsedUrl.searchParams.get('projectSlug')).toBe('proj-1');
    expect(init.method).toBe('GET');
  });

  it('memory_list returns the envelope (items/nextCursor/hasMore) as-is', async () => {
    const envelope = {
      items: [
        {
          publicId: 'pub-1',
          memoryType: 'FACT',
          importance: 0.5,
          summary: 'hi',
          scope: 'USER',
          createdAt: '2024-01-01T00:00:00.000Z',
        },
      ],
      nextCursor: 'next-cursor-value',
      hasMore: true,
    };
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, envelope));
    const client = new BranorOsClient(
      { apiBaseUrl: 'http://api.test', apiPrefix: '/api/v1', apiKey: 'ak_test' },
      fetchMock as unknown as typeof fetch,
    );
    const endpoints = createEndpoints(client, { workspaceId: 'ws_pub_1' });

    const schema = z.object(memoryList.inputSchema);
    const parsed = schema.parse({});
    const result = await memoryList.handler(parsed, endpoints);

    expect(result).toEqual(envelope);
  });

  it('memory_list rejects limit above 200', () => {
    const schema = z.object(memoryList.inputSchema);
    expect(() => schema.parse({ limit: 201 })).toThrow();
  });

  it('wiki_node_write UPDATE with name+parentId builds PATCH with both fields in body', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { id: 'node_1' }));
    const client = new BranorOsClient(
      { apiBaseUrl: 'http://api.test', apiPrefix: '/api/v1', apiKey: 'ak_test' },
      fetchMock as unknown as typeof fetch,
    );
    const endpoints = createEndpoints(client, { workspaceId: 'ws_pub_1' });

    const schema = z.object(wikiNodeWrite.inputSchema);
    const parsed = schema.parse({
      wikiId: 'wk_1',
      nodeId: 'node_1',
      name: 'novo-nome.md',
      parentId: 'folder_1',
    });
    await wikiNodeWrite.handler(parsed, endpoints);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://api.test/api/v1/workspaces/ws_pub_1/wikis/wk_1/nodes/node_1');
    expect(init.method).toBe('PATCH');
    const body = JSON.parse(init.body as string);
    expect(body).toEqual({ name: 'novo-nome.md', parentId: 'folder_1' });
  });

  it('wiki_node_write UPDATE moving to root sends parentId: null explicitly in the body', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { id: 'node_1' }));
    const client = new BranorOsClient(
      { apiBaseUrl: 'http://api.test', apiPrefix: '/api/v1', apiKey: 'ak_test' },
      fetchMock as unknown as typeof fetch,
    );
    const endpoints = createEndpoints(client, { workspaceId: 'ws_pub_1' });

    const schema = z.object(wikiNodeWrite.inputSchema);
    const parsed = schema.parse({
      wikiId: 'wk_1',
      nodeId: 'node_1',
      parentId: null,
    });
    await wikiNodeWrite.handler(parsed, endpoints);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body).toEqual({ parentId: null });
  });

  it('wiki_node_write CREATE with type=FOLDER+tags+sortOrder builds POST with those fields', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(201, { id: 'node_2' }));
    const client = new BranorOsClient(
      { apiBaseUrl: 'http://api.test', apiPrefix: '/api/v1', apiKey: 'ak_test' },
      fetchMock as unknown as typeof fetch,
    );
    const endpoints = createEndpoints(client, { workspaceId: 'ws_pub_1' });

    const schema = z.object(wikiNodeWrite.inputSchema);
    const parsed = schema.parse({
      wikiId: 'wk_1',
      name: 'projetos',
      type: 'FOLDER',
      tags: ['ativo'],
      sortOrder: 3,
    });
    await wikiNodeWrite.handler(parsed, endpoints);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://api.test/api/v1/workspaces/ws_pub_1/wikis/wk_1/nodes');
    expect(init.method).toBe('POST');
    const body = JSON.parse(init.body as string);
    expect(body).toEqual({
      type: 'FOLDER',
      name: 'projetos',
      kind: 'TEXT',
      tags: ['ativo'],
      sortOrder: 3,
    });
  });

  it('wiki_list builds GET /workspaces/{ws}/wikis', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { items: [] }));
    const client = new BranorOsClient(
      { apiBaseUrl: 'http://api.test', apiPrefix: '/api/v1', apiKey: 'ak_test' },
      fetchMock as unknown as typeof fetch,
    );
    const endpoints = createEndpoints(client, { workspaceId: 'ws_pub_1' });

    const schema = z.object(wikiList.inputSchema);
    const parsed = schema.parse({});
    await wikiList.handler(parsed, endpoints);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://api.test/api/v1/workspaces/ws_pub_1/wikis');
    expect(init.method).toBe('GET');
  });

  it('wiki_tree builds GET /workspaces/{ws}/wikis/{wikiId}/tree', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { nodes: [] }));
    const client = new BranorOsClient(
      { apiBaseUrl: 'http://api.test', apiPrefix: '/api/v1', apiKey: 'ak_test' },
      fetchMock as unknown as typeof fetch,
    );
    const endpoints = createEndpoints(client, { workspaceId: 'ws_pub_1' });

    const schema = z.object(wikiTree.inputSchema);
    const parsed = schema.parse({ wikiId: 'wk_1' });
    await wikiTree.handler(parsed, endpoints);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://api.test/api/v1/workspaces/ws_pub_1/wikis/wk_1/tree');
    expect(init.method).toBe('GET');
  });

  it('wiki_node_delete builds DELETE /workspaces/{ws}/wikis/{wikiId}/nodes/{nodeId}', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { ok: true }));
    const client = new BranorOsClient(
      { apiBaseUrl: 'http://api.test', apiPrefix: '/api/v1', apiKey: 'ak_test' },
      fetchMock as unknown as typeof fetch,
    );
    const endpoints = createEndpoints(client, { workspaceId: 'ws_pub_1' });

    const schema = z.object(wikiNodeDelete.inputSchema);
    const parsed = schema.parse({ wikiId: 'wk_1', nodeId: 'node_1' });
    await wikiNodeDelete.handler(parsed, endpoints);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://api.test/api/v1/workspaces/ws_pub_1/wikis/wk_1/nodes/node_1');
    expect(init.method).toBe('DELETE');
  });

  it('wiki_graph builds GET /workspaces/{ws}/wikis/{wikiId}/graph', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { nodes: [], edges: [] }));
    const client = new BranorOsClient(
      { apiBaseUrl: 'http://api.test', apiPrefix: '/api/v1', apiKey: 'ak_test' },
      fetchMock as unknown as typeof fetch,
    );
    const endpoints = createEndpoints(client, { workspaceId: 'ws_pub_1' });

    const schema = z.object(wikiGraph.inputSchema);
    const parsed = schema.parse({ wikiId: 'wk_1' });
    await wikiGraph.handler(parsed, endpoints);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://api.test/api/v1/workspaces/ws_pub_1/wikis/wk_1/graph');
    expect(init.method).toBe('GET');
  });
});
