import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { allTools } from '../tools/index.js';
import {
  listCreativeAssets,
  getAssetMetrics,
  searchCreativeAssets,
  creativeAssetTools,
} from '../tools/creative-assets.js';
import type { Endpoints } from '../client/endpoints.js';
import { BranorOsClient } from '../client/http.js';
import { createEndpoints } from '../client/endpoints.js';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('tool input schemas (zod validation)', () => {
  it('every tool has a unique name and a non-empty description', () => {
    const names = new Set<string>();
    for (const tool of allTools) {
      expect(tool.name.length).toBeGreaterThan(0);
      expect(tool.description.length).toBeGreaterThan(20);
      expect(names.has(tool.name)).toBe(false);
      names.add(tool.name);
    }
  });

  it('list_creative_assets accepts an empty input (all filters optional) and typed enums', () => {
    const schema = z.object(listCreativeAssets.inputSchema);
    expect(schema.parse({})).toEqual({});
    expect(schema.parse({ type: 'VIDEO', status: 'READY', search: 'unboxing', page: 1, limit: 20 })).toEqual({
      type: 'VIDEO',
      status: 'READY',
      search: 'unboxing',
      page: 1,
      limit: 20,
    });
    expect(() => schema.parse({ type: 'BOGUS' })).toThrow();
    expect(() => schema.parse({ status: 'BOGUS' })).toThrow();
  });

  it('list_creative_assets forwards parsed filters to endpoints.listCreativeAssets', async () => {
    const schema = z.object(listCreativeAssets.inputSchema);
    const parsed = schema.parse({ type: 'IMAGE', page: 2 });

    let calledWith: unknown;
    const page = { items: [{ publicId: 'ca_1', name: 'Foto produto', type: 'IMAGE', status: 'READY' }], limit: 20, page: 2 };
    const endpoints = {
      listCreativeAssets: async (opts: unknown) => {
        calledWith = opts;
        return page;
      },
    } as unknown as Endpoints;

    const result = await listCreativeAssets.handler(parsed, endpoints);
    expect(calledWith).toEqual({
      type: 'IMAGE',
      status: undefined,
      search: undefined,
      page: 2,
      limit: undefined,
    });
    expect(result).toEqual(page);
  });

  it('registers all 12 creative-asset tools in the global registry', () => {
    const creativeNames = new Set(creativeAssetTools.map((t) => t.name));
    expect(creativeNames.size).toBe(12);
    for (const name of creativeNames) {
      expect(allTools.some((t) => t.name === name)).toBe(true);
    }
  });

  it('get_asset_metrics builds GET /workspaces/{ws}/creative-assets/{id}/metrics with date range query params', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { totalSpend: 100 }));
    const client = new BranorOsClient(
      { apiBaseUrl: 'http://api.test', apiPrefix: '/api/v1', apiKey: 'ak_test' },
      fetchMock as unknown as typeof fetch,
    );
    const endpoints = createEndpoints(client, { workspaceId: 'ws_pub_1' });

    const schema = z.object(getAssetMetrics.inputSchema);
    const parsed = schema.parse({ id: 'ca_1', startDate: '2026-06-01', endDate: '2026-06-30' });
    const result = await getAssetMetrics.handler(parsed, endpoints);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      'http://api.test/api/v1/workspaces/ws_pub_1/creative-assets/ca_1/metrics?startDate=2026-06-01&endDate=2026-06-30',
    );
    expect(result).toEqual({ totalSpend: 100 });
  });

  it('search_creative_assets sends the query as ?q= (not ?query=)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { items: [] }));
    const client = new BranorOsClient(
      { apiBaseUrl: 'http://api.test', apiPrefix: '/api/v1', apiKey: 'ak_test' },
      fetchMock as unknown as typeof fetch,
    );
    const endpoints = createEndpoints(client, { workspaceId: 'ws_pub_1' });

    const schema = z.object(searchCreativeAssets.inputSchema);
    const parsed = schema.parse({ query: 'unboxing verao', limit: 5 });
    await searchCreativeAssets.handler(parsed, endpoints);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      'http://api.test/api/v1/workspaces/ws_pub_1/creative-assets/search?q=unboxing+verao&limit=5',
    );
  });
});
