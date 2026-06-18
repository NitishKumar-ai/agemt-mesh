export interface ToolCall {
  taskReferenceName?: string;
  name?: string;
  integrationNames?: Record<string, string>;
  type: string;
  inputParameters?: Record<string, unknown>;
  output?: Record<string, unknown>;
}
