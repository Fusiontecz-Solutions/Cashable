import type { ConfigService } from '@nestjs/config';
import { ClaudePdfExtractionService } from '../../nestjs-claude-pdf/claude-pdf-extraction.service';

export type PdfExtractionProvider = 'claude' | 'documentai' | 'openai';

export interface PdfExtractionServiceLike {
  getRuntimeDebugConfig(): Record<string, unknown>;
  extractHybridFromPdfBuffer(
    pdf: Buffer,
    opts?: { applicationOnly?: boolean },
  ): Promise<{
    result: import('../../nestjs-claude-pdf/claude-pdf-extraction.service').PdfClaudeExtractResultDTO;
    meta: import('../../nestjs-claude-pdf/claude-pdf-extraction.service').ClaudePdfExtractMetaDTO;
  }>;
  extractKycDocument(
    buffer: Buffer,
    mimeType: string,
    documentType: 'driverLicense' | 'voidedCheck',
  ): Promise<{ key_data: Record<string, string> }>;
}

let singleton: PdfExtractionServiceLike | undefined;

/**
 * With an OpenAI (ChatGPT) key on the server, application PDFs are read with GPT unless
 * PDF_EXTRACTION_PROVIDER=claude/documentai is forced with PDF_EXTRACTION_PROVIDER_LOCK=true.
 */
function readProvider(): PdfExtractionProvider {
  const raw = String(process.env.PDF_EXTRACTION_PROVIDER || 'claude')
    .trim()
    .toLowerCase();
  const hasOpenAi = String(process.env.OPENAI_API_KEY || '').trim() !== '';
  if (raw === 'openai' || raw === 'gpt' || raw === 'chatgpt') return 'openai';
  if (hasOpenAi && process.env.PDF_EXTRACTION_PROVIDER_LOCK !== 'true') return 'openai';
  if (raw === 'documentai' || raw === 'document_ai' || raw === 'google') return 'documentai';
  return 'claude';
}

function buildEnvConfigService(): Pick<ConfigService, 'get'> {
  return {
    get: <T = string>(key: string): T | undefined => {
      let v = process.env[key];
      if (v == null || v === '') {
        const bomKey = Object.keys(process.env).find((k) => k.replace(/^\ufeff/, '') === key);
        if (bomKey) v = process.env[bomKey];
      }
      return (v ?? undefined) as T | undefined;
    },
  } as Pick<ConfigService, 'get'>;
}

function createClaudeService(): PdfExtractionServiceLike {
  return new ClaudePdfExtractionService(buildEnvConfigService() as ConfigService);
}

function buildPdfExtractionService(): PdfExtractionServiceLike {
  if (readProvider() === 'openai') {
    return new ClaudePdfExtractionService(buildEnvConfigService() as ConfigService, { llm: 'openai' });
  }
  if (readProvider() === 'documentai') {
    // Optional — only when PDF_EXTRACTION_PROVIDER=documentai
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { DocumentAiPdfExtractionService } = require('../document-ai/documentAiPdfExtraction.service');
    return new DocumentAiPdfExtractionService();
  }
  return createClaudeService();
}

/** Claude by default; set PDF_EXTRACTION_PROVIDER=documentai only if you use Google Document AI. */
export function getPdfExtractionService(): PdfExtractionServiceLike {
  return (singleton ??= buildPdfExtractionService());
}

/** Always returns Claude extraction (ignores PDF_EXTRACTION_PROVIDER). */
export function getClaudePdfExtractionService(): PdfExtractionServiceLike {
  return createClaudeService();
}
