// In-scene editing: the curved code panel is the editor. CodeMirror runs in an
// invisible layer laid over the panel's screen bounds, where it takes keyboard,
// clipboard and IME input (so composition windows appear near the panel); the
// panel draws its document, selection and caret.

import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { cpp } from '@codemirror/lang-cpp';
import { indentOnInput } from '@codemirror/language';
import { EditorState } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import type { ScreenRect } from '../panels/bounds';
import type { PointerTarget } from '../panels/panel';
import type { ProjectStore } from '../project/store';
import { EditorSession } from './session';

export class SceneEditor {
  readonly session: EditorSession;
  private readonly input: HTMLDivElement;
  private target: PointerTarget | null = null;

  constructor(
    private readonly store: ProjectStore,
    private readonly bounds: () => { code: ScreenRect; portal: ScreenRect },
  ) {
    this.input = document.createElement('div');
    this.input.className = 'sv-scene-input';
    this.input.setAttribute('aria-label', 'Shader source editor');
    document.body.appendChild(this.input);

    // No tooltips, panels or completion: nothing CodeMirror draws is visible.
    this.session = new EditorSession(store, this.input, [
      history(),
      closeBrackets(),
      indentOnInput(),
      cpp(),
      EditorState.allowMultipleSelections.of(true),
      keymap.of([...closeBracketsKeymap, ...defaultKeymap, ...historyKeymap, indentWithTab]),
      EditorView.contentAttributes.of({ 'aria-multiline': 'true', spellcheck: 'false', autocorrect: 'off', autocapitalize: 'off' }),
    ]);

    store.subscribe((s, prev) => {
      if (s.ui.editorOpen !== prev.ui.editorOpen) {
        if (s.ui.editorOpen) this.show();
        else this.hide();
      }
    });

    // Leaving the editor: a click anywhere outside the canvas and popover.
    document.addEventListener('pointerdown', (e) => {
      if (!this.isOpen || e.target instanceof HTMLCanvasElement) return;
      if (!(e.target as HTMLElement).closest('.sv-popover')) this.close();
    });
    // Typing anywhere returns focus to the editor while it's open.
    window.addEventListener('keydown', (e) => {
      if (this.isOpen && !this.view.hasFocus && document.activeElement === document.body && !e.metaKey && !e.ctrlKey) {
        this.view.focus();
      }
    }, true);
    window.addEventListener('resize', () => this.position());
  }

  /** The pointer target (the code panel) whose clicks keep the editor open. */
  setTarget(target: PointerTarget): void {
    this.target = target;
  }

  ownsCanvasTarget(target: PointerTarget | null): boolean {
    return !!target && target === this.target;
  }

  get view(): EditorView {
    return this.session.view;
  }

  get isOpen(): boolean {
    return this.store.getState().ui.editorOpen;
  }

  close(): void {
    this.session.close();
  }

  createKnob(): boolean {
    return this.session.createKnob();
  }

  private show() {
    this.session.pullSource();
    this.position();
    this.view.focus();
  }

  private hide() {
    this.session.flush();
    this.view.contentDOM.blur();
  }

  /**
   * Keeps the input layer over the panel, so IME windows open near it. Only
   * while editing: it runs every frame the camera moves, and measuring the
   * panel's screen bounds and restyling the layer is costly (Firefox halves
   * its frame rate).
   */
  position(): void {
    if (!this.isOpen) return;
    const { code } = this.bounds();
    Object.assign(this.input.style, {
      left: `${code.left}px`,
      top: `${code.top}px`,
      width: `${Math.max(100, code.right - code.left)}px`,
      height: `${Math.max(100, code.bottom - code.top)}px`,
    });
  }
}
