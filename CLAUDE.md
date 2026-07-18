# branor-os-mcp — Servidor MCP

> Repo git próprio: `github.com/eulucasmoraes/branor-os-mcp`. Faz parte do monorepo lógico **branor-os**
> (pastas `backend/`, `frontend/`, `mcp/` são repos separados; a raiz NÃO é repo).
> **Acesso às máquinas (homelab/manager02), fluxo de deploy e convenção de commit:** ver o `CLAUDE.md` da raiz `branor-os/`.

Servidor MCP que expõe as capacidades do branor-os para agentes: **Meta Ads** (leitura + escrita),
**memória**, **wiki**, **tasks**, **creative assets** e **workspaces**. É um cliente HTTP fino do backend
(`src/client/endpoints.ts`) — a lógica de verdade vive no backend; aqui é contrato de tools + mapeamento.

---

## Como rodar / validar

> ⚠️ **Não roda no Windows/SMB:** os symlinks do virtual store do pnpm não resolvem no share montado no Windows
> (`tsc`/`vitest` quebram com "Cannot find module"). **Valide no homelab** (mesmo working tree via SMB, mas
> `node_modules` instalado no Linux). Receita de acesso no `CLAUDE.md` da raiz.

```bash
pnpm typecheck   # tsc -p tsconfig.json --noEmit
pnpm test        # vitest run
pnpm lint        # eslint .
pnpm build       # tsc -p tsconfig.json
```

`pnpm install` só no homelab (line-endings do SMB + store Linux).

---

## Convenções das tools (não-óbvias)

- **`defineTool` + Zod `inputSchema`** em `src/tools/*.ts`. O Zod **descarta chaves não declaradas** — um
  campo que não está no `inputSchema` é silenciosamente removido e **nunca chega ao backend**. Ao adicionar
  um parâmetro, ele PRECISA estar no schema E ser encaminhado no `handler`.
- **Toda escrita exige `reason`** (alimenta o changelog) e **nasce PAUSED**.
- **`validate_only` (dry-run):** o flag da tool vira `execution_options: ['validate_only']` no body via helper
  `execOpts(validate_only)`. O backend, ao ver `validate_only`, **pula a persistência + changelog**. Todas as
  tools de escrita de Meta (`create/update_campaign`, `create/update_adset`, `create/update_ad`) seguem esse
  padrão — ao criar uma nova tool de escrita, **espelhe-o** (regressão histórica: `create_ad`/`update_ad`
  ficaram sem isso e o dry-run era ignorado, executando a escrita de verdade).
- **`resourceId`** é opcional na maioria das tools (seleciona o ConnectedResource/conta quando há mais de um).

---

## Estrutura

| Caminho | Papel |
| --- | --- |
| `src/tools/*.ts` | Definição das tools (`defineTool`, schema Zod, handler) |
| `src/tools/index.ts` | Registro agregado (`allTools`) |
| `src/client/endpoints.ts` | Cliente HTTP → backend (`/workspaces/{ws}/...`) |
| `src/client/http.ts` | `BranorOsClient` (fetch, auth por API key) |
| `src/server.ts` / `src/http.ts` / `src/index.ts` | Transportes MCP (stdio / streamable HTTP) |
| `src/__tests__/*.test.ts` | Vitest — os testes provam o request montado (URL, método, body) |

Padrão de teste: parseia o `inputSchema` com Zod, chama o `handler` com um `fetch` mockado e afirma o
request. Para escrita, afirmar que `validate_only` **não** vaza como chave crua e que virou
`execution_options`.
