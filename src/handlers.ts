import type { GenerateMusicParams, SunoTrack, HandlerConfig } from './types.js';

const TERMINAL_ERRORS = [
  'SENSITIVE_WORD_ERROR',
  'GENERATE_AUDIO_FAILED',
  'CREATE_TASK_FAILED',
  'CALLBACK_EXCEPTION',
  'ERROR',
];

/**
 * Transient API error — safe to retry. sunoapi.org answers HTTP 200 with the real code in the
 * body: 430 = call frequency too high (rate limit), 455 = maintenance, 5xx = server error.
 */
export class SunoTransientError extends Error {
  constructor(public readonly code: number, message: string) {
    super(message);
    this.name = 'SunoTransientError';
  }
}

const TRANSIENT_CODES = new Set([430, 455, 500, 502, 503, 504]);
const TRANSIENT_HTTP = new Set([408, 425, 429, 500, 502, 503, 504]);

/** Maps 'male'/'female' (and variants) to the only values sunoapi.org accepts: 'm' | 'f'. */
export function normalizeVocalGender(v?: string): 'm' | 'f' | undefined {
  if (!v) return undefined;
  const x = v.trim().toLowerCase();
  if (x === 'm' || x === 'male') return 'm';
  if (x === 'f' || x === 'female') return 'f';
  return undefined;
}

async function httpRequest(
  baseUrl: string,
  apiKey: string,
  path: string,
  options: RequestInit = {},
): Promise<any> {
  let res: Response;
  try {
    res = await fetch(`${baseUrl}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        ...(options.headers as Record<string, string>),
      },
    });
  } catch (e) {
    throw new SunoTransientError(0, `Network error: ${(e as Error).message}`);
  }
  if (!res.ok) {
    const text = await res.text();
    if (TRANSIENT_HTTP.has(res.status)) throw new SunoTransientError(res.status, `API error ${res.status}: ${text}`);
    throw new Error(`API error ${res.status}: ${text}`);
  }
  const body = await res.json();
  // sunoapi.org: HTTP 200 + { code, msg, data } — any code other than 200 is an error.
  if (body && typeof body.code === 'number' && body.code !== 200) {
    const msg = `Suno API error ${body.code}: ${body.msg ?? 'unknown error'}`;
    if (TRANSIENT_CODES.has(body.code)) throw new SunoTransientError(body.code, msg);
    throw new Error(msg);
  }
  return body;
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function createHandlers(config: HandlerConfig) {
  const { apiKey, baseUrl, maxPollAttempts = 30, pollIntervalMs = 10000, callBackUrl, retryDelayMs = 1500 } = config;

  // Detect which API variant we're talking to.
  // sunoapi.org uses a different credits endpoint and returns credits as a plain number.
  const isSunoBoard =
    config.apiType === 'sunoboard' ||
    (config.apiType !== 'sunoapi' && baseUrl.includes('sunoboard'));

  const req = (path: string, options?: RequestInit) =>
    httpRequest(baseUrl, apiKey, path, options);

  async function generateMusic(params: GenerateMusicParams) {
    const isCustom = params.customMode ?? false;

    const body: Record<string, unknown> = {
      prompt: params.prompt,
      model: params.model ?? 'V4_5',
      instrumental: params.instrumental ?? false,
      customMode: isCustom,
      styleWeight: params.styleWeight ?? 0.5,
      weirdnessConstraint: params.weirdnessConstraint ?? 0.5,
      audioWeight: params.audioWeight ?? 0.5,
    };

    // title and style are only meaningful in custom mode
    if (isCustom) {
      if (params.style) body.style = params.style;
      if (params.title) body.title = params.title;
    }
    if (params.negativeTags) body.negativeTags = params.negativeTags;
    // vocalGender is only relevant when there's a vocal track
    // sunoapi.org only understands 'm' | 'f' — 'male'/'female' used to be silently ignored.
    const vocalGender = normalizeVocalGender(params.vocalGender);
    if (vocalGender && !body.instrumental) body.vocalGender = vocalGender;
    // sunoapi.org requires callBackUrl — we poll for status anyway so any URL works
    if (!isSunoBoard) {
      body.callBackUrl = callBackUrl ?? 'https://api.sunoboard.com/health';
    }

    // Retry transient errors (rate limit 430, maintenance 455, 5xx) with backoff.
    let result: any;
    for (let attempt = 1; ; attempt++) {
      try {
        result = await req('/api/v1/generate', { method: 'POST', body: JSON.stringify(body) });
        break;
      } catch (err) {
        if (!(err instanceof SunoTransientError)) throw err;
        if (attempt >= 3) {
          throw new Error(
            err.code === 430
              ? 'Suno API is rate limiting requests right now (code 430). Wait a minute and try again.'
              : `Suno API is temporarily unavailable (${err.message}). Try again in a few minutes.`,
          );
        }
        await sleep(retryDelayMs * attempt);
      }
    }

    // sunoapi.org: { code, msg, data: { taskId } }          — no status in generate response
    // SunoBoard:   { data: { taskId, status: 'PENDING' } }
    const taskId = (result.data?.taskId ?? result.taskId) as string;
    const status = (result.data?.status ?? result.status) as string | undefined;

    if (!taskId) {
      throw new Error(`Generate failed: ${result?.msg ?? JSON.stringify(result).slice(0, 200)}`);
    }

    return {
      taskId,
      status,
      message: `Generation started. TaskId: ${taskId}. Use wait_for_music to get the audio URL.`,
    };
  }

  async function getMusicStatus(taskId: string) {
    const result = await req(
      `/api/v1/generate/record-info?taskId=${encodeURIComponent(taskId)}`,
    );
    // Both APIs return { data: { taskId, status, response? } }
    const data = result.data ?? result;
    const status = (data.status as string | undefined)?.toUpperCase();

    // SUCCESS     — both tracks fully generated
    // FIRST_SUCCESS — first track is ready (1 of 2); return available tracks
    if (status === 'SUCCESS' || status === 'FIRST_SUCCESS') {
      const tracks: SunoTrack[] = data.response?.sunoData ?? [];
      return {
        status,
        taskId,
        tracks: tracks.map((t) => ({
          audioUrl: t.audioUrl,
          duration: t.duration,
          title: t.title,
          imageUrl: t.imageUrl,
        })),
        audioUrl: tracks[0]?.audioUrl,
        audioUrlShort: tracks[1]?.audioUrl,
        duration: tracks[0]?.duration,
        imageUrl: tracks[0]?.imageUrl,
      };
    }

    return {
      status: data.status as string,
      taskId,
      message: `Current status: ${data.status}`,
    };
  }

  async function waitForMusic(taskId: string) {
    for (let i = 1; i <= maxPollAttempts; i++) {
      let result: Awaited<ReturnType<typeof getMusicStatus>>;
      try {
        result = await getMusicStatus(taskId);
      } catch (err) {
        // Rate limit / maintenance while polling is not a failure — just try again next round.
        if (!(err instanceof SunoTransientError)) throw err;
        if (i < maxPollAttempts) await sleep(pollIntervalMs);
        continue;
      }

      // Only resolve on full SUCCESS — FIRST_SUCCESS means 1 of 2 tracks is ready,
      // keep polling so the caller always receives both tracks.
      if (result.status === 'SUCCESS') return result;

      if (TERMINAL_ERRORS.includes((result.status ?? '').toUpperCase())) {
        throw new Error(`Generation failed with status: ${result.status}`);
      }

      if (i < maxPollAttempts) {
        await sleep(pollIntervalMs);
      }
    }

    throw new Error(
      `Timeout: music not ready after ${maxPollAttempts} attempts (${(maxPollAttempts * pollIntervalMs) / 1000}s)`,
    );
  }

  async function listRecentMusic(page = 1, limit = 20) {
    const result = await req(`/api/v1/generate/list?page=${page}&limit=${limit}`);
    const items: Array<Record<string, unknown>> = result.items ?? result.data?.list ?? [];

    return {
      total: (result.total ?? result.data?.total ?? items.length) as number,
      page: (result.page ?? page) as number,
      items: items.map((item) => ({
        id: item.id as string | undefined,
        taskId: item.taskId as string | undefined,
        title: item.title as string | undefined,
        status: item.status as string | undefined,
        audioUrl: item.audioUrl as string | undefined,
        imageUrl: item.imageUrl as string | undefined,
        createdAt: item.createdAt as string | undefined,
      })),
    };
  }

  async function getCredits() {
    // sunoapi.org: GET /api/v1/generate/credit → data is a plain number (remaining only)
    // SunoBoard:   GET /api/v1/credits         → data is { remaining, total, used }
    const path = isSunoBoard ? '/api/v1/credits' : '/api/v1/generate/credit';
    const result = await req(path);
    const data = result.data ?? result;

    if (typeof data === 'number') {
      return {
        remaining: data,
        message: `Remaining credits: ${data}`,
      };
    }

    return {
      remaining: data.remaining as number,
      total: data.total as number,
      used: data.used as number,
      message: `Remaining credits: ${data.remaining}`,
    };
  }

  return { generateMusic, getMusicStatus, waitForMusic, listRecentMusic, getCredits };
}

export type Handlers = ReturnType<typeof createHandlers>;
