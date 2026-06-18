import { SecretManagerServiceClient } from '@google-cloud/secret-manager';
import { SecretManager } from './SecretManager.js';

export class GcpSecretManagerProvider implements SecretManager {
  private client: SecretManagerServiceClient;

  constructor(private projectId: string) {
    this.client = new SecretManagerServiceClient();
  }

  async getSecret(key: string, agentId?: string, tenantId?: string): Promise<string | undefined> {
    try {
      const name = `projects/${this.projectId}/secrets/${key}/versions/latest`;
      const [version] = await this.client.accessSecretVersion({ name });

      const payload = version.payload?.data?.toString();

      // Audit log the secret access
      console.log(
        JSON.stringify({
          timestamp: new Date().toISOString(),
          action: 'SECRET_ACCESS',
          secretKey: key,
          agentId: agentId || 'unknown',
          tenantId: tenantId || 'unknown',
        }),
      );

      return payload;
    } catch (error) {
      console.error(`[SecretManager] Error accessing secret ${key}:`, error);
      return undefined;
    }
  }
}
