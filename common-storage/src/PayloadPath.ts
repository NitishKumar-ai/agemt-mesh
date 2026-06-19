/**
 * Helper for constructing standardised storage paths.
 */
export const PayloadPath = {
  workflowInput(workflowId: string): string {
    return `workflow/input/${workflowId}.json`;
  },

  workflowOutput(workflowId: string): string {
    return `workflow/output/${workflowId}.json`;
  },

  taskInput(taskId: string): string {
    return `task/input/${taskId}.json`;
  },

  taskOutput(taskId: string): string {
    return `task/output/${taskId}.json`;
  },

  fileStorage(workflowId: string, fileId: string): string {
    return `agentmesh/${workflowId}/${fileId}`;
  },
} as const;
