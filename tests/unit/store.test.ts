import { describe, expect, it } from 'vitest';
import { createProjectStore } from '../../src/project/store';
import { migrate, newProject, ProjectFormatError, SCHEMA_VERSION, KNOB_SLOTS, defaultRange } from '../../src/project/schema';
import { exportProjectJson, importProjectJson, exportBakedGlsl } from '../../src/project/persistence';

const BASE = 'void mainImage(out vec4 o, in vec2 c)\n{\n    o = vec4(0.5, 0.25, 2.0, 1.0);\n}';
const WITH = (params: string) => BASE.replace('in vec2 c', `in vec2 c${params}`);

const store = (src = BASE) => createProjectStore(newProject(src));

describe('store actions', () => {
  it('setSource reconciles hand-typed parameters into knobs', () => {
    const s = store();
    s.getState().dispatch({ type: 'setSource', source: WITH(', in float a, in int n') });
    const k = s.getState().project.knobs;
    expect(k.map((x) => [x.param, x.type, x.slot])).toEqual([
      ['a', 'float', 0],
      ['n', 'int', 1],
    ]);
  });

  it('createKnob sets metadata from the literal', () => {
    const s = store();
    const src = WITH(', in float blue').replace('2.0', 'blue');
    s.getState().dispatch({ type: 'createKnob', source: src, param: 'blue', knobType: 'float', value: 2 });
    const [k] = s.getState().project.knobs;
    expect(k).toMatchObject({ param: 'blue', value: 2, default: 2, min: 0, max: 4, slot: 0 });
  });

  it('keeps removed knob metadata so undo restores it', () => {
    const s = store();
    const src = WITH(', in float blue').replace('2.0', 'blue');
    s.getState().dispatch({ type: 'createKnob', source: src, param: 'blue', knobType: 'float', value: 2 });
    const id = s.getState().project.knobs[0]!.id;
    s.getState().dispatch({ type: 'updateKnob', id, patch: { min: -10, max: 10 } });
    s.getState().dispatch({ type: 'setSource', source: BASE }); // undo
    expect(s.getState().project.knobs).toHaveLength(0);
    s.getState().dispatch({ type: 'setSource', source: src }); // redo
    expect(s.getState().project.knobs[0]).toMatchObject({ id, min: -10, max: 10 });
  });

  it('keeps knobs while the signature does not parse', () => {
    const s = store(WITH(', in float a'));
    s.getState().dispatch({ type: 'setSource', source: WITH(', in float a').replace('{', '') + '}}' });
    s.getState().dispatch({ type: 'setSource', source: 'void mainImage(' });
    expect(s.getState().analysis.ok).toBe(false);
    expect(s.getState().project.knobs).toHaveLength(1);
  });

  it('renames a knob through the source', () => {
    const s = store(WITH(', in float a').replace('0.5', 'a'));
    const id = s.getState().project.knobs[0]!.id;
    expect(s.getState().dispatch({ type: 'renameKnob', id, name: 'red' }).ok).toBe(true);
    const st = s.getState();
    expect(st.project.source).toContain('in float red');
    expect(st.project.source).toContain('vec4(red,');
    expect(st.project.knobs[0]).toMatchObject({ id, param: 'red', label: 'red' });
  });

  it('rejects invalid or colliding names', () => {
    const s = store(WITH(', in float a, in float b'));
    const id = s.getState().project.knobs[0]!.id;
    expect(s.getState().dispatch({ type: 'renameKnob', id, name: 'b' }).ok).toBe(false);
    expect(s.getState().dispatch({ type: 'renameKnob', id, name: '9x' }).ok).toBe(false);
    expect(s.getState().dispatch({ type: 'renameKnob', id, name: 'sin' }).ok).toBe(false);
  });

  it('deleteKnob bakes the current value', () => {
    const s = store(WITH(', in float a').replace('0.5', 'a'));
    const id = s.getState().project.knobs[0]!.id;
    s.getState().dispatch({ type: 'setKnobValue', id, value: 0.75 });
    s.getState().dispatch({ type: 'deleteKnob', id });
    expect(s.getState().project.source).toBe(BASE.replace('0.5', '0.75'));
    expect(s.getState().project.knobs).toHaveLength(0);
  });

  it('setKnobValue does not change the source; int knobs round', () => {
    const s = store(WITH(', in int n'));
    const before = s.getState().project.source;
    const id = s.getState().project.knobs[0]!.id;
    s.getState().dispatch({ type: 'setKnobValue', id, value: 2.7 });
    expect(s.getState().project.knobs[0]!.value).toBe(3);
    expect(s.getState().project.source).toBe(before);
    s.getState().dispatch({ type: 'resetKnob', id });
    expect(s.getState().project.knobs[0]!.value).toBe(0);
  });

  it('validates ranges', () => {
    const s = store(WITH(', in float a'));
    const id = s.getState().project.knobs[0]!.id;
    expect(s.getState().dispatch({ type: 'updateKnob', id, patch: { min: 5, max: 1 } }).ok).toBe(false);
  });

  it('declines createKnob when no slot is free', () => {
    const params = Array.from({ length: KNOB_SLOTS }, (_, i) => `, in float k${i}`).join('');
    const s = store(WITH(params));
    const src = WITH(params + ', in float extra').replace('2.0', 'extra');
    const r = s.getState().dispatch({ type: 'createKnob', source: src, param: 'extra', knobType: 'float', value: 2 });
    expect(r.ok).toBe(false);
  });

  it('logs actions with actor and coalesces drags', () => {
    const s = store(WITH(', in float a'));
    const id = s.getState().project.knobs[0]!.id;
    s.getState().dispatch({ type: 'setKnobValue', id, value: 0.1 });
    s.getState().dispatch({ type: 'setKnobValue', id, value: 0.2 });
    s.getState().dispatch({ type: 'setPlayback', playing: false }, 'agent');
    const log = s.getState().log;
    expect(log).toHaveLength(2);
    expect(log[0]!.action).toMatchObject({ type: 'setKnobValue', value: 0.2 });
    expect(log[1]!.actor).toBe('agent');
    expect(JSON.parse(JSON.stringify(log))).toEqual(log);
  });

  it('opens and closes the editor', () => {
    const s = store();
    s.getState().dispatch({ type: 'openEditor' });
    expect(s.getState().ui.editorOpen).toBe(true);
    s.getState().dispatch({ type: 'closeEditor' });
    expect(s.getState().ui.editorOpen).toBe(false);
  });
});

describe('schema', () => {
  it('round-trips through export and import', () => {
    const s = store(WITH(', in float a'));
    const p = s.getState().project;
    expect(importProjectJson(exportProjectJson(p))).toEqual(p);
  });

  it('runs migrations from older versions', () => {
    const old = { schemaVersion: 0, code: BASE };
    const p = migrate(old, { 0: (d) => ({ ...d, schemaVersion: 1, source: d.code }) });
    expect(p.schemaVersion).toBe(SCHEMA_VERSION);
    expect(p.source).toBe(BASE);
  });

  it('rejects newer or malformed files', () => {
    expect(() => migrate({ schemaVersion: 99, source: '' })).toThrow(ProjectFormatError);
    expect(() => migrate({ source: '' })).toThrow(ProjectFormatError);
    expect(() => migrate('nope')).toThrow(ProjectFormatError);
  });

  it('bakes knobs for .glsl export', () => {
    const s = store(WITH(', in float a').replace('0.5', 'a'));
    const id = s.getState().project.knobs[0]!.id;
    s.getState().dispatch({ type: 'setKnobValue', id, value: 0.9 });
    expect(exportBakedGlsl(s.getState().project)).toBe(BASE.replace('0.5', '0.9'));
  });

  it('range heuristic', () => {
    expect(defaultRange(2, 'float')).toEqual({ min: 0, max: 4, step: 0 });
    expect(defaultRange(-1, 'float')).toEqual({ min: -2, max: 0, step: 0 });
    expect(defaultRange(0, 'float')).toEqual({ min: -1, max: 1, step: 0 });
    expect(defaultRange(5, 'int')).toEqual({ min: 0, max: 10, step: 1 });
  });
});
