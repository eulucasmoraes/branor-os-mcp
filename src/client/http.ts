import type { ApiErrorBody } from './types.js';

/**
 * Error thrown for any non-2xx response. `message` is set to the API's own
 * instructive message so tool handlers can surface it to the model verbatim
 * instead of a generic "request failed".
 */
export class ApiError extends Error {
  readonly statusCode: number;
  readonly errorCode: string;
  readonly requestId?: string;
  readonly path?: string;

  constructor(body: ApiErrorBody, fallbackStatus: number) {
    const msg = Array.isArray(body.message) ? body.message.join('; ') : body.message;
    super(msg || `Request failed with status ${fallbackStatus}`);
    this.name = 'ApiError';
    this.statusCode = body.statusCode ?? fallbackStatus;
    this.errorCode = body.errorCode ?? body.error ?? 'Error';
    this.requestId = body.requestId;
    this.path = body.path;
  }
}

/**
 * Config for the base client: everything that is fixed for the lifetime of
 * an MCP session (one per connection). Notably this does NOT include a
 * workspace — that is per-call (see RequestOptions and
 * BranorOsClient.workspacePath), because a single session can interleave
 * concurrent tools/call requests scoped to different workspaces.
 */
export interface ClientConfig {
  apiBaseUrl: string;
  apiPrefix: string;
  apiKey: string;
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
}

/**
 * Minimal typed fetch wrapper for the branor-os API. Injects
 * Authorization: Bearer <apiKey> (org-scoped, fixed for the session).
 * Workspace-scoped paths are built via `workspacePath(workspaceId, suffix)`
 * — the workspace is a per-call argument, not client state.
 */
export class BranorOsClient {
  constructor(
    private readonly config: ClientConfig,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  workspacePath(workspaceId: string, suffix: string): string {
    return `/workspaces/${workspaceId}${suffix}`;
  }

  async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const method = options.method ?? 'GET';
    const url = new URL(`${this.config.apiBaseUrl}${this.config.apiPrefix}${path}`);
    if (options.query) {
      for (const [key, value] of Object.entries(options.query)) {
        if (value !== undefined) url.searchParams.set(key, String(value));
      }
    }

    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.config.apiKey}`,
    };

    let bodyText: string | undefined;
    if (options.body !== undefined) {
      headers['Content-Type'] = 'application/json';
      bodyText = JSON.stringify(options.body);
    }

    const res = await this.fetchImpl(url.toString(), {
      method,
      headers,
      body: bodyText,
    });

    const text = await res.text();
    const parsed: unknown = text.length > 0 ? JSON.parse(text) : undefined;

    if (!res.ok) {
      const errBody = (parsed ?? {}) as Partial<ApiErrorBody>;
      throw new ApiError(
        {
          statusCode: errBody.statusCode ?? res.status,
          error: errBody.error ?? res.statusText,
          errorCode: errBody.errorCode,
          message: errBody.message ?? `HTTP ${res.status}`,
          timestamp: errBody.timestamp ?? new Date().toISOString(),
          path: errBody.path ?? url.pathname,
          requestId: errBody.requestId,
        },
        res.status,
      );
    }

    return parsed as T;
  }

  get<T>(path: string, query?: RequestOptions['query']): Promise<T> {
    return this.request<T>(path, { method: 'GET', query });
  }

  post<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>(path, { method: 'POST', body });
  }

  patch<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>(path, { method: 'PATCH', body });
  }

  put<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>(path, { method: 'PUT', body });
  }

  delete<T>(path: string): Promise<T> {
    return this.request<T>(path, { method: 'DELETE' });
  }
}
