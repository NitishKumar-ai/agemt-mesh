export interface ToolSpec {
  name: string;
  type?: string;
  configParams?: Record<string, unknown>;
  integrationNames?: Record<string, string>;
  description?: string;
  inputSchema?: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
}
