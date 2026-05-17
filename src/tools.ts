import { MODEL_ORDER } from './models.js';

export const toolSchemas = [
  {
    name: 'generate_music',
    description:
      'Generate AI music using Suno API. Returns a taskId. Use wait_for_music immediately after to get the audio URL. Simple mode (default): describe the music in prompt, optionally add style tags. Custom mode: prompt = literal lyrics, style and title are required.',
    inputSchema: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description:
            'Text description of the music (mood, theme, instruments). In customMode this is the literal lyrics to be sung.',
        },
        style: {
          type: 'string',
          description:
            'Music style tags (e.g. "ambient dark, slow drums, cinematic"). Required when customMode is true.',
        },
        title: {
          type: 'string',
          description: 'Title for the generated track. Required when customMode is true.',
        },
        model: {
          type: 'string',
          enum: MODEL_ORDER as unknown as string[],
          description:
            'Suno model version (default: V4_5). V4=classic fast · V4_5=enhanced · V4_5PLUS=rich sound · V4_5ALL=full control · V5=expressive · V5_5=cutting edge',
        },
        instrumental: {
          type: 'boolean',
          description: 'Generate without vocals (default: false)',
        },
        customMode: {
          type: 'boolean',
          description:
            'Enable custom mode: prompt is used as literal lyrics, style and title become required (default: false)',
        },
        negativeTags: {
          type: 'string',
          description: 'Music styles to avoid (e.g. "Heavy Metal, Upbeat Drums")',
        },
        styleWeight: {
          type: 'number',
          minimum: 0,
          maximum: 1,
          description: 'Style adherence weight 0–1 (default: 0.5)',
        },
        weirdnessConstraint: {
          type: 'number',
          minimum: 0,
          maximum: 1,
          description: 'Creativity vs. predictability 0–1 (default: 0.5)',
        },
        audioWeight: {
          type: 'number',
          minimum: 0,
          maximum: 1,
          description: 'Audio quality weight 0–1 (default: 0.5)',
        },
        vocalGender: {
          type: 'string',
          enum: ['m', 'f'],
          description: 'Vocal gender preference when not instrumental',
        },
      },
      required: ['prompt'],
    },
  },
  {
    name: 'get_music_status',
    description:
      'Retrieve a generation by taskId — returns full audio data (audioUrl, title, imageUrl, duration) when status is SUCCESS, or the current status (PENDING/PROCESSING) if still generating. Use this to fetch a previously completed generation by its taskId.',
    inputSchema: {
      type: 'object',
      properties: {
        taskId: {
          type: 'string',
          description: 'The taskId returned by generate_music',
        },
      },
      required: ['taskId'],
    },
  },
  {
    name: 'wait_for_music',
    description:
      'Wait for music generation to complete and return the audio URLs. Polls automatically every few seconds until ready (up to 5 minutes).',
    inputSchema: {
      type: 'object',
      properties: {
        taskId: {
          type: 'string',
          description: 'The taskId returned by generate_music',
        },
      },
      required: ['taskId'],
    },
  },
  {
    name: 'list_recent_music',
    description:
      'List all recently generated music tracks with their audioUrl, title, status, imageUrl and createdAt. Use this to find a previously generated song by name or date, or to show the user their music history.',
    inputSchema: {
      type: 'object',
      properties: {
        page: {
          type: 'number',
          description: 'Page number (default: 1)',
        },
        limit: {
          type: 'number',
          description: 'Items per page (default: 20, max: 50)',
        },
      },
    },
  },
  {
    name: 'get_credits',
    description: 'Check remaining Suno API credits for your account.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
] as const;
