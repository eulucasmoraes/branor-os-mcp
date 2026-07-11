import { z } from 'zod';
import { defineTool } from './types.js';

export const listTasks = defineTool({
  name: 'list_tasks',
  description:
    'List tasks in a list. Useful to check campaign-related action items and progress. Returns status, priority, assignees.',
  inputSchema: {
    spaceId: z.string().describe('Space public ID or UUID'),
    listId: z.string().describe('List public ID or UUID'),
  },
  handler: async (input, endpoints) => endpoints.listTasks(input.spaceId, input.listId),
});

export const getTask = defineTool({
  name: 'get_task',
  description: 'Get full details of a single task including description and assignees.',
  inputSchema: {
    spaceId: z.string(),
    listId: z.string(),
    taskId: z.string().describe('Task public ID or UUID'),
  },
  handler: async (input, endpoints) =>
    endpoints.getTask(input.spaceId, input.listId, input.taskId),
});

export const createTask = defineTool({
  name: 'create_task',
  description:
    'Create a task for campaign action items (e.g. "Review creative fatigue on campaign X", "Upload new video for Q3 launch").',
  inputSchema: {
    spaceId: z.string(),
    listId: z.string(),
    title: z.string().min(1).max(500),
    description: z.string().max(10000).optional(),
    statusItemId: z.string().optional().describe('Status item UUID or publicId'),
    priority: z.number().int().min(0).max(10).optional(),
    dueAt: z.string().datetime().optional(),
    assigneeIds: z.array(z.string()).optional(),
  },
  handler: async (input, endpoints) =>
    endpoints.createTask(input.spaceId, input.listId, {
      title: input.title,
      description: input.description,
      statusItemId: input.statusItemId,
      priority: input.priority,
      dueAt: input.dueAt,
      assigneeIds: input.assigneeIds,
    }),
});

export const updateTask = defineTool({
  name: 'update_task',
  description:
    'Update a task (title, description, status, priority, due date). Use to mark action items as done after campaign changes.',
  inputSchema: {
    spaceId: z.string(),
    listId: z.string(),
    taskId: z.string(),
    title: z.string().min(1).max(500).optional(),
    description: z.string().max(10000).optional().nullable(),
    statusItemId: z.string().optional(),
    priority: z.number().int().min(0).max(10).optional().nullable(),
    dueAt: z.string().datetime().optional().nullable(),
  },
  handler: async (input, endpoints) =>
    endpoints.updateTask(input.spaceId, input.listId, input.taskId, {
      title: input.title,
      description: input.description,
      statusItemId: input.statusItemId,
      priority: input.priority,
      dueAt: input.dueAt,
    }),
});

export const taskTools = [listTasks, getTask, createTask, updateTask];
