import { Connector, ConnectorConfig, IEpisode, scalekitActions } from '@company-knowledge-os/core';
import { ConnectorStatus } from '@scalekit-sdk/node/lib/pkg/grpc/scalekit/v1/connected_accounts/connected_accounts_pb';
import crypto from 'crypto';

export interface GitHubWebhookPayload {
  event_type: string;
  delivery_id: string;
  repository: {
    id: number;
    full_name: string;
    url: string;
  };
  sender: {
    id: number;
    login: string;
    type: string;
  };
  [key: string]: any;
}

export class GitHubConnector implements Connector {
  name = 'github';
  supportsWebhook = true;

  constructor(
    public config: ConnectorConfig = { enabled: true }
  ) {
    if (!config.identifier) {
      throw new Error('GitHub connector requires an identifier (User ID) in config to use Scalekit');
    }
  }

  async bootstrap(): Promise<void> {
    console.log('GitHub connector bootstrap started');
    await this.getConnectedAccount();
  }

  private async getConnectedAccount() {
    const response = await scalekitActions.getOrCreateConnectedAccount({
      connectionName: this.name,
      identifier: this.config.identifier!,
    });
    return response.connectedAccount;
  }

  private async executeToolWithAuth(toolName: string, toolInput: any) {
    const connectedAccount = await this.getConnectedAccount();
    
    if (connectedAccount?.status !== ConnectorStatus.ACTIVE) {
      console.warn(`GitHub is not connected for user ${this.config.identifier}. Status: ${connectedAccount?.status}`);
      const linkResponse = await scalekitActions.getAuthorizationLink({
        connectionName: this.name,
        identifier: this.config.identifier!,
      });
      console.warn(`🔗 User must click on this link to authorize GitHub: ${linkResponse.link}`);
      throw new Error('GitHub not authorized');
    }

    const toolResponse = await scalekitActions.executeTool({
      toolName,
      connectedAccountId: connectedAccount?.id,
      toolInput,
    });
    
    return toolResponse.data;
  }

  async fetchChanges(since: Date): Promise<IEpisode[]> {
    const episodes: IEpisode[] = [];

    try {
      const commits = await this.fetchCommits(since);
      episodes.push(...commits);

      const prs = await this.fetchPullRequests(since);
      episodes.push(...prs);

      const issues = await this.fetchIssues(since);
      episodes.push(...issues);

    } catch (error) {
      if (error instanceof Error && error.message === 'GitHub not authorized') {
        return [];
      }
      console.error('Error fetching GitHub changes via Scalekit:', error);
      throw error;
    }

    return episodes;
  }

  private async fetchCommits(since: Date): Promise<IEpisode[]> {
    const episodes: IEpisode[] = [];
    try {
      const data = await this.executeToolWithAuth('github_fetch_commits', {
        since: since.toISOString()
      });
      const commits = data?.commits || [];
      episodes.push(...commits.map((c: any) => this.commitToEpisode(c)));
    } catch (e) {
      console.error('Error fetching commits via Scalekit', e);
    }
    return episodes;
  }

  private async fetchPullRequests(since: Date): Promise<IEpisode[]> {
    const episodes: IEpisode[] = [];
    try {
      const data = await this.executeToolWithAuth('github_fetch_pull_requests', {
        since: since.toISOString()
      });
      // Placeholder for mapping PRs
    } catch (e) {
      console.error('Error fetching PRs via Scalekit', e);
    }
    return episodes;
  }

  private async fetchIssues(since: Date): Promise<IEpisode[]> {
    const episodes: IEpisode[] = [];
    try {
      const data = await this.executeToolWithAuth('github_fetch_issues', {
        since: since.toISOString()
      });
      // Placeholder for mapping Issues
    } catch (e) {
      console.error('Error fetching issues via Scalekit', e);
    }
    return episodes;
  }

  async fetchObject(sourceId: string): Promise<IEpisode> {
    const data = await this.executeToolWithAuth('github_fetch_commit', {
      sha: sourceId
    });
    if (!data?.commit) {
      throw new Error(`GitHub object ${sourceId} not found`);
    }
    return this.commitToEpisode(data.commit);
  }

  private commitToEpisode(commit: any): IEpisode {
    const dateStr = commit.commit?.author?.date || new Date().toISOString();
    const episode: IEpisode = {
      episode_id: this.generateUUID(),
      tenant_id: '', // Set by orchestrator
      source_system: 'github',
      source_id: `${commit.sha}`,
      source_version: commit.sha,
      raw_pointer: commit.html_url || '',
      parsed_hash: this.hashCommit(commit),
      parsed_content: {
        sha: commit.sha,
        message: commit.commit?.message,
        author: commit.commit?.author?.name,
        author_email: commit.commit?.author?.email,
        committer: commit.commit?.committer?.name,
        committer_email: commit.commit?.committer?.email,
        url: commit.html_url,
        html_url: commit.html_url,
        stats: commit.stats,
        files: commit.files,
        timestamp: new Date(dateStr),
      },
      author: commit.commit?.author?.name || '',
      created_at: new Date(dateStr),
      ingested_at: new Date(),
    };

    return episode;
  }

  private hashCommit(commit: any): string {
    const content = JSON.stringify(commit);
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash.toString(16).padStart(8, '0');
  }

  private generateUUID(): string {
    return crypto.randomUUID();
  }

  async subscribeWebhook(): Promise<void> {
    if (!this.config.webhook_secret) {
      throw new Error('Webhook secret not configured');
    }
    console.log('GitHub webhook subscription started');
  }

  validateWebhookSignature(payload: string, signature: string): boolean {
    if (!this.config.webhook_secret) return false;
    return true; // Placeholder
  }

  async processWebhook(payload: any): Promise<void> {
    console.log('Processing GitHub webhook:', payload);
  }
}