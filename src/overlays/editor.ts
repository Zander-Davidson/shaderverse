// Flat CodeMirror editor that lifts forward over the code display. It never
// covers the portal. Kept as an alternative to the in-scene editor
// (?editor=overlay); the editing logic lives in EditorSession. Hovering a
// standard library function name reports it for the function plot.

import { cpp } from '@codemirror/lang-cpp';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { setDiagnostics, type Diagnostic } from '@codemirror/lint';
import { StateEffect, StateField } from '@codemirror/state';
import { Decoration, EditorView, type DecorationSet } from '@codemirror/view';
import { tags as t } from '@lezer/highlight';
import { basicSetup } from 'codemirror';
import { EditorSession, isMac } from '../editor/session';
import type { ScreenRect } from '../panels/bounds';
import type { ProjectStore } from '../project/store';
import { functionAt, type FunctionHit } from '../source/functions';
import { COLORS, MONO } from '../theme';

/** Underlines the hovered library function name. */
const setFunctionMark = StateEffect.define<{ from: number; to: number } | null>();
const functionMark = Decoration.mark({ class: 'sv-fn-hover' });
const functionMarkField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(marks, tr) {
    marks = marks.map(tr.changes);
    for (const e of tr.effects) {
      if (e.is(setFunctionMark)) marks = e.value ? Decoration.set([functionMark.range(e.value.from, e.value.to)]) : Decoration.none;
    }
    return marks;
  },
  provide: (f) => EditorView.decorations.from(f),
});

export const highlight = HighlightStyle.define([
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
    '.sv-fn-hover': { textDecoration: `underline 2px ${COLORS.accent}`, textUnderlineOffset: '3px' },
  },
  { dark: true },
);

export class EditorOverlay {
  readonly root: HTMLDivElement;
  readonly session: EditorSession;
  private readonly hint: HTMLDivElement;
  private readonly knobButton: HTMLButtonElement;
  private fnHover: FunctionHit | null = null;
  /** Called when the hovered function name changes. */
  onFunctionHover: ((hit: FunctionHit | null) => void) | null = null;

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
    this.knobButton.addEventListener('click', () => this.session.createKnob());
    this.root.appendChild(this.knobButton);

    this.session = new EditorSession(store, this.root.querySelector('.sv-editor-body')!, [
      basicSetup,
      cpp(),
      theme,
      syntaxHighlighting(highlight),
      functionMarkField,
    ]);
    this.session.subscribe((u) => {
      if (!u) this.renderHint();
      else if (u.selectionSet || u.docChanged || u.geometryChanged) this.updateKnobButton();
    });

    store.subscribe((s, prev) => {
      if (s.ui.editorOpen !== prev.ui.editorOpen) {
        if (s.ui.editorOpen) this.show();
        else this.hide();
      }
      if (s.compile !== prev.compile || s.project.source !== prev.project.source) this.showDiagnostics();
    });

    // Clicks outside close the editor (canvas clicks are routed by the app).
    document.addEventListener('pointerdown', (e) => {
      if (!this.root.hidden && !this.root.contains(e.target as Node) && !(e.target instanceof HTMLCanvasElement)) {
        const el = e.target as HTMLElement;
        if (!el.closest('.sv-popover')) this.session.close();
      }
    });
    window.addEventListener('resize', () => this.position());
    this.view.contentDOM.addEventListener('mousemove', (e) => this.hoverAt(e.clientX, e.clientY));
    this.view.contentDOM.addEventListener('mouseleave', () => this.setFunctionHover(null));
  }

  private hoverAt(x: number, y: number) {
    let pos = this.view.posAtCoords({ x, y });
    if (pos === null) return this.setFunctionHover(null);
    // posAtCoords gives the nearest character boundary; step back onto the
    // character the pointer is over when it's left of that boundary.
    const c = this.view.coordsAtPos(pos);
    if (c && x < c.left && pos > 0) pos--;
    this.setFunctionHover(functionAt(this.session.doc, pos));
  }

  private setFunctionHover(hit: FunctionHit | null) {
    if (hit?.from === this.fnHover?.from && hit?.fn === this.fnHover?.fn) return;
    this.fnHover = hit;
    this.view.dispatch({ effects: setFunctionMark.of(hit && { from: hit.from, to: hit.to }) });
    this.onFunctionHover?.(hit);
  }

  get view(): EditorView {
    return this.session.view;
  }

  get isOpen(): boolean {
    return !this.root.hidden;
  }

  close(): void {
    this.session.close();
  }

  createKnob(): boolean {
    return this.session.createKnob();
  }

  /** The overlay takes canvas clicks only by closing; it has no in-scene input. */
  ownsCanvasTarget(): boolean {
    return false;
  }

  /** Lines the editor scrolled to, so the curved display can follow. */
  private topLine(): number {
    const block = this.view.lineBlockAtHeight(this.view.scrollDOM.scrollTop);
    return this.view.state.doc.lineAt(block.from).number - 1;
  }

  private show() {
    this.session.pullSource();
    this.root.hidden = false;
    this.position();
    const line = this.store.getState().ui.codeScrollLine;
    const pos = this.view.state.doc.line(Math.min(line + 1, this.view.state.doc.lines)).from;
    this.view.dispatch({ effects: EditorView.scrollIntoView(pos, { y: 'start' }) });
    this.view.focus();
    this.showDiagnostics();
  }

  private hide() {
    this.session.flush();
    this.store.getState().dispatch({ type: 'setCodeScroll', line: this.topLine() });
    this.root.hidden = true;
    this.knobButton.hidden = true;
    this.setFunctionHover(null);
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
    if (general.length) this.session.setHint(general.join(' · '), 'error', 0);
    else if (this.session.hint.kind === 'error' && !this.session.hint.text.startsWith('Knob')) this.session.setHint('', 'info', 0);
  }

  private renderHint() {
    this.hint.textContent = this.session.hint.text;
    this.hint.dataset.kind = this.session.hint.kind;
  }

  private updateKnobButton() {
    const offer = this.root.hidden ? null : this.session.knobOffer();
    const sel = this.view.state.selection.main;
    const coords = offer && this.view.coordsAtPos(sel.to);
    if (!offer || !coords) {
      this.knobButton.hidden = true;
      return;
    }
    const box = this.root.getBoundingClientRect();
    this.knobButton.hidden = false;
    this.knobButton.disabled = !offer.ok;
    this.knobButton.textContent = offer.ok ? `◉ make knob “${offer.name}”` : `✕ ${offer.reason}`;
    this.knobButton.title = offer.ok ? `${isMac() ? '⌘' : 'Ctrl+'}K` : offer.reason;
    this.knobButton.style.left = `${Math.min(coords.right - box.left + 8, box.width - 40)}px`;
    this.knobButton.style.top = `${coords.top - box.top - 2}px`;
    this.knobButton.style.maxWidth = `${Math.max(160, box.width - (coords.right - box.left) - 24)}px`;
  }
}
