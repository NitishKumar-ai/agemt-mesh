import { Connector, ConnectorConfig, IEpisode, scalekitActions } from '@company-knowledge-os/core';
import { ConnectorStatus } from '@scalekit-sdk/node/lib/pkg/grpc/scalekit/v1/connected_accounts/connected_accounts_pb';
import crypto from 'crypto';

function getRepoFromUrl(url?: string): string {
  if (!url) return 'unknown-repo';
  const match = url.match(/github\.com\/([^\/]+\/[^\/]+)/);
  return match ? match[1] : 'unknown-repo';
}

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
      const data: any = await this.executeToolWithAuth('github_fetch_commits', {
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
      const data: any = await this.executeToolWithAuth('github_fetch_pull_requests', {
        since: since.toISOString()
      });
      const prs = data?.pull_requests || [];
      episodes.push(...prs.map((pr: any) => this.pullRequestToEpisode(pr)));
    } catch (e) {
      console.error('Error fetching PRs via Scalekit', e);
    }
    return episodes;
  }

  private async fetchIssues(since: Date): Promise<IEpisode[]> {
    const episodes: IEpisode[] = [];
    try {
      const data: any = await this.executeToolWithAuth('github_fetch_issues', {
        since: since.toISOString()
      });
      const issues = data?.issues || [];
      episodes.push(...issues.map((issue: any) => this.issueToEpisode(issue)));
    } catch (e) {
      console.error('Error fetching issues via Scalekit', e);
    }
    return episodes;
  }

  async fetchObject(sourceId: string): Promise<IEpisode> {
    const data: any = await this.executeToolWithAuth('github_fetch_commit', {
      sha: sourceId
    });
    if (!data?.commit) {
      throw new Error(`GitHub object ${sourceId} not found`);
    }
    return this.commitToEpisode(data.commit);
  }

  private commitToEpisode(commit: any): IEpisode {
    const dateStr = commit.commit?.author?.date || new Date().toISOString();
    const repo = commit.repository?.full_name || getRepoFromUrl(commit.html_url || commit.url);
    const episode: IEpisode = {
      episode_id: this.generateUUID(),
      tenant_id: '', // Set by orchestrator
      source_system: 'github',
      source_id: `${repo}@${commit.sha}`,
      source_version: commit.sha,
      raw_pointer: commit.html_url || '',
      parsed_hash: this.hashObject(commit),
      parsed_content: {
        repo,
        sha: commit.sha,
        text: commit.commit?.message,
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
      author: commit.commit?.author?.name ?? commit.author?.login ?? 'unknown',
      created_at: new Date(dateStr),
      ingested_at: new Date(),
    };

    return episode;
  }

  private pullRequestToEpisode(pr: any): IEpisode {
    const repo = pr.repository?.full_name || getRepoFromUrl(pr.html_url || pr.url);
    return {
      episode_id: this.generateUUID(),
      tenant_id: '',
      source_system: 'github',
      source_id: `${repo}#pr-${pr.number}`,
      source_version: pr.updated_at,
      raw_pointer: pr.html_url || '',
      parsed_hash: this.hashObject(pr),
      parsed_content: {
        repo,
        number: pr.number,
        title: pr.title,
        text: `${pr.title}\n\n${pr.body ?? ''}`,
        body: pr.body,
        state: pr.state,
        merged: pr.merged_at != null,
        user: pr.user?.login,
        url: pr.html_url,
        html_url: pr.html_url,
        timestamp: new Date(pr.updated_at),
      },
      author: pr.user?.login ?? 'unknown',
      created_at: new Date(pr.created_at ?? pr.updated_at),
      ingested_at: new Date(),
    };
  }

  private issueToEpisode(issue: any): IEpisode {
    const repo = issue.repository?.full_name || getRepoFromUrl(issue.html_url || issue.url);
    return {
      episode_id: this.generateUUID(),
      tenant_id: '',
      source_system: 'github',
      source_id: `${repo}#issue-${issue.number}`,
      source_version: issue.updated_at,
      raw_pointer: issue.html_url || '',
      parsed_hash: this.hashObject(issue),
      parsed_content: {
        repo,
        number: issue.number,
        title: issue.title,
        text: `${issue.title}\n\n${issue.body ?? ''}`,
        body: issue.body,
        state: issue.state,
        user: issue.user?.login,
        labels: (issue.labels || []).map((l: any) => (typeof l === 'string' ? l : l.name)),
        url: issue.html_url,
        html_url: issue.html_url,
        timestamp: new Date(issue.updated_at),
      },
      author: issue.user?.login ?? 'unknown',
      created_at: new Date(issue.created_at ?? issue.updated_at),
      ingested_at: new Date(),
    };
  }

  private hashObject(obj: any): string {
    const content = JSON.stringify(obj);
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
    if (!this.config.webhook_secret || !signature) return false;

    const expected =
      'sha256=' + crypto.createHmac('sha256', this.config.webhook_secret).update(payload).digest('hex');

    const expectedBuf = Buffer.from(expected);
    const signatureBuf = Buffer.from(signature);
    if (expectedBuf.length !== signatureBuf.length) return false;

    return crypto.timingSafeEqual(expectedBuf, signatureBuf);
  }

  async processWebhook(payload: any): Promise<void> {
    console.log('Processing GitHub webhook:', payload);
  }
}
