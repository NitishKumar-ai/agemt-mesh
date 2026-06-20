import { describe, it, expect, vi } from 'vitest';
import { ParserOrchestrator } from '../src/parser-orchestrator';
import { DocumentParser, ParseResult } from '../src/document-parser';

class MarkdownParser implements DocumentParser {
  supports(mimeType: string, fileExtension?: string): boolean {
    return mimeType === 'text/markdown' || fileExtension === '.md';
  }

  async parse(buffer: Buffer): Promise<ParseResult> {
    return {
      text: buffer.toString('utf-8'),
      metadata: { parser: 'markdown' },
    };
  }
}

describe('ParserOrchestrator', () => {
  it('selects a registered parser by MIME type', async () => {
    const orchestrator = new ParserOrchestrator({
      parsers: [new MarkdownParser()],
      fallbackToMarkItDown: false,
    });

    const result = await orchestrator.parse(
      Buffer.from('# Hello'),
      'text/markdown',
      'hello.md'
    );

    expect(result.text).toBe('# Hello');
    expect(result.metadata.parser).toBe('markdown');
  });

  it('selects a registered parser by file extension', async () => {
    const orchestrator = new ParserOrchestrator({
      parsers: [new MarkdownParser()],
      fallbackToMarkItDown: false,
    });

    const result = await orchestrator.parse(
      Buffer.from('content'),
      'application/octet-stream',
      'notes.md'
    );

    expect(result.text).toBe('content');
  });

  it('throws when no parser supports the input', async () => {
    const orchestrator = new ParserOrchestrator({
      parsers: [new MarkdownParser()],
      fallbackToMarkItDown: false,
    });

    await expect(
      orchestrator.parse(Buffer.from('pdf'), 'application/pdf', 'doc.pdf')
    ).rejects.toThrow('No parser supports');
  });

  it('falls back to MarkItDown spawn parser by default', () => {
    const orchestrator = new ParserOrchestrator();
    expect(orchestrator.supports('application/pdf', '.pdf')).toBe(true);
  });

  it('supports MarkItDown client parser when endpoint is provided', () => {
    const orchestrator = new ParserOrchestrator({
      markItDownEndpoint: 'http://localhost:8000/parse',
    });
    expect(orchestrator.supports('application/pdf', '.pdf')).toBe(true);
  });
});
