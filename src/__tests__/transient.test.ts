import { describe, it, expect, vi, afterEach } from 'vitest';
import { createHandlers, normalizeVocalGender } from '../handlers.js';

const BASE = 'https://api.sunoapi.org';

/** fetch mock that returns each body in sequence (HTTP 200, like sunoapi.org does). */
function seq(...bodies: unknown[]) {
  const fn = vi.fn();
  for (const b of bodies) {
    fn.mockResolvedValueOnce({ ok: true, status: 200, json: async () => b, text: async () => JSON.stringify(b) });
  }
  return fn;
}

const RATE_LIMIT = { code: 430, msg: 'Your call frequency is too high. Please try again later.', data: null };

afterEach(() => vi.unstubAllGlobals());

describe('normalizeVocalGender', () => {
  it('maps to m/f and drops unknown values', () => {
    expect(normalizeVocalGender('male')).toBe('m');
    expect(normalizeVocalGender('Female')).toBe('f');
    expect(normalizeVocalGender('m')).toBe('m');
    expect(normalizeVocalGender('other')).toBeUndefined();
    expect(normalizeVocalGender(undefined)).toBeUndefined();
  });
});

describe('transient errors (HTTP 200 with error code in body)', () => {
  it('generate retries on 430 and succeeds', async () => {
    const f = seq(RATE_LIMIT, { code: 200, msg: 'success', data: { taskId: 't1' } });
    vi.stubGlobal('fetch', f);
    const { generateMusic } = createHandlers({ apiKey: 'k', baseUrl: BASE, retryDelayMs: 1 });

    const r = await generateMusic({ prompt: 'x' });
    expect(r.taskId).toBe('t1');
    expect(f).toHaveBeenCalledTimes(2);
  });

  it('generate gives a clear message when rate limit persists', async () => {
    vi.stubGlobal('fetch', seq(RATE_LIMIT, RATE_LIMIT, RATE_LIMIT));
    const { generateMusic } = createHandlers({ apiKey: 'k', baseUrl: BASE, retryDelayMs: 1 });

    await expect(generateMusic({ prompt: 'x' })).rejects.toThrow(/rate limiting.*430.*Wait a minute/);
  });

  it('non-transient body code fails immediately with the API message', async () => {
    const f = seq({ code: 429, msg: 'Insufficient credits', data: null });
    vi.stubGlobal('fetch', f);
    const { generateMusic } = createHandlers({ apiKey: 'k', baseUrl: BASE, retryDelayMs: 1 });

    await expect(generateMusic({ prompt: 'x' })).rejects.toThrow('Suno API error 429: Insufficient credits');
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('wait_for_music keeps polling through a 430 instead of failing', async () => {
    vi.stubGlobal('fetch', seq(
      RATE_LIMIT,
      { code: 200, data: { status: 'PENDING' } },
      { code: 200, data: { status: 'SUCCESS', response: { sunoData: [{ audioUrl: 'https://a.mp3', duration: 60 }] } } },
    ));
    const { waitForMusic } = createHandlers({ apiKey: 'k', baseUrl: BASE, pollIntervalMs: 1, maxPollAttempts: 5 });

    const r = await waitForMusic('t1');
    expect(r.status).toBe('SUCCESS');
    expect(r.audioUrl).toBe('https://a.mp3');
  });
});
