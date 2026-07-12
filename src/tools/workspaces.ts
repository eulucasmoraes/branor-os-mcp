import { defineTool } from './types.js';

export const workspaceList = defineTool({
  name: 'workspace_list',
  description:
    'Lista os workspaces acessíveis pela API key (com key de organização, todos os workspaces da org). Use para DESCOBRIR o workspace_public_id exigido pelas demais tools.',
  workspaceScoped: false,
  inputSchema: {},
  handler: async (_input, endpoints) => {
    const result = await endpoints.listWorkspaces();
    const list = Array.isArray(result) ? result : [];
    return list.map((w: Record<string, unknown>) => {
      const membership = w.membership as Record<string, unknown> | undefined;
      return {
        publicId: w.publicId,
        name: w.name,
        type: w.type,
        organizationPublicId: w.organizationPublicId,
        role: membership?.baseRole,
      };
    });
  },
});

export const workspaceMembers = defineTool({
  name: 'workspace_members',
  description:
    'Lista os membros do workspace (papel + usuário), read-only. Útil pra atribuir tasks/resolver pessoas.',
  inputSchema: {},
  handler: async (_input, endpoints) => {
    const result = await endpoints.listWorkspaceMembers();
    const list = Array.isArray(result) ? result : [];
    return list.map((m: Record<string, unknown>) => {
      const user = m.user as Record<string, unknown> | undefined;
      return {
        membershipId: m.id,
        name: user?.name,
        email: user?.email,
        baseRole: m.baseRole,
        status: m.status,
      };
    });
  },
});

export const workspaceTools = [workspaceList, workspaceMembers];
