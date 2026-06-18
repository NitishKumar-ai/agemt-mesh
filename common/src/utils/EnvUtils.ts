/**
 * Port of `com.agentmesh.agentmesh.common.utils.EnvUtils`.
 */
export const SystemParameters = {
  CPEWF_TASK_ID: 'CPEWF_TASK_ID',
  AGENTMESH_ENV: 'AGENTMESH_ENV',
  AGENTMESH_STACK: 'AGENTMESH_STACK',
} as const;
export type SystemParameters = (typeof SystemParameters)[keyof typeof SystemParameters];

export function isEnvironmentVariable(test: string): boolean {
  if (Object.values(SystemParameters).includes(test as SystemParameters)) {
    return true;
  }
  return process.env[test] !== undefined;
}

export function getSystemParametersValue(sysParam: string, taskId?: string): string | undefined {
  if (sysParam === SystemParameters.CPEWF_TASK_ID) {
    return taskId;
  }
  return process.env[sysParam];
}

export const EnvUtils = {
  SystemParameters,
  isEnvironmentVariable,
  getSystemParametersValue,
};
