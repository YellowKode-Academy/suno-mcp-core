import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createHandlers } from '../handlers.js';

// ── Fetch mock helpers ──────────────────────────────────────────────────────

function mockFetch(response: unknown, ok = true) {
  return vi.fn().mockResolvedValue({
    ok,
    status: ok ? 200 : 400,
    json: async () => response,
    text: async () => JSON.stringify(response),
  });
}

const BASE = 'https://api.test.local';
const KEY = 'test-api-key';

describe('createHandlers', () => {
  let fetchMock: ReturnType<typeof mockFetch>;

  beforeEach(() => {
    fetchMock = mockFetch({});
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // ── generateMusic ──────────────────────────────────────────────────────────

  describe('generateMusic', () => {
    it('sends prompt, model, instrumental, customMode in body', async () => {
      fetchMock = mockFetch({ data: { taskId: 'task123', status: 'PENDING' } });
      vi.stubGlobal('fetch', fetchMock);

      const { generateMusic } = createHandlers({ apiKey: KEY, baseUrl: BASE });
      await generateMusic({ prompt: 'rainy jazz café', model: 'V4_5' });

      const [url, init] = fetchMock.mock.calls[0];
      const body = JSON.parse(init.body as string);
      expect(url).toBe(`${BASE}/api/v1/generate`);
      expect(body.prompt).toBe('rainy jazz café');
      expect(body.model).toBe('V4_5');
      expect(body.customMode).toBe(false);
      expect(body.instrumental).toBe(false);
    });

    it('in simple mode (customMode=false) does NOT send title or style', async () => {
      fetchMock = mockFetch({ data: { taskId: 'task123', status: 'PENDING' } });
      vi.stubGlobal('fetch', fetchMock);

      const { generateMusic } = createHandlers({ apiKey: KEY, baseUrl: BASE });
      await generateMusic({ prompt: 'epic orchestral', style: 'cinematic', title: 'Battle Theme', customMode: false });

      const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
      expect(body.style).toBeUndefined();
      expect(body.title).toBeUndefined();
    });

    it('in custom mode sends style and title', async () => {
      fetchMock = mockFetch({ data: { taskId: 'abc', status: 'PENDING' } });
      vi.stubGlobal('fetch', fetchMock);

      const { generateMusic } = createHandlers({ apiKey: KEY, baseUrl: BASE });
      await generateMusic({ prompt: 'verse lyrics here', style: 'lo-fi jazz', title: 'Midnight Rain', customMode: true });

      const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
      expect(body.style).toBe('lo-fi jazz');
      expect(body.title).toBe('Midnight Rain');
      expect(body.customMode).toBe(true);
    });

    it('sends vocalGender only when not instrumental', async () => {
      fetchMock = mockFetch({ data: { taskId: 'x', status: 'PENDING' } });
      vi.stubGlobal('fetch', fetchMock);

      const { generateMusic } = createHandlers({ apiKey: KEY, baseUrl: BASE });
      await generateMusic({ prompt: 'pop song', instrumental: false, vocalGender: 'f' });

      const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
      expect(body.vocalGender).toBe('f');
    });

    it('does NOT send vocalGender when instrumental=true', async () => {
      fetchMock = mockFetch({ data: { taskId: 'x', status: 'PENDING' } });
      vi.stubGlobal('fetch', fetchMock);

      const { generateMusic } = createHandlers({ apiKey: KEY, baseUrl: BASE });
      await generateMusic({ prompt: 'ambient wave', instrumental: true, vocalGender: 'f' });

      const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
      expect(body.vocalGender).toBeUndefined();
    });

    it('returns taskId and a human-readable message', async () => {
      fetchMock = mockFetch({ data: { taskId: 'task-XYZ', status: 'PENDING' } });
      vi.stubGlobal('fetch', fetchMock);

      const { generateMusic } = createHandlers({ apiKey: KEY, baseUrl: BASE });
      const result = await generateMusic({ prompt: 'test' });

      expect(result.taskId).toBe('task-XYZ');
      expect(result.message).toContain('task-XYZ');
    });
  });

  // ── getMusicStatus ─────────────────────────────────────────────────────────

  describe('getMusicStatus', () => {
    it('returns SUCCESS with tracks when status is SUCCESS', async () => {
      fetchMock = mockFetch({
        data: {
          status: 'SUCCESS',
          response: {
            sunoData: [
              { audioUrl: 'https://cdn/a.mp3', duration: 180 },
              { audioUrl: 'https://cdn/b.mp3', duration: 90 },
            ],
          },
        },
      });
      vi.stubGlobal('fetch', fetchMock);

      const { getMusicStatus } = createHandlers({ apiKey: KEY, baseUrl: BASE });
      const result = await getMusicStatus('task-abc');

      expect(result.status).toBe('SUCCESS');
      expect((result as any).tracks).toHaveLength(2);
      expect((result as any).audioUrl).toBe('https://cdn/a.mp3');
      expect((result as any).audioUrlShort).toBe('https://cdn/b.mp3');
    });

    it('returns pending status object when still PENDING', async () => {
      fetchMock = mockFetch({ data: { status: 'PENDING' } });
      vi.stubGlobal('fetch', fetchMock);

      const { getMusicStatus } = createHandlers({ apiKey: KEY, baseUrl: BASE });
      const result = await getMusicStatus('task-abc');

      expect(result.status).toBe('PENDING');
      expect((result as any).message).toContain('PENDING');
    });
  });

  // ── waitForMusic ───────────────────────────────────────────────────────────

  describe('waitForMusic', () => {
    it('resolves immediately on first SUCCESS', async () => {
      fetchMock = mockFetch({
        data: {
          status: 'SUCCESS',
          response: { sunoData: [{ audioUrl: 'https://cdn/done.mp3', duration: 120 }] },
        },
      });
      vi.stubGlobal('fetch', fetchMock);

      const { waitForMusic } = createHandlers({ apiKey: KEY, baseUrl: BASE, pollIntervalMs: 0 });
      const result = await waitForMusic('done-task');
      expect(result.status).toBe('SUCCESS');
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('polls until SUCCESS on 3rd attempt', async () => {
      let callCount = 0;
      vi.stubGlobal('fetch', vi.fn().mockImplementation(() => {
        callCount++;
        const status = callCount < 3 ? 'PENDING' : 'SUCCESS';
        const sunoData = callCount >= 3 ? [{ audioUrl: 'https://cdn/x.mp3', duration: 60 }] : [];
        return Promise.resolve({
          ok: true,
          json: async () => ({ data: { status, response: { sunoData } } }),
          text: async () => '',
        });
      }));

      const { waitForMusic } = createHandlers({ apiKey: KEY, baseUrl: BASE, pollIntervalMs: 0, maxPollAttempts: 5 });
      const result = await waitForMusic('poll-task');
      expect(result.status).toBe('SUCCESS');
      expect(callCount).toBe(3);
    });

    it('throws on terminal error SENSITIVE_WORD_ERROR', async () => {
      fetchMock = mockFetch({ data: { status: 'SENSITIVE_WORD_ERROR' } });
      vi.stubGlobal('fetch', fetchMock);

      const { waitForMusic } = createHandlers({ apiKey: KEY, baseUrl: BASE, pollIntervalMs: 0 });
      await expect(waitForMusic('bad-task')).rejects.toThrow('Generation failed');
    });

    it('throws on terminal error GENERATE_AUDIO_FAILED', async () => {
      fetchMock = mockFetch({ data: { status: 'GENERATE_AUDIO_FAILED' } });
      vi.stubGlobal('fetch', fetchMock);

      const { waitForMusic } = createHandlers({ apiKey: KEY, baseUrl: BASE, pollIntervalMs: 0 });
      await expect(waitForMusic('fail-task')).rejects.toThrow('Generation failed');
    });

    it('throws timeout when maxPollAttempts exceeded', async () => {
      fetchMock = mockFetch({ data: { status: 'PROCESSING' } });
      vi.stubGlobal('fetch', fetchMock);

      const { waitForMusic } = createHandlers({ apiKey: KEY, baseUrl: BASE, pollIntervalMs: 0, maxPollAttempts: 2 });
      await expect(waitForMusic('slow-task')).rejects.toThrow('Timeout');
    });
  });

  // ── getCredits ─────────────────────────────────────────────────────────────

  describe('getCredits', () => {
    it('returns remaining, total, used and a message', async () => {
      fetchMock = mockFetch({ data: { remaining: 42, total: 100, used: 58 } });
      vi.stubGlobal('fetch', fetchMock);

      const { getCredits } = createHandlers({ apiKey: KEY, baseUrl: BASE });
      const result = await getCredits();

      expect(result.remaining).toBe(42);
      expect(result.total).toBe(100);
      expect(result.used).toBe(58);
      expect(result.message).toContain('42');
    });
  });

  // ── auth header ───────────────────────────────────────────────────────────

  it('sends Authorization: Bearer header on every request', async () => {
    fetchMock = mockFetch({ data: { remaining: 0, total: 0, used: 0 } });
    vi.stubGlobal('fetch', fetchMock);

    const { getCredits } = createHandlers({ apiKey: 'my-secret-key', baseUrl: BASE });
    await getCredits();

    const headers = fetchMock.mock.calls[0][1].headers as Record<string, string>;
    expect(headers['Authorization']).toBe('Bearer my-secret-key');
  });
});
