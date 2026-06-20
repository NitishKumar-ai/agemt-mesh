import { extname } from 'path';
import { DocumentParser, ParseResult } from './document-parser';
import { MarkItDownClientParser } from './markitdown-client';
import { MarkItDownSpawnParser } from './markitdown-spawn';

export interface ParserOrchestratorOptions {
  parsers?: DocumentParser[];
  fallbackToMarkItDown?: boolean;
  markItDownEndpoint?: string;
  markItDownSpawnOptions?: ConstructorParameters<typeof MarkItDownSpawnParser>[0];
}

export class ParserOrchestrator {
  private parsers: DocumentParser[];

  constructor(private options: ParserOrchestratorOptions = {}) {
    this.parsers = options.parsers ? [...options.parsers] : [];

    if (options.fallbackToMarkItDown !== false && this.parsers.length === 0) {
      if (options.markItDownEndpoint) {
        this.parsers.push(new MarkItDownClientParser({ endpoint: options.markItDownEndpoint }));
      } else {
        this.parsers.push(new MarkItDownSpawnParser(options.markItDownSpawnOptions));
      }
    }
  }

  register(parser: DocumentParser): void {
    this.parsers.push(parser);
  }

  async parse(
    buffer: Buffer,
    mimeType: string = 'application/octet-stream',
    fileName?: string
  ): Promise<ParseResult> {
    const extension = fileName ? extname(fileName) : undefined;
    const parser = this.parsers.find((p) => p.supports(mimeType, extension));

    if (!parser) {
      throw new Error(`No parser supports mimeType=${mimeType} extension=${extension ?? 'none'}`);
    }

    return parser.parse(buffer, mimeType, fileName);
  }

  supports(mimeType: string, fileExtension?: string): boolean {
    return this.parsers.some((p) => p.supports(mimeType, fileExtension));
  }
}
