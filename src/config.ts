/**
 * Deployment/server-level configuration, loaded once from environment
 * variables at startup. Identity (API key) is not fixed per deployment —
 * the API key arrives per session (HTTP connection header, or env for
 * stdio) and the workspace arrives per tool call. See src/server.ts.
 */
export interface ServerConfig {
  apiBaseUrl: string;
  apiPrefix: string;
}

export class ConfigError extends Error {}

export function loadConfigFromEnv(
  env: Record<string, string | undefined> = process.env,
): ServerConfig {
  const apiBaseUrl = env.BRANOR_API_BASE_URL;
  const apiPrefix = env.BRANOR_API_PREFIX ?? '/api/v1';

  if (!apiBaseUrl) {
    throw new ConfigError(
      'Missing required environment variable(s): BRANOR_API_BASE_URL. See .env.example.',
    );
  }

  return {
    apiBaseUrl: apiBaseUrl.replace(/\/+$/, ''),
    apiPrefix: apiPrefix.startsWith('/') ? apiPrefix : `/${apiPrefix}`,
  };
}

/**
 * Local-dev-only source of the branor-os API key: the stdio entrypoint
 * (src/index.ts) has no connection to read an Authorization header from, so
 * it falls back to BRANOR_API_KEY. The HTTP entrypoint (src/http.ts) never
 * calls this — it reads the key from the per-connection Authorization header
 * instead.
 */
export function loadApiKeyFromEnv(env: Record<string, string | undefined> = process.env): string {
  const apiKey = env.BRANOR_API_KEY;
  if (!apiKey) {
    throw new ConfigError(
      'Missing required environment variable: BRANOR_API_KEY (stdio mode). See .env.example.',
    );
  }
  return apiKey;
}
