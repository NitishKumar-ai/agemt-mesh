import type { WorkflowModel } from './types.js';

export function resolveTaskInput(
  inputParams: Record<string, unknown>,
  workflow: WorkflowModel,
  taskId: string,
): Record<string, unknown> {
  const getTaskOutput = (taskRef: string): Record<string, unknown> | undefined => {
    // Reference names inside loops might have iteration suffix, e.g. "taskRef_1"
    const task = workflow.tasks.find((t) => t.referenceTaskName === taskRef);
    return task?.outputData;
  };

  const getTaskInput = (taskRef: string): Record<string, unknown> | undefined => {
    const task = workflow.tasks.find((t) => t.referenceTaskName === taskRef);
    return task?.inputData;
  };

  const resolveValue = (val: unknown): unknown => {
    if (typeof val === 'string') {
      if (val === '${CPEWF_TASK_ID}') {
        return taskId;
      }
      if (val.startsWith('${') && val.endsWith('}')) {
        const path = val.slice(2, -1).trim();
        const resolved = getValueByPath(path);
        return resolved !== undefined ? resolved : val;
      }
      // String interpolation: "some ${workflow.input.param} text"
      return val.replace(/\$\{([^}]+)\}/g, (match, path) => {
        const resolved = getValueByPath(path.trim());
        return resolved !== undefined ? String(resolved) : match;
      });
    }
    if (Array.isArray(val)) {
      return val.map(resolveValue);
    }
    if (val !== null && typeof val === 'object') {
      const result: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(val)) {
        result[k] = resolveValue(v);
      }
      return result;
    }
    return val;
  };

  const getValueByPath = (path: string): unknown => {
    const parts = path.split('.');
    if (parts[0] === 'workflow') {
      if (parts[1] === 'input') {
        return getNestedValue(workflow.input, parts.slice(2));
      }
      if (parts[1] === 'variables') {
        return getNestedValue(workflow.variables, parts.slice(2));
      }
    }
    // E.g. "taskRefName.output.paramName"
    const taskRef = parts[0];
    if (taskRef) {
      if (parts[1] === 'output') {
        const output = getTaskOutput(taskRef);
        return getNestedValue(output, parts.slice(2));
      }
      if (parts[1] === 'input') {
        const input = getTaskInput(taskRef);
        return getNestedValue(input, parts.slice(2));
      }
    }
    return undefined;
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const getNestedValue = (obj: any, pathParts: string[]): unknown => {
    let current = obj;
    for (const part of pathParts) {
      if (current === null || current === undefined) return undefined;
      current = current[part];
    }
    return current;
  };

  return resolveValue(inputParams) as Record<string, unknown>;
}
