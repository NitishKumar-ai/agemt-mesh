import { Connector } from '@company-knowledge-os/core';

/**
 * Maps a source_system identifier (e.g. "slack", "github") to a live
 * Connector instance so the ingestion orchestrator can resolve connectors
 * at runtime instead of hard-coding them.
 */
export class ConnectorRegistry {
  private connectors = new Map<string, Connector>();

  register(connector: Connector): void {
    this.connectors.set(connector.name, connector);
  }

  get(sourceSystem: string): Connector | undefined {
    return this.connectors.get(sourceSystem);
  }

  getOrThrow(sourceSystem: string): Connector {
    const connector = this.connectors.get(sourceSystem);
    if (!connector) {
      throw new Error(`No connector registered for source system "${sourceSystem}"`);
    }
    return connector;
  }

  has(sourceSystem: string): boolean {
    return this.connectors.has(sourceSystem);
  }

  list(): string[] {
    return Array.from(this.connectors.keys());
  }
}
