// The project store. Every change goes through `dispatch` with a serializable
// action; the scene and overlays only read state and dispatch.

import { createStore } from 'zustand/vanilla';
import { analyze } from '../source/mainImage';
import { isValidName } from '../source/literals';
import { reconcile } from '../source/reconcile';
import { bakeAll, bakeRewrite, renameRewrite } from '../source/rewrite';
import type { ShaderError } from '../shader/errors';
import type { Quality } from '../shader/runtime';
import { KNOB_SLOTS, makeKnob, type KnobRecord, type Project } from './schema';
import type { KnobType } from '../source/mainImage';

export type Actor = 'user' | 'agent' | 'system';

export type Action =
  | { type: 'setSource'; source: string }
  | { type: 'createKnob'; source: string; param: string; knobType: KnobType; value: number }
  | { type: 'renameKnob'; id: string; name: string }
  | { type: 'updateKnob'; id: string; patch: Partial<Pick<KnobRecord, 'label' | 'min' | 'max' | 'step'>> }
  | { type: 'deleteKnob'; id: string }
  | { type: 'setKnobValue'; id: string; value: number }
  | { type: 'resetKnob'; id: string }
  | { type: 'setPlayback'; playing?: boolean; quality?: Quality }
  | { type: 'restart' }
  | { type: 'openEditor' }
  | { type: 'closeEditor' }
  | { type: 'setCodeScroll'; line: number }
  | { type: 'editKnob'; id: string }
  | { type: 'stopEditingKnob' }
  | { type: 'setBakeArmed'; armed: boolean }
  | { type: 'bakeAllKnobs' }
  | { type: 'setLean'; lean: boolean }
  | { type: 'loadProject'; project: Project };

export interface LogEntry {
  action: Action;
  actor: Actor;
  at: string;
}

export type ActionResult = { ok: true } | { ok: false; error: string };

export interface CompileState {
  status: 'pending' | 'ok' | 'error';
  errors: ShaderError[];
  /** Source text the errors refer to. */
  source: string;
}

export interface AppState {
  project: Project;
  analysis: { ok: true; warnings: string[] } | { ok: false; reason: string };
  compile: CompileState;
  ui: {
    editorOpen: boolean;
    /** The knob in knob edit mode on the console (docs/control-board.md). */
    editKnobId: string | null;
    /** Whether the BAKE key is turned to ARM. */
    bakeArmed: boolean;
    codeScrollLine: number;
    /** Incremented by `restart` so the runtime can react. */
    restartCount: number;
    /** Camera leaned in so the portal and knobs fill the view. */
    lean: boolean;
  };
  log: LogEntry[];
  dispatch: (action: Action, actor?: Actor) => ActionResult;
  /** Runtime feedback; not a user action, so not logged. */
  setCompile: (compile: CompileState) => void;
}

const LOG_LIMIT = 500;
const OK: ActionResult = { ok: true };
const fail = (error: string): ActionResult => ({ ok: false, error });

export function createProjectStore(initial: Project) {
  // Metadata of knobs removed from the signature this session, by parameter.
  const graveyard = new Map<string, KnobRecord>();

  return createStore<AppState>()((set, get) => {
    /** Sets source and reconciles the knob list with the signature. */
    const withSource = (
      project: Project,
      source: string,
      pending?: Map<string, KnobRecord>,
    ): Pick<AppState, 'project' | 'analysis'> => {
      const a = analyze(source);
      if (!a.ok) {
        // Unparseable: keep knobs as they are until the signature parses again.
        return { project: { ...project, source }, analysis: { ok: false, reason: a.reason } };
      }
      const r = reconcile(a.info.knobParams, project.knobs, graveyard, pending);
      for (const k of r.removed) graveyard.set(k.param, k);
      return {
        project: { ...project, source, knobs: r.knobs },
        analysis: { ok: true, warnings: a.warnings },
      };
    };

    const updateKnob = (id: string, fn: (k: KnobRecord) => KnobRecord): ActionResult => {
      const p = get().project;
      if (!p.knobs.some((k) => k.id === id)) return fail('No such knob.');
      set({ project: { ...p, knobs: p.knobs.map((k) => (k.id === id ? fn(k) : k)) } });
      return OK;
    };

    const reduce = (action: Action): ActionResult => {
      const s = get();
      const p = s.project;
      switch (action.type) {
        case 'setSource':
          if (action.source === p.source) return OK;
          set(withSource(p, action.source));
          return OK;

        case 'createKnob': {
          const used = new Set(p.knobs.map((k) => k.slot));
          let slot = -1;
          for (let i = 0; i < KNOB_SLOTS; i++) {
            if (!used.has(i)) {
              slot = i;
              break;
            }
          }
          if (slot === -1) return fail(`All ${KNOB_SLOTS} knob slots are in use.`);
          const knob = makeKnob(action.param, action.knobType, action.value, slot);
          graveyard.delete(action.param);
          set(withSource(p, action.source, new Map([[action.param, knob]])));
          return OK;
        }

        case 'renameKnob': {
          const knob = p.knobs.find((k) => k.id === action.id);
          if (!knob) return fail('No such knob.');
          if (action.name === knob.param) return OK;
          const a = analyze(p.source);
          const invalid = isValidName(action.name, a.tokens);
          if (invalid) return fail(invalid);
          const r = renameRewrite(p.source, knob.param, action.name);
          if (!r) return fail('The shader could not be analyzed, so the knob cannot be renamed.');
          const renamed: KnobRecord = {
            ...knob,
            param: action.name,
            label: knob.label === knob.param ? action.name : knob.label,
          };
          const knobs = p.knobs.map((k) => (k.id === knob.id ? renamed : k));
          set(withSource({ ...p, knobs }, r.source));
          return OK;
        }

        case 'updateKnob': {
          const { patch } = action;
          const knob = p.knobs.find((k) => k.id === action.id);
          if (!knob) return fail('No such knob.');
          const next = { ...knob, ...patch };
          if (patch.label !== undefined) next.label = patch.label.trim() || knob.param;
          if (!(next.min < next.max)) return fail('The minimum must be below the maximum.');
          if (!(next.step >= 0)) return fail('The step cannot be negative.');
          if (next.type === 'int') next.step = Math.max(1, Math.round(next.step));
          return updateKnob(action.id, () => next);
        }

        case 'deleteKnob': {
          const knob = p.knobs.find((k) => k.id === action.id);
          if (!knob) return fail('No such knob.');
          const r = bakeRewrite(p.source, knob.param, knob.value, knob.type);
          if (!r) return fail('The shader could not be analyzed, so the knob cannot be deleted.');
          const editKnobId = s.ui.editKnobId === knob.id ? null : s.ui.editKnobId;
          set({ ...withSource(p, r.source), ui: { ...s.ui, editKnobId } });
          return OK;
        }

        case 'bakeAllKnobs': {
          // Only with the key at ARM, so a stray dispatch can't bake everything.
          if (!s.ui.bakeArmed) return fail('Turn the BAKE key to ARM first.');
          if (!p.knobs.length) return fail('There are no knobs to bake.');
          set(withSource(p, bakeAll(p.source, p.knobs)));
          return OK;
        }

        case 'setKnobValue':
          if (!Number.isFinite(action.value)) return fail('The value must be a number.');
          return updateKnob(action.id, (k) => ({
            ...k,
            value: k.type === 'int' ? Math.round(action.value) : action.value,
          }));

        case 'resetKnob':
          return updateKnob(action.id, (k) => ({ ...k, value: k.default }));

        case 'setPlayback':
          set({
            project: {
              ...p,
              playback: {
                playing: action.playing ?? p.playback.playing,
                quality: action.quality ?? p.playback.quality,
              },
            },
          });
          return OK;

        case 'restart':
          set({ ui: { ...s.ui, restartCount: s.ui.restartCount + 1 } });
          return OK;

        case 'openEditor':
          // The code panel is out of view when leaned in.
          set({ ui: { ...s.ui, editorOpen: true, lean: false } });
          return OK;

        case 'closeEditor':
          set({ ui: { ...s.ui, editorOpen: false } });
          return OK;

        case 'setCodeScroll':
          set({ ui: { ...s.ui, codeScrollLine: Math.max(0, Math.floor(action.line)) } });
          return OK;

        case 'editKnob':
          if (!p.knobs.some((k) => k.id === action.id)) return fail('No such knob.');
          if (s.ui.bakeArmed) return fail('The knobs are locked while the BAKE key is at ARM.');
          set({ ui: { ...s.ui, editKnobId: action.id } });
          return OK;

        case 'stopEditingKnob':
          if (s.ui.editKnobId) set({ ui: { ...s.ui, editKnobId: null } });
          return OK;

        case 'setBakeArmed':
          set({ ui: { ...s.ui, bakeArmed: action.armed, editKnobId: action.armed ? null : s.ui.editKnobId } });
          return OK;

        case 'setLean':
          if (action.lean === s.ui.lean) return OK;
          set({ ui: { ...s.ui, lean: action.lean, editorOpen: action.lean ? false : s.ui.editorOpen } });
          return OK;

        case 'loadProject':
          graveyard.clear();
          set({
            ...withSource(action.project, action.project.source),
            compile: { status: 'pending', errors: [], source: action.project.source },
            ui: { ...s.ui, editorOpen: false, editKnobId: null, bakeArmed: false, codeScrollLine: 0 },
          });
          return OK;
      }
    };

    const PERSISTENT: Action['type'][] = [
      'setSource', 'createKnob', 'renameKnob', 'updateKnob', 'deleteKnob', 'bakeAllKnobs',
      'setKnobValue', 'resetKnob', 'setPlayback', 'loadProject',
    ];

    return {
      ...withSource(initial, initial.source),
      compile: { status: 'pending', errors: [], source: initial.source },
      ui: { editorOpen: false, editKnobId: null, bakeArmed: false, codeScrollLine: 0, restartCount: 0, lean: false },
      log: [],
      setCompile: (compile) => set({ compile }),
      dispatch: (action, actor = 'user') => {
        const before = new Set(get().project.knobs.map((k) => k.id));
        const result = reduce(action);
        if (!result.ok) return result;
        // Edit mode ends with its knob, however the knob went (a bake, an
        // edit or undo in the source).
        const { ui, project } = get();
        if (ui.editKnobId && !project.knobs.some((k) => k.id === ui.editKnobId)) set({ ui: { ...ui, editKnobId: null } });
        // A new knob, however it came (made from a literal, typed into the
        // signature, undo), turns the BAKE key back to OFF.
        if (get().ui.bakeArmed && project.knobs.some((k) => !before.has(k.id))) set({ ui: { ...get().ui, bakeArmed: false } });
        const entry: LogEntry = { action, actor, at: new Date().toISOString() };
        const log = get().log;
        const last = log[log.length - 1];
        // Coalesce rapid repeats (typing, knob drags) into one entry.
        const coalesce =
          last &&
          last.actor === actor &&
          last.action.type === action.type &&
          (action.type === 'setSource' ||
            action.type === 'setCodeScroll' ||
            (action.type === 'setKnobValue' && (last.action as { id: string }).id === action.id));
        const next = coalesce ? [...log.slice(0, -1), entry] : [...log, entry];
        const patch: Partial<AppState> = { log: next.slice(-LOG_LIMIT) };
        if (PERSISTENT.includes(action.type) && action.type !== 'loadProject') {
          patch.project = { ...get().project, updatedAt: entry.at };
        }
        set(patch);
        return result;
      },
    };
  });
}

export type ProjectStore = ReturnType<typeof createProjectStore>;
