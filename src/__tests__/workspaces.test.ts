import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { workspaceTools, workspaceList, workspaceMembers } from '../tools/workspaces.js';
import { allTools } from '../tools/index.js';
import { BranorOsClient } from '../client/http.js';
import { createEndpoints } from '../client/endpoints.js';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('workspace tools registry', () => {
  it('registers both workspace tools in the global registry', () => {
    const names = new Set(workspaceTools.map((t) => t.name));
    expect(names.size).toBe(2);
    for (const name of names) {
      expect(allTools.some((t) => t.name === name)).toBe(true);
    }
  });

  it('workspace_list is workspaceScoped: false', () => {
    expect(workspaceList.workspaceScoped).toBe(false);
  });

  it('workspace_members is workspaceScoped by default (undefined)', () => {
    expect(workspaceMembers.workspaceScoped).toBeUndefined();
  });
});

describe('workspace tools build the right request', () => {
  it('workspace_list builds a plain GET /workspaces (no workspace segment) and projects the shape', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(200, [
        {
          id: 'w_1',
          publicId: 'ws_pub_1',
          type: 'BRAND',
          name: 'Acme',
          slug: 'acme',
          organizationId: 'org_1',
          organizationPublicId: 'org_pub_1',
          membership: { baseRole: 'OWNER', status: 'ACTIVE' },
          subscription: { plan: 'PRO' },
          _count: { members: 3 },
        },
      ]),
    );
    const client = new BranorOsClient(
      { apiBaseUrl: 'http://api.test', apiPrefix: '/api/v1', apiKey: 'ak_test' },
      fetchMock as unknown as typeof fetch,
    );
    const endpoints = createEndpoints(client, { workspaceId: 'ws_pub_1' });

    const schema = z.object(workspaceList.inputSchema);
    const parsed = schema.parse({});
    const result = await workspaceList.handler(parsed, endpoints);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://api.test/api/v1/workspaces');
    expect(init.method).toBe('GET');

    expect(result).toEqual([
      {
        publicId: 'ws_pub_1',
        name: 'Acme',
        type: 'BRAND',
        organizationPublicId: 'org_pub_1',
        role: 'OWNER',
      },
    ]);
  });

  it('workspace_members builds GET /workspaces/{ws}/members and projects the shape', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(200, [
        {
          id: 'mem_1',
          baseRole: 'MEMBER',
          status: 'ACTIVE',
          user: { id: 'u_1', name: 'Lucas', email: 'eu@lucasmoraes.me', avatarUrl: null },
          invitedEmail: null,
          joinedAt: '2026-01-01T00:00:00Z',
        },
      ]),
    );
    const client = new BranorOsClient(
      { apiBaseUrl: 'http://api.test', apiPrefix: '/api/v1', apiKey: 'ak_test' },
      fetchMock as unknown as typeof fetch,
    );
    const endpoints = createEndpoints(client, { workspaceId: 'ws_pub_1' });

    const schema = z.object(workspaceMembers.inputSchema);
    const parsed = schema.parse({});
    const result = await workspaceMembers.handler(parsed, endpoints);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://api.test/api/v1/workspaces/ws_pub_1/members');
    expect(init.method).toBe('GET');

    expect(result).toEqual([
      {
        membershipId: 'mem_1',
        name: 'Lucas',
        email: 'eu@lucasmoraes.me',
        baseRole: 'MEMBER',
        status: 'ACTIVE',
      },
    ]);
  });
});
