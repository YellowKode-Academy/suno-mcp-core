import type { GenerateMusicParams, SunoTrack, HandlerConfig } from './types.js';

const TERMINAL_ERRORS = [
  'SENSITIVE_WORD_ERROR',
  'GENERATE_AUDIO_FAILED',
  'CREATE_TASK_FAILED',
  'CALLBACK_EXCEPTION',
  'ERROR',
];

async function httpRequest(
  baseUrl: string,
  apiKey: string,
  path: string,
  options: RequestInit = {},
): Promise<any> {
  const res = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API error ${res.status}: ${text}`);
  }
  return res.json();
}

export function createHandlers(config: HandlerConfig) {
  const { apiKey, baseUrl, maxPollAttempts = 30, pollIntervalMs = 10000 } = config;

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
    if (params.vocalGender && !body.instrumental) body.vocalGender = params.vocalGender;

    const result = await req('/api/v1/generate', {
      method: 'POST',
      body: JSON.stringify(body),
    });

    const taskId = (result.data?.taskId ?? result.taskId) as string;
    const status = (result.data?.status ?? result.status) as string;
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
    const data = result.data ?? result;

    if (data.status?.toUpperCase() === 'SUCCESS') {
      const tracks: SunoTrack[] = data.response?.sunoData ?? [];
      return {
        status: 'SUCCESS' as const,
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
      const result = await getMusicStatus(taskId);

      if (result.status === 'SUCCESS') return result;

      if (TERMINAL_ERRORS.includes((result.status ?? '').toUpperCase())) {
        throw new Error(`Generation failed with status: ${result.status}`);
      }

      if (i < maxPollAttempts) {
        await new Promise<void>((resolve) => setTimeout(resolve, pollIntervalMs));
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
    const result = await req('/api/v1/credits');
    const data = result.data ?? result;

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
