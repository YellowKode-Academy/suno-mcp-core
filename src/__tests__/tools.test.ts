import { describe, it, expect } from 'vitest';
import { toolSchemas } from '../tools.js';
import { MODEL_ORDER } from '../models.js';

describe('toolSchemas', () => {
  it('exports exactly 5 tools', () => {
    expect(toolSchemas).toHaveLength(5);
  });

  it('every tool has name, description, and inputSchema', () => {
    for (const tool of toolSchemas) {
      expect(tool.name).toBeTruthy();
      expect(tool.description).toBeTruthy();
      expect(tool.inputSchema).toBeDefined();
      expect(tool.inputSchema.type).toBe('object');
    }
  });

  it('tool names match expected set', () => {
    const names = toolSchemas.map((t) => t.name);
    expect(names).toContain('generate_music');
    expect(names).toContain('get_music_status');
    expect(names).toContain('wait_for_music');
    expect(names).toContain('list_recent_music');
    expect(names).toContain('get_credits');
  });

  describe('generate_music schema', () => {
    const tool = toolSchemas.find((t) => t.name === 'generate_music')!;

    it('requires only prompt', () => {
      expect(tool.inputSchema.required).toEqual(['prompt']);
    });

    it('model enum matches MODEL_ORDER', () => {
      const modelProp = (tool.inputSchema.properties as any).model;
      expect(modelProp.enum).toEqual(MODEL_ORDER);
    });

    it('model enum does NOT include deprecated V3_5', () => {
      const modelProp = (tool.inputSchema.properties as any).model;
      expect(modelProp.enum).not.toContain('V3_5');
    });

    it('model enum includes all current models', () => {
      const modelProp = (tool.inputSchema.properties as any).model;
      expect(modelProp.enum).toContain('V4');
      expect(modelProp.enum).toContain('V4_5');
      expect(modelProp.enum).toContain('V4_5PLUS');
      expect(modelProp.enum).toContain('V4_5ALL');
      expect(modelProp.enum).toContain('V5');
      expect(modelProp.enum).toContain('V5_5');
    });

    it('vocalGender enum is ["m","f"]', () => {
      const vg = (tool.inputSchema.properties as any).vocalGender;
      expect(vg.enum).toEqual(['m', 'f']);
    });

    it('numeric weights have min:0 max:1', () => {
      for (const key of ['styleWeight', 'weirdnessConstraint', 'audioWeight']) {
        const prop = (tool.inputSchema.properties as any)[key];
        expect(prop.type).toBe('number');
        expect(prop.minimum).toBe(0);
        expect(prop.maximum).toBe(1);
      }
    });
  });

  describe('get_music_status schema', () => {
    const tool = toolSchemas.find((t) => t.name === 'get_music_status')!;
    it('requires taskId', () => expect(tool.inputSchema.required).toContain('taskId'));
  });

  describe('wait_for_music schema', () => {
    const tool = toolSchemas.find((t) => t.name === 'wait_for_music')!;
    it('requires taskId', () => expect(tool.inputSchema.required).toContain('taskId'));
  });
});
