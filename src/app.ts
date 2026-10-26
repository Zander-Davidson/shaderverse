// Wires the store, the shader runtime, the cockpit scene, panels, knobs and
// overlays together, and runs the single render loop.

import * as THREE from 'three';
import { EXAMPLES } from '../examples';
import { layout, type LayoutConfig } from './cockpit/layout';
import { Compositor } from './cockpit/compositor';
import { Cockpit } from './cockpit/scene';
import { KnobBank } from './knobs/knobs';
import { showBoot } from './overlays/boot';
import { SceneEditor } from './editor/sceneEditor';
import { EditorOverlay } from './overlays/editor';
import { HelpOverlay, toast } from './overlays/help';
import { KnobPopover } from './overlays/popover';
import { screenBounds, screenPoint, type ScreenRect } from './panels/bounds';
import { CodePanel } from './panels/code';
import { wallToWorld } from './panels/patch';
import { onPanelRedraw } from './panels/panel';
import { PlotPanel } from './panels/plot';
import { PointerRouter } from './panels/pointer';
import { PortalPanel, PortalRim, portalMold } from './panels/portal';
import { LibraryPanel, StatusPanel, type LibraryActions } from './panels/status';
import {
  autosave,
  downloadText,
  exportBakedGlsl,
  exportProjectJson,
  importProjectJson,
  LocalProjectStorage,
  pickTextFile,
} from './project/persistence';
import { createProjectStore } from './project/store';
import { ShaderRuntime, type Quality } from './shader/runtime';
import { LOW_GFX } from './style/quality';

export function startApp(root: HTMLElement): void {
  const canvas = document.createElement('canvas');
  canvas.className = 'sv-canvas';
  // Probe on a throwaway canvas: the first getContext fixes the attributes.
  if (!document.createElement('canvas').getContext('webgl2')) {
    fatal(root, 'WebGL2 is not available', 'SHADERVERSE needs WebGL2. Try a current version of Chrome, Firefox or Safari, and check that hardware acceleration is enabled.');
    return;
  }
  root.appendChild(canvas);

  // No MSAA on the canvas: the compositor's cached cockpit is antialiased (or,
  // at high pixel ratios, fine enough without), and the canvas only receives
  // a full-screen copy plus the portal.
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
  const maxDpr = LOW_GFX ? 1 : 2;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, maxDpr));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor('#020304', 1);
  // Compile errors are reported by our own validator; don't spam the console.
  renderer.debug.checkShaderErrors = false;

  const storage = new LocalProjectStorage();
  const store = createProjectStore(storage.load() ?? EXAMPLES[0]!.create());
  autosave(store, storage);

  const initial = store.getState().project;
  const runtime = new ShaderRuntime(renderer, initial.playback.quality);
  runtime.playing = initial.playback.playing;

  const cfg: LayoutConfig = layout;
  const cockpit = new Cockpit(cfg);
  cockpit.setEnvironment(renderer);
  cockpit.fit(window.innerWidth / window.innerHeight);
  const portal = new PortalPanel(runtime, cfg);
  const rim = new PortalRim(cfg);
  // The curved panel is the editor; ?editor=overlay restores the flat window.
  const useOverlay = new URLSearchParams(location.search).get('editor') === 'overlay';
  const editor: SceneEditor | EditorOverlay = useOverlay
    ? new EditorOverlay(store, () => overlayBounds())
    : new SceneEditor(store, () => overlayBounds());
  const code = new CodePanel(cfg, store, editor instanceof SceneEditor ? editor.session : null);
  const plot = new PlotPanel(cfg);
  // Hovering a function name in the source, curved or overlay, plots it.
  code.onFunctionHover = (hit) => plot.show(hit?.fn ?? null);
  if (editor instanceof EditorOverlay) editor.onFunctionHover = (hit) => plot.show(hit?.fn ?? null);
  if (editor instanceof SceneEditor) editor.setTarget(code);
  const status = new StatusPanel(cfg, store, runtime);
  const helpOverlay = new HelpOverlay();
  const libraryActions: LibraryActions = {
    examples: EXAMPLES.map((e) => e.name),
    loadExample: (i) => {
      const s = store.getState();
      const edited = s.project.updatedAt !== s.project.createdAt;
      if (edited && !window.confirm('Replace the current project with this example? Export it first to keep it.')) return;
      s.dispatch({ type: 'loadProject', project: EXAMPLES[i]!.create() });
    },
    exportProject: () => {
      const p = store.getState().project;
      downloadText(`${slug(p.name)}.shaderverse.json`, exportProjectJson(p), 'application/json');
    },
    importProject: async () => {
      const text = await pickTextFile('.json,application/json');
      if (!text) return;
      try {
        store.getState().dispatch({ type: 'loadProject', project: importProjectJson(text) });
        toast('Project imported.');
      } catch (err) {
        toast(`Import failed: ${(err as Error).message}`, 'error');
      }
    },
    exportGlsl: () => {
      const p = store.getState().project;
      downloadText(`${slug(p.name)}.glsl`, exportBakedGlsl(p));
    },
    toggleHelp: () => helpOverlay.toggle(),
  };
  const library = new LibraryPanel(cfg, store, libraryActions);
  const knobs = new KnobBank(cfg, store);

  cockpit.scene.add(code.caret, portal.hole, knobs.tubes.group, rim.mesh, portal.mesh, plot.mesh, code.mesh, status.mesh, library.mesh, knobs.group);
  // Bezels, collars and tubing, molded into the console as one piece.
  const moldConsole = () =>
    cockpit.console.mold(renderer, cfg, {
      panels: [plot, code, status, library].flatMap((p) => p.mold() ?? []),
      rings: [portalMold(cfg), ...knobs.molds(cfg)],
      pipes: knobs.tubes.molds,
    });
  moldConsole();
  const aniso = renderer.capabilities.getMaxAnisotropy();
  for (const p of [rim, plot, code, status, library]) p.setAnisotropy(aniso);
  knobs.setAnisotropy(aniso);

  const router = new PointerRouter(canvas, cockpit.camera);
  router.add(portal);
  router.add(code);
  router.add(status);
  router.add(library);
  for (const s of knobs.slots) router.add(s);

  // Overlays
  const overlayBounds = (): { code: ScreenRect; portal: ScreenRect } => {
    const c = screenBounds(code.mesh, cockpit.camera, canvas);
    const p = screenBounds(portal.mesh, cockpit.camera, canvas);
    // Keep clear of the knob ring too, not just the portal.
    for (const s of knobs.slots) p.left = Math.min(p.left, screenBounds(s.face.mesh, cockpit.camera, canvas).left);
    return { code: c, portal: p };
  };
  const popover = new KnobPopover(store, (id) => {
    const k = store.getState().project.knobs.find((x) => x.id === id);
    const slot = k && knobs.slots[k.slot];
    return slot ? screenPoint(slot.anchor(), cockpit.camera, canvas) : null;
  });
  portal.onClick = () => {
    const s = store.getState();
    s.dispatch({ type: 'setLean', lean: !s.ui.lean });
  };
  router.onCanvasDown = (target) => {
    // Clicking empty space while leaned in sits back.
    if (!target && store.getState().ui.lean) store.getState().dispatch({ type: 'setLean', lean: false });
    if (!editor.ownsCanvasTarget(target)) editor.close();
    popover.close();
    helpOverlay.hide();
  };

  // Looking toward the panels the pointer is over: the source side or the
  // readouts. Anywhere on the page counts, overlays included.
  window.addEventListener('pointermove', (e) => {
    const r = canvas.getBoundingClientRect();
    cockpit.setFocus(cockpit.sideAt(((e.clientX - r.left) / r.width) * 2 - 1));
  });
  document.documentElement.addEventListener('pointerleave', () => cockpit.setFocus(null));

  // Store → runtime
  const compile = () => {
    const source = store.getState().project.source;
    const r = runtime.setSource(source);
    store.getState().setCompile({ status: r.ok ? 'ok' : 'error', errors: r.ok ? [] : r.errors, source });
  };
  const pushKnobs = () => {
    for (const k of store.getState().project.knobs) runtime.setKnob(k.param, k.value);
  };
  pushKnobs();
  compile();
  store.subscribe((s, prev) => {
    if (s.project.knobs !== prev.project.knobs) pushKnobs();
    if (s.project.source !== prev.project.source) compile();
    if (s.project.playback !== prev.project.playback) {
      runtime.playing = s.project.playback.playing;
      runtime.setQuality(s.project.playback.quality);
    }
    if (s.ui.restartCount !== prev.ui.restartCount) runtime.restart();
    if (s.ui.lean !== prev.ui.lean) cockpit.setLean(s.ui.lean);
    if (s.project.id !== prev.project.id) runtime.restart();
  });

  // Keyboard: global shortcuts only while the cockpit has focus.
  const typing = (e: KeyboardEvent) => {
    const el = e.target;
    if (!(el instanceof HTMLElement)) return false;
    return el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || !!el.closest('.cm-editor');
  };
  window.addEventListener('keydown', (e) => {
    if (typing(e) || editor.isOpen || popover.isOpen || e.metaKey || e.ctrlKey || e.altKey) {
      if (e.key === 'Escape' && helpOverlay.isOpen) helpOverlay.hide();
      return;
    }
    const s = store.getState();
    if (e.key === 'Escape' && !helpOverlay.isOpen && s.ui.lean) {
      s.dispatch({ type: 'setLean', lean: false });
      e.preventDefault();
      return;
    }
    switch (e.key) {
      case ' ':
        s.dispatch({ type: 'setPlayback', playing: !s.project.playback.playing });
        break;
      case 'r':
      case 'R':
        s.dispatch({ type: 'restart' });
        break;
      case 'q':
      case 'Q': {
        const order: Quality[] = ['low', 'medium', 'high'];
        const next = order[(order.indexOf(s.project.playback.quality) + 1) % order.length]!;
        s.dispatch({ type: 'setPlayback', quality: next });
        toast(`Quality: ${next}`);
        break;
      }
      case 'e':
      case 'E':
      case 'Enter':
        s.dispatch({ type: 'openEditor' });
        break;
      case '?':
      case 'h':
      case 'H':
        helpOverlay.toggle();
        break;
      case 'Escape':
        helpOverlay.hide();
        break;
      default:
        if (/^[1-9]$/.test(e.key) && EXAMPLES[Number(e.key) - 1]) {
          libraryActions.loadExample(Number(e.key) - 1);
          break;
        }
        return;
    }
    e.preventDefault();
  });

  // The cockpit renders through the compositor; changed panels mark their
  // screen regions for re-rendering.
  const compositor = new Compositor(renderer, cockpit.scene, cockpit.camera);
  onPanelRedraw((obj) => compositor.markObject(obj));

  // Resize
  const resize = () => {
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, maxDpr));
    renderer.setSize(window.innerWidth, window.innerHeight);
    cockpit.fit(window.innerWidth / window.innerHeight);
    compositor.resize();
    editor.position();
  };
  window.addEventListener('resize', resize);

  // Robustness: lost contexts, hidden tabs
  let contextLost = false;
  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    contextLost = true;
    toast('Graphics context lost. Restoring…', 'error', 0);
  });
  canvas.addEventListener('webglcontextrestored', () => {
    contextLost = false;
    compositor.resize();
    // Render targets were lost with the context: bake the reflections and console again.
    cockpit.setEnvironment(renderer);
    moldConsole();
    runtime.recompile(store.getState().project.source);
    for (const p of [rim, plot, code, status, library]) p.invalidate();
    for (const s of knobs.slots) s.face.invalidate();
    toast('Graphics context restored.');
  });

  // Render loop
  let last = performance.now();
  let fps = 60;
  const frame = (now: number) => {
    requestAnimationFrame(frame);
    const dt = Math.min((now - last) / 1000, 0.25);
    last = now;
    if (contextLost || document.hidden) return;
    if (dt > 0) fps += (1 / dt - fps) * 0.05;
    status.fps = fps;
    status.tick(now);
    code.tick(now);
    if (cockpit.update(dt)) {
      // The camera moved: everything on screen changed.
      compositor.markAll();
      editor.position();
    }
    runtime.render(dt);
    rim.update();
    plot.update();
    code.update();
    status.update();
    library.update();
    knobs.update(now / 1000);
    compositor.render();
  };
  requestAnimationFrame(frame);

  const relayout = () => {
    cockpit.relayout(cfg);
    cockpit.fit(window.innerWidth / window.innerHeight);
    portal.rebuild(cfg);
    rim.relayout(cfg);
    plot.relayout(cfg);
    code.relayout(cfg);
    status.relayout(cfg);
    library.relayout(cfg);
    knobs.relayout(cfg);
    moldConsole();
    editor.position();
    compositor.markAll();
  };

  if (import.meta.env.DEV) {
    void import('./dev/tuning').then((m) => m.createTuningPanel(cfg, relayout));
  }

  showBoot(root);

  // Handles for browser tests and debugging; not part of any public API.
  Object.assign(window, {
    __sv: {
      store, runtime, router, cockpit, code, plot, status, portal, knobs, editor, popover, canvas, renderer, relayout, cfg, compositor,
      knobPoint: (slot: number) => screenPoint(knobs.slots[slot]!.anchor(), cockpit.camera, canvas),
      bounds: overlayBounds,
      /** Screen point of a source offset on the curved code panel. */
      codePoint: (pos: number) => {
        const px = code.pixelOf(pos);
        const r = code.rect;
        const wx = r.x + (px.x / code.pixelWidth - 0.5) * r.w;
        const wy = r.y + (0.5 - px.y / code.pixelHeight) * r.h;
        return screenPoint(wallToWorld(wx, wy, cfg.radius, 0.01), cockpit.camera, canvas);
      },
    },
  });
}

function slug(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'shader';
}

function fatal(root: HTMLElement, title: string, body: string) {
  const el = document.createElement('div');
  el.className = 'sv-fatal';
  el.innerHTML = `<div class="sv-fatal-box"><div class="sv-boot-line">SHADERVERSE // UNIT C/7a</div><h1></h1><p></p></div>`;
  el.querySelector('h1')!.textContent = title;
  el.querySelector('p')!.textContent = body;
  root.appendChild(el);
}
