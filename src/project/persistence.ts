// Storage sits behind a small interface so v2.0 can swap in a server.

import { migrate, type Project } from './schema';
import { bakeAll } from '../source/rewrite';
import type { ProjectStore } from './store';

export interface ProjectStorage {
  load(): Project | null;
  save(project: Project): void;
}

export class LocalProjectStorage implements ProjectStorage {
  constructor(private readonly key = 'shaderverse.project.v1') {}

  load(): Project | null {
    try {
      const raw = localStorage.getItem(this.key);
      return raw ? migrate(JSON.parse(raw)) : null;
    } catch (err) {
      console.warn('Could not restore the saved project:', err);
      return null;
    }
  }

  save(project: Project): void {
    try {
      localStorage.setItem(this.key, JSON.stringify(project));
    } catch (err) {
      console.warn('Could not save the project:', err);
    }
  }
}

/** Saves the project shortly after it stops changing. */
export function autosave(store: ProjectStore, storage: ProjectStorage, delayMs = 400): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let last = store.getState().project;
  const flush = () => storage.save(store.getState().project);
  const unsub = store.subscribe((s) => {
    if (s.project === last) return;
    last = s.project;
    clearTimeout(timer);
    timer = setTimeout(flush, delayMs);
  });
  const onHide = () => flush();
  window.addEventListener('pagehide', onHide);
  return () => {
    unsub();
    clearTimeout(timer);
    window.removeEventListener('pagehide', onHide);
  };
}

export const exportProjectJson = (p: Project): string => JSON.stringify(p, null, 2);

export const importProjectJson = (text: string): Project => migrate(JSON.parse(text));

export const exportBakedGlsl = (p: Project): string =>
  bakeAll(p.source, p.knobs.map((k) => ({ param: k.param, value: k.value, type: k.type })));

export function downloadText(filename: string, text: string, mime = 'text/plain'): void {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function pickTextFile(accept: string): Promise<string | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.onchange = async () => {
      const f = input.files?.[0];
      resolve(f ? await f.text() : null);
    };
    input.click();
  });
}
