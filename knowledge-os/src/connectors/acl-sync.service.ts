import { graphService } from '@agentmesh/graph-service';

export class ACLSyncService {
  constructor(private connectorAPI: any) {}

  async syncConnectorACLs(tenantId: string, connectorId: string): Promise<void> {
    try {
      // Fetch ACLs from connector source
      const aclData = await this.connectorAPI.getACLs(connectorId);

      // Store in graph with provenance
      await graphService.storeSourceACLs(tenantId, connectorId, aclData);

      // Update permission hashes for all affected facts
      await graphService.updatePermissionHashes(tenantId, aclData);
      
      console.log(`Successfully synced ACLs for connector ${connectorId}`);
    } catch (error) {
      console.error(`Failed to sync ACLs for connector ${connectorId}`, error);
      throw error;
    }
  }

  async syncAllConnectors(tenantId: string, connectorIds: string[]): Promise<void> {
    await Promise.allSettled(
      connectorIds.map(connectorId => this.syncConnectorACLs(tenantId, connectorId))
    );
  }
}

// Instantiate with a generic or provided connector API registry later
export const aclSyncService = new ACLSyncService(null);
