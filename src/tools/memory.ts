import { z } from 'zod';
import { defineTool } from './types.js';

const MEMORY_DESC =
  'Memória = fato/registro atômico otimizado para recall futuro do agente (preferência, decisão, fato sobre um cliente/projeto). NÃO use para documentação extensa — isso é Biblioteca (wiki_node_write). Corpo deve seguir convenção FACT/DECISION/RISK quando aplicável.';

const MEMORY_TYPE_VALUES = [
  'FACT',
  'PREFERENCE',
  'DECISION',
  'RELATIONSHIP',
  'INSTRUCTION',
  'EVENT',
  'ARCHITECTURE',
  'FEATURE',
  'RISK',
  'LESSON',
] as const;

const MEMORY_VISIBILITY_VALUES = ['PRIVATE', 'WORKSPACE', 'ORGANIZATION'] as const;

const RETRIEVAL_SCHEMA = z
  .object({
    exactSearchKeys: z
      .array(z.string())
      .optional()
      .describe('Chaves de busca exata (match literal) para recall dessa memória'),
    fuzzySearchKeys: z
      .array(z.string())
      .optional()
      .describe('Chaves de busca aproximada (fuzzy) para recall dessa memória'),
    loadWhen: z
      .record(z.string(), z.unknown())
      .optional()
      .describe('Condições (chave/valor) sob as quais essa memória deve ser pré-carregada'),
    priority: z
      .enum(['high', 'medium', 'low'])
      .optional()
      .describe('Prioridade de recall/carregamento da memória'),
    aliases: z.array(z.string()).optional().describe('Apelidos/sinônimos para recall'),
  })
  .strict()
  .describe('Metadados de recuperação — controla como/quando a memória é recarregada');

export const memorySearch = defineTool({
  name: 'memory_search',
  description: `Busca semântica nas Memórias do agente/usuário. ${MEMORY_DESC} Retorna memórias relevantes ordenadas por similaridade (score).`,
  inputSchema: {
    query: z.string().min(1).describe('Texto ou pergunta para buscar'),
    clientSlug: z.string().optional().describe('Slug do cliente para filtrar memórias'),
    agentId: z.string().uuid().optional().describe('ID do agente para filtrar memórias'),
    sessionId: z.string().optional().describe('Filtra por ID de sessão (recall por conversa)'),
    projectSlug: z.string().optional().describe('Filtra por slug de projeto'),
    topK: z
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .describe('Número máximo de resultados (padrão: 10)'),
    memoryType: z
      .array(z.enum(MEMORY_TYPE_VALUES))
      .optional()
      .describe('Filtra por tipo(s) de memória'),
    minImportance: z
      .number()
      .min(0)
      .max(1)
      .optional()
      .describe('Importância mínima (0..1) para incluir no resultado'),
  },
  handler: async (input, endpoints) =>
    endpoints.searchMemory({
      query: input.query,
      clientSlug: input.clientSlug,
      agentId: input.agentId,
      sessionId: input.sessionId,
      projectSlug: input.projectSlug,
      topK: input.topK,
      memoryType: input.memoryType,
      minImportance: input.minImportance,
    }),
});

export const memoryAdd = defineTool({
  name: 'memory_add',
  description: `Cria uma Memória — fato/registro atômico otimizado para recall futuro do agente. ${MEMORY_DESC} content deve seguir a convenção FACT/DECISION/RISK quando aplicável. scope define o nível de isolamento (USER/AGENT/SESSION/CLIENT/PROJECT); visibility controla quem pode ler (PRIVATE = só o dono, WORKSPACE = todo o workspace, ORGANIZATION = visível/gerenciável de qualquer workspace da mesma organização — ex.: uma lição geral válida para todos os clientes). memoryType LESSON = aprendizado/lição extraída de uma situação, tipicamente promovida a visibility=ORGANIZATION quando generalizável.`,
  inputSchema: {
    scope: z
      .enum(['USER', 'AGENT', 'SESSION', 'CLIENT', 'PROJECT'])
      .describe('Nível de isolamento da memória'),
    memoryType: z.enum(MEMORY_TYPE_VALUES).describe('Tipo do registro'),
    content: z.string().min(1).describe('Corpo da memória — convenção FACT/DECISION/RISK'),
    summary: z.string().optional().describe('Resumo curto (usado em listagens/prompt)'),
    sourceType: z.enum(['CONVERSATION', 'DOCUMENT', 'MANUAL']).describe('Origem do registro'),
    clientSlug: z.string().optional().describe('Slug do cliente (quando scope=CLIENT)'),
    agentId: z.string().uuid().optional().describe('ID do agente (quando scope=AGENT)'),
    sessionId: z.string().optional().describe('ID da sessão (quando scope=SESSION)'),
    projectSlug: z.string().optional().describe('Slug do projeto (quando scope=PROJECT)'),
    visibility: z
      .enum(MEMORY_VISIBILITY_VALUES)
      .optional()
      .describe(
        'Quem pode ler/gerenciar. PRIVATE = só o dono, WORKSPACE = todo o workspace, ORGANIZATION = qualquer workspace da mesma organização (lição geral pra todos os clientes). Omitir usa o default do workspace (memoryDefaultVisibility).',
      ),
    importance: z.number().min(0).max(1).optional(),
    confidence: z.enum(['EVIDENCE', 'SYNTHETIC']).optional(),
    sourceRef: z.string().optional().describe('Referência da origem'),
    slug: z.string().optional().describe('Slug único opcional da memória'),
    retrieval: RETRIEVAL_SCHEMA.optional(),
    wikiId: z.string().optional().describe('ID da wiki relacionada (uuid)'),
    wikiNodeId: z.string().optional().describe('ID do nó da wiki relacionado (uuid)'),
    sourceChunkId: z
      .string()
      .optional()
      .describe('ID do chunk de origem, quando a memória vem de um documento indexado (uuid)'),
    eventDate: z
      .string()
      .optional()
      .describe('Data ISO do evento/fato descrito (quando diferente da data de criação)'),
    metadata: z
      .record(z.string(), z.unknown())
      .optional()
      .describe('Metadados livres em formato chave/valor'),
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
      slug: input.slug,
      retrieval: input.retrieval,
      wikiId: input.wikiId,
      wikiNodeId: input.wikiNodeId,
      sourceChunkId: input.sourceChunkId,
      eventDate: input.eventDate,
      metadata: input.metadata,
    }),
});

export const memoryBootstrap = defineTool({
  name: 'memory_bootstrap',
  description:
    'Lista memórias do escopo por importância (não-semântica) — use no início da sessão pra carregar o contexto relevante; filtre por tipo/importância pra não trazer memórias irrelevantes. Retorna uma projeção compacta (sem o content inteiro) pra não estourar o contexto do agente.',
  inputSchema: {
    clientSlug: z.string().optional().describe('Slug do cliente para filtrar memórias'),
    agentId: z.string().uuid().optional().describe('ID do agente para filtrar memórias'),
    sessionId: z.string().optional().describe('Filtra por ID de sessão (recall por conversa)'),
    projectSlug: z.string().optional().describe('Filtra por slug de projeto'),
    memoryType: z
      .array(z.enum(MEMORY_TYPE_VALUES))
      .optional()
      .describe('Filtra por tipo(s) de memória'),
    minImportance: z
      .number()
      .min(0)
      .max(1)
      .optional()
      .describe('Importância mínima (0..1) para incluir no resultado'),
    limit: z
      .number()
      .int()
      .min(1)
      .optional()
      .describe('Número máximo de memórias retornadas'),
  },
  handler: async (input, endpoints) => {
    const result = await endpoints.bootstrapMemory({
      clientSlug: input.clientSlug,
      agentId: input.agentId,
      sessionId: input.sessionId,
      projectSlug: input.projectSlug,
      memoryType: input.memoryType,
      minImportance: input.minImportance,
      limit: input.limit,
    });
    const list = Array.isArray(result) ? result : [];
    return list.map((m: Record<string, unknown>) => ({
      publicId: m.publicId,
      memoryType: m.memoryType,
      importance: m.importance,
      summary: m.summary,
      scope: m.scope,
    }));
  },
});

export const memoryUpdate = defineTool({
  name: 'memory_update',
  description:
    'Edita uma memória: conteúdo, resumo, slug, tipo, escopo, importância e/ou visibilidade. Editar content/summary re-gera o embedding. Promova a visibility=ORGANIZATION para valer em todos os workspaces da org. NÃO apaga — para remover use memory_deactivate.',
  inputSchema: {
    id: z.string().min(1).describe('ID ou publicId da memória'),
    content: z
      .string()
      .min(1)
      .optional()
      .describe('Novo corpo da memória (re-gera o embedding)'),
    summary: z
      .string()
      .optional()
      .describe('Novo resumo curto (re-gera o embedding)'),
    slug: z.string().optional().describe('Novo slug da memória'),
    memoryType: z.enum(MEMORY_TYPE_VALUES).optional().describe('Novo tipo do registro'),
    scope: z
      .enum(['USER', 'AGENT', 'SESSION', 'CLIENT', 'PROJECT'])
      .optional()
      .describe('Novo nível de isolamento da memória'),
    importance: z.number().min(0).max(1).optional().describe('Nova importância (0..1)'),
    visibility: z
      .enum(MEMORY_VISIBILITY_VALUES)
      .optional()
      .describe(
        'Nova visibilidade. ORGANIZATION promove a memória para qualquer workspace da mesma organização (ex.: lição geral pra todos os clientes).',
      ),
    clientSlug: z.string().optional().describe('Slug do cliente para filtrar/isolar'),
    agentId: z.string().uuid().optional().describe('ID do agente para filtrar/isolar'),
    confidence: z
      .enum(['EVIDENCE', 'SYNTHETIC'])
      .optional()
      .describe('Nova confiança: EVIDENCE (observado) ou SYNTHETIC (inferido)'),
    retrieval: RETRIEVAL_SCHEMA.optional(),
    metadata: z
      .record(z.string(), z.unknown())
      .optional()
      .describe('Novos metadados livres em formato chave/valor (substitui os existentes)'),
    isActive: z
      .boolean()
      .optional()
      .describe('Reativa uma memória soft-deleted quando true'),
  },
  handler: async (input, endpoints) => {
    if (
      input.content === undefined &&
      input.summary === undefined &&
      input.slug === undefined &&
      input.memoryType === undefined &&
      input.scope === undefined &&
      input.visibility === undefined &&
      input.importance === undefined &&
      input.confidence === undefined &&
      input.retrieval === undefined &&
      input.metadata === undefined &&
      input.isActive === undefined
    ) {
      throw new Error(
        'Informe ao menos um campo para editar: content, summary, slug, memoryType, scope, visibility, importance, confidence, retrieval, metadata ou isActive.',
      );
    }
    return endpoints.updateMemory(
      input.id,
      {
        content: input.content,
        summary: input.summary,
        slug: input.slug,
        memoryType: input.memoryType,
        scope: input.scope,
        visibility: input.visibility,
        importance: input.importance,
        confidence: input.confidence,
        retrieval: input.retrieval,
        metadata: input.metadata,
        isActive: input.isActive,
      },
      { clientSlug: input.clientSlug, agentId: input.agentId },
    );
  },
});

export const memoryGet = defineTool({
  name: 'memory_get',
  description:
    'Lê uma memória específica por ID ou publicId. Retorna o registro completo (content, summary, tipo, escopo, importância, visibilidade).',
  inputSchema: {
    id: z.string().min(1).describe('ID ou publicId da memória'),
    clientSlug: z.string().optional().describe('Slug do cliente para filtrar/isolar'),
    agentId: z.string().uuid().optional().describe('ID do agente para filtrar/isolar'),
  },
  handler: async (input, endpoints) =>
    endpoints.getMemory(input.id, { clientSlug: input.clientSlug, agentId: input.agentId }),
});

export const memoryDeactivate = defineTool({
  name: 'memory_deactivate',
  description:
    'Remove (SOFT-delete, reversível) uma memória: marca isActive=false e registra deletedAt. NÃO apaga fisicamente o registro.',
  inputSchema: {
    id: z.string().min(1).describe('ID ou publicId da memória'),
    clientSlug: z.string().optional().describe('Slug do cliente para filtrar/isolar'),
    agentId: z.string().uuid().optional().describe('ID do agente para filtrar/isolar'),
  },
  handler: async (input, endpoints) =>
    endpoints.deactivateMemory(input.id, {
      clientSlug: input.clientSlug,
      agentId: input.agentId,
    }),
});

export const memoryGcCandidates = defineTool({
  name: 'memory_gc_candidates',
  description:
    "Lista memórias 'frias' (baixa importância, sem acesso, antigas) como SUGESTÃO de limpeza — cada uma com suggestedAction (downgrade/soft-delete) e motivo. NÃO altera nada; a decisão de rebaixar/remover é humana.",
  inputSchema: {
    maxImportance: z
      .number()
      .min(0)
      .max(1)
      .optional()
      .describe('Importância máxima para considerar candidata (padrão do backend: 0.3)'),
    maxAccessCount: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe('Número máximo de acessos para considerar candidata (padrão: 1)'),
    inactiveDays: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe('Dias sem acesso/desde criação para considerar fria (padrão: 90)'),
    limit: z.number().int().min(1).optional().describe('Número máximo de resultados'),
    clientSlug: z.string().optional().describe('Slug do cliente para filtrar memórias'),
    agentId: z.string().uuid().optional().describe('ID do agente para filtrar memórias'),
  },
  handler: async (input, endpoints) => {
    const result = await endpoints.gcCandidatesMemory({
      maxImportance: input.maxImportance,
      maxAccessCount: input.maxAccessCount,
      inactiveDays: input.inactiveDays,
      limit: input.limit,
      clientSlug: input.clientSlug,
      agentId: input.agentId,
    });
    const list = Array.isArray(result) ? result : [];
    return list.map((m: Record<string, unknown>) => ({
      publicId: m.publicId,
      memoryType: m.memoryType,
      importance: m.importance,
      accessCount: m.accessCount,
      lastAccessed: m.lastAccessed,
      suggestedAction: m.suggestedAction,
      reason: m.reason,
    }));
  },
});

export const memoryConsolidate = defineTool({
  name: 'memory_consolidate',
  description:
    'Enfileira um job de consolidação de memória a partir de material bruto (ex.: transcrição de conversa). O backend processa assincronamente e extrai uma ou mais memórias atômicas do material — não retorna as memórias já criadas, só confirma o enfileiramento.',
  inputSchema: {
    material: z.string().min(1).describe('Material bruto a consolidar (ex.: transcrição)'),
    sessionId: z.string().min(1).describe('ID da sessão de origem do material'),
    agentId: z.string().uuid().optional().describe('ID do agente relacionado'),
    clientSlug: z.string().optional().describe('Slug do cliente relacionado'),
  },
  handler: async (input, endpoints) =>
    endpoints.consolidateMemory({
      material: input.material,
      sessionId: input.sessionId,
      agentId: input.agentId,
      clientSlug: input.clientSlug,
    }),
});

const MEMORY_LINK_TARGET_TYPES = ['MEMORY', 'WIKI_NODE'] as const;
const MEMORY_LINK_TYPES = [
  'DEPENDS_ON',
  'ELABORATED_BY',
  'SUPPORTS',
  'SUPERSEDES',
  'RELATES_TO',
  'CONTRADICTS',
] as const;

export const memoryLinkAdd = defineTool({
  name: 'memory_link_add',
  description:
    'Cria um link no grafo de memórias, ligando uma memória de origem a outra memória ou a um nó da wiki. Tipos de link: DEPENDS_ON (depende de), ELABORATED_BY (elaborada por), SUPPORTS (apoia), SUPERSEDES (substitui), RELATES_TO (relacionada a), CONTRADICTS (contradiz). Use para modelar relações explícitas entre fatos/decisões.',
  inputSchema: {
    id: z.string().min(1).describe('ID ou publicId da memória de origem'),
    targetType: z.enum(MEMORY_LINK_TARGET_TYPES).describe('Tipo do alvo do link'),
    targetMemoryId: z
      .string()
      .optional()
      .describe('ID da memória alvo (quando targetType=MEMORY)'),
    targetNodeId: z
      .string()
      .optional()
      .describe('ID do nó da wiki alvo (quando targetType=WIKI_NODE)'),
    targetRef: z.string().optional().describe('Referência textual alternativa do alvo'),
    linkType: z.enum(MEMORY_LINK_TYPES).describe('Natureza da relação entre origem e alvo'),
    reason: z.string().optional().describe('Motivo/explicação do link'),
  },
  handler: async (input, endpoints) =>
    endpoints.createMemoryLink(input.id, {
      targetType: input.targetType,
      targetMemoryId: input.targetMemoryId,
      targetNodeId: input.targetNodeId,
      targetRef: input.targetRef,
      linkType: input.linkType,
      reason: input.reason,
    }),
});

export const memoryLinksList = defineTool({
  name: 'memory_links_list',
  description:
    'Lista os links de uma memória no grafo de memórias (relações DEPENDS_ON, SUPERSEDES, RELATES_TO etc. com outras memórias ou nós da wiki).',
  inputSchema: {
    id: z.string().min(1).describe('ID ou publicId da memória de origem'),
  },
  handler: async (input, endpoints) => endpoints.listMemoryLinks(input.id),
});

export const memoryLinkDelete = defineTool({
  name: 'memory_link_delete',
  description: 'Remove um link do grafo de memórias pelo seu ID.',
  inputSchema: {
    linkId: z.string().min(1).describe('ID do link a remover'),
  },
  handler: async (input, endpoints) => endpoints.deleteMemoryLink(input.linkId),
});

export const memoryList = defineTool({
  name: 'memory_list',
  description:
    'Índice de curadoria — devolve resumos + publicId, SEM content (use memory_get pra ler o corpo); filtrável por tipo/escopo/visibilidade, ordenado por recência, paginado via cursor (nextCursor/hasMore).',
  inputSchema: {
    clientSlug: z.string().optional().describe('Slug do cliente para filtrar memórias'),
    agentId: z.string().uuid().optional().describe('ID do agente para filtrar memórias'),
    sessionId: z.string().optional().describe('Filtra por ID de sessão (recall por conversa)'),
    projectSlug: z.string().optional().describe('Filtra por slug de projeto'),
    memoryType: z
      .array(z.enum(MEMORY_TYPE_VALUES))
      .optional()
      .describe('Filtra por tipo(s) de memória'),
    scope: z
      .enum(['USER', 'AGENT', 'SESSION', 'CLIENT', 'PROJECT'])
      .optional()
      .describe('Filtra por escopo de isolamento da memória'),
    visibility: z
      .enum(MEMORY_VISIBILITY_VALUES)
      .optional()
      .describe('Filtra por visibilidade da memória'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(200)
      .optional()
      .describe('Número máximo de memórias por página (padrão: 50, teto: 200)'),
    cursor: z
      .string()
      .optional()
      .describe('Cursor opaco (nextCursor da página anterior) para continuar a paginação'),
  },
  handler: async (input, endpoints) =>
    endpoints.listMemories({
      clientSlug: input.clientSlug,
      agentId: input.agentId,
      sessionId: input.sessionId,
      projectSlug: input.projectSlug,
      memoryType: input.memoryType,
      scope: input.scope,
      visibility: input.visibility,
      limit: input.limit,
      cursor: input.cursor,
    }),
});

export const memoryTools = [
  memorySearch,
  memoryAdd,
  memoryBootstrap,
  memoryUpdate,
  memoryGcCandidates,
  memoryGet,
  memoryDeactivate,
  memoryConsolidate,
  memoryLinkAdd,
  memoryLinksList,
  memoryLinkDelete,
  memoryList,
];
