// Flat CodeMirror editor that lifts forward over the code display. It never
// covers the portal. Knobs are created here from a selected literal.

import { cpp } from '@codemirror/lang-cpp';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { setDiagnostics, type Diagnostic } from '@codemirror/lint';
import { Annotation, EditorState } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import { tags as t } from '@lezer/highlight';
import { basicSetup } from 'codemirror';
import type { ScreenRect } from '../panels/bounds';
import { KNOB_SLOTS } from '../project/schema';
import type { ProjectStore } from '../project/store';
import { checkLiteral } from '../source/literals';
import { analyze } from '../source/mainImage';
import { createKnobRewrite } from '../source/rewrite';
import { COLORS, KNOB_TINTS, MONO } from '../theme';

/** Marks transactions that came from the store, so they aren't echoed back. */
const fromStore = Annotation.define<boolean>();

export const SOURCE_DEBOUNCE_MS = 120;

const highlight = HighlightStyle.define([
  { tag: [t.keyword, t.controlKeyword, t.modifier, t.operatorKeyword], color: COLORS.keyword },
  { tag: [t.typeName, t.standard(t.typeName)], color: COLORS.type },
  { tag: [t.number, t.bool], color: COLORS.number },
  { tag: [t.comment, t.lineComment, t.blockComment], color: COLORS.comment, fontStyle: 'italic' },
  { tag: [t.processingInstruction, t.meta], color: COLORS.preprocessor },
  { tag: [t.function(t.variableName), t.function(t.propertyName)], color: COLORS.builtin },
  { tag: [t.operator, t.punctuation, t.bracket], color: COLORS.punct },
  { tag: [t.variableName, t.propertyName], color: COLORS.ident },
  { tag: t.string, color: COLORS.ok },
]);

const theme = EditorView.theme(
  {
    '&': { color: COLORS.text, backgroundColor: 'transparent', height: '100%', fontSize: '13.5px' },
    '.cm-scroller': { fontFamily: MONO, lineHeight: '1.55' },
    '.cm-content': { caretColor: COLORS.accent },
    '.cm-cursor, .cm-dropCursor': { borderLeftColor: COLORS.accent, borderLeftWidth: '2px' },
    '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
      backgroundColor: '#1f4255 !important',
    },
    '.cm-gutters': { backgroundColor: 'transparent', color: '#3d4f5c', border: 'none' },
    '.cm-activeLine': { backgroundColor: '#ffffff08' },
    '.cm-activeLineGutter': { backgroundColor: 'transparent', color: COLORS.dim },
    '.cm-matchingBracket': { backgroundColor: '#2a3f4c', outline: 'none' },
    '.cm-tooltip': { backgroundColor: '#0e171e', border: `1px solid ${COLORS.panelEdge}`, color: COLORS.text },
    '.cm-diagnostic-error': { borderLeftColor: COLORS.error },
    '.cm-lintRange-error': { backgroundImage: 'none', textDecoration: `underline wavy ${COLORS.error}` },
    '.cm-panels': { backgroundColor: '#0b1116', color: COLORS.text },
    '.cm-searchMatch': { backgroundColor: '#4fd1ff33' },
  },
  { dark: true },
);

export class EditorOverlay {
  readonly root: HTMLDivElement;
  readonly view: EditorView;
  private readonly hint: HTMLDivElement;
  private readonly knobButton: HTMLButtonElement;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private hintTimer: ReturnType<typeof setTimeout> | undefined;
  /** Set while this editor is the one changing the store's source. */
  private pushing = false;

  constructor(
    private readonly store: ProjectStore,
    private readonly bounds: () => { code: ScreenRect; portal: ScreenRect },
  ) {
    this.root = document.createElement('div');
    this.root.className = 'sv-editor';
    this.root.hidden = true;
    this.root.innerHTML = `
      <div class="sv-editor-head">
        <span class="sv-editor-title">SOURCE // EDIT</span>
        <span class="sv-editor-keys">select a number · <kbd>${isMac() ? '⌘' : 'Ctrl'}K</kbd> make knob · <kbd>Esc</kbd> close</span>
      </div>
      <div class="sv-editor-body"></div>
      <div class="sv-editor-hint" role="status"></div>`;
    document.body.appendChild(this.root);
    this.hint = this.root.querySelector('.sv-editor-hint')!;

    this.knobButton = document.createElement('button');
    this.knobButton.className = 'sv-knob-button';
    this.knobButton.type = 'button';
    this.knobButton.hidden = true;
    this.knobButton.addEventListener('mousedown', (e) => e.preventDefault());
    this.knobButton.addEventListener('click', () => this.createKnob());
    this.root.appendChild(this.knobButton);

    this.view = new EditorView({
      parent: this.root.querySelector('.sv-editor-body')!,
      state: EditorState.create({
        doc: store.getState().project.source,
        extensions: [
          keymap.of([
            { key: 'Mod-k', preventDefault: true, run: () => (this.createKnob(), true) },
            { key: 'Escape', run: () => (this.close(), true) },
          ]),
          basicSetup,
          cpp(),
          theme,
          syntaxHighlighting(highlight),
          EditorView.updateListener.of((u) => {
            if (u.docChanged && !u.transactions.some((tr) => tr.annotation(fromStore))) this.scheduleSource();
            if (u.selectionSet || u.docChanged || u.geometryChanged) this.updateKnobButton();
          }),
        ],
      }),
    });

    store.subscribe((s, prev) => {
      if (s.ui.editorOpen !== prev.ui.editorOpen) {
        if (s.ui.editorOpen) this.show();
        else this.hide();
      }
      if (s.project.source !== prev.project.source && !this.timer && !this.pushing) this.pullSource();
      if (s.compile !== prev.compile || s.project.source !== prev.project.source) this.showDiagnostics();
    });

    // Clicks outside close the editor (canvas clicks are routed by the app).
    document.addEventListener('pointerdown', (e) => {
      if (!this.root.hidden && !this.root.contains(e.target as Node) && !(e.target instanceof HTMLCanvasElement)) {
        const el = e.target as HTMLElement;
        if (!el.closest('.sv-popover')) this.close();
      }
    });
    window.addEventListener('resize', () => this.position());
  }

  get isOpen(): boolean {
    return !this.root.hidden;
  }

  close(): void {
    if (this.store.getState().ui.editorOpen) this.store.getState().dispatch({ type: 'closeEditor' });
  }

  /** Lines the editor scrolled to, so the curved display can follow. */
  private topLine(): number {
    const block = this.view.lineBlockAtHeight(this.view.scrollDOM.scrollTop);
    return this.view.state.doc.lineAt(block.from).number - 1;
  }

  private show() {
    this.pullSource();
    this.root.hidden = false;
    this.position();
    const line = this.store.getState().ui.codeScrollLine;
    const pos = this.view.state.doc.line(Math.min(line + 1, this.view.state.doc.lines)).from;
    this.view.dispatch({ effects: EditorView.scrollIntoView(pos, { y: 'start' }) });
    this.view.focus();
    this.showDiagnostics();
  }

  private hide() {
    this.flush();
    this.store.getState().dispatch({ type: 'setCodeScroll', line: this.topLine() });
    this.root.hidden = true;
    this.knobButton.hidden = true;
    this.view.contentDOM.blur();
  }

  position(): void {
    if (this.root.hidden) return;
    const { code, portal } = this.bounds();
    const margin = 12;
    const left = Math.max(margin, code.left - 6);
    const right = Math.min(code.right + 6, portal.left - margin);
    const top = Math.max(margin, code.top - 6);
    const bottom = Math.min(window.innerHeight - margin, code.bottom + 6);
    Object.assign(this.root.style, {
      left: `${left}px`,
      top: `${top}px`,
      width: `${Math.max(260, right - left)}px`,
      height: `${Math.max(200, bottom - top)}px`,
    });
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
    const doc = this.view.state.doc.toString();
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
  private pullSource() {
    const src = this.store.getState().project.source;
    const doc = this.view.state.doc.toString();
    if (src === doc) return;
    this.view.dispatch({
      changes: { from: 0, to: doc.length, insert: src },
      annotations: fromStore.of(true),
    });
  }

  private showDiagnostics() {
    const { compile } = this.store.getState();
    const doc = this.view.state.doc;
    const diagnostics: Diagnostic[] = [];
    const general: string[] = [];
    if (compile.source === doc.toString()) {
      for (const e of compile.errors) {
        if (e.line !== null && e.line <= doc.lines) {
          const l = doc.line(e.line);
          diagnostics.push({ from: l.from, to: l.to, severity: 'error', message: e.message });
        } else {
          general.push(e.message);
        }
      }
    }
    this.view.dispatch(setDiagnostics(this.view.state, diagnostics));
    if (general.length) this.setHint(general.join(' · '), 'error', 0);
    else if (this.hint.dataset.kind === 'error') this.setHint('', 'info', 0);
  }

  private setHint(text: string, kind: 'info' | 'error' | 'ok', ms = 4000) {
    clearTimeout(this.hintTimer);
    this.hint.textContent = text;
    this.hint.dataset.kind = kind;
    if (ms > 0 && text) this.hintTimer = setTimeout(() => this.setHint('', 'info', 0), ms);
  }

  private updateKnobButton() {
    const sel = this.view.state.selection.main;
    if (sel.empty || this.root.hidden) {
      this.knobButton.hidden = true;
      return;
    }
    const src = this.view.state.doc.toString();
    const r = checkLiteral(src, sel.from, sel.to);
    // Only offer the button for selections that look like a number.
    if (!r.ok && !/^\s*-?\s*[\d.]/.test(this.view.state.sliceDoc(sel.from, sel.to))) {
      this.knobButton.hidden = true;
      return;
    }
    const coords = this.view.coordsAtPos(sel.to);
    if (!coords) {
      this.knobButton.hidden = true;
      return;
    }
    const box = this.root.getBoundingClientRect();
    this.knobButton.hidden = false;
    this.knobButton.disabled = !r.ok;
    this.knobButton.textContent = r.ok ? `◉ make knob “${r.proposedName}”` : `✕ ${r.reason}`;
    this.knobButton.title = r.ok ? `${isMac() ? '⌘' : 'Ctrl+'}K` : r.reason;
    this.knobButton.style.left = `${Math.min(coords.right - box.left + 8, box.width - 40)}px`;
    this.knobButton.style.top = `${coords.top - box.top - 2}px`;
    this.knobButton.style.maxWidth = `${Math.max(160, box.width - (coords.right - box.left) - 24)}px`;
  }

  /** Turns the selected literal into a knob in one undoable change. */
  createKnob(): boolean {
    const sel = this.view.state.selection.main;
    const src = this.view.state.doc.toString();
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
    this.knobButton.style.setProperty('--tint', KNOB_TINTS[(knob?.slot ?? 0) % KNOB_TINTS.length]!);
    return true;
  }
}

function isMac() {
  return /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
}
