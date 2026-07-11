import { describe, expect, it, vi } from 'vitest';
import { BranorOsClient, ApiError } from '../client/http.js';
import type { ClientConfig } from '../client/http.js';

const config: ClientConfig = {
  apiBaseUrl: 'http://api.test',
  apiPrefix: '/api/v1',
  apiKey: 'ak_test_secret',
};

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('BranorOsClient', () => {
  it('builds base+prefix+path, sets the query string, and injects Authorization bearer', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { items: [], limit: 20 }));
    const client = new BranorOsClient(config, fetchMock as unknown as typeof fetch);

    await client.get(client.workspacePath('ws_pub_1', '/creative-assets'), { limit: 20, page: 1 });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://api.test/api/v1/workspaces/ws_pub_1/creative-assets?limit=20&page=1');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer ak_test_secret');
    expect(init.method).toBe('GET');
  });

  it('workspacePath takes the workspace id as an explicit parameter (no client-level workspace state)', () => {
    const fetchMock = vi.fn();
    const client = new BranorOsClient(config, fetchMock as unknown as typeof fetch);

    expect(client.workspacePath('ws-a', '/creative-assets')).toBe('/workspaces/ws-a/creative-assets');
    expect(client.workspacePath('ws-b', '/creative-assets')).toBe('/workspaces/ws-b/creative-assets');
  });

  it('sends a JSON body on POST', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(201, { publicId: 'ca_1' }));
    const client = new BranorOsClient(config, fetchMock as unknown as typeof fetch);

    const result = await client.post(client.workspacePath('ws_pub_1', '/creative-assets'), { name: 'Acme' });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json');
    expect(init.body).toBe(JSON.stringify({ name: 'Acme' }));
    expect(result).toEqual({ publicId: 'ca_1' });
  });

  it('throws ApiError with the API instructive message when status >= 400', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(404, {
        statusCode: 404,
        error: 'Not Found',
        message: 'creative asset not found',
        timestamp: '2026-07-10T00:00:00Z',
        path: '/api/v1/workspaces/ws_pub_1/creative-assets/ca_x',
      }),
    );
    const client = new BranorOsClient(config, fetchMock as unknown as typeof fetch);

    await expect(client.get(client.workspacePath('ws_pub_1', '/creative-assets/ca_x'))).rejects.toMatchObject({
      statusCode: 404,
      message: 'creative asset not found',
    });
  });

  it('preserves ApiError instance type for downstream instanceof checks', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(500, {
        statusCode: 500,
        error: 'Internal Server Error',
        message: 'boom',
        timestamp: '2026-07-10T00:00:00Z',
        path: '/x',
      }),
    );
    const client = new BranorOsClient(config, fetchMock as unknown as typeof fetch);

    try {
      await client.get('/x');
      expect.fail('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      expect((err as ApiError).statusCode).toBe(500);
    }
  });

  it('joins array messages with a semicolon', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(400, {
        statusCode: 400,
        error: 'Bad Request',
        message: ['campo A é obrigatório', 'campo B é obrigatório'],
        timestamp: '2026-07-10T00:00:00Z',
        path: '/x',
      }),
    );
    const client = new BranorOsClient(config, fetchMock as unknown as typeof fetch);

    await expect(client.post('/x', {})).rejects.toMatchObject({
      message: 'campo A é obrigatório; campo B é obrigatório',
    });
  });

  it('omits the body/Content-Type header on a GET with no body', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, {}));
    const client = new BranorOsClient(config, fetchMock as unknown as typeof fetch);

    await client.get('/health');

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>)['Content-Type']).toBeUndefined();
    expect(init.body).toBeUndefined();
  });
});
