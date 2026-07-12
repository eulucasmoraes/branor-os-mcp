import { z } from 'zod';
import { defineTool } from './types.js';

const LIBRARY_DESC =
  'Biblioteca (wiki node) = artefato escrito para SER LIDO (documentação, spec, lição, diário). NÃO use para fatos atômicos de recall — isso é Memória (memory_add).';

export const wikiSearch = defineTool({
  name: 'wiki_search',
  description: `Busca semântica + léxica numa wiki de conhecimento (Biblioteca). ${LIBRARY_DESC} Use para responder perguntas sobre documentos, procedures, ou conteúdo indexado. Retorna trechos (chunks) com score e o nodeId/path de origem — use wiki_node_read para ler a nota completa.`,
  inputSchema: {
    wikiId: z.string().describe('ID da wiki a pesquisar'),
    query: z.string().min(1).describe('Texto da consulta'),
    tags: z.array(z.string()).optional().describe('Filtrar por tags'),
    pathPrefix: z.string().optional().describe('Filtrar por prefixo de path (ex: /docs)'),
    kind: z.enum(['TEXT', 'CODE']).optional().describe('Filtrar por tipo de conteúdo'),
    topK: z
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .describe('Número máximo de resultados (padrão: 10)'),
  },
  handler: async (input, endpoints) =>
    endpoints.searchWiki(input.wikiId, {
      query: input.query,
      tags: input.tags,
      pathPrefix: input.pathPrefix,
      kind: input.kind,
      topK: input.topK,
    }),
});

export const wikiNodeRead = defineTool({
  name: 'wiki_node_read',
  description: `Lê uma nota da Biblioteca (wiki node) por ID. ${LIBRARY_DESC} Retorna o conteúdo completo (rawContent), path, tags e metadados — use depois de localizar o node via wiki_search.`,
  inputSchema: {
    wikiId: z.string().describe('ID da wiki'),
    nodeId: z.string().describe('ID (UUID) ou publicId do node'),
  },
  handler: async (input, endpoints) => endpoints.getWikiNode(input.wikiId, input.nodeId),
});

export const wikiNodeWrite = defineTool({
  name: 'wiki_node_write',
  description: `Cria ou atualiza um node da Biblioteca (wiki node — arquivo ou pasta). ${LIBRARY_DESC} Informe nodeId para ATUALIZAR um node existente (permite renomear via name, mover via parentId — null move para a raiz, reordenar via sortOrder, editar rawContent e tags); omita nodeId para CRIAR um novo node (requer name; type default FILE, use FOLDER para criar pastas; parentId opcional — omitido cria na raiz da wiki; aceita tags e sortOrder na criação).`,
  inputSchema: {
    wikiId: z.string().describe('ID da wiki'),
    nodeId: z.string().optional().describe('ID ou publicId do node a atualizar. Omitir para criar.'),
    name: z.string().optional().describe('Nome do node (obrigatório ao criar; opcional ao atualizar para renomear)'),
    type: z
      .enum(['FOLDER', 'FILE'])
      .optional()
      .describe("Tipo do node ao criar (padrão 'FILE'). Ignorado ao atualizar."),
    parentId: z
      .string()
      .nullable()
      .optional()
      .describe(
        'ID da pasta pai (folder node). Ao criar: omitir cria na raiz. Ao atualizar: informe null explicitamente para mover para a raiz; omita para não mover.',
      ),
    extension: z.string().optional().describe('Extensão do arquivo (somente ao criar)'),
    rawContent: z.string().optional().describe('Conteúdo completo da nota (markdown)'),
    kind: z.enum(['TEXT', 'CODE']).optional().describe('Tipo de conteúdo (somente ao criar)'),
    sortOrder: z.number().int().optional().describe('Posição de ordenação entre os irmãos'),
    tags: z.array(z.string()).optional().describe('Tags da nota'),
  },
  handler: async (input, endpoints) => {
    if (input.nodeId) {
      return endpoints.updateWikiNode(input.wikiId, input.nodeId, {
        ...(input.name !== undefined && { name: input.name }),
        ...(input.parentId !== undefined && { parentId: input.parentId }),
        ...(input.rawContent !== undefined && { rawContent: input.rawContent }),
        ...(input.sortOrder !== undefined && { sortOrder: input.sortOrder }),
        ...(input.tags !== undefined && { tags: input.tags }),
      });
    }

    if (!input.name) {
      throw new Error('name é obrigatório ao criar uma nova nota');
    }

    return endpoints.createWikiNode(input.wikiId, {
      type: input.type ?? 'FILE',
      name: input.name,
      ...(typeof input.parentId === 'string' && { parentId: input.parentId }),
      kind: input.kind ?? 'TEXT',
      ...(input.rawContent !== undefined && { rawContent: input.rawContent }),
      ...(input.extension !== undefined && { extension: input.extension }),
      ...(input.sortOrder !== undefined && { sortOrder: input.sortOrder }),
      ...(input.tags !== undefined && { tags: input.tags }),
    });
  },
});

export const wikiList = defineTool({
  name: 'wiki_list',
  description:
    'Lista as wikis (Bibliotecas) do workspace. Use para descobrir o wikiId exigido pelas demais tools de Biblioteca.',
  inputSchema: {},
  handler: async (_input, endpoints) => endpoints.listWikis(),
});

export const wikiTree = defineTool({
  name: 'wiki_tree',
  description: `Retorna a árvore hierárquica de nodes (pastas/arquivos) de uma wiki, para navegação sem busca semântica. ${LIBRARY_DESC}`,
  inputSchema: {
    wikiId: z.string().describe('ID da wiki'),
  },
  handler: async (input, endpoints) => endpoints.getWikiTree(input.wikiId),
});

export const wikiNodeDelete = defineTool({
  name: 'wiki_node_delete',
  description:
    'Remove (soft-delete recursivo) um node da Biblioteca e todos os seus descendentes.',
  inputSchema: {
    wikiId: z.string().describe('ID da wiki'),
    nodeId: z.string().describe('ID ou publicId do node a remover'),
  },
  handler: async (input, endpoints) => endpoints.deleteWikiNode(input.wikiId, input.nodeId),
});

export const wikiGraph = defineTool({
  name: 'wiki_graph',
  description: `Retorna o grafo de nodes + arestas resolvidas (links entre notas) de uma wiki. ${LIBRARY_DESC}`,
  inputSchema: {
    wikiId: z.string().describe('ID da wiki'),
  },
  handler: async (input, endpoints) => endpoints.getWikiGraph(input.wikiId),
});

export const wikiTools = [
  wikiSearch,
  wikiNodeRead,
  wikiNodeWrite,
  wikiList,
  wikiTree,
  wikiNodeDelete,
  wikiGraph,
];
