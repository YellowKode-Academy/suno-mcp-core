export interface ModelSpec {
  label: string;
  desc: string;
  promptMax: number;
  styleMax: number;
  titleMax: number;
}

export const MODEL_SPECS: Record<string, ModelSpec> = {
  V4:       { label: 'V4',       desc: 'Classic · fast',       promptMax: 3000, styleMax: 200,  titleMax: 80  },
  V4_5:     { label: 'V4.5',     desc: 'Enhanced · balanced',  promptMax: 5000, styleMax: 1000, titleMax: 100 },
  V4_5PLUS: { label: 'V4.5+',    desc: 'Enhanced plus',        promptMax: 5000, styleMax: 1000, titleMax: 100 },
  V4_5ALL:  { label: 'V4.5 All', desc: 'Full param control',   promptMax: 5000, styleMax: 1000, titleMax: 80  },
  V5:       { label: 'V5',       desc: 'Latest · expressive',  promptMax: 5000, styleMax: 1000, titleMax: 100 },
  V5_5:     { label: 'V5.5',     desc: 'Cutting edge',         promptMax: 5000, styleMax: 1000, titleMax: 100 },
};

export const MODEL_ORDER = ['V4', 'V4_5', 'V4_5PLUS', 'V4_5ALL', 'V5', 'V5_5'] as const;

export type ModelId = typeof MODEL_ORDER[number];
