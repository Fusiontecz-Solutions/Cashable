import { PDFDocument, StandardFonts } from 'pdf-lib';
import { ClaudePdfExtractionService } from './claude-pdf-extraction.service';

const cfg = { get: (k: string) => ({ OPENAI_API_KEY: 'test-key' } as Record<string, string>)[k] } as never;

async function applicationPdf(): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([612, 792]);
  const lines = ['Business Legal Name:      NMJ CONTRACTORS LLC', 'Owner:   MYNOR E DE LEON-REYES', 'EIN: 87-2084094'];
  for (let i = 0; i < 40; i++) lines.push(`Field ${i}:        value number ${i} for the merchant application form`);
  lines.forEach((l, i) => page.drawText(l, { x: 40, y: 760 - i * 16, size: 9, font }));
  return Buffer.from(await doc.save());
}

describe('GPT PDF reader: token savings', () => {
  const calls: Array<{ system: string; user: string; max: number }> = [];
  beforeEach(() => {
    calls.length = 0;
    global.fetch = jest.fn(async (_url: unknown, init: { body: string }) => {
      const body = JSON.parse(init.body);
      calls.push({ system: body.messages[0].content, user: body.messages[1].content[0].text, max: body.max_completion_tokens });
      expect(body.model).toBe('gpt-4.1-mini');
      return { ok: true, json: async () => ({ choices: [{ message: { content: '{"document_type":"application","key_data":{"business_name":"NMJ CONTRACTORS LLC"},"transactions":[]}' } }] }) };
    }) as never;
  });

  it('sends the text once, asks no transactions for applications, and never re-sends the same PDF', async () => {
    const svc = new ClaudePdfExtractionService(cfg, { llm: 'openai' });
    const pdf = await applicationPdf();
    const out = await svc.extractHybridFromPdfBuffer(pdf, { applicationOnly: true });
    expect(out.result.key_data?.business_name).toBe('NMJ CONTRACTORS LLC');
    expect(calls).toHaveLength(1);
    expect(calls[0].user.split('NMJ CONTRACTORS LLC')).toHaveLength(2); // text present exactly once
    expect(calls[0].user).not.toMatch(/ {2,}/); // runs of spaces squeezed
    expect(calls[0].system).toMatch(/transactions \(always \[\]\)/);
    expect(calls[0].max).toBe(4000);
    await svc.extractHybridFromPdfBuffer(pdf, { applicationOnly: true });
    expect(calls).toHaveLength(1); // cached
  });
});
