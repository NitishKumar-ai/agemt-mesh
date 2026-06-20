import { Connector, ConnectorConfig } from '@company-knowledge-os/core';
import { IEpisode } from '@company-knowledge-os/core';
import axios, { AxiosInstance } from 'axios';
import { createHmac, timingSafeEqual } from 'crypto';

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

  private http: AxiosInstance;

  constructor(
    private token: string,
    private webhookSecret?: string,
    public config: ConnectorConfig = { enabled: true },
    /**
     * Explicit list of "owner/repo" targets. When empty the connector
     * discovers the authenticated user's repositories.
     */
    private repos: string[] = []
  ) {
    this.http = axios.create({
      baseURL: 'https://api.github.com',
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });
  }

  async bootstrap(): Promise<void> {
    // Fetch historical commits, PRs, and issues
    console.log('GitHub connector bootstrap started');
  }

  async fetchChanges(since: Date): Promise<IEpisode[]> {
    const episodes: IEpisode[] = [];

    try {
      const repos = await this.getRepos();

      for (const repo of repos) {
        const commits = await this.fetchCommits(repo, since);
        episodes.push(...commits);

        const prs = await this.fetchPullRequests(repo, since);
        episodes.push(...prs);

        const issues = await this.fetchIssues(repo, since);
        episodes.push(...issues);
      }
    } catch (error) {
      console.error('Error fetching GitHub changes:', error);
      throw error;
    }

    return episodes;
  }

  async fetchObject(sourceId: string): Promise<IEpisode> {
    // sourceId format: "owner/repo@<sha>" for a commit
    const [repo, sha] = sourceId.split('@');
    if (!repo || !sha) {
      throw new Error(`Invalid GitHub source_id "${sourceId}", expected "owner/repo@<sha>"`);
    }

    const { data } = await this.http.get(`/repos/${repo}/commits/${sha}`);
    return this.commitToEpisode(data, repo);
  }

  private async getRepos(): Promise<string[]> {
    if (this.repos.length > 0) return this.repos;

    const { data } = await this.http.get('/user/repos', {
      params: { per_page: 100, sort: 'updated' },
    });
    return (data || []).map((r: any) => r.full_name);
  }

  private async fetchCommits(repo: string, since: Date): Promise<IEpisode[]> {
    const { data } = await this.http.get(`/repos/${repo}/commits`, {
      params: { since: since.toISOString(), per_page: 100 },
    });
    return (data || []).map((commit: any) => this.commitToEpisode(commit, repo));
  }

  private async fetchPullRequests(repo: string, since: Date): Promise<IEpisode[]> {
    const { data } = await this.http.get(`/repos/${repo}/pulls`, {
      params: { state: 'all', sort: 'updated', direction: 'desc', per_page: 100 },
    });
    return (data || [])
      .filter((pr: any) => new Date(pr.updated_at) >= since)
      .map((pr: any) => this.pullRequestToEpisode(pr, repo));
  }

  private async fetchIssues(repo: string, since: Date): Promise<IEpisode[]> {
    const { data } = await this.http.get(`/repos/${repo}/issues`, {
      params: { state: 'all', since: since.toISOString(), per_page: 100 },
    });
    // The issues endpoint also returns PRs; exclude those (they have pull_request).
    return (data || [])
      .filter((issue: any) => !issue.pull_request)
      .map((issue: any) => this.issueToEpisode(issue, repo));
  }

  private commitToEpisode(commit: any, repo: string): IEpisode {
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
        timestamp: new Date(commit.commit?.author?.date ?? Date.now()),
      },
      author: commit.commit?.author?.name ?? commit.author?.login ?? 'unknown',
      created_at: new Date(commit.commit?.author?.date ?? Date.now()),
      ingested_at: new Date(),
    };

    return episode;
  }

  private pullRequestToEpisode(pr: any, repo: string): IEpisode {
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

  private issueToEpisode(issue: any, repo: string): IEpisode {
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
    // Simple hash for deduplication
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
    // Register webhook with GitHub
    // Implementation would call GitHub API to register webhook
    console.log('GitHub webhook subscription started');
  }

  validateWebhookSignature(payload: string, signature: string): boolean {
    if (!this.webhookSecret || !signature) return false;

    // GitHub sends "sha256=<hex>" in the X-Hub-Signature-256 header.
    const expected =
      'sha256=' + createHmac('sha256', this.webhookSecret).update(payload).digest('hex');

    const expectedBuf = Buffer.from(expected);
    const signatureBuf = Buffer.from(signature);
    if (expectedBuf.length !== signatureBuf.length) return false;

    return timingSafeEqual(expectedBuf, signatureBuf);
  }

  async processWebhook(payload: any): Promise<void> {
    // Process incoming GitHub webhook event
    console.log('Processing GitHub webhook:', payload);
  }
}
