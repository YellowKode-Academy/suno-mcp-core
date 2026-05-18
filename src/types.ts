export interface GenerateMusicParams {
  prompt: string;
  style?: string;
  title?: string;
  model?: 'V4' | 'V4_5' | 'V4_5PLUS' | 'V4_5ALL' | 'V5' | 'V5_5';
  instrumental?: boolean;
  customMode?: boolean;
  negativeTags?: string;
  styleWeight?: number;
  weirdnessConstraint?: number;
  audioWeight?: number;
  vocalGender?: 'm' | 'f';
}

export interface SunoTrack {
  audioUrl: string;
  duration: number;
  title?: string;
  imageUrl?: string;
}

export interface HandlerConfig {
  apiKey: string;
  baseUrl: string;
  maxPollAttempts?: number;
  pollIntervalMs?: number;
  /**
   * Which API is being called.
   * - 'sunoboard': api.sunoboard.com — credits at /api/v1/credits, returns { remaining, total, used }
   * - 'sunoapi':   api.sunoapi.org   — credits at /api/v1/generate/credit, returns a plain number
   * Defaults to auto-detect: baseUrl containing "sunoboard" → 'sunoboard', otherwise 'sunoapi'.
   */
  apiType?: 'sunoboard' | 'sunoapi';
}

export type ToolName =
  | 'generate_music'
  | 'get_music_status'
  | 'wait_for_music'
  | 'list_recent_music'
  | 'get_credits';
