import type { z } from 'zod';
import type { Endpoints } from '../client/endpoints.js';

/**
 * A tool definition pairs an MCP tool (name/description/zod input schema)
 * with a handler that receives the parsed input plus the endpoint bindings.
 * `workspace_public_id` is injected centrally into every tool's schema by
 * src/server.ts — it never needs to be declared here.
 */
export interface ToolDef<Schema extends z.ZodRawShape> {
  name: string;
  description: string;
  inputSchema: Schema;
  handler: (input: z.infer<z.ZodObject<Schema>>, endpoints: Endpoints) => Promise<unknown>;
  /**
   * Default true. Quando false, src/server.ts NÃO injeta o campo obrigatório
   * workspace_public_id (para tools que batem em rotas não scoped a
   * workspace, ex.: workspace_list).
   */
  workspaceScoped?: boolean;
}

export function defineTool<Schema extends z.ZodRawShape>(def: ToolDef<Schema>): ToolDef<Schema> {
  return def;
}
