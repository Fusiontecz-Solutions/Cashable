import { toOpenAiContent } from './claude-pdf-extraction.service';

describe('OpenAI (ChatGPT) PDF reader', () => {
  it('sends the same text, page images and PDF the Claude reader would', () => {
    const parts = toOpenAiContent([
      { type: 'text', text: 'Extract fields' },
      { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'AAA' } },
      { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: 'BBB' } } as never,
    ]);
    expect(parts).toEqual([
      { type: 'text', text: 'Extract fields' },
      { type: 'image_url', image_url: { url: 'data:image/png;base64,AAA' } },
      { type: 'file', file: { filename: 'document.pdf', file_data: 'data:application/pdf;base64,BBB' } },
    ]);
  });
});
