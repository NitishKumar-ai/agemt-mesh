const fs = require('fs');
const path = require('path');

const packagesDir = path.join(__dirname, 'packages');

const tsconfigContent = `{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "lib": ["ES2022"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}`;

// 1. Ensure all packages have tsconfig.json
const packages = fs.readdirSync(packagesDir);
for (const pkg of packages) {
  const pkgDir = path.join(packagesDir, pkg);
  if (fs.statSync(pkgDir).isDirectory()) {
    const tsconfigPath = path.join(pkgDir, 'tsconfig.json');
    if (!fs.existsSync(tsconfigPath)) {
      fs.writeFileSync(tsconfigPath, tsconfigContent);
      console.log(`Created tsconfig.json in ${pkg}`);
    }
  }
}

// 2. Create the missing connectors
const missingConnectors = [
  'googlecalendar', 'hubspot', 'jira', 'salesforce', 
  'outlook', 'linear', 'zoom', 'gong', 'airtable'
];

for (const connector of missingConnectors) {
  const pkgName = `connector-${connector}`;
  const pkgDir = path.join(packagesDir, pkgName);
  if (!fs.existsSync(pkgDir)) {
    fs.mkdirSync(pkgDir);
    fs.mkdirSync(path.join(pkgDir, 'src'));
    
    // package.json
    fs.writeFileSync(path.join(pkgDir, 'package.json'), JSON.stringify({
      name: `@company-knowledge-os/${pkgName}`,
      version: "1.0.0",
      private: true,
      description: `${connector} connector for company knowledge OS`,
      main: "./dist/index.js",
      types: "./dist/index.d.ts",
      scripts: {
        build: "tsc",
        dev: "tsc --watch",
        test: "vitest",
        lint: "eslint src --ext .ts",
        clean: "rm -rf dist"
      },
      dependencies: {
        "@company-knowledge-os/core": "workspace:*",
        "@scalekit-sdk/node": "^2.6.3"
      },
      devDependencies: {
        "@types/node": "^20.0.0",
        "typescript": "^5.4.0",
        "vitest": "^1.0.0"
      }
    }, null, 2));
    
    // tsconfig.json
    fs.writeFileSync(path.join(pkgDir, 'tsconfig.json'), tsconfigContent);
    
    // index.ts
    fs.writeFileSync(path.join(pkgDir, 'src', 'index.ts'), `export * from './${connector}-connector';\n`);
    
    // connector.ts
    const connectorContent = `import { Connector, ConnectorConfig, IEpisode, scalekitActions } from '@company-knowledge-os/core';
import { ConnectorStatus } from '@scalekit-sdk/node/lib/pkg/grpc/scalekit/v1/connected_accounts/connected_accounts_pb';
import * as crypto from 'crypto';

export class ${connector.charAt(0).toUpperCase() + connector.slice(1)}Connector implements Connector {
  name = '${connector}';
  supportsWebhook = true;

  constructor(
    public config: ConnectorConfig = { enabled: true }
  ) {
    if (!config.identifier) {
      throw new Error('${connector} connector requires an identifier (User ID) in config to use Scalekit');
    }
  }

  async bootstrap(): Promise<void> {
    console.log('${connector} connector bootstrap started');
    await this.getConnectedAccount();
  }

  private async getConnectedAccount() {
    const response = await scalekitActions.getOrCreateConnectedAccount({
      connectionName: this.name,
      identifier: this.config.identifier!,
    });
    return response.connectedAccount;
  }

  async fetchChanges(since: Date): Promise<IEpisode[]> {
    const episodes: IEpisode[] = [];
    try {
      const connectedAccount = await this.getConnectedAccount();
      
      if (connectedAccount?.status !== ConnectorStatus.ACTIVE) {
        console.warn(\`${connector} is not connected for user \${this.config.identifier}. Status: \${connectedAccount?.status}\`);
        const linkResponse = await scalekitActions.getAuthorizationLink({
          connectionName: this.name,
          identifier: this.config.identifier!,
        });
        console.warn(\`🔗 User must click on this link to authorize ${connector}: \${linkResponse.link}\`);
        return [];
      }

      // Generic proxy call using actions.request
      const result = await scalekitActions.request({
        connectionName: this.name,
        identifier: this.config.identifier!,
        path: '/v1/changes', // Placeholder path
        method: 'GET',
        queryParams: { since: since.toISOString() },
      });
      
      const items: any[] = (result as any)?.data || (result as any)?.items || [];
      episodes.push(...items.map((item) => this.itemToEpisode(item)));

    } catch (error) {
      console.error('Error fetching ${connector} changes via Scalekit:', error);
      throw error;
    }
    return episodes;
  }

  async fetchObject(sourceId: string): Promise<IEpisode> {
    throw new Error('Method not implemented.');
  }

  private itemToEpisode(item: any): IEpisode {
    const episode: IEpisode = {
      episode_id: this.generateUUID(),
      tenant_id: '',
      source_system: '${connector}',
      source_id: item.id || '',
      source_version: item.version || '',
      raw_pointer: '',
      parsed_content: item,
      author: '',
      created_at: new Date(),
      ingested_at: new Date(),
    };
    return episode;
  }

  private generateUUID(): string {
    return crypto.randomUUID();
  }

  async subscribeWebhook(): Promise<void> {}
  validateWebhookSignature(payload: string, signature: string): boolean { return true; }
  async processWebhook(payload: any): Promise<void> {}
}
`;
    fs.writeFileSync(path.join(pkgDir, 'src', `${connector}-connector.ts`), connectorContent);
    console.log(`Created new package ${pkgName}`);
  }
}
