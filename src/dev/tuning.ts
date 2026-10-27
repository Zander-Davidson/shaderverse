// Development-only tuning panel for camera and layout. Tune by eye, then
// press "copy config" and paste the result into src/cockpit/layout.ts.

import GUI from 'lil-gui';
import { DEFAULT_LAYOUT, type LayoutConfig } from '../cockpit/layout';

export function createTuningPanel(cfg: LayoutConfig, onChange: () => void): GUI {
  const gui = new GUI({ title: 'cockpit tuning (dev)' });
  gui.close();
  const cam = gui.addFolder('camera');
  cam.add(cfg, 'radius', 6, 400, 0.5).name('sphere radius').onChange(onChange);
  cam.add(cfg, 'eyeDistance', 2, 15, 0.1).name('eye distance').onChange(onChange);
  cam.add(cfg, 'fitHalfWidth', 3, 12, 0.05).name('fit half width').onChange(onChange);
  cam.add(cfg, 'fitHalfHeight', 2, 8, 0.05).name('fit half height').onChange(onChange);

  const rect = (name: string, r: { x: number; y: number; w?: number; h?: number; size?: number }) => {
    const f = gui.addFolder(name);
    f.close();
    f.add(r, 'x', -10, 10, 0.05).onChange(onChange);
    f.add(r, 'y', -6, 6, 0.05).onChange(onChange);
    if (r.w !== undefined) f.add(r, 'w', 0.5, 12, 0.05).onChange(onChange);
    if (r.h !== undefined) f.add(r, 'h', 0.5, 10, 0.05).onChange(onChange);
    if (r.size !== undefined) f.add(r, 'size', 1, 8, 0.05).onChange(onChange);
  };
  rect('portal', cfg.portal);
  rect('plot', cfg.plot);
  rect('code', cfg.code);
  rect('status', cfg.status);
  rect('library', cfg.library);
  const ring = gui.addFolder('knob ring');
  ring.close();
  ring.add(cfg.knobRing, 'radius', 1, 5, 0.01).onChange(onChange);
  ring.add(cfg.knobRing, 'size', 0.4, 2, 0.01).onChange(onChange);
  ring.add(cfg.knobRing, 'startDeg', 0, 360, 1).onChange(onChange);
  ring.add(cfg.knobRing, 'stepDeg', 5, 45, 0.5).onChange(onChange);
  const comp = gui.addFolder('companion');
  comp.close();
  comp.add(cfg.companion, 'size', 0.3, 2, 0.01).onChange(onChange);
  comp.add(cfg.companion, 'standoff', 0, 0.8, 0.01).onChange(onChange);
  comp.add(cfg.companion, 'margin', 0, 0.6, 0.01).onChange(onChange);
  for (const [view, perches] of Object.entries(cfg.companion.perches)) {
    perches.forEach((p, i) => {
      comp.add(p, 'x', -10, 10, 0.05).name(`${view} ${i + 1} x`).onChange(onChange);
      comp.add(p, 'y', -6, 6, 0.05).name(`${view} ${i + 1} y`).onChange(onChange);
    });
  }

  gui.add(
    {
      copy: () => {
        const text = JSON.stringify(cfg, null, 2);
        void navigator.clipboard?.writeText(text);
        console.info('[tuning] layout config\n', text);
      },
    },
    'copy',
  ).name('copy config');
  gui.add(
    {
      reset: () => {
        // Assign nested objects in place so the controllers stay bound to them.
        const assign = (target: Record<string, unknown>, from: Record<string, unknown>) => {
          for (const [k, v] of Object.entries(from)) {
            if (v && typeof v === 'object' && target[k]) assign(target[k] as Record<string, unknown>, v as Record<string, unknown>);
            else target[k] = v;
          }
        };
        assign(cfg as unknown as Record<string, unknown>, structuredClone(DEFAULT_LAYOUT) as unknown as Record<string, unknown>);
        gui.controllersRecursive().forEach((c) => c.updateDisplay());
        onChange();
      },
    },
    'reset',
  ).name('reset');
  return gui;
}
