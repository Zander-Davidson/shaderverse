// Startup sequence. Purely cosmetic: the cockpit is live underneath it, and a
// click or key skips it.

const LINES = ['SHADERVERSE', 'GENERATIVE FIELD SYNTHESIS SYSTEM', 'UNIT C/7a', 'SYSTEM INITIALIZING'];

export function showBoot(root: HTMLElement, durationMs = 2200): void {
  if (new URLSearchParams(location.search).has('noboot')) return;
  const el = document.createElement('div');
  el.className = 'sv-boot';
  el.setAttribute('aria-hidden', 'true');
  LINES.forEach((text, i) => {
    const line = document.createElement('div');
    line.className = i === 0 ? 'sv-boot-title' : 'sv-boot-line';
    line.textContent = text;
    line.style.animationDelay = `${i * 260}ms`;
    el.appendChild(line);
  });
  const bar = document.createElement('div');
  bar.className = 'sv-boot-bar';
  el.appendChild(bar);
  root.appendChild(el);

  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    el.classList.add('sv-boot-out');
    setTimeout(() => el.remove(), 500);
    window.removeEventListener('keydown', finish);
  };
  el.addEventListener('pointerdown', finish);
  window.addEventListener('keydown', finish);
  setTimeout(finish, durationMs);
}
