import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ServerConfig } from './config.js';
import { BranorOsClient, ApiError } from './client/http.js';
import { createEndpoints } from './client/endpoints.js';
import { allTools } from './tools/index.js';

export interface BuiltServer {
  server: McpServer;
  toolNames: string[];
}

// Injected into every tool's input schema at registration time (see
// buildServer below). This is exactly what the host runtime injects into
// every tools/call argument set: the workspace_public_id the caller picked.
const WORKSPACE_PUBLIC_ID_FIELD = z
  .string()
  .min(1)
  .describe('publicId of the branor-os workspace this call is scoped to.');

/**
 * Builds the MCP server for ONE session and registers every tool
 * unconditionally. Enforcement of what a given API key may actually do
 * happens call-time, on the branor-os API itself: a call for a
 * workspace/permission the key lacks returns an error, which the tools/call
 * wrapper below surfaces to the model verbatim.
 *
 * `apiKey` is the one thing that IS fixed for the session: it is the
 * org-scoped key from the connection's `Authorization: Bearer <apiKey>`
 * header (HTTP) or from BRANOR_API_KEY (stdio).
 */
export function buildServer(
  config: ServerConfig,
  apiKey: string,
  fetchImpl: typeof fetch = fetch,
): BuiltServer {
  const client = new BranorOsClient({ ...config, apiKey }, fetchImpl);

  const server = new McpServer({
    name: 'branor-os-mcp',
    version: '0.1.0',
  });

  const toolNames: string[] = [];

  for (const tool of allTools) {
    toolNames.push(tool.name);

    const inputSchema: Record<string, z.ZodTypeAny> = { ...tool.inputSchema };
    if (tool.workspaceScoped !== false) {
      inputSchema.workspace_public_id = WORKSPACE_PUBLIC_ID_FIELD;
    }

    server.registerTool(
      tool.name,
      {
        title: tool.name,
        description: tool.description,
        inputSchema,
      },
      async (rawInput: Record<string, unknown>) => {
        const { workspace_public_id: workspacePublicId, ...toolInput } = rawInput;
        try {
          // Built fresh for THIS call, from the args THIS call carried —
          // never from anything stored on the session/server. That is what
          // makes concurrent tools/call requests (possibly for different
          // workspaces) safe: there is no shared mutable workspace state to
          // race on.
          const endpoints = createEndpoints(client, {
            workspaceId: typeof workspacePublicId === 'string' ? workspacePublicId : '',
          });

          const result = await tool.handler(toolInput as never, endpoints);
          // A handler can legitimately return undefined — e.g. a DELETE tool
          // whose endpoint hits a 204 No Content. In that case
          // JSON.stringify(undefined) is the value `undefined`, not a
          // string, which would produce a content item with a non-string
          // `text` and make the MCP SDK reject the result with a ZodError on
          // the client. Guard both: undefined result AND stringify
          // returning undefined, so `text` is ALWAYS a string.
          const serialized = JSON.stringify(result, null, 2);
          const text = serialized === undefined ? '{"ok": true}' : serialized;
          return {
            content: [{ type: 'text' as const, text }],
          };
        } catch (err) {
          if (err instanceof ApiError) {
            // Surface the API's own instructive message verbatim so the
            // model can self-correct.
            return {
              content: [{ type: 'text' as const, text: `Error (${err.statusCode} ${err.errorCode}): ${err.message}` }],
              isError: true,
            };
          }
          const message = err instanceof Error ? err.message : String(err);
          return {
            content: [{ type: 'text' as const, text: `Unexpected error: ${message}` }],
            isError: true,
          };
        }
      },
    );
  }

  return { server, toolNames };
}
