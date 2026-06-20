import { DocumentParser, ParseResult } from './document-parser';

export interface MarkItDownClientOptions {
  endpoint: string;
  timeoutMs?: number;
}

export class MarkItDownClientParser implements DocumentParser {
  private timeoutMs: number;

  constructor(private options: MarkItDownClientOptions) {
    this.timeoutMs = options.timeoutMs ?? 120_000;
  }

  supports(_mimeType: string, fileExtension?: string): boolean {
    return this.canUseMarkItDown(fileExtension);
  }

  async parse(
    buffer: Buffer,
    mimeType: string,
    fileName: string = 'document'
  ): Promise<ParseResult> {
    const form = new FormData();
    const blob = new Blob([buffer], { type: mimeType || 'application/octet-stream' });
    form.append('file', blob, fileName);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(this.options.endpoint, {
        method: 'POST',
        body: form,
        signal: controller.signal,
      });

      if (!response.ok) {
        const body = await response.text();
        throw new Error(
          `MarkItDown service returned ${response.status}: ${body}`
        );
      }

      const json = (await response.json()) as {
        text?: string;
        metadata?: Record<string, unknown>;
      };

      return {
        text: json.text ?? '',
        metadata: {
          parser: 'markitdown-client',
          endpoint: this.options.endpoint,
          ...(json.metadata ?? {}),
        },
      };
    } finally {
      clearTimeout(timer);
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
}
