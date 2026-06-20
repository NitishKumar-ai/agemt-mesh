import { spawn } from 'child_process';
import { mkdtemp, writeFile, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join, extname } from 'path';
import { DocumentParser, ParseResult } from './document-parser';

export interface MarkItDownSpawnOptions {
  pythonPath?: string;
  moduleName?: string;
  maxBufferBytes?: number;
  timeoutMs?: number;
}

export class MarkItDownSpawnParser implements DocumentParser {
  private pythonPath: string;
  private moduleName: string;
  private maxBufferBytes: number;
  private timeoutMs: number;

  constructor(private options: MarkItDownSpawnOptions = {}) {
    this.pythonPath = options.pythonPath ?? 'python';
    this.moduleName = options.moduleName ?? 'markitdown';
    this.maxBufferBytes = options.maxBufferBytes ?? 50 * 1024 * 1024;
    this.timeoutMs = options.timeoutMs ?? 120_000;
  }

  supports(_mimeType: string, fileExtension?: string): boolean {
    return this.canUseMarkItDown(fileExtension);
  }

  async parse(
    buffer: Buffer,
    _mimeType: string,
    fileName: string = 'document'
  ): Promise<ParseResult> {
    const extension = extname(fileName) || '.bin';
    const tmpDir = await mkdtemp(join(tmpdir(), 'markitdown-'));
    const inputPath = join(tmpDir, `input${extension}`);

    try {
      await writeFile(inputPath, buffer);
      const text = await this.runMarkItDown(inputPath);
      return {
        text,
        metadata: {
          parser: 'markitdown-spawn',
          module: this.moduleName,
          inputBytes: buffer.length,
        },
      };
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
  }

  private canUseMarkItDown(fileExtension?: string): boolean {
    if (!fileExtension) return true;
    const ext = fileExtension.toLowerCase();
    const supported = new Set([
      '.pdf', '.doc', '.docx', '.ppt', '.pptx', '.xls', '.xlsx',
      '.html', '.htm', '.txt', '.md', '.markdown', '.csv', '.json',
      '.xml', '.epub', '.rtf', '.zip',
    ]);
    return supported.has(ext);
  }

  private runMarkItDown(inputPath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const proc = spawn(this.pythonPath, ['-m', this.moduleName, inputPath]);
      let stdout = '';
      let stderr = '';
      let killed = false;

      const timer = setTimeout(() => {
        killed = true;
        proc.kill('SIGTERM');
        reject(
          new Error(`markitdown timed out after ${this.timeoutMs}ms: ${stderr}`)
        );
      }, this.timeoutMs);

      proc.stdout.on('data', (chunk: Buffer) => {
        stdout += chunk.toString('utf-8');
        if (Buffer.byteLength(stdout, 'utf-8') > this.maxBufferBytes) {
          killed = true;
          proc.kill('SIGTERM');
          clearTimeout(timer);
          reject(new Error('markitdown output exceeded maxBufferBytes'));
        }
      });

      proc.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString('utf-8');
      });

      proc.on('error', (error) => {
        clearTimeout(timer);
        reject(
          new Error(
            `Failed to spawn markitdown (${this.pythonPath} -m ${this.moduleName}): ${error.message}`
          )
        );
      });

      proc.on('close', (code) => {
        clearTimeout(timer);
        if (killed) return;
        if (code === 0) {
          resolve(stdout);
        } else {
          reject(
            new Error(
              `markitdown exited with code ${code}${stderr ? `: ${stderr}` : ''}`
            )
          );
        }
      });
    });
  }
}
