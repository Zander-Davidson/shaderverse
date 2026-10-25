// The editing engine shared by both editor front ends (the in-scene curved
// editor and the flat overlay). CodeMirror owns the document, selection,
// undo history and keyboard input; this class keeps it in sync with the store
// and turns selected literals into knobs.

import { Annotation, EditorState, type Extension } from '@codemirror/state';
import { EditorView, keymap, type ViewUpdate } from '@codemirror/view';
import { KNOB_SLOTS } from '../project/schema';
import type { ProjectStore } from '../project/store';
import { checkLiteral } from '../source/literals';
import { analyze } from '../source/mainImage';
import { createKnobRewrite } from '../source/rewrite';

/** Marks transactions that came from the store, so they aren't echoed back. */
const fromStore = Annotation.define<boolean>();

export const SOURCE_DEBOUNCE_MS = 120;

export type HintKind = 'info' | 'error' | 'ok';

export interface Hint {
  text: string;
  kind: HintKind;
}

/** What the "make knob" affordance should offer for the current selection. */
export type KnobOffer = { ok: true; name: string } | { ok: false; reason: string };

export class EditorSession {
  readonly view: EditorView;
  hint: Hint = { text: '', kind: 'info' };
  private timer: ReturnType<typeof setTimeout> | undefined;
  private hintTimer: ReturnType<typeof setTimeout> | undefined;
  /** Set while this session is the one changing the store's source. */
  private pushing = false;
  private readonly listeners = new Set<(u: ViewUpdate | null) => void>();

  constructor(
    private readonly store: ProjectStore,
    parent: HTMLElement,
    extensions: Extension[],
  ) {
    this.view = new EditorView({
      parent,
      state: EditorState.create({
        doc: store.getState().project.source,
        extensions: [
          keymap.of([
            { key: 'Mod-k', preventDefault: true, run: () => (this.createKnob(), true) },
            { key: 'Escape', run: () => (this.close(), true) },
          ]),
          ...extensions,
          EditorView.updateListener.of((u) => {
            if (u.docChanged && !u.transactions.some((tr) => tr.annotation(fromStore))) this.scheduleSource();
            this.emit(u);
          }),
        ],
      }),
    });

    store.subscribe((s, prev) => {
      if (s.project.source !== prev.project.source && !this.timer && !this.pushing) this.pullSource();
    });
  }

  get doc(): string {
    return this.view.state.doc.toString();
  }

  /** Called after every editor update, and with null for hint changes. */
  subscribe(fn: (u: ViewUpdate | null) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(u: ViewUpdate | null) {
    for (const fn of this.listeners) fn(u);
  }

  close(): void {
    if (this.store.getState().ui.editorOpen) this.store.getState().dispatch({ type: 'closeEditor' });
  }

  private scheduleSource() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), SOURCE_DEBOUNCE_MS);
  }

  /** Sends pending edits to the store now. */
  flush(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
    const doc = this.doc;
    if (doc !== this.store.getState().project.source) {
      this.pushing = true;
      try {
        this.store.getState().dispatch({ type: 'setSource', source: doc });
      } finally {
        this.pushing = false;
      }
    }
  }

  /** Brings in a source change made elsewhere (rename, bake, load). */
  pullSource(): void {
    const src = this.store.getState().project.source;
    const doc = this.doc;
    if (src === doc) return;
    this.view.dispatch({
      changes: { from: 0, to: doc.length, insert: src },
      annotations: fromStore.of(true),
    });
  }

  setHint(text: string, kind: HintKind, ms = 4000): void {
    clearTimeout(this.hintTimer);
    this.hint = { text, kind };
    this.emit(null);
    if (ms > 0 && text) this.hintTimer = setTimeout(() => this.setHint('', 'info', 0), ms);
  }

  /** The knob offer for the main selection, or null if it isn't number-like. */
  knobOffer(): KnobOffer | null {
    const sel = this.view.state.selection.main;
    if (sel.empty) return null;
    const r = checkLiteral(this.doc, sel.from, sel.to);
    if (r.ok) return { ok: true, name: r.proposedName };
    // Only offer for selections that look like a number.
    return /^\s*-?\s*[\d.]/.test(this.view.state.sliceDoc(sel.from, sel.to)) ? { ok: false, reason: r.reason } : null;
  }

  /** Turns the selected literal into a knob in one undoable change. */
  createKnob(): boolean {
    const sel = this.view.state.selection.main;
    const src = this.doc;
    const r = checkLiteral(src, sel.from, sel.to);
    if (!r.ok) {
      this.setHint(r.reason, 'error');
      return false;
    }
    const used = this.store.getState().project.knobs.filter((k) => k.slot >= 0).length;
    if (used >= KNOB_SLOTS) {
      this.setHint(`All ${KNOB_SLOTS} knob slots are in use. Delete a knob first.`, 'error');
      return false;
    }
    const a = analyze(src);
    if (!a.ok) return false;
    const rw = createKnobRewrite(src, r.info, a.tokens, r.from, r.to, r.proposedName, r.type);

    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
    this.pushing = true;
    let res;
    try {
      res = this.store.getState().dispatch({
        type: 'createKnob',
        source: rw.source,
        param: r.proposedName,
        knobType: r.type,
        value: r.value,
      });
    } finally {
      this.pushing = false;
    }
    if (!res.ok) {
      this.setHint(res.error, 'error');
      return false;
    }
    // Changes are in original-document coordinates, applied as one transaction
    // so a single undo removes the knob.
    const nameAt = r.from + rw.changes.filter((c) => c.from < r.from).reduce((n, c) => n + c.insert.length - (c.to - c.from), 0);
    this.view.dispatch({
      changes: rw.changes,
      selection: { anchor: nameAt, head: nameAt + r.proposedName.length },
      annotations: fromStore.of(true),
      userEvent: 'input.knob',
    });
    const knob = this.store.getState().project.knobs.find((k) => k.param === r.proposedName);
    this.setHint(`Knob “${r.proposedName}” created in slot ${(knob?.slot ?? 0) + 1}. Rename it from the knob.`, 'ok');
    return true;
  }
}

export function isMac(): boolean {
  return /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
}
