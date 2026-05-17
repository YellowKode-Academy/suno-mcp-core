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

const SUNOAPI_BASE = 'https://api.sunoapi.org';
const SUNOBOARD_BASE = 'https://api.sunoboard.com';
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

      const { generateMusic } = createHandlers({ apiKey: KEY, baseUrl: SUNOAPI_BASE });
      await generateMusic({ prompt: 'rainy jazz café', model: 'V4_5' });

      const [url, init] = fetchMock.mock.calls[0];
      const body = JSON.parse(init.body as string);
      expect(url).toBe(`${SUNOAPI_BASE}/api/v1/generate`);
      expect(body.prompt).toBe('rainy jazz café');
      expect(body.model).toBe('V4_5');
      expect(body.customMode).toBe(false);
      expect(body.instrumental).toBe(false);
    });

    it('in simple mode (customMode=false) does NOT send title or style', async () => {
      fetchMock = mockFetch({ data: { taskId: 'task123', status: 'PENDING' } });
      vi.stubGlobal('fetch', fetchMock);

      const { generateMusic } = createHandlers({ apiKey: KEY, baseUrl: SUNOAPI_BASE });
      await generateMusic({ prompt: 'epic orchestral', style: 'cinematic', title: 'Battle Theme', customMode: false });

      const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
      expect(body.style).toBeUndefined();
      expect(body.title).toBeUndefined();
    });

    it('in custom mode sends style and title', async () => {
      fetchMock = mockFetch({ data: { taskId: 'abc', status: 'PENDING' } });
      vi.stubGlobal('fetch', fetchMock);

      const { generateMusic } = createHandlers({ apiKey: KEY, baseUrl: SUNOAPI_BASE });
      await generateMusic({ prompt: 'verse lyrics here', style: 'lo-fi jazz', title: 'Midnight Rain', customMode: true });

      const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
      expect(body.style).toBe('lo-fi jazz');
      expect(body.title).toBe('Midnight Rain');
      expect(body.customMode).toBe(true);
    });

    it('sends vocalGender only when not instrumental', async () => {
      fetchMock = mockFetch({ data: { taskId: 'x', status: 'PENDING' } });
      vi.stubGlobal('fetch', fetchMock);

      const { generateMusic } = createHandlers({ apiKey: KEY, baseUrl: SUNOAPI_BASE });
      await generateMusic({ prompt: 'pop song', instrumental: false, vocalGender: 'female' });

      const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
      expect(body.vocalGender).toBe('female');
    });

    it('does NOT send vocalGender when instrumental=true', async () => {
      fetchMock = mockFetch({ data: { taskId: 'x', status: 'PENDING' } });
      vi.stubGlobal('fetch', fetchMock);

      const { generateMusic } = createHandlers({ apiKey: KEY, baseUrl: SUNOAPI_BASE });
      await generateMusic({ prompt: 'ambient wave', instrumental: true, vocalGender: 'female' });

      const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
      expect(body.vocalGender).toBeUndefined();
    });

    it('returns taskId from nested sunoapi.org format: { code, msg, data: { taskId } }', async () => {
      // sunoapi.org does NOT include status in the generate response
      fetchMock = mockFetch({ code: 200, msg: 'success', data: { taskId: 'task-XYZ' } });
      vi.stubGlobal('fetch', fetchMock);

      const { generateMusic } = createHandlers({ apiKey: KEY, baseUrl: SUNOAPI_BASE });
      const result = await generateMusic({ prompt: 'test' });

      expect(result.taskId).toBe('task-XYZ');
      expect(result.message).toContain('task-XYZ');
    });

    it('returns taskId from SunoBoard format: { data: { taskId, status } }', async () => {
      fetchMock = mockFetch({ data: { taskId: 'task-SB', status: 'PENDING' } });
      vi.stubGlobal('fetch', fetchMock);

      const { generateMusic } = createHandlers({ apiKey: KEY, baseUrl: SUNOBOARD_BASE });
      const result = await generateMusic({ prompt: 'test' });

      expect(result.taskId).toBe('task-SB');
      expect(result.status).toBe('PENDING');
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

      const { getMusicStatus } = createHandlers({ apiKey: KEY, baseUrl: SUNOAPI_BASE });
      const result = await getMusicStatus('task-abc');

      expect(result.status).toBe('SUCCESS');
      expect((result as any).tracks).toHaveLength(2);
      expect((result as any).audioUrl).toBe('https://cdn/a.mp3');
      expect((result as any).audioUrlShort).toBe('https://cdn/b.mp3');
    });

    it('returns FIRST_SUCCESS with available tracks (1 of 2 ready)', async () => {
      fetchMock = mockFetch({
        data: {
          status: 'FIRST_SUCCESS',
          response: {
            sunoData: [
              { audioUrl: 'https://cdn/first.mp3', duration: 195, title: 'Track 1' },
            ],
          },
        },
      });
      vi.stubGlobal('fetch', fetchMock);

      const { getMusicStatus } = createHandlers({ apiKey: KEY, baseUrl: SUNOAPI_BASE });
      const result = await getMusicStatus('task-partial');

      expect(result.status).toBe('FIRST_SUCCESS');
      expect((result as any).tracks).toHaveLength(1);
      expect((result as any).audioUrl).toBe('https://cdn/first.mp3');
      expect((result as any).audioUrlShort).toBeUndefined();
    });

    it('returns pending status object when still PENDING', async () => {
      fetchMock = mockFetch({ data: { status: 'PENDING' } });
      vi.stubGlobal('fetch', fetchMock);

      const { getMusicStatus } = createHandlers({ apiKey: KEY, baseUrl: SUNOAPI_BASE });
      const result = await getMusicStatus('task-abc');

      expect(result.status).toBe('PENDING');
      expect((result as any).message).toContain('PENDING');
    });

    it('returns status object when status is TEXT_SUCCESS (lyrics done, audio pending)', async () => {
      fetchMock = mockFetch({ data: { status: 'TEXT_SUCCESS' } });
      vi.stubGlobal('fetch', fetchMock);

      const { getMusicStatus } = createHandlers({ apiKey: KEY, baseUrl: SUNOAPI_BASE });
      const result = await getMusicStatus('task-text');

      expect(result.status).toBe('TEXT_SUCCESS');
      expect((result as any).message).toContain('TEXT_SUCCESS');
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

      const { waitForMusic } = createHandlers({ apiKey: KEY, baseUrl: SUNOAPI_BASE, pollIntervalMs: 0 });
      const result = await waitForMusic('done-task');
      expect(result.status).toBe('SUCCESS');
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('does NOT resolve on FIRST_SUCCESS — keeps polling until SUCCESS', async () => {
      let callCount = 0;
      vi.stubGlobal('fetch', vi.fn().mockImplementation(() => {
        callCount++;
        const status = callCount < 2 ? 'FIRST_SUCCESS' : 'SUCCESS';
        const sunoData = [
          { audioUrl: 'https://cdn/a.mp3', duration: 195 },
          ...(callCount >= 2 ? [{ audioUrl: 'https://cdn/b.mp3', duration: 195 }] : []),
        ];
        return Promise.resolve({
          ok: true,
          json: async () => ({ data: { status, response: { sunoData } } }),
          text: async () => '',
        });
      }));

      const { waitForMusic } = createHandlers({ apiKey: KEY, baseUrl: SUNOAPI_BASE, pollIntervalMs: 0, maxPollAttempts: 5 });
      const result = await waitForMusic('partial-task');
      expect(result.status).toBe('SUCCESS');
      expect(callCount).toBe(2);
      expect((result as any).tracks).toHaveLength(2);
    });

    it('polls past TEXT_SUCCESS until SUCCESS', async () => {
      let callCount = 0;
      vi.stubGlobal('fetch', vi.fn().mockImplementation(() => {
        callCount++;
        const status = callCount === 1 ? 'TEXT_SUCCESS' : callCount === 2 ? 'PROCESSING' : 'SUCCESS';
        const sunoData = callCount >= 3 ? [{ audioUrl: 'https://cdn/x.mp3', duration: 60 }] : [];
        return Promise.resolve({
          ok: true,
          json: async () => ({ data: { status, response: { sunoData } } }),
          text: async () => '',
        });
      }));

      const { waitForMusic } = createHandlers({ apiKey: KEY, baseUrl: SUNOAPI_BASE, pollIntervalMs: 0, maxPollAttempts: 5 });
      const result = await waitForMusic('poll-task');
      expect(result.status).toBe('SUCCESS');
      expect(callCount).toBe(3);
    });

    it('throws on terminal error SENSITIVE_WORD_ERROR', async () => {
      fetchMock = mockFetch({ data: { status: 'SENSITIVE_WORD_ERROR' } });
      vi.stubGlobal('fetch', fetchMock);

      const { waitForMusic } = createHandlers({ apiKey: KEY, baseUrl: SUNOAPI_BASE, pollIntervalMs: 0 });
      await expect(waitForMusic('bad-task')).rejects.toThrow('Generation failed');
    });

    it('throws on terminal error GENERATE_AUDIO_FAILED', async () => {
      fetchMock = mockFetch({ data: { status: 'GENERATE_AUDIO_FAILED' } });
      vi.stubGlobal('fetch', fetchMock);

      const { waitForMusic } = createHandlers({ apiKey: KEY, baseUrl: SUNOAPI_BASE, pollIntervalMs: 0 });
      await expect(waitForMusic('fail-task')).rejects.toThrow('Generation failed');
    });

    it('throws timeout when maxPollAttempts exceeded', async () => {
      fetchMock = mockFetch({ data: { status: 'PROCESSING' } });
      vi.stubGlobal('fetch', fetchMock);

      const { waitForMusic } = createHandlers({ apiKey: KEY, baseUrl: SUNOAPI_BASE, pollIntervalMs: 0, maxPollAttempts: 2 });
      await expect(waitForMusic('slow-task')).rejects.toThrow('Timeout');
    });
  });

  // ── getCredits ─────────────────────────────────────────────────────────────

  describe('getCredits', () => {
    it('sunoapi.org: calls /api/v1/generate/credit and handles plain number response', async () => {
      // sunoapi.org returns data as a plain number
      fetchMock = mockFetch({ code: 200, msg: 'success', data: 73 });
      vi.stubGlobal('fetch', fetchMock);

      const { getCredits } = createHandlers({ apiKey: KEY, baseUrl: SUNOAPI_BASE });
      const result = await getCredits();

      const [url] = fetchMock.mock.calls[0];
      expect(url).toBe(`${SUNOAPI_BASE}/api/v1/generate/credit`);
      expect(result.remaining).toBe(73);
      expect(result.message).toContain('73');
      expect((result as any).total).toBeUndefined();
    });

    it('SunoBoard: calls /api/v1/credits and handles object response', async () => {
      fetchMock = mockFetch({ data: { remaining: 42, total: 100, used: 58 } });
      vi.stubGlobal('fetch', fetchMock);

      const { getCredits } = createHandlers({ apiKey: KEY, baseUrl: SUNOBOARD_BASE });
      const result = await getCredits();

      const [url] = fetchMock.mock.calls[0];
      expect(url).toBe(`${SUNOBOARD_BASE}/api/v1/credits`);
      expect(result.remaining).toBe(42);
      expect((result as any).total).toBe(100);
      expect((result as any).used).toBe(58);
      expect(result.message).toContain('42');
    });

    it('explicit apiType=sunoapi overrides baseUrl detection', async () => {
      fetchMock = mockFetch({ data: 50 });
      vi.stubGlobal('fetch', fetchMock);

      const { getCredits } = createHandlers({ apiKey: KEY, baseUrl: 'https://custom.api.com', apiType: 'sunoapi' });
      const result = await getCredits();

      const [url] = fetchMock.mock.calls[0];
      expect(url).toBe('https://custom.api.com/api/v1/generate/credit');
      expect(result.remaining).toBe(50);
    });

    it('explicit apiType=sunoboard overrides baseUrl detection', async () => {
      fetchMock = mockFetch({ data: { remaining: 10, total: 200, used: 190 } });
      vi.stubGlobal('fetch', fetchMock);

      const { getCredits } = createHandlers({ apiKey: KEY, baseUrl: 'https://custom.api.com', apiType: 'sunoboard' });
      const result = await getCredits();

      const [url] = fetchMock.mock.calls[0];
      expect(url).toBe('https://custom.api.com/api/v1/credits');
      expect(result.remaining).toBe(10);
    });
  });

  // ── auth header ───────────────────────────────────────────────────────────

  it('sends Authorization: Bearer header on every request', async () => {
    fetchMock = mockFetch({ data: 0 });
    vi.stubGlobal('fetch', fetchMock);

    const { getCredits } = createHandlers({ apiKey: 'my-secret-key', baseUrl: SUNOAPI_BASE });
    await getCredits();

    const headers = fetchMock.mock.calls[0][1].headers as Record<string, string>;
    expect(headers['Authorization']).toBe('Bearer my-secret-key');
  });
});
