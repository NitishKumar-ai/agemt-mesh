import { mkdir, readFile, writeFile, unlink, access } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import type { ExternalPayloadStorage } from '@agentmesh/common-storage';

export interface LocalExternalPayloadStorageOptions {
  /** Root directory for payload storage (default: ./data/external-payloads) */
  storageDir?: string;
}

/**
 * Local filesystem implementation of ExternalPayloadStorage.
 *
 * Stores JSON payloads as flat files under a configurable root directory.
 * Intended for development / single-node deployments where S3/GCS is
 * unavailable.
 */
export class LocalExternalPayloadStorage implements ExternalPayloadStorage {
  private readonly root: string;

  constructor(options: LocalExternalPayloadStorageOptions = {}) {
    this.root = options.storageDir ?? join(process.cwd(), 'data', 'external-payloads');
  }

  async store(path: string, payload: string): Promise<string> {
    const fullPath = join(this.root, path);
    await mkdir(dirname(fullPath), { recursive: true });
    await writeFile(fullPath, payload, 'utf-8');
    return `file://${fullPath}`;
  }

  async get(path: string): Promise<string | null> {
    const fullPath = join(this.root, path);
    try {
      await access(fullPath);
      return await readFile(fullPath, 'utf-8');
    } catch {
      return null;
    }
  }

  async remove(path: string): Promise<boolean> {
    const fullPath = join(this.root, path);
    try {
      await access(fullPath);
      await unlink(fullPath);
      return true;
    } catch {
      return false;
    }
  }

  async getSignedUrl(_path: string, _expirationInSeconds: number): Promise<string> {
    throw new Error('Signed URLs are not supported by local file storage');
  }
}
