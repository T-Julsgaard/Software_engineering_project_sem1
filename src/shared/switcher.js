/* Prototype settings, shared by every design version: switch between V1 and V2,
   plus any extra controls the running version registers on window.PB_PROTOTYPE. */
(() => {
  const VERSIONS = [
    { id: '1', label: 'V1', name: 'Original prototype', href: 'powerbuddy-v1.html' },
    { id: '2', label: 'V2', name: 'Overhaul with goals & rewards', href: 'powerbuddy.html' }
  ];
  const current = document.documentElement.dataset.pbVersion || '2';
  const svg = (inner) => `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
  const GEAR = svg('<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>');
  const CHECK = svg('<path d="M20 6 9 17l-5-5"/>');
  const esc = (v) => String(v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

  const root = document.createElement('div');
  root.className = 'pbx';
  root.innerHTML = `<button type="button" class="pbx-button" aria-haspopup="true" aria-expanded="false" aria-controls="pbx-menu" title="Prototype settings">${GEAR}<span class="pbx-sr">Prototype settings</span></button><div class="pbx-menu" id="pbx-menu" hidden></div>`;
  const button = root.querySelector('.pbx-button');
  const menu = root.querySelector('.pbx-menu');

  function render() {
    const extra = window.PB_PROTOTYPE && typeof window.PB_PROTOTYPE.actions === 'function' ? window.PB_PROTOTYPE.actions() : [];
    menu.innerHTML = `
      <p class="pbx-heading">Design version</p>
      ${VERSIONS.map((v) => `<a class="pbx-version${v.id === current ? ' is-current' : ''}" href="${v.href}"${v.id === current ? ' aria-current="page"' : ''}>
        <span class="pbx-tag">${v.label}</span><span class="pbx-name">${esc(v.name)}</span>${v.id === current ? CHECK : ''}</a>`).join('')}
      ${extra.length ? `<p class="pbx-heading">Prototype</p>${extra.map((a, i) => `<button type="button" class="pbx-action" data-i="${i}">${esc(a.label)}${a.hint ? `<small>${esc(a.hint)}</small>` : ''}</button>`).join('')}` : ''}
      <p class="pbx-foot">Fictional data, simulated in your browser.</p>`;
    menu.querySelectorAll('.pbx-action').forEach((el) => el.addEventListener('click', () => { close(); extra[+el.dataset.i].run(); }));
  }
  function open() { render(); menu.hidden = false; button.setAttribute('aria-expanded', 'true'); (menu.querySelector('a,button') || menu).focus(); }
  function close() { menu.hidden = true; button.setAttribute('aria-expanded', 'false'); }
  button.addEventListener('click', () => (menu.hidden ? open() : close()));
  document.addEventListener('click', (e) => { if (!root.contains(e.target)) close(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !menu.hidden) { close(); button.focus(); } });
  document.body.appendChild(root);
})();
