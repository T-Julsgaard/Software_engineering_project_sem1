/* PowerBuddy V2 feedback tool.
   Always available behind its Feedback button; Thomas's call points it out. Visitors click "Comment on something", then click any element in the
   phone and leave a note (for example "change this text to ..."). Comments are filed per page and
   pinned to their element. Stored in this browser for now through a small adapter, so an online
   store (Supabase) can replace it later without touching the UI. Exposes window.PBFeedback. */
(() => {
  'use strict';
  const LS = { comments: 'pb.v2.feedback.comments', author: 'pb.v2.feedback.author', open: 'pb.v2.feedback.open', session: 'pb.v2.feedback.session' };
  const read = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } };
  const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage unavailable */ } };
  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8));
  const SESSION = read(LS.session, null) || (() => { const id = uid(); write(LS.session, id); return id; })();

  /* ---------- storage adapter ----------
     Every method is async so a network store can drop in. A Supabase version would look like:
       const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
       PBFeedback.setStore({
         name: 'supabase',
         list:   async () => (await sb.from('feedback_comments').select('*').order('created_at')).data.map(fromRow),
         add:    async (c) => fromRow((await sb.from('feedback_comments').insert(toRow(c)).select().single()).data),
         update: async (id, patch) => fromRow((await sb.from('feedback_comments').update(toRow(patch)).eq('id', id).select().single()).data),
         remove: async (id) => { await sb.from('feedback_comments').delete().eq('id', id); }
       });
     The comment fields below map one-to-one to table columns. */
  const localStore = {
    name: 'local',
    async list() { return read(LS.comments, []); },
    async add(c) { const all = read(LS.comments, []); all.push(c); write(LS.comments, all); return c; },
    async update(id, patch) { const all = read(LS.comments, []), i = all.findIndex((c) => c.id === id); if (i < 0) return null; all[i] = { ...all[i], ...patch }; write(LS.comments, all); return all[i]; },
    async remove(id) { write(LS.comments, read(LS.comments, []).filter((c) => c.id !== id)); }
  };
  let store = localStore;

  /* ---------- helpers ---------- */
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const icon = (name, cls = '') => `<svg class="i ${cls}" viewBox="0 0 24 24" aria-hidden="true">${(typeof ICONS !== 'undefined' && ICONS[name]) || ''}</svg>`;
  const fx = (n) => window.PBFX && PBFX.play(n);
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const squash = (t) => String(t || '').replace(/\s+/g, ' ').trim();
  const short = (t, n = 48) => { t = squash(t); return t.length > n ? t.slice(0, n - 1) + '…' : t; };
  const reduce = () => window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const typing = (el) => el && (/INPUT|TEXTAREA|SELECT/.test(el.tagName) || el.isContentEditable);
  function ago(iso) {
    const s = (Date.now() - new Date(iso).getTime()) / 1000;
    if (s < 60) return 'just now'; if (s < 3600) return `${Math.floor(s / 60)} min ago`; if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
    return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  }
  const TYPES = [['text', 'Change text'], ['bug', 'Bug'], ['idea', 'Idea'], ['remove', 'Remove'], ['other', 'Other']];
  const typeName = (t) => (TYPES.find((x) => x[0] === t) || TYPES[4])[1];

  const phone = $('#phone'), stage = $('#stage');
  const appPage = () => (window.PowerBuddy && PowerBuddy.pageInfo ? PowerBuddy.pageInfo() : { key: 'app', label: 'App' });

  /* ---------- state ---------- */
  const S = {
    // Always available, from the first onboarding screen. Starts behind its button until opened or until Thomas's call reveals it.
    unlocked: true,
    open: read(LS.open, false), mode: 'idle', filter: 'page', comments: [], page: appPage(),
    hover: null, hoverTrail: [], target: null, targetEl: null, editing: null, type: 'other', spotlight: false, flashId: null, undo: null
  };

  /* ---------- DOM ---------- */
  const panel = document.createElement('aside');
  panel.className = 'fbx-panel'; panel.id = 'fbx-panel'; panel.setAttribute('aria-label', 'Feedback');
  panel.innerHTML = `<header class="fbx-head">
      <span class="fbx-logo">${icon('MessageSquare')}</span>
      <div class="fbx-title"><h2>Feedback</h2><p>Comment on anything in the app</p></div>
      <button type="button" class="fbx-icon" data-fb="collapse" aria-label="Hide the feedback panel" title="Hide">${icon('PanelRightClose')}</button>
    </header>
    <div class="fbx-body">
      <button type="button" class="fbx-primary" data-fb="pick" aria-pressed="false">${icon('MessageSquarePlus', 'sm')}<span class="fbx-primary-label">Comment on something</span><kbd>C</kbd></button>
      <p class="fbx-picking-note">${icon('MousePointerClick', 'xs')}<span>Click any text, button or chart in the phone. <kbd>↑</kbd> picks the surrounding block, <kbd>Esc</kbd> cancels.</span></p>
      <div class="fbx-pagebar">
        <div class="fbx-pagename"><span>You're on</span><b data-fb-page></b></div>
        <div class="fbx-seg" role="group" aria-label="Show comments"><button type="button" data-fb="filter" data-v="page" aria-pressed="true">This page</button><button type="button" data-fb="filter" data-v="all" aria-pressed="false">All <span data-fb-total></span></button></div>
      </div>
      <div class="fbx-list" role="list"></div>
    </div>
    <footer class="fbx-foot">
      <div class="fbx-name"><div class="fbx-name-row"><label for="fbx-author">Your name</label><span class="fbx-saved">${icon('ShieldCheck', 'xs')}Saved in this browser</span></div><input type="text" id="fbx-author" data-fb-input="author" maxlength="40" placeholder="Optional, shown with your comments" autocomplete="name"></div>
      <div class="fbx-foot-row"><button type="button" data-fb="copy" title="Copy all comments as text">${icon('Copy', 'xs')}Copy all</button><button type="button" data-fb="export-csv" title="Download for Excel or Google Sheets">${icon('Download', 'xs')}CSV</button><button type="button" data-fb="export" title="Download everything as JSON">${icon('Download', 'xs')}JSON</button></div>
    </footer>
    <div class="fbx-snack" role="status" aria-live="polite" hidden></div>`;

  const root = document.createElement('div');
  root.className = 'fbx'; root.id = 'fbx';
  root.innerHTML = `<button type="button" class="fbx-fab" data-fb="open" aria-label="Open the feedback tool" hidden>${icon('MessageSquare')}<span class="fbx-fab-label">Feedback</span><span class="fbx-count" hidden></span></button>
    <div class="fbx-dim" hidden></div>
    <div class="fbx-coach" role="status" hidden></div>
    <div class="fbx-layer">
      <div class="fbx-box fbx-hover" aria-hidden="true" hidden><span class="fbx-tag"></span></div>
      <div class="fbx-box fbx-target" aria-hidden="true" hidden></div>
      <div class="fbx-pins"></div>
    </div>
    <div class="fbx-pickbar" hidden>${icon('MousePointerClick', 'sm')}<span>Tap something in the app to comment</span><button type="button" data-fb="cancel">Cancel</button></div>
    <div class="fbx-pop" role="dialog" aria-label="Comment" hidden></div>`;
  document.body.appendChild(root);
  stage.appendChild(panel);
  const el = {
    fab: $('.fbx-fab', root), count: $('.fbx-count', root), dim: $('.fbx-dim', root), coach: $('.fbx-coach', root),
    hover: $('.fbx-hover', root), tag: $('.fbx-hover .fbx-tag', root), target: $('.fbx-target', root), pins: $('.fbx-pins', root),
    pickbar: $('.fbx-pickbar', root), pop: $('.fbx-pop', root), list: $('.fbx-list', panel), page: $('[data-fb-page]', panel),
    total: $('[data-fb-total]', panel), pick: $('[data-fb="pick"]', panel), author: $('[data-fb-input="author"]', panel), snack: $('.fbx-snack', panel)
  };
  el.author.value = read(LS.author, '');

  /* ---------- layout ----------
     dock: pinned top right, under the prototype gear, while the phone stays centred (wide screens only,
     so the two never overlap); drawer: the same place but closed by default, since it would cover part
     of the phone; sheet: a bottom sheet on phones. */
  const layout = () => (innerWidth >= 1130 ? 'dock' : innerWidth > 740 ? 'drawer' : 'sheet');
  function applyLayout() {
    const L = layout(), open = S.unlocked && S.open;
    document.body.dataset.fbx = S.unlocked ? L : '';
    document.body.classList.toggle('fbx-open', open);
    document.body.classList.toggle('fbx-picking', S.mode === 'pick' || (S.mode === 'compose' && L !== 'dock'));
    panel.hidden = !S.unlocked;
    el.fab.hidden = !S.unlocked || open;
    el.pickbar.hidden = !(S.mode === 'pick' && L !== 'dock');
    if (open && window.PBSeg) PBSeg.init(panel);
    schedule();
  }
  function setOpen(open) {
    S.open = open; write(LS.open, open);
    if (open) { panel.classList.remove('fbx-enter'); void panel.offsetWidth; panel.classList.add('fbx-enter'); }
    applyLayout();
  }

  /* ---------- comments ---------- */
  async function load() { S.comments = (await store.list()) || []; renderList(); }
  const onPage = () => S.comments.filter((c) => c.page === S.page.key).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  function renderList() {
    const page = onPage(), total = S.comments.length;
    el.page.textContent = S.page.label;
    el.total.textContent = total ? `(${total})` : '';
    el.count.textContent = total; el.count.hidden = !total;
    const seg = $('.fbx-seg', panel), want = $(`[data-fb="filter"][data-v="${S.filter}"]`, panel);
    if (window.PBSeg) PBSeg.select(seg, want); else $$('[data-fb="filter"]', panel).forEach((b) => b.setAttribute('aria-pressed', b === want));
    let html;
    if (S.filter === 'page') {
      html = page.length ? page.map((c, i) => item(c, i + 1)).join('')
        : `<div class="fbx-empty">${icon('MessageSquarePlus')}<p><b>No comments on this page yet.</b></p><p>Press <b>Comment on something</b>, then click any text, button or chart in the phone. Want a different wording? Pick the text and type the new one.</p></div>`;
    } else {
      const groups = new Map();
      for (const c of [...S.comments].sort((a, b) => a.createdAt.localeCompare(b.createdAt))) { if (!groups.has(c.page)) groups.set(c.page, []); groups.get(c.page).push(c); }
      html = groups.size ? [...groups].map(([key, list]) => `<div class="fbx-group"><div class="fbx-group-head"><b>${esc(list[0].pageLabel)}</b>${key === S.page.key ? '<span>You\'re here</span>' : /^(sheet|onboarding)\//.test(key) ? '' : `<button type="button" data-fb="goto" data-page="${esc(key)}">Go to page${icon('ChevronRight', 'xs')}</button>`}</div>${list.map((c, i) => item(c, i + 1)).join('')}</div>`).join('')
        : `<div class="fbx-empty">${icon('MessageSquare')}<p><b>No comments yet.</b></p><p>They'll be listed here by page.</p></div>`;
    }
    el.list.innerHTML = html;
    if (window.PBSeg) PBSeg.init(el.list);
    schedule();
  }
  function item(c, n) {
    if (S.editing === c.id) return `<div class="fbx-item editing" role="listitem" data-id="${c.id}"><span class="fbx-num">${n}</span><div class="fbx-item-main">${composerFields(c.type, c.changeTo, c.body, c.text)}<div class="fbx-pop-foot"><button type="button" class="fbx-cancel" data-fb="edit-cancel">Cancel</button><button type="button" class="fbx-post" data-fb="edit-save" data-id="${c.id}">Save</button></div></div></div>`;
    const where = c.page === S.page.key ? (resolve(c) ? '' : '<span class="fbx-gone" title="This element isn\'t on screen right now">not on screen</span>') : '';
    return `<div class="fbx-item${S.flashId === c.id ? ' flash' : ''}" role="listitem" data-id="${c.id}" tabindex="0">
      <span class="fbx-num">${n}</span>
      <div class="fbx-item-main">
        <div class="fbx-item-top"><span class="fbx-type t-${esc(c.type)}">${esc(typeName(c.type))}</span>${where}<span class="fbx-when">${ago(c.createdAt)}</span></div>
        <div class="fbx-item-target">${esc(c.kind)}${c.text ? ` · “${esc(short(c.text, 60))}”` : ''}</div>
        ${c.changeTo ? `<div class="fbx-item-change">${icon('ArrowRight', 'xs')}<span>“${esc(c.changeTo)}”</span></div>` : ''}
        ${c.body ? `<p class="fbx-item-body">${esc(c.body)}</p>` : ''}
        <div class="fbx-item-actions">${c.author ? `<span class="fbx-by">${esc(c.author)}</span>` : ''}<button type="button" data-fb="edit" data-id="${c.id}">${icon('Pencil', 'xs')}Edit</button><button type="button" data-fb="delete" data-id="${c.id}">${icon('Trash2', 'xs')}Delete</button></div>
      </div></div>`;
  }

  /* ---------- finding elements ---------- */
  const SKIP = '.call, .fbx, .launch, .home-indicator, .island, .statusbar';
  const inApp = (n) => n && n.nodeType === 1 && phone.contains(n) && n !== phone && !n.closest(SKIP);
  function normalize(n) {
    const ico = n.closest('svg.i');
    if (ico) n = ico.closest('button, a, .chip-icon, .tab, .medal, [role="switch"]') || ico.parentElement;
    else if (n.closest('svg')) { const svg = n.closest('svg'); n = svg.closest('.chart') || svg; }
    return n;
  }
  const scopeOf = (n) => (n.closest('#sheet') ? '#sheet' : n.closest('#toast') ? '#toast' : n.closest('#app') ? '#app' : '#phone');
  function cssPath(n, scope) {
    const top = $(scope), parts = [];
    for (let x = n; x && x !== top; x = x.parentElement) {
      let i = 1; for (let sib = x.previousElementSibling; sib; sib = sib.previousElementSibling) if (sib.tagName === x.tagName) i++;
      parts.unshift(`${x.tagName.toLowerCase()}:nth-of-type(${i})`);
    }
    return scope + (parts.length ? ' > ' + parts.join(' > ') : '');
  }
  function textOf(n) {
    if (/INPUT|TEXTAREA/.test(n.tagName)) return squash(n.value || n.placeholder || n.getAttribute('aria-label'));
    if (n.tagName === 'SELECT') return squash(n.options[n.selectedIndex] ? n.options[n.selectedIndex].text : '');
    return squash(n.getAttribute('aria-label') && !(n.innerText || '').trim() ? n.getAttribute('aria-label') : n.innerText || n.textContent).slice(0, 300);
  }
  const firstLine = (n) => squash(String(n.innerText || n.textContent || '').split('\n').find((l) => l.trim()) || '').slice(0, 80);
  /* Readable "where": the cards, sections and sheets around the element, named by their first line (outermost first). */
  function areaOf(n, own) {
    const names = [];
    for (let x = n.parentElement; x && x !== phone && phone.contains(x); x = x.parentElement) {
      if (!x.matches('.card, section, header, nav, form, .sheet, .ob-body, .welcome')) continue;
      const name = firstLine(x);
      if (name && name !== own && !names.includes(name)) names.unshift(name);
    }
    return names.slice(-2).join(' › ');
  }
  /* The text right around the element, for short labels like "+11%" or "in use right now" that need their row to make
     sense: grows outwards while it stays short, and stops at the row, button or list item that holds the element. */
  function nearbyOf(n, own) {
    let best = '';
    for (let x = n.parentElement, i = 0; x && x !== phone && phone.contains(x) && i < 4; x = x.parentElement, i++) {
      const t = squash(x.innerText || x.textContent);
      if (t.length > 160) break;
      if (t !== own) best = t;
      if (x.matches('button, a, li, label, tr, [role="button"], [role="switch"], [role="listitem"]')) break;
    }
    return best;
  }
  /* Where it sat in the phone screen, in CSS pixels, at the scroll position it was picked at. */
  function boxOf(n) {
    // The phone may be scaled down to fit the window; divide that out so positions are in the phone's own pixels.
    const r = n.getBoundingClientRect(), p = phone.getBoundingClientRect(), k = window.PBFit ? PBFit() : 1, R = (v) => Math.round(v / k);
    return { x: R(r.left - p.left), y: R(r.top - p.top), w: R(r.width), h: R(r.height), screenW: R(p.width), screenH: R(p.height) };
  }
  function kindOf(n) {
    const t = n.tagName.toLowerCase();
    if (n.matches('[role="switch"]')) return 'Switch';
    if (t === 'a') return 'Link';
    if (t === 'button' || n.matches('[role="button"]')) return 'Button';
    if (/^h[1-6]$/.test(t)) return 'Heading';
    if (/^(input|select|textarea)$/.test(t)) return 'Field';
    if (n.matches('.chart') || t === 'svg') return 'Chart';
    if (n.matches('header, nav, main, section, .card, .list, .sheet, .ob-body, .welcome')) return 'Section';
    if ([...n.childNodes].some((c) => c.nodeType === 3 && c.textContent.trim())) return 'Text';
    return 'Block';
  }
  function describe(n) {
    const scope = scopeOf(n), text = textOf(n);
    return { selector: cssPath(n, scope), scope, tag: n.tagName.toLowerCase(), kind: kindOf(n), text };
  }
  /* Extra detail saved with a new comment (not used to find the element again). */
  function details(n) {
    const text = textOf(n), cls = typeof n.className === 'string' ? squash(n.className) : (n.getAttribute('class') || '');
    return { area: areaOf(n, text) || null, nearby: nearbyOf(n, text) || null, ariaLabel: n.getAttribute('aria-label') || null, classes: cls || null, box: boxOf(n) };
  }
  /* Find a comment's element again after the app re-renders: exact path and text first, then the same text anywhere nearby, then the path alone (live numbers change). */
  function resolve(c) {
    let byPath = null;
    try { byPath = document.querySelector(c.selector); } catch { /* bad selector */ }
    if (byPath && (byPath.tagName.toLowerCase() !== c.tag || !inApp(byPath))) byPath = null;
    const want = squash(c.text).slice(0, 60);
    if (byPath && squash(textOf(byPath)).slice(0, 60) === want) return byPath;
    if (want) {
      const scope = $(c.scope) || phone;
      const match = $$(c.tag, scope).find((x) => inApp(x) && squash(textOf(x)).slice(0, 60) === want);
      if (match) return match;
    }
    return byPath;
  }
  const visibleRect = (n) => {
    const r = n.getBoundingClientRect(), box = phone.getBoundingClientRect(), sc = n.closest('.content, .sheet-body, .ob-body');
    const clip = sc ? sc.getBoundingClientRect() : box;
    return { r, clip: { top: Math.max(box.top, clip.top), bottom: Math.min(box.bottom, clip.bottom), left: Math.max(box.left, clip.left), right: Math.min(box.right, clip.right) } };
  };
  function placeBox(box, n, pad = 3) {
    if (!n || !n.isConnected) { box.hidden = true; return; }
    const { r } = visibleRect(n);
    if (!r.width && !r.height) { box.hidden = true; return; }
    box.hidden = false;
    Object.assign(box.style, { left: r.left - pad + 'px', top: r.top - pad + 'px', width: r.width + pad * 2 + 'px', height: r.height + pad * 2 + 'px' });
  }

  /* ---------- picking ---------- */
  function startPick() {
    if (!S.unlocked) return;
    if (S.spotlight) endSpotlight();
    closePop(false);
    S.mode = 'pick'; S.hover = null; S.hoverTrail = [];
    el.pick.setAttribute('aria-pressed', 'true'); $('.fbx-primary-label', panel).textContent = 'Click something in the phone…';
    document.body.classList.add('fbx-pickmode');
    fx('pick'); applyLayout();
  }
  function stopPick() {
    S.mode = S.mode === 'pick' ? 'idle' : S.mode; S.hover = null; S.hoverTrail = [];
    el.hover.hidden = true; el.pick.setAttribute('aria-pressed', 'false'); $('.fbx-primary-label', panel).textContent = 'Comment on something';
    document.body.classList.remove('fbx-pickmode');
    applyLayout();
  }
  function setHover(n) {
    if (n === S.hover) return;
    S.hover = n;
    if (!n) { el.hover.hidden = true; S.hoverDesc = null; return; }
    const d = describe(n); S.hoverDesc = d;
    el.tag.innerHTML = `<b>${esc(d.kind)}</b>${d.text ? ` “${esc(short(d.text, 34))}”` : ''}`;
    placeBox(el.hover, n);
  }
  function choose(n) {
    S.mode = 'compose'; S.targetEl = n; S.target = describe(n); S.editing = null;
    S.type = /^(Text|Heading|Button|Link)$/.test(S.target.kind) && S.target.text ? 'text' : 'other';
    stopPick(); S.mode = 'compose';
    fx('tap');
    openPop();
  }

  /* ---------- composer ---------- */
  function composerFields(type, changeTo, body, current) {
    return `<div class="fbx-types" role="group" aria-label="Kind of comment">${TYPES.map(([v, l]) => `<button type="button" data-fb="type" data-v="${v}" aria-pressed="${type === v}">${l}</button>`).join('')}</div>
      <label class="fbx-field fbx-change"${type === 'text' ? '' : ' hidden'}><span>Change the text to</span><input type="text" data-fb-input="changeTo" value="${esc(changeTo ?? current ?? '')}" placeholder="New wording"></label>
      <label class="fbx-field"><span>${type === 'text' ? 'Why? (optional)' : 'Your comment'}</span><textarea data-fb-input="body" rows="3" placeholder="${type === 'bug' ? 'What went wrong?' : type === 'remove' ? 'Why should it go?' : type === 'text' ? 'Anything else to add' : 'What should change?'}">${esc(body || '')}</textarea></label>`;
  }
  function openPop() {
    const t = S.target;
    el.pop.innerHTML = `<div class="fbx-pop-head"><span class="fbx-kind">${esc(t.kind)}</span><span class="fbx-pop-target">${t.text ? `“${esc(short(t.text, 70))}”` : 'No text'}</span></div>
      <div class="fbx-pop-body">${composerFields(S.type, null, '', t.text)}</div>
      <div class="fbx-pop-foot"><button type="button" class="fbx-cancel" data-fb="cancel">Cancel</button><button type="button" class="fbx-post" data-fb="post">${icon('Send', 'xs')}Post</button></div>`;
    el.pop.hidden = false; el.pop.classList.remove('fbx-pop-in'); void el.pop.offsetWidth; el.pop.classList.add('fbx-pop-in');
    if (window.PBSeg) PBSeg.init(el.pop);
    applyLayout(); positionPop(); validate();
    const f = S.type === 'text' ? $('[data-fb-input="changeTo"]', el.pop) : $('[data-fb-input="body"]', el.pop);
    setTimeout(() => { f.focus({ preventScroll: true }); if (S.type === 'text') f.select(); }, 30);
  }
  function closePop(restore = true) {
    el.pop.hidden = true; el.target.hidden = true;
    if (S.mode === 'compose') S.mode = 'idle';
    S.target = null; S.targetEl = null;
    applyLayout();
    if (restore && layout() === 'dock') el.pick.focus({ preventScroll: true });
  }
  function readFields(scope) {
    const type = ($('[data-fb="type"][aria-pressed="true"]', scope) || {}).dataset?.v || 'other';
    const changeTo = type === 'text' ? squash(($('[data-fb-input="changeTo"]', scope) || {}).value) : '';
    const body = (($('[data-fb-input="body"]', scope) || {}).value || '').trim();
    return { type, changeTo, body };
  }
  function validate(scope = el.pop) {
    const f = readFields(scope), cur = S.target ? squash(S.target.text) : null, post = $('.fbx-post', scope);
    const ok = !!f.body || (f.type === 'text' && f.changeTo && f.changeTo !== cur) || (f.type === 'remove');
    if (post) post.disabled = !ok;
    return ok;
  }
  function setType(scope, v) {
    const seg = $('.fbx-types', scope), want = $(`[data-fb="type"][data-v="${v}"]`, scope);
    if (window.PBSeg) PBSeg.select(seg, want); else $$('[data-fb="type"]', scope).forEach((b) => b.setAttribute('aria-pressed', b === want));
    const change = $('.fbx-change', scope), label = $('.fbx-field:not(.fbx-change) > span', scope), ta = $('textarea', scope);
    if (change) change.hidden = v !== 'text';
    if (label) label.textContent = v === 'text' ? 'Why? (optional)' : 'Your comment';
    if (ta) ta.placeholder = v === 'bug' ? 'What went wrong?' : v === 'remove' ? 'Why should it go?' : v === 'text' ? 'Anything else to add' : 'What should change?';
    if (scope === el.pop) S.type = v;
    validate(scope);
    (v === 'text' ? $('[data-fb-input="changeTo"]', scope) : ta).focus({ preventScroll: true });
    if (scope === el.pop) positionPop();
  }
  async function post() {
    if (!S.target || !validate()) return;
    const f = readFields(el.pop), page = S.page, now = new Date().toISOString();
    const n = S.targetEl && S.targetEl.isConnected ? S.targetEl : resolve(S.target), more = n ? details(n) : {};
    const c = { id: uid(), page: page.key, pageLabel: page.label, pageBase: page.base || null, ...S.target, ...more, type: f.type, changeTo: f.changeTo || null, body: f.body || null, author: squash(el.author.value) || null, createdAt: now, updatedAt: now, session: SESSION, app: 'powerbuddy-v2', viewport: `${innerWidth}x${innerHeight}`, status: 'open' };
    await store.add(c);
    S.comments.push(c); S.flashId = c.id;
    fx('send'); if (window.PBFX) PBFX.vibrate(12);
    closePop(); S.filter = 'page'; renderList(); popPin(c.id);
    snack('Comment saved');
    setTimeout(() => { S.flashId = null; }, 1200);
  }
  function positionPop() {
    if (el.pop.hidden) return;
    const n = S.targetEl && S.targetEl.isConnected ? S.targetEl : S.target ? resolve(S.target) : null;
    if (n) S.targetEl = n;
    placeBox(el.target, n, 4);
    const w = Math.min(360, innerWidth - 16), h = el.pop.offsetHeight || 260;
    el.pop.style.width = w + 'px';
    let left, top;
    if (n) {
      const r = n.getBoundingClientRect();
      top = r.bottom + 12; if (top + h > innerHeight - 8) top = r.top - h - 12;
      if (top < 8) top = clamp(innerHeight - h - 12, 8, innerHeight);
      left = clamp(r.left, 8, innerWidth - w - 8);
    } else { const b = phone.getBoundingClientRect(); left = clamp(b.left + (b.width - w) / 2, 8, innerWidth - w - 8); top = clamp(b.top + b.height / 3, 8, innerHeight - h - 8); }
    el.pop.style.left = left + 'px'; el.pop.style.top = top + 'px';
  }

  /* ---------- pins ---------- */
  /* Pins are kept and moved rather than rebuilt, so they stay clickable while the app updates. */
  const pinEls = new Map();
  function drawPins() {
    const show = S.unlocked && (S.open || S.mode !== 'idle') && !/^(ringing|active)$/.test(document.body.dataset.call || '');
    const keep = new Set();
    if (show) onPage().forEach((c, i) => {
      const n = resolve(c); if (!n) return;
      const { r, clip } = visibleRect(n);
      if (r.bottom < clip.top + 4 || r.top > clip.bottom - 4 || r.right < clip.left || r.left > clip.right) return;
      const x = clamp(r.right - 9, clip.left + 2, clip.right - 20), y = clamp(r.top - 9, clip.top + 2, clip.bottom - 20);
      let p = pinEls.get(c.id);
      if (!p) {
        p = document.createElement('button'); p.type = 'button'; p.className = 'fbx-pin'; p.dataset.fb = 'pin'; p.dataset.id = c.id;
        el.pins.appendChild(p); pinEls.set(c.id, p);
      }
      const label = `Comment ${i + 1}: ${short(c.body || c.changeTo || typeName(c.type), 40)}`;
      if (p.textContent !== String(i + 1)) p.textContent = i + 1;
      if (p.getAttribute('aria-label') !== label) p.setAttribute('aria-label', label);
      p.style.transform = `translate(${x}px, ${y}px)`;
      keep.add(c.id);
    });
    for (const [id, p] of pinEls) if (!keep.has(id)) { p.remove(); pinEls.delete(id); }
  }
  function popPin(id) { drawPins(); const p = pinEls.get(id); if (p) { p.classList.remove('pop'); void p.offsetWidth; p.classList.add('pop'); } }
  function focusComment(id) {
    const c = S.comments.find((x) => x.id === id); if (!c) return;
    if (!S.open) setOpen(true);
    S.filter = c.page === S.page.key ? 'page' : 'all'; S.flashId = id; renderList();
    const it = $(`.fbx-item[data-id="${id}"]`, el.list); if (it) it.scrollIntoView({ block: 'nearest', behavior: reduce() ? 'auto' : 'smooth' });
    const n = c.page === S.page.key && resolve(c);
    if (n) { n.scrollIntoView({ block: 'center', behavior: reduce() ? 'auto' : 'smooth' }); flashTarget(n); }
    setTimeout(() => { S.flashId = null; }, 1200);
  }
  let flashTimer = 0;
  function flashTarget(n) {
    clearTimeout(flashTimer); el.target.classList.add('flash'); follow(700, () => placeBox(el.target, n, 4));
    flashTimer = setTimeout(() => { el.target.classList.remove('flash'); if (S.mode !== 'compose') el.target.hidden = true; }, 1400);
  }

  /* ---------- spotlight (during Thomas's call) ---------- */
  function reveal({ spotlight = false, brief = false, open = false } = {}) {
    // On wide screens the panel opens itself. On smaller ones it would cover the app, so it waits behind its button,
    // unless asked to open (the call was declined, so nothing else is on screen).
    if (open || layout() === 'dock') { S.open = true; write(LS.open, true); panel.classList.remove('fbx-enter'); void panel.offsetWidth; panel.classList.add('fbx-enter'); }
    else S.open = false;
    applyLayout(); load();
    if (spotlight) startSpotlight(brief); // no chime here: it would play over Thomas's voice
  }
  let spotTimer = 0;
  function startSpotlight(brief) {
    S.spotlight = true; clearTimeout(spotTimer);
    document.body.classList.add('fbx-spot');
    el.dim.hidden = false; el.dim.classList.remove('out');
    // With the panel open the glow says enough. Only the closed launcher gets a short hint.
    if (S.open) el.coach.hidden = true;
    else {
      el.coach.innerHTML = '<b>New: the feedback tool</b><span>Tap here, then tap anything in the app to leave a note about it.</span>';
      el.coach.dataset.at = 'fab'; el.coach.hidden = false; el.coach.classList.remove('out');
    }
    follow(900);
    if (brief) spotTimer = setTimeout(endSpotlight, 7000);
  }
  function endSpotlight() {
    if (!S.spotlight) return;
    S.spotlight = false; clearTimeout(spotTimer);
    el.dim.classList.add('out'); el.coach.classList.add('out');
    document.body.classList.remove('fbx-spot');
    setTimeout(() => { if (!S.spotlight) { el.dim.hidden = true; el.coach.hidden = true; } }, 450);
  }
  function placeCoach() {
    if (el.coach.hidden) return;
    const w = el.coach.offsetWidth, h = el.coach.offsetHeight;
    if (el.coach.dataset.at === 'panel') {
      const r = el.pick.getBoundingClientRect();
      el.coach.style.left = Math.max(8, r.left - w - 18) + 'px'; el.coach.style.top = clamp(r.top + r.height / 2 - h / 2, 8, innerHeight - h - 8) + 'px';
    } else {
      const r = el.fab.getBoundingClientRect(), below = r.top < innerHeight / 2; // phones: the button is in the top bar
      el.coach.dataset.at = below ? 'fab-top' : 'fab';
      el.coach.style.left = clamp(r.right + 8 - w, 8, innerWidth - w - 8) + 'px';
      el.coach.style.top = (below ? r.bottom + 14 : Math.max(8, r.top - h - 16)) + 'px';
    }
  }

  /* ---------- positioning loop ---------- */
  let queued = false, followUntil = 0, followFn = null;
  function schedule() { if (queued) return; queued = true; requestAnimationFrame(frame); }
  function follow(ms, fn) { followUntil = performance.now() + ms; followFn = fn || null; schedule(); }
  function frame() {
    queued = false;
    if (!S.unlocked) return;
    const p = appPage();
    if (p.key !== S.page.key) { S.page = p; if (S.editing) S.editing = null; renderList(); }
    if (S.mode === 'pick' && S.hover) {
      if (!S.hover.isConnected) { const again = S.hoverDesc && resolve(S.hoverDesc); S.hover = null; S.hoverTrail = []; setHover(again || null); } // the app re-rendered under the cursor
      else placeBox(el.hover, S.hover);
    }
    if (S.mode === 'compose') positionPop();
    drawPins(); placeCoach();
    if (followFn) followFn();
    if (performance.now() < followUntil) schedule(); else followFn = null;
  }

  /* ---------- snack + undo ---------- */
  let snackTimer = 0;
  function snack(text, undo) {
    el.snack.innerHTML = `<span>${esc(text)}</span>${undo ? '<button type="button" data-fb="undo">Undo</button>' : ''}`;
    el.snack.hidden = false; el.snack.classList.remove('in'); void el.snack.offsetWidth; el.snack.classList.add('in');
    clearTimeout(snackTimer); snackTimer = setTimeout(() => { el.snack.hidden = true; S.undo = null; }, undo ? 5000 : 2200);
  }

  /* ---------- export ---------- */
  /* All three formats carry the comment (type, new wording, text, author, time) and what was selected
     (page, element type, its text, the card it sits in, the text around it, its place on screen, and a selector).
     The number (#) is the same as the comment's pin number on its page. */
  const when = (iso) => (iso ? new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '');
  const boxText = (b) => (b ? `x ${b.x}, y ${b.y}, ${b.w}×${b.h} px (screen ${b.screenW}×${b.screenH})` : '');
  function numbered() {
    const seen = new Map();
    return [...S.comments].sort((a, b) => a.createdAt.localeCompare(b.createdAt)).map((c) => { const n = (seen.get(c.page) || 0) + 1; seen.set(c.page, n); return { n, c }; });
  }
  function asText() {
    const rows = numbered(), groups = new Map();
    for (const r of rows) { if (!groups.has(r.c.pageLabel)) groups.set(r.c.pageLabel, []); groups.get(r.c.pageLabel).push(r); }
    const head = `PowerBuddy feedback: ${rows.length} comment${rows.length === 1 ? '' : 's'}, copied ${when(new Date().toISOString())}`;
    return head + '\n\n' + [...groups].map(([label, list]) => `${label}\n` + list.map(({ n, c }) => [
      `  #${n} ${typeName(c.type)} on ${c.kind}${c.text ? ` "${c.text}"` : ' (no text)'}`,
      c.area ? `     In: ${c.area}` : '',
      c.nearby ? `     Around it: "${c.nearby}"` : '',
      c.changeTo ? `     Change the text to: "${c.changeTo}"` : '',
      c.body ? `     Comment: ${c.body}` : '',
      `     ${c.author ? `By ${c.author}, ` : ''}${when(c.createdAt)}`
    ].filter(Boolean).join('\n')).join('\n\n')).join('\n\n');
  }
  const CSV_COLS = [
    ['#', (n) => n], ['Page', (n, c) => c.pageLabel], ['Comment type', (n, c) => typeName(c.type)], ['Comment', (n, c) => c.body], ['Change text to', (n, c) => c.changeTo],
    ['Selected element', (n, c) => c.kind], ['Selected text', (n, c) => c.text], ['In (card / section)', (n, c) => c.area], ['Text around it', (n, c) => c.nearby],
    ['Author', (n, c) => c.author], ['Created', (n, c) => when(c.createdAt)], ['Edited', (n, c) => (c.updatedAt && c.updatedAt !== c.createdAt ? when(c.updatedAt) : '')],
    ['Position on screen', (n, c) => boxText(c.box)], ['Viewport', (n, c) => c.viewport], ['Page key', (n, c) => c.page], ['Opened from', (n, c) => c.pageBase],
    ['Element tag', (n, c) => c.tag], ['Aria label', (n, c) => c.ariaLabel], ['Classes', (n, c) => c.classes], ['Selector', (n, c) => c.selector],
    ['Comment ID', (n, c) => c.id], ['Session', (n, c) => c.session]
  ];
  /* Semicolons, a byte-order mark and CRLF so Excel with Danish (and most European) settings opens it in columns with æ, ø and å intact.
     Cells that start like a formula are prefixed with ' so Excel shows them as text (plain values like "+11%" are left alone). */
  function asCSV() {
    const formula = (s) => /^[=@\t\r]/.test(s) || (/^[+-]/.test(s) && !/^[+-][\d\s.,%]*$/.test(s));
    const cell = (v) => { let s = v == null ? '' : String(v); if (formula(s)) s = "'" + s; return '"' + s.replace(/"/g, '""') + '"'; };
    const lines = [CSV_COLS.map(([h]) => cell(h)).join(';'), ...numbered().map(({ n, c }) => CSV_COLS.map(([, f]) => cell(f(n, c))).join(';'))];
    return '﻿' + lines.join('\r\n') + '\r\n';
  }
  function fileName(ext) {
    const who = squash(el.author.value).toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24);
    return `powerbuddy-feedback-${who ? who + '-' : ''}${new Date().toISOString().slice(0, 10)}.${ext}`;
  }
  function download(name, text, type) {
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name;
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  function exportAs(kind) {
    if (!S.comments.length) { snack('No comments to export yet'); return; }
    if (kind === 'csv') { download(fileName('csv'), asCSV(), 'text/csv;charset=utf-8'); snack('Downloaded as CSV'); return; }
    const comments = numbered().map(({ n, c }) => ({ number: n, ...c }));
    download(fileName('json'), JSON.stringify({ app: 'powerbuddy-v2', exportedAt: new Date().toISOString(), count: comments.length, comments }, null, 2), 'application/json');
    snack('Downloaded as JSON');
  }

  /* ---------- events ---------- */
  const isOurs = (t) => t && t.closest && (t.closest('#fbx') || t.closest('#fbx-panel'));
  // While picking, clicks in the phone choose an element instead of using the app.
  for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'touchstart', 'touchend']) {
    document.addEventListener(type, (e) => { if (S.mode === 'pick' && inApp(e.target)) { if (type !== 'touchstart' && type !== 'touchend') e.preventDefault(); e.stopPropagation(); } }, { capture: true, passive: false });
  }
  document.addEventListener('pointermove', (e) => { if (S.mode === 'pick') setHover(inApp(e.target) ? normalize(e.target) : null); }, true);
  document.addEventListener('click', (e) => {
    if (S.mode === 'pick' && inApp(e.target)) { e.preventDefault(); e.stopImmediatePropagation(); const n = S.hover && S.hover.contains(e.target) ? S.hover : normalize(e.target); choose(n); return; }
    const b = e.target.closest && e.target.closest('[data-fb]');
    if (!b || !isOurs(b)) return;
    e.preventDefault();
    const a = b.dataset.fb, scope = b.closest('.fbx-item') || el.pop;
    if (a === 'pick') { if (S.mode === 'pick') stopPick(); else startPick(); }
    else if (a === 'cancel') { if (S.mode === 'pick') stopPick(); else closePop(); }
    else if (a === 'collapse') { if (S.mode === 'pick') stopPick(); setOpen(false); fx('close'); }
    else if (a === 'open') { endSpotlight(); setOpen(true); fx('open'); }
    else if (a === 'filter') { S.filter = b.dataset.v; renderList(); fx('tap'); }
    else if (a === 'type') { setType(scope, b.dataset.v); fx('tap'); }
    else if (a === 'post') post();
    else if (a === 'pin') { e.stopPropagation(); focusComment(b.dataset.id); }
    else if (a === 'edit') { S.editing = b.dataset.id; renderList(); const it = $(`.fbx-item[data-id="${b.dataset.id}"]`, el.list); if (it) { validateEdit(it); $('textarea', it).focus(); } }
    else if (a === 'edit-cancel') { S.editing = null; renderList(); }
    else if (a === 'edit-save') saveEdit(b.dataset.id, scope);
    else if (a === 'delete') remove(b.dataset.id);
    else if (a === 'undo') undo();
    else if (a === 'goto') { if (window.PowerBuddy && PowerBuddy.navigate(b.dataset.page)) { S.filter = 'page'; fx('tap'); } }
    else if (a === 'export') exportAs('json');
    else if (a === 'export-csv') exportAs('csv');
    else if (a === 'copy') {
      if (!S.comments.length) { snack('No comments to copy yet'); return; }
      const done = () => snack('Copied all comments'), fail = () => snack('Copy is blocked here. Use CSV or JSON.');
      try { navigator.clipboard.writeText(asText()).then(done, fail); } catch { fail(); }
    }
  }, true);
  el.list.addEventListener('click', (e) => { const it = e.target.closest('.fbx-item'); if (!it || e.target.closest('button, input, textarea') || it.classList.contains('editing')) return; focusComment(it.dataset.id); });
  el.list.addEventListener('keydown', (e) => { const it = e.target.closest('.fbx-item'); if (it && e.target === it && e.key === 'Enter') focusComment(it.dataset.id); });
  el.list.addEventListener('pointerover', (e) => {
    const it = e.target.closest('.fbx-item'); if (!it || S.mode !== 'idle') return;
    const c = S.comments.find((x) => x.id === it.dataset.id), n = c && c.page === S.page.key && resolve(c);
    if (n) placeBox(el.target, n, 4); else el.target.hidden = true;
  });
  el.list.addEventListener('pointerleave', () => { if (S.mode === 'idle') el.target.hidden = true; });
  document.addEventListener('input', (e) => {
    if (!isOurs(e.target)) return;
    if (e.target === el.author) { write(LS.author, el.author.value.trim()); return; }
    const it = e.target.closest('.fbx-item'); if (it) validateEdit(it); else validate();
  });
  document.addEventListener('keydown', (e) => {
    if (!S.unlocked) return;
    const t = e.target;
    if (isOurs(t)) {
      if (e.key === 'Escape') { e.stopPropagation(); if (S.mode === 'compose') closePop(); else if (S.editing) { S.editing = null; renderList(); } return; }
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); e.stopPropagation(); const it = t.closest('.fbx-item'); if (it && S.editing) saveEdit(S.editing, it); else post(); return; }
      if (e.key === 'Tab') e.stopPropagation(); // keep the app's sheet focus trap out of the tool
      return;
    }
    if (S.mode === 'pick') {
      if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); stopPick(); return; }
      if (e.key === 'ArrowUp' && S.hover && S.hover.parentElement && inApp(S.hover.parentElement)) { e.preventDefault(); e.stopPropagation(); S.hoverTrail.push(S.hover); setHover(S.hover.parentElement); fx('pick'); return; }
      if (e.key === 'ArrowDown' && S.hoverTrail.length) { e.preventDefault(); e.stopPropagation(); setHover(S.hoverTrail.pop()); return; }
      if (e.key === 'Enter' && S.hover) { e.preventDefault(); e.stopPropagation(); choose(S.hover); return; }
    }
    if (S.mode === 'compose' && e.key === 'Escape') { e.stopPropagation(); closePop(); return; }
    if ((e.key === 'c' || e.key === 'C') && !e.ctrlKey && !e.metaKey && !e.altKey && !typing(t) && !(window.PBCall && PBCall.busy() && document.body.dataset.call !== 'minimized')) { e.preventDefault(); if (S.mode === 'pick') stopPick(); else startPick(); }
  }, true);
  function validateEdit(it) {
    const f = readFields(it), c = S.comments.find((x) => x.id === it.dataset.id), btn = $('.fbx-post', it);
    if (btn) btn.disabled = !(f.body || (f.type === 'text' && f.changeTo && f.changeTo !== squash(c && c.text)) || f.type === 'remove');
  }
  async function saveEdit(id, it) {
    const f = readFields(it), patch = { type: f.type, changeTo: f.changeTo || null, body: f.body || null, updatedAt: new Date().toISOString() };
    const c = S.comments.find((x) => x.id === id); if (!c) return;
    Object.assign(c, patch); await store.update(id, patch);
    S.editing = null; S.flashId = id; renderList(); fx('send'); snack('Comment updated');
    setTimeout(() => { S.flashId = null; }, 1200);
  }
  async function remove(id) {
    const i = S.comments.findIndex((x) => x.id === id); if (i < 0) return;
    const [c] = S.comments.splice(i, 1); await store.remove(id);
    S.undo = c; renderList(); fx('close'); snack('Comment deleted', true);
  }
  async function undo() {
    if (!S.undo) return; const c = S.undo; S.undo = null;
    await store.add(c); S.comments.push(c); renderList(); el.snack.hidden = true; fx('tap');
  }
  // Follow the app: page changes, re-renders, scrolling, resizing.
  document.addEventListener('pb:render', schedule);
  new MutationObserver(schedule).observe(phone, { childList: true, subtree: true });
  document.addEventListener('scroll', schedule, true);
  addEventListener('resize', () => applyLayout());
  setInterval(() => { if (S.unlocked && S.mode === 'idle') renderList(); }, 60000); // keeps "2 min ago" fresh

  window.PBFeedback = {
    reveal, endSpotlight,
    isBusy: () => S.mode !== 'idle',
    setStore(adapter) { store = adapter; return load(); },
    comments: () => S.comments.slice(),
    exportText: asText, exportCSV: asCSV
  };
  if (S.unlocked) { if (layout() !== 'dock') S.open = false; applyLayout(); load(); }
})();
