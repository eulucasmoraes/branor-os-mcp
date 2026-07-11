#!/usr/bin/env node
/**
 * Remote (network) entrypoint for the branor-os MCP server.
 *
 * The default entrypoint (index.ts) speaks stdio, which only works for a
 * client that spawns this process locally. This entrypoint instead exposes
 * the SAME server over the MCP Streamable HTTP transport, so an agent running
 * on a different host can connect to it as a normal remote MCP server.
 *
 * Session model: stateful. Each MCP `initialize` mints a session id and gets
 * its own McpServer instance (built via buildServer). Subsequent requests
 * carry the `mcp-session-id` header and reuse that session's transport.
 *
 * Auth: the org-scoped branor-os API key IS the gate. Every request to the
 * MCP path must present `Authorization: Bearer <apiKey>`; that key is used
 * directly as the session's BranorOsClient credential (no separate
 * front-door bearer token). There is no per-session workspace here — it
 * arrives per tools/call as the `workspace_public_id` argument (see
 * src/server.ts), because this client's connection headers are static for
 * the whole session while calls scoped to different workspaces can be
 * concurrent within it.
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { loadConfigFromEnv } from './config.js';
import { buildServer } from './server.js';

const PORT = Number(process.env.PORT ?? 8080);
const HOST = process.env.HOST ?? '0.0.0.0';
const MCP_PATH = process.env.MCP_PATH ?? '/mcp';

// Validate the base (deployment-level) config once at startup so a bad env
// fails the container boot instead of surfacing only on the first agent
// connection. The API key is NOT part of this — it comes per-connection.
const config = loadConfigFromEnv();

// Active sessions, keyed by the id we hand back on `initialize`.
const transports: Record<string, StreamableHTTPServerTransport> = {};

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(payload);
}

function readBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (raw.length === 0) {
        resolve(undefined);
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

/** Extracts the bearer token from `Authorization: Bearer <token>`, or undefined. */
function bearerToken(req: IncomingMessage): string | undefined {
  const header = req.headers['authorization'];
  if (!header || Array.isArray(header)) return undefined;
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match?.[1];
}

const httpServer = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);

    // Unauthenticated liveness probe for Coolify / load balancers.
    if (req.method === 'GET' && url.pathname === '/health') {
      sendJson(res, 200, { status: 'ok' });
      return;
    }

    if (url.pathname !== MCP_PATH) {
      sendJson(res, 404, { error: 'not_found' });
      return;
    }

    // The branor-os org-scoped API key is the gate for this endpoint. No
    // key, no session — regardless of method, since even GET/DELETE need an
    // existing session that was itself created under a valid key.
    const apiKey = bearerToken(req);
    if (!apiKey) {
      sendJson(res, 401, { error: 'unauthorized' });
      return;
    }

    if (req.method === 'POST') {
      const body = await readBody(req);
      const sessionId = req.headers['mcp-session-id'];
      const sessionKey = Array.isArray(sessionId) ? sessionId[0] : sessionId;

      let transport: StreamableHTTPServerTransport;

      if (sessionKey && transports[sessionKey]) {
        transport = transports[sessionKey];
      } else if (!sessionKey && isInitializeRequest(body)) {
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (sid) => {
            transports[sid] = transport;
          },
        });
        transport.onclose = () => {
          if (transport.sessionId) delete transports[transport.sessionId];
        };
        // The API key from THIS connection's Authorization header becomes
        // this session's credential. The workspace is NOT resolved here —
        // it arrives per tools/call (see src/server.ts).
        const { server, toolNames } = buildServer(config, apiKey);
        console.error(`branor-os-mcp (http): new session, exposing ${toolNames.length} tool(s)`);
        await server.connect(transport);
      } else {
        sendJson(res, 400, {
          jsonrpc: '2.0',
          error: { code: -32000, message: 'Bad Request: no valid session id' },
          id: null,
        });
        return;
      }

      await transport.handleRequest(req, res, body);
      return;
    }

    // GET (server->client SSE stream) and DELETE (session teardown) must
    // reference an existing session.
    if (req.method === 'GET' || req.method === 'DELETE') {
      const sessionId = req.headers['mcp-session-id'];
      const sessionKey = Array.isArray(sessionId) ? sessionId[0] : sessionId;
      if (!sessionKey || !transports[sessionKey]) {
        sendJson(res, 400, { error: 'invalid_or_missing_session_id' });
        return;
      }
      await transports[sessionKey].handleRequest(req, res);
      return;
    }

    sendJson(res, 405, { error: 'method_not_allowed' });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('branor-os-mcp (http) request failed:', message);
    if (!res.headersSent) {
      sendJson(res, 500, { error: 'internal_error' });
    }
  }
});

httpServer.listen(PORT, HOST, () => {
  console.error(`branor-os-mcp (http) listening on http://${HOST}:${PORT}${MCP_PATH}`);
});
