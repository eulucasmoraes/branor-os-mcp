import { z } from 'zod';
import { defineTool } from './types.js';

const MEMORY_DESC =
  'Memória = fato/registro atômico otimizado para recall futuro do agente (preferência, decisão, fato sobre um cliente/projeto). NÃO use para documentação extensa — isso é Biblioteca (wiki_node_write). Corpo deve seguir convenção FACT/DECISION/RISK quando aplicável.';

export const memorySearch = defineTool({
  name: 'memory_search',
  description: `Busca semântica nas Memórias do agente/usuário. ${MEMORY_DESC} Retorna memórias relevantes ordenadas por similaridade (score).`,
  inputSchema: {
    query: z.string().min(1).describe('Texto ou pergunta para buscar'),
    clientSlug: z.string().optional().describe('Slug do cliente para filtrar memórias'),
    agentId: z.string().optional().describe('ID do agente para filtrar memórias'),
    topK: z
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .describe('Número máximo de resultados (padrão: 5)'),
  },
  handler: async (input, endpoints) =>
    endpoints.searchMemory({
      query: input.query,
      clientSlug: input.clientSlug,
      agentId: input.agentId,
      topK: input.topK,
    }),
});

export const memoryAdd = defineTool({
  name: 'memory_add',
  description: `Cria uma Memória — fato/registro atômico otimizado para recall futuro do agente. ${MEMORY_DESC} content deve seguir a convenção FACT/DECISION/RISK quando aplicável. scope define o nível de isolamento (USER/AGENT/SESSION/CLIENT/PROJECT); visibility controla quem pode ler (PRIVATE = só o dono, WORKSPACE = todo o workspace).`,
  inputSchema: {
    scope: z
      .enum(['USER', 'AGENT', 'SESSION', 'CLIENT', 'PROJECT'])
      .describe('Nível de isolamento da memória'),
    memoryType: z
      .enum(['FACT', 'PREFERENCE', 'DECISION', 'RELATIONSHIP', 'INSTRUCTION'])
      .describe('Tipo do registro'),
    content: z.string().min(1).describe('Corpo da memória — convenção FACT/DECISION/RISK'),
    summary: z.string().optional().describe('Resumo curto (usado em listagens/prompt)'),
    sourceType: z.enum(['CONVERSATION', 'DOCUMENT', 'MANUAL']).describe('Origem do registro'),
    clientSlug: z.string().optional().describe('Slug do cliente (quando scope=CLIENT)'),
    agentId: z.string().optional().describe('ID do agente (quando scope=AGENT)'),
    sessionId: z.string().optional().describe('ID da sessão (quando scope=SESSION)'),
    projectSlug: z.string().optional().describe('Slug do projeto (quando scope=PROJECT)'),
    visibility: z
      .enum(['PRIVATE', 'WORKSPACE'])
      .optional()
      .describe('Quem pode ler. Omitir usa o default do workspace (memoryDefaultVisibility).'),
    importance: z.number().min(0).max(1).optional(),
    confidence: z.enum(['EVIDENCE', 'SYNTHETIC']).optional(),
    sourceRef: z.string().optional().describe('Referência da origem'),
  },
  handler: async (input, endpoints) =>
    endpoints.createMemory({
      scope: input.scope,
      memoryType: input.memoryType,
      content: input.content,
      summary: input.summary,
      sourceType: input.sourceType,
      clientSlug: input.clientSlug,
      agentId: input.agentId,
      sessionId: input.sessionId,
      projectSlug: input.projectSlug,
      visibility: input.visibility,
      importance: input.importance,
      confidence: input.confidence,
      sourceRef: input.sourceRef,
    }),
});

export const memoryTools = [memorySearch, memoryAdd];
