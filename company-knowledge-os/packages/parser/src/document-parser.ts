export interface ParseResult {
  text: string;
  metadata: Record<string, unknown>;
}

export interface DocumentParser {
  supports(mimeType: string, fileExtension?: string): boolean;
  parse(buffer: Buffer, mimeType: string, fileName?: string): Promise<ParseResult>;
}
