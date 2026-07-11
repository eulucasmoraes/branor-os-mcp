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
  description: `Cria ou atualiza uma nota da Biblioteca (wiki node). ${LIBRARY_DESC} Informe nodeId para ATUALIZAR uma nota existente (rawContent/tags/name); omita nodeId para CRIAR uma nova nota (requer name; parentId opcional — omitido cria na raiz da wiki).`,
  inputSchema: {
    wikiId: z.string().describe('ID da wiki'),
    nodeId: z.string().optional().describe('ID ou publicId do node a atualizar. Omitir para criar.'),
    name: z.string().optional().describe('Nome do arquivo (obrigatório ao criar)'),
    parentId: z.string().optional().describe('ID da pasta pai (folder node). Omitir para raiz.'),
    rawContent: z.string().describe('Conteúdo completo da nota (markdown)'),
    kind: z.enum(['TEXT', 'CODE']).optional().describe('Tipo de conteúdo (somente ao criar)'),
    tags: z.array(z.string()).optional().describe('Tags da nota'),
  },
  handler: async (input, endpoints) => {
    if (input.nodeId) {
      return endpoints.updateWikiNode(input.wikiId, input.nodeId, {
        rawContent: input.rawContent,
        tags: input.tags,
      });
    }

    if (!input.name) {
      throw new Error('name é obrigatório ao criar uma nova nota');
    }

    return endpoints.createWikiNode(input.wikiId, {
      type: 'FILE',
      name: input.name,
      parentId: input.parentId,
      kind: input.kind ?? 'TEXT',
      rawContent: input.rawContent,
    });
  },
});

export const wikiTools = [wikiSearch, wikiNodeRead, wikiNodeWrite];
