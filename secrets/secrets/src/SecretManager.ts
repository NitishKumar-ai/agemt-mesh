export interface SecretManager {
  getSecret(key: string, agentId?: string, tenantId?: string): Promise<string | undefined>;
}
