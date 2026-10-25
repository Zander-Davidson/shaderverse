// Small flat popover anchored to a knob: label, name, range, step, delete.

import type { ProjectStore } from '../project/store';
import { formatValue } from '../knobs/knobs';
import { KNOB_TINTS } from '../theme';

export class KnobPopover {
  readonly root: HTMLFormElement;
  private readonly error: HTMLDivElement;
  private shownFor: string | null = null;

  constructor(
    private readonly store: ProjectStore,
    private readonly anchorFor: (knobId: string) => { x: number; y: number } | null,
  ) {
    this.root = document.createElement('form');
    this.root.className = 'sv-popover';
    this.root.hidden = true;
    this.root.innerHTML = `
      <div class="sv-pop-head"><span class="sv-pop-swatch"></span><span class="sv-pop-title"></span>
        <button type="button" class="sv-pop-close" aria-label="Close">×</button></div>
      <label>Label <input name="label" autocomplete="off" spellcheck="false"></label>
      <label>Name <input name="param" autocomplete="off" spellcheck="false" class="mono"></label>
      <div class="sv-pop-row">
        <label>Min <input name="min" type="number" step="any"></label>
        <label>Max <input name="max" type="number" step="any"></label>
        <label>Step <input name="step" type="number" step="any" min="0"></label>
      </div>
      <div class="sv-pop-value"></div>
      <div class="sv-pop-error" role="alert"></div>
      <div class="sv-pop-actions">
        <button type="button" class="sv-pop-reset">Reset value</button>
        <button type="button" class="sv-pop-delete" title="Replace the parameter with its current value">Delete (bake)</button>
      </div>`;
    document.body.appendChild(this.root);
    this.error = this.root.querySelector('.sv-pop-error')!;

    this.root.addEventListener('submit', (e) => {
      e.preventDefault();
      this.apply();
    });
    this.root.addEventListener('change', () => this.apply());
    this.root.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        this.close();
      }
    });
    this.root.querySelector('.sv-pop-close')!.addEventListener('click', () => this.close());
    this.root.querySelector('.sv-pop-reset')!.addEventListener('click', () => {
      if (this.shownFor) store.getState().dispatch({ type: 'resetKnob', id: this.shownFor });
    });
    this.root.querySelector('.sv-pop-delete')!.addEventListener('click', () => {
      if (!this.shownFor) return;
      const r = store.getState().dispatch({ type: 'deleteKnob', id: this.shownFor });
      if (!r.ok) this.error.textContent = r.error;
    });
    document.addEventListener('pointerdown', (e) => {
      if (!this.root.hidden && !this.root.contains(e.target as Node) && !(e.target instanceof HTMLCanvasElement)) {
        this.close();
      }
    });

    store.subscribe((s, prev) => {
      if (s.ui.popoverKnobId !== prev.ui.popoverKnobId) this.render();
      else if (s.project.knobs !== prev.project.knobs && this.shownFor) this.refreshValue();
    });
    window.addEventListener('resize', () => this.position());
  }

  get isOpen() {
    return !this.root.hidden;
  }

  close() {
    if (this.store.getState().ui.popoverKnobId) this.store.getState().dispatch({ type: 'closePopover' });
  }

  private knob() {
    return this.store.getState().project.knobs.find((k) => k.id === this.shownFor) ?? null;
  }

  private input(name: string) {
    return this.root.elements.namedItem(name) as HTMLInputElement;
  }

  private render() {
    const id = this.store.getState().ui.popoverKnobId;
    this.shownFor = id;
    const k = this.knob();
    if (!k) {
      this.root.hidden = true;
      return;
    }
    this.error.textContent = '';
    this.root.style.setProperty('--tint', KNOB_TINTS[k.slot % KNOB_TINTS.length]!);
    this.root.querySelector('.sv-pop-title')!.textContent = `KNOB ${k.slot + 1} · ${k.type.toUpperCase()}`;
    this.input('label').value = k.label;
    this.input('param').value = k.param;
    this.input('min').value = String(k.min);
    this.input('max').value = String(k.max);
    this.input('step').value = String(k.step);
    this.input('step').step = k.type === 'int' ? '1' : 'any';
    this.refreshValue();
    this.root.hidden = false;
    this.position();
    this.input('label').focus();
    this.input('label').select();
  }

  private refreshValue() {
    const k = this.knob();
    if (!k) {
      this.root.hidden = true;
      this.shownFor = null;
      return;
    }
    this.root.querySelector('.sv-pop-value')!.textContent =
      `value ${formatValue(k, k.value)} · default ${formatValue(k, k.default)}`;
    if (document.activeElement !== this.input('param')) this.input('param').value = k.param;
  }

  private position() {
    if (this.root.hidden || !this.shownFor) return;
    const a = this.anchorFor(this.shownFor);
    if (!a) return;
    const w = this.root.offsetWidth || 280;
    const h = this.root.offsetHeight || 300;
    // Open beside the knob, on whichever side has room.
    let x = a.x + 56;
    if (x + w > window.innerWidth - 12) x = a.x - 56 - w;
    const y = Math.min(window.innerHeight - h - 12, Math.max(12, a.y - h / 2));
    this.root.style.left = `${Math.max(12, x)}px`;
    this.root.style.top = `${y}px`;
  }

  private apply() {
    const k = this.knob();
    if (!k) return;
    const dispatch = this.store.getState().dispatch;
    this.error.textContent = '';
    const name = this.input('param').value.trim();
    if (name && name !== k.param) {
      const r = dispatch({ type: 'renameKnob', id: k.id, name });
      if (!r.ok) {
        this.error.textContent = r.error;
        return;
      }
    }
    const num = (n: string) => Number(this.input(n).value);
    const patch: { label?: string; min: number; max: number; step: number } = {
      min: num('min'),
      max: num('max'),
      step: num('step'),
    };
    // Only send the label if it was edited, so a rename can update it.
    if (this.input('label').value !== k.label) patch.label = this.input('label').value;
    if ([patch.min, patch.max, patch.step].some((v) => !Number.isFinite(v))) {
      this.error.textContent = 'Min, max and step must be numbers.';
      return;
    }
    const r = dispatch({ type: 'updateKnob', id: k.id, patch });
    if (!r.ok) {
      this.error.textContent = r.error;
      return;
    }
    // Keep the value inside the new range.
    const updated = this.knob();
    if (updated && (updated.value < updated.min || updated.value > updated.max)) {
      dispatch({ type: 'setKnobValue', id: k.id, value: Math.min(updated.max, Math.max(updated.min, updated.value)) });
    }
    if (updated) this.input('label').value = updated.label;
  }
}
