import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { allTools } from '../tools/index.js';
import { metaTools, deepDiveCampaign, createCampaign, getCampaign, createAdset } from '../tools/meta.js';
import { BranorOsClient } from '../client/http.js';
import { createEndpoints } from '../client/endpoints.js';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('meta tools registry', () => {
  it('registers all 17 meta tools in the global registry', () => {
    const metaNames = new Set(metaTools.map((t) => t.name));
    expect(metaNames.size).toBe(17);
    for (const name of metaNames) {
      expect(allTools.some((t) => t.name === name)).toBe(true);
    }
  });
});

describe('meta read tools build the right request', () => {
  it('deep_dive_campaign builds GET /workspaces/{ws}/meta/agent/campaigns/{id}/deep-dive with query params', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { id: 'c_1' }));
    const client = new BranorOsClient(
      { apiBaseUrl: 'http://api.test', apiPrefix: '/api/v1', apiKey: 'ak_test' },
      fetchMock as unknown as typeof fetch,
    );
    const endpoints = createEndpoints(client, { workspaceId: 'ws_pub_1' });

    const schema = z.object(deepDiveCampaign.inputSchema);
    const parsed = schema.parse({ campaignId: '120210000001234567', resourceId: 'res_1', period: 'last_7d' });
    const result = await deepDiveCampaign.handler(parsed, endpoints);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      'http://api.test/api/v1/workspaces/ws_pub_1/meta/agent/campaigns/120210000001234567/deep-dive?resourceId=res_1&period=last_7d',
    );
    expect(init.method).toBe('GET');
    expect(result).toEqual({ id: 'c_1' });
  });

  it('get_campaign builds GET /workspaces/{ws}/meta/live/campaigns/{id}', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { id: 'c_1' }));
    const client = new BranorOsClient(
      { apiBaseUrl: 'http://api.test', apiPrefix: '/api/v1', apiKey: 'ak_test' },
      fetchMock as unknown as typeof fetch,
    );
    const endpoints = createEndpoints(client, { workspaceId: 'ws_pub_1' });

    const schema = z.object(getCampaign.inputSchema);
    const parsed = schema.parse({ campaignId: '120210000001234567' });
    await getCampaign.handler(parsed, endpoints);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://api.test/api/v1/workspaces/ws_pub_1/meta/live/campaigns/120210000001234567');
  });
});

describe('meta write tools build the right request', () => {
  it('create_campaign POSTs /workspaces/{ws}/meta/campaigns with the mapped body (validate_only -> execution_options)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(201, { id: 'c_new' }));
    const client = new BranorOsClient(
      { apiBaseUrl: 'http://api.test', apiPrefix: '/api/v1', apiKey: 'ak_test' },
      fetchMock as unknown as typeof fetch,
    );
    const endpoints = createEndpoints(client, { workspaceId: 'ws_pub_1' });

    const schema = z.object(createCampaign.inputSchema);
    const parsed = schema.parse({
      name: 'Campanha Teste',
      objective: 'OUTCOME_SALES',
      special_ad_categories: ['NONE'],
      validate_only: true,
      reason: 'Testando criação',
    });
    const result = await createCampaign.handler(parsed, endpoints);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://api.test/api/v1/workspaces/ws_pub_1/meta/campaigns');
    expect(init.method).toBe('POST');
    const body = JSON.parse(init.body as string);
    expect(body).toMatchObject({
      name: 'Campanha Teste',
      objective: 'OUTCOME_SALES',
      special_ad_categories: ['NONE'],
      status: 'PAUSED',
      reason: 'Testando criação',
      execution_options: ['validate_only'],
    });
    expect(body.validate_only).toBeUndefined();
    expect(result).toEqual({ id: 'c_new' });
  });

  it('create_adset POSTs /workspaces/{ws}/meta/adsets with targeting passed through', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(201, { id: 'as_new' }));
    const client = new BranorOsClient(
      { apiBaseUrl: 'http://api.test', apiPrefix: '/api/v1', apiKey: 'ak_test' },
      fetchMock as unknown as typeof fetch,
    );
    const endpoints = createEndpoints(client, { workspaceId: 'ws_pub_1' });

    const schema = z.object(createAdset.inputSchema);
    const parsed = schema.parse({
      name: 'Ad set teste',
      campaign_id: '120210000001234567',
      optimization_goal: 'OFFSITE_CONVERSIONS',
      targeting: { geo_locations: { countries: ['BR'] } },
      reason: 'Testando ad set',
    });
    await createAdset.handler(parsed, endpoints);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://api.test/api/v1/workspaces/ws_pub_1/meta/adsets');
    const body = JSON.parse(init.body as string);
    expect(body.targeting).toEqual({ geo_locations: { countries: ['BR'] } });
    expect(body.campaign_id).toBe('120210000001234567');
    expect(body.billing_event).toBe('IMPRESSIONS');
    expect(body.status).toBe('PAUSED');
  });
});
