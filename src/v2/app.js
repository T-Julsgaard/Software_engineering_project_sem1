/* PowerBuddy V2 UI. Renders from state with template strings; one delegated click handler. */
(() => {
  'use strict';
  const P = PBD, H = P.helpers;
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const ic = (name, cls = '') => `<svg class="i ${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || ''}</svg>`;
  const fmt = (v, d = 0) => Number(v).toLocaleString('en-GB', { minimumFractionDigits: d, maximumFractionDigits: d });
  const kr = (v, d = 0) => `${fmt(v, d)} kr`;
  const unit = (r) => (r === 'water' ? 'm³' : 'kWh');
  const resName = (r) => (r === 'water' ? 'Water' : r === 'both' ? 'Electricity and water' : 'Electricity');
  const fmtRes = (r, v) => (r === 'water' ? fmt(v, 1) : fmt(v));
  const signed = (v, d = 0) => (v === null || !Number.isFinite(v) ? '–' : `${v < 0 ? '−' : v > 0 ? '+' : ''}${fmt(Math.abs(v), d)}%`);
  const clock = (ts) => new Date(ts).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  const dateShort = (d) => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  const initials = (name) => String(name || '?').trim().slice(0, 1).toUpperCase() + (String(name).split(/\s+/)[1] || '').slice(0, 1).toUpperCase();
  const avatar = (cls = '') => `<span class="avatar me ${cls}" aria-hidden="true">${esc(initials(s.profile.name))}</span>`;
  function ago(iso) {
    const diff = (P.now(s).getTime() - new Date(iso).getTime()) / 1000;
    if (diff < 60) return 'Just now';
    if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)} h ago`;
    if (diff < 172800) return 'Yesterday';
    if (diff < 7 * 86400) return `${Math.floor(diff / 86400)} days ago`;
    return dateShort(iso);
  }
  function delta(v, d = 0) {
    if (v === null || !Number.isFinite(v)) return '<span class="delta flat">–</span>';
    const cls = v <= -0.5 ? 'good' : v >= 0.5 ? 'bad' : 'flat';
    return `<span class="delta ${cls}">${v < -0.5 ? ic('ArrowDownRight', 'xs') : v > 0.5 ? ic('ArrowUpRight', 'xs') : ''}${signed(v, d)}</span>`;
  }

  /* ---------- state ---------- */
  function load() { try { const raw = localStorage.getItem(P.KEY); if (!raw) return null; const x = JSON.parse(raw); return P.validate(x) ? x : null; } catch { return null; } }
  function save() { try { if (s) localStorage.setItem(P.KEY, JSON.stringify(s)); else localStorage.removeItem(P.KEY); } catch { /* storage unavailable: keep running in memory */ } }
  let s = load();
  const OB_DEFAULT = () => ({ name: '', region: 'capital', housing: 'apartment', area: 70, adults: 2, children: 0, heating: 'district', hotWater: 'heating', appliances: ['fridge', 'washer', 'cooking', 'tv'], payment: 'bills', billE: '', billW: '', sample: true, terms: false, data: false });
  const ui = { tab: 'home', page: null, goalsSeg: 'goals', usageRes: 'electricity', planDay: 'today', planApp: null, planFinish: 'tonight', sheet: null, ob: s ? null : { step: 0, d: OB_DEFAULT(), errors: {} }, fresh: new Set(), toasts: [], lastDay: null, nextNotify: Date.now() + 12000, notifySeq: 0, sheetToken: 0 };
  if (s) { P.ensureNotify(s); P.sync(s); }

  /* ---------- render ---------- */
  const TAB_ORDER = ['home', 'usage', 'plan', 'goals'];
  const PAGE_DEPTH = { profile: 1, settings: 2 };
  /* How the screen should animate in, given where we were: push/pop for pages, slide for tabs. */
  function navMotion(prev, next) {
    if (!prev) return 'fade';
    if (prev.page !== next.page) return (PAGE_DEPTH[next.page] || 0) > (PAGE_DEPTH[prev.page] || 0) ? 'push' : 'pop';
    if (prev.tab !== next.tab) return TAB_ORDER.indexOf(next.tab) > TAB_ORDER.indexOf(prev.tab) ? 'right' : 'left';
    return 'fade';
  }
  function render() {
    const app = $('#app');
    if (!s) {
      const obKey = 'ob' + (ui.ob ? ui.ob.step : ''), obGliders = obKey === ui.lastKey ? snapSegs(app) : null;
      app.innerHTML = viewOnboarding();
      initSegs(app, obGliders);
      if (obKey !== ui.lastKey) { const b = $('.ob-body, .welcome'); if (b && ui.lastKey) b.classList.add('enter', ui.ob && ui.lastObStep > ui.ob.step ? 'enter-pop' : 'enter-push'); }
      ui.lastObStep = ui.ob ? ui.ob.step : 0; ui.lastKey = obKey;
      focusOb(); emitRender(); return;
    }
    // Switching a segment (Goals / Rewards, Electricity / Water...) is not navigation: the page and its controls stay put.
    const key = ui.page || ui.tab;
    const prev = $('#content'), top = prev ? prev.scrollTop : 0, navigated = key !== ui.lastKey;
    const gliders = navigated ? null : snapSegs(app), segMove = ui.segMotion; ui.segMotion = null;
    const home = !ui.page && ui.tab === 'home';
    app.innerHTML = header() + `<main class="content${home ? ' home' : ''}" id="content" tabindex="-1">${view()}</main>` + (ui.page ? '' : tabs());
    const content = $('#content');
    initSegs(app, gliders);
    if (home) fitHome();
    if (!navigated) { content.scrollTop = top; if (segMove) segEnter(content, segMove, gliders); }
    else if (ui.lastKey) {
      const motion = navMotion(ui.lastNav, { tab: ui.tab, page: ui.page });
      $$(':scope > .section, :scope > .profile-head', content).forEach((el, i) => el.style.setProperty('--i', Math.min(i, 8)));
      content.classList.add('enter', 'enter-' + motion);
      $$('.chart', content).forEach((c) => c.classList.add('grow'));
      if (motion === 'push' || motion === 'pop') { const t = $('.top-title'); if (t) t.classList.add('enter-title'); }
      const cur = $('.tab[aria-current="page"]'); if (cur && (motion === 'left' || motion === 'right')) cur.classList.add('just');
      setTimeout(() => content.classList.remove('enter', 'enter-' + motion), 950);
    }
    ui.lastKey = key; ui.lastNav = { tab: ui.tab, page: ui.page };
    ui.fresh.clear();
    bindCharts(content);
    bindSwipes(content);
    if (!navigated) monthEnter(content); else ui.monthMotion = null;
    updateLive();
    emitRender();
  }
  /* Home is one screen: tighten it when the phone is short, and stop the last few pixels from scrolling. */
  function fitHome() {
    const c = $('#content'); if (!c || !c.classList.contains('home')) return;
    c.classList.remove('tight', 'tighter', 'fits');
    const shrunk = $('.progress-card [data-chart]', c);
    if (shrunk && ui.homeChart && $('svg', shrunk).viewBox.baseVal.height !== ui.homeChart.height) { shrunk.outerHTML = lineChart(ui.homeChart); bindCharts($('.progress-card', c)); }
    const need =() => { const last = c.lastElementChild; return last ? last.offsetTop - c.offsetTop + last.offsetHeight + parseFloat(getComputedStyle(c).paddingBottom) : 0; };
    if (need() > c.clientHeight + 1) c.classList.add('tight');
    if (need() - c.clientHeight > 26) c.classList.add('tighter'); // short phones: one line per row
    // Still too tall (two goals, a short phone): give the progress chart whatever height is left, down to a minimum.
    const chart = $('.progress-card [data-chart]', c), over = need() - c.clientHeight - 1;
    if (chart && ui.homeChart && over > 0) {
      const scale = chart.offsetWidth / 340, h = Math.max(66, Math.floor(92 - over / scale));
      if (h !== ui.homeChart.height) { chart.outerHTML = lineChart({ ...ui.homeChart, height: h }); bindCharts($('.progress-card', c)); }
    }
    if (need() <= c.clientHeight + 1) { c.classList.add('fits'); c.scrollTop = 0; }
  }
  /* On a computer the phone is drawn at its real size, 390 × 844, and scaled down as a whole when the window is
     shorter than that (most laptops), so it never gets squashed. On phones (740 px and narrower) it fills the screen. */
  const PHONE = { w: 390, h: 844 }, STAGE_PAD = 48;
  function fitDevice() {
    const k = innerWidth <= 740 ? 1 : H.clamp(Math.min((innerHeight - STAGE_PAD) / PHONE.h, (innerWidth - STAGE_PAD) / PHONE.w), 0.6, 1);
    ui.fit = Math.floor(k * 1000) / 1000; // rounded down, so the page never ends up a pixel taller than the window
    document.documentElement.style.setProperty('--fit', ui.fit);
  }
  /* Screen pixels to phone pixels (drags and chart tooltips work in the phone's own pixels). */
  const unfit = (px) => px / (ui.fit || 1);
  fitDevice();
  addEventListener('resize', () => { fitDevice(); fitHome(); for (const seg of $$('.seg-glide')) glide(seg); });

  /* ---------- segmented controls ----------
     One pill slides between the options. Its leading edge springs ahead and the trailing edge follows,
     so it stretches on the way and settles into place. Works across re-renders: the old position is
     read before the HTML is replaced and the new pill starts from there. */
  const SEG_SEL = '.seg, .fbx-types, .fbx-seg';
  const segId = (seg) => { const b = seg.querySelector('button'); return b ? b.dataset.key || b.dataset.field || b.dataset.a || b.dataset.fb || '' : ''; };
  const pressed = (seg) => seg.querySelector(':scope > button[aria-pressed="true"]');
  function gliderBox(g) { return g && g.offsetWidth ? { x: g.offsetLeft, y: g.offsetTop, w: g.offsetWidth, h: g.offsetHeight } : null; }
  function snapSegs(root) { const m = new Map(); for (const seg of $$(SEG_SEL, root)) { const b = gliderBox(seg.querySelector(':scope > .seg-glider')); if (b) m.set(segId(seg), b); } return m; }
  const segObserver = window.ResizeObserver ? new ResizeObserver((list) => list.forEach((e) => (e.target.isConnected ? glide(e.target) : segObserver.unobserve(e.target)))) : null;
  function initSegs(root, before) {
    for (const seg of root.matches && root.matches(SEG_SEL) ? [root] : $$(SEG_SEL, root)) {
      if (!seg.querySelector(':scope > .seg-glider')) {
        const g = document.createElement('span'); g.className = 'seg-glider'; g.setAttribute('aria-hidden', 'true');
        seg.prepend(g); seg.classList.add('seg-glide'); if (segObserver) segObserver.observe(seg);
      }
      glide(seg, before && before.get(segId(seg)));
    }
  }
  const springOut = (t) => 1 - Math.exp(-7 * t) * Math.cos(7.6 * t); // ~5% overshoot, then settles
  const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
  function glide(seg, from) {
    const g = seg.querySelector(':scope > .seg-glider'), b = pressed(seg);
    if (!g) return;
    if (!b) { g.style.opacity = '0'; return; }
    const to = { x: b.offsetLeft, y: b.offsetTop, w: b.offsetWidth, h: b.offsetHeight };
    if (!to.w) return; // not laid out yet; the resize observer places it once it is
    Object.assign(g.style, { opacity: '', left: to.x + 'px', top: to.y + 'px', width: to.w + 'px', height: to.h + 'px' });
    if (!from || reduceMotion() || (Math.abs(from.x - to.x) < 1 && Math.abs(from.y - to.y) < 1 && Math.abs(from.w - to.w) < 1)) return;
    g.getAnimations().forEach((a) => a.cancel());
    const right = to.x + to.w >= from.x + from.w, N = 36, frames = [];
    const lo = 3, hi = seg.clientWidth - 3; // keep the overshoot inside the track
    for (let i = 0; i <= N; i++) {
      const t = i / N, lead = springOut(t), trail = easeInOut(Math.min(1, Math.max(0, (t - 0.1) / 0.78)));
      const l0 = from.x, r0 = from.x + from.w, l1 = to.x, r1 = to.x + to.w;
      let L = right ? l0 + (l1 - l0) * trail : l0 + (l1 - l0) * lead;
      let R = right ? r0 + (r1 - r0) * lead : r0 + (r1 - r0) * trail;
      L = Math.max(lo, L); R = Math.min(hi, Math.max(L + 8, R));
      const squeeze = Math.sin(Math.PI * Math.min(1, t * 1.25)) * 1.2; // a touch thinner mid-flight
      const y = from.y + (to.y - from.y) * lead, h = from.h + (to.h - from.h) * lead;
      frames.push({ left: L + 'px', width: R - L + 'px', top: y + squeeze + 'px', height: Math.max(4, h - squeeze * 2) + 'px' });
    }
    g.animate(frames, { duration: 560, easing: 'linear' });
  }
  /* Select an option in place (no re-render), with the slide. */
  function segSelect(seg, btn) {
    const from = gliderBox(seg.querySelector(':scope > .seg-glider'));
    $$(':scope > button', seg).forEach((x) => x.setAttribute('aria-pressed', x === btn));
    glide(seg, from);
  }
  /* What sits below a segmented control changes with it, so only that slides in, from the side the pill went. */
  function segEnter(content, { key, dir }, before) {
    const btn = $(`.seg [data-key="${key}"]`, content); if (!btn || reduceMotion()) return;
    const seg = btn.closest('.seg'), out = [];
    // Controls that were already on screen stay still; everything around them moves.
    const collect = (el) => {
      const kept = (x) => before && before.has(segId(x));
      if (el.matches(SEG_SEL) && kept(el)) return;
      if ($$(SEG_SEL, el).some(kept)) [...el.children].forEach(collect); else out.push(el);
    };
    for (let n = seg; n && n !== content; n = n.parentElement) for (let x = n.nextElementSibling; x; x = x.nextElementSibling) collect(x);
    out.forEach((el, i) => {
      el.getAnimations().forEach((a) => a.cancel());
      el.animate([{ opacity: 0, transform: `translateX(${dir * 18}px)` }, { opacity: 1, transform: 'none' }], { duration: 420, delay: 40 + Math.min(i, 6) * 32, easing: 'cubic-bezier(.16,1,.3,1)', fill: 'backwards' });
      $$('.chart', el).forEach((c) => c.classList.add('grow'));
    });
  }

  /* Lets the prototype layers (call, feedback tool) follow page changes. */
  function emitRender() { document.dispatchEvent(new CustomEvent('pb:render')); }
  function view() {
    if (ui.page === 'profile') return viewProfile();
    if (ui.page === 'settings') return viewSettings();
    return { home: viewHome, usage: viewUsage, plan: viewPlan, goals: viewGoals }[ui.tab]();
  }
  function header() {
    if (ui.page === 'profile') return `<header class="top"><button class="icon-btn" data-a="back" aria-label="Back">${ic('ChevronLeft')}</button><div class="top-title"><h1>Profile</h1><p>Your badges, points and household</p></div><button class="icon-btn" data-a="settings" aria-label="Settings">${ic('Settings')}</button></header>`;
    if (ui.page === 'settings') return `<header class="top"><button class="icon-btn" data-a="back" aria-label="Back">${ic('ChevronLeft')}</button><div class="top-title"><h1>Settings</h1><p>Notifications, sound and your household</p></div></header>`;
    const region = P.REGIONS.find((r) => r.id === s.profile.region);
    const t = {
      home: [`${s.profile.name}'s home`, region.name],
      usage: ['Consumption', 'Electricity and water, month by month'],
      plan: ['Recommendations', 'Ideas, prices and the cheapest hours'],
      goals: ['Goals', 'Your goals and rewards']
    }[ui.tab];
    const unread = s.notes.filter((n) => !n.read).length;
    return `<header class="top">
      <button class="icon-btn" data-a="profile" aria-label="Your profile">${avatar('sm')}</button>
      <div class="top-title"><h1>${esc(t[0])}</h1><p>${esc(t[1])}</p></div>
      <button class="icon-btn" data-a="notes" aria-label="Notifications${unread ? `, ${unread} unread` : ''}">${ic('Bell')}${unread ? `<span class="count">${unread > 9 ? '9+' : unread}</span>` : ''}</button>
    </header>`;
  }
  function tabs() {
    const items = [['home', 'Home', 'House'], ['usage', 'Consumption', 'ChartColumn'], ['plan', 'Recommendations', 'Lightbulb'], ['goals', 'Goals', 'Target']];
    return `<nav class="tabs" aria-label="Main">${items.map(([id, label, icon]) => `<button class="tab" data-a="tab" data-tab="${id}" aria-label="${label}" title="${label}"${ui.tab === id ? ' aria-current="page"' : ''}>${ic(icon)}</button>`).join('')}</nav>`;
  }
  const seg = (key, options, cls = '') => `<div class="seg ${cls}" role="group">${options.map(([v, label]) => `<button data-a="seg" data-key="${key}" data-val="${v}" aria-pressed="${ui[key] === v}">${label}</button>`).join('')}</div>`;
  const sectionHead = (title, meta = '') => `<div class="section-head"><h2>${title}</h2>${meta ? `<span class="meta">${meta}</span>` : ''}</div>`;

  /* ---------- browsing earlier months ----------
     Usage and prices can go back a year: arrows, or drag the chart sideways (right for earlier). */
  const MONTHS_BACK = 12;
  function monthBounds() { const cur = P.thisMonth(s); return [H.addMonths(cur, -MONTHS_BACK), cur]; }
  /* ui[key] holds an earlier month, or null for this month. */
  function shownMonth(key) { const [lo, hi] = monthBounds(), m = ui[key]; if (!m || m < lo || m >= hi) { ui[key] = null; return hi; } return m; }
  function canStep(key, dir) { const [lo, hi] = monthBounds(), n = H.addMonths(shownMonth(key), dir); return n >= lo && n <= hi; }
  function stepMonth(key, dir) {
    if (!canStep(key, dir)) return;
    const n = H.addMonths(shownMonth(key), dir);
    ui[key] = n === monthBounds()[1] ? null : n; ui.monthMotion = { key, dir }; render();
  }
  function monthNav(key, m) {
    const [lo, hi] = monthBounds(), back = (+hi.slice(0, 4) - +m.slice(0, 4)) * 12 + (+hi.slice(5) - +m.slice(5));
    return `<div class="month-nav"><button class="icon-btn" data-a="month-step" data-key="${key}" data-d="-1"${m <= lo ? ' disabled' : ''} aria-label="Earlier month">${ic('ChevronLeft')}</button>
      <div class="month-label" aria-live="polite"><b>${H.monthName(m)} ${m.slice(0, 4)}</b><span>${back ? `${back} month${back > 1 ? 's' : ''} ago` : 'This month · drag for earlier'}</span></div>
      <button class="icon-btn" data-a="month-step" data-key="${key}" data-d="1"${m >= hi ? ' disabled' : ''} aria-label="Later month">${ic('ChevronRight')}</button></div>`;
  }
  /* Drag sideways on a month card to change month. Vertical drags still scroll the page. */
  function bindSwipes(root) {
    for (const el of $$('[data-swipe]', root)) {
      const track = $('.swipe-track', el) || el, key = el.dataset.swipe;
      let x0 = null, y0 = 0, dx = 0, axis = null, pid = null;
      el.addEventListener('pointerdown', (e) => { if (e.button || e.target.closest('button, a, select, input')) return; x0 = e.clientX; y0 = e.clientY; dx = 0; axis = null; pid = e.pointerId; });
      el.addEventListener('pointermove', (e) => {
        if (x0 === null || e.pointerId !== pid) return;
        const mx = unfit(e.clientX - x0), my = unfit(e.clientY - y0);
        if (!axis && Math.hypot(mx, my) > 8) {
          axis = Math.abs(mx) > Math.abs(my) ? 'x' : 'y';
          if (axis === 'x') { try { el.setPointerCapture(pid); } catch { /* not capturable */ } track.getAnimations().forEach((a) => a.cancel()); track.style.transition = 'none'; el.classList.add('dragging'); }
        }
        if (axis !== 'x') return;
        dx = canStep(key, mx > 0 ? -1 : 1) ? mx : mx * 0.25; // rubber band at either end
        track.style.transform = `translateX(${dx * 0.7}px)`; track.style.opacity = String(1 - Math.min(0.45, Math.abs(dx) / 360));
      });
      const up = () => {
        if (x0 === null) return; x0 = null; el.classList.remove('dragging');
        if (axis !== 'x') return;
        ui.swipedAt = Date.now();
        const dir = dx > 0 ? -1 : 1;
        if (Math.abs(dx) > 56 && canStep(key, dir)) { if (window.PBFX) { PBFX.play('tap'); PBFX.vibrate(6); } stepMonth(key, dir); return; }
        track.style.transition = 'transform .3s var(--spring), opacity .3s'; track.style.transform = ''; track.style.opacity = '';
      };
      el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
    }
  }
  /* The new month slides in from the side it came from. */
  function monthEnter(content) {
    const mv = ui.monthMotion; ui.monthMotion = null;
    if (!mv || reduceMotion()) return;
    const track = $(`[data-swipe="${mv.key}"] .swipe-track`, content); if (!track) return;
    track.animate([{ opacity: 0, transform: `translateX(${mv.dir * 40}px)` }, { opacity: 1, transform: 'none' }], { duration: 380, easing: 'cubic-bezier(.16,1,.3,1)' });
    $$('.chart', track).forEach((c) => c.classList.add('grow'));
  }

  /* ---------- home ---------- */
  /* Something to do in the house: the best idea not answered yet, or, once every idea has been, when to run
     the next appliance cheaply tonight. */
  function homeTask() {
    const rec = P.recommendations(s).find((r) => !s.recs[r.id]);
    if (rec) return { icon: rec.icon, tone: rec.resource === 'water' ? 'water' : 'elec', title: rec.title, sub: savingText(rec) };
    const has = (id) => s.profile.appliances.includes(id);
    const what = has('dishwasher') ? 'the dishwasher' : has('washer') ? 'the washing machine' : has('ev') ? 'the car charging' : null;
    const w = P.cheapWindow(s, has('dishwasher') ? 3 : 2), when = `${clock(w.start)}${w.late ? '' : ' tonight'}`;
    return { icon: 'Moon', tone: 'elec', title: what ? `Start ${what} from ${when}` : `Charge laptops and phones from ${when}`, sub: `About ${fmt(w.avg, 2)} kr/kWh then, ${w.below}% below this evening's peak. Use the delay timer.` };
  }
  function viewHome() {
    const m = P.thisMonth(s), n = P.now(s);
    // 1. One thing to do at home.
    const t = homeTask();
    const recs = `<section class="section">${sectionHead('Recommendation', '<button class="link" data-a="tab" data-tab="plan">More ideas</button>')}<div class="list"><button class="row home-row" data-a="tab" data-tab="plan"><span class="chip-icon ${t.tone}">${ic(t.icon)}</span><div class="row-main"><div class="row-title">${esc(t.title)}</div><div class="row-sub">${esc(t.sub)}</div></div>${ic('ChevronRight', 'sm muted')}</button></div></section>`;
    // 2. Up to two active goals, one line and a bar each.
    const active = s.goals.filter((g) => g.status === 'active').slice(0, 2);
    const goalLine = (g) => { const p = P.goalProgress(s, g), st = goalState(g, p); return `<button class="home-goal" data-a="goal-detail" data-id="${g.id}" aria-label="${esc(P.goalLabel(g))}: see how it's going">
        <div class="hg-top"><span class="chip-icon brand sm">${ic(g.kind === 'keep' ? 'ShieldCheck' : 'Target', 'sm')}</span><span class="row-title">${esc(P.goalLabel(g))}</span><span class="hg-status ${st.tone}">${esc(st.short)}</span></div>
        ${goalBar(g, p)}</button>`; };
    const goals = `<section class="section">${sectionHead('Goals', `<button class="link" data-a="tab" data-tab="goals">${active.length ? 'All goals' : 'Goals'}</button>`)}<div class="list">${active.length ? active.map(goalLine).join('')
      : `<div class="row home-row"><span class="chip-icon">${ic('Target')}</span><div class="row-main"><div class="row-title">No goal running</div><div class="row-sub">Cut back, or keep it steady.</div></div><button class="btn primary small" data-a="goal">Set a goal</button></div>`}</div></section>`;
    // 3. Live prices, not live usage: prices are public, while usage only comes in once a month.
    const list = P.prices(s, P.today(s)), h = n.getHours(), green = P.greenHours(list), level = P.priceLevel(list[h], list), up = P.upcomingPrices(s);
    const day = (ts) => (H.ymd(new Date(ts)) === P.today(s) ? '' : ' tomorrow'), slot = `${String(h).padStart(2, '0')}:00–${String((h + 1) % 24).padStart(2, '0')}:00`;
    const live = `<section class="section">${sectionHead('Live price', '<button class="link" data-a="tab" data-tab="plan">Whole day</button>')}<button class="card live ${s.live ? '' : 'paused'}" data-a="tab" data-tab="plan" aria-label="Electricity price right now. Open Recommendations for the whole day.">
      <div class="live-main"><div><div class="live-head"><span class="pulse" aria-hidden="true"></span><span>Electricity, ${slot}</span></div><div class="big-num num"><span data-live="price">${fmt(list[h], 2)}</span><small>kr/kWh</small></div></div>${priceStrip(list, h, green)}</div>
      <div class="live-line"><span class="tag ${level}">${{ low: 'Low', normal: 'Normal', high: 'High' }[level]}</span>${s.live ? '' : '<span class="tag">Paused</span>'}<span>${up ? `Cheapest next <b class="num">${clock(up.low.start)}</b>${day(up.low.start)}, ${fmt(up.low.price, 2)} kr` : ''}</span></div></button></section>`;
    // 4. Progress: how the last finished months went against homes like yours.
    const months = []; for (let i = 6; i >= 1; i--) months.push(H.addMonths(m, -i));
    const pts = months.map((mm) => ({ m: mm, value: s.months[mm] ? s.months[mm].e : null, typ: P.typicalMonth(s.profile, 'electricity', mm) }));
    const last = [...pts].reverse().find((p) => p.value !== null), streak = P.loggedStreak(s, H.addMonths(m, -1));
    const vs = last ? (last.value / last.typ - 1) * 100 : null;
    const headline = last ? `${H.monthName(last.m)}: <b>${fmt(Math.abs(vs))}% ${vs <= 0 ? 'less' : 'more'}</b> than homes like yours` : 'Add a month to compare with homes like yours.';
    const progress = `<section class="section">${sectionHead('Your progress so far', streak ? `${streak}-month streak` : '')}<button class="card progress-card" data-a="tab" data-tab="usage" data-res="electricity" aria-label="Your progress. Open Consumption.">
      <p class="small progress-head">${headline}</p>
      ${lineChart(ui.homeChart = { points: pts.map((p) => ({ value: p.value, label: H.monthName(p.m, 'short'), tip: p.value === null ? `${H.monthName(p.m)} ${p.m.slice(0, 4)}|Not entered yet` : `${H.monthName(p.m)} ${p.m.slice(0, 4)}|${fmt(p.value)} kWh|Homes like yours: ${fmt(p.typ)} kWh` })), typical: pts.map((p) => p.typ), height: 92, desc: 'Your electricity per month for the last 6 months, against homes like yours' })}
      <div class="legend"><span><i style="background:var(--elec)"></i>Your electricity</span><span><i class="dash"></i>Homes like yours</span></div></button></section>`;
    return recs + goals + live + progress;
  }
  function savingText(r) {
    if (r.costOnly) return `Saves about ${kr(r.saveKr)} a month. Same energy, lower price.`;
    const parts = [r.saveE ? `${fmt(r.saveE, r.saveE < 10 ? 1 : 0)} kWh` : '', r.saveW ? `${fmt(Math.round(r.saveW * 100) * 10)} litres` : ''].filter(Boolean);
    return `About ${parts.join(' and ')} a month, worth ${kr(r.saveKr)}.`;
  }
  /* Goals come in two kinds: cut (use X% less than usual in a month within the time frame) and keep (stay at
     or under your usual, or under similar homes, over the time frame). Both are judged on entered months only. */
  const goalBenchName = (g) => (g.bench === 'typical' ? 'similar homes' : 'your usual');
  const monthShort = (m) => H.monthName(m, 'short');
  const timeFrame = (g) => (g.start === g.end ? `${H.monthName(g.start)} ${g.start.slice(0, 4)}` : `${monthShort(g.start)} – ${monthShort(g.end)} ${g.end.slice(0, 4)}`);
  /* Fill of the progress bar; the marker in the middle is the target. Empty until a month's numbers are in. */
  const goalRatio = (g, p) => (p.reduction === null ? 0 : H.clamp(g.kind === 'keep' ? 0.5 + p.reduction / 20 : p.reduction / (g.target * 2), 0, 1));
  const goalBar = (g, p) => `<div class="target-bar" aria-hidden="true"><i style="width:${goalRatio(g, p) * 100}%;background:${p.onTrack ? 'var(--good)' : 'var(--gold)'}"></i><b style="left:50%"></b></div>`;
  /* Where a goal stands, in words: short for Home, long for the Goals tab. */
  function goalState(g, p) {
    const cur = P.thisMonth(s);
    if (p.reduction === null) {
      if (p.waiting.length) return { tone: 'muted', short: `Waiting for ${monthShort(p.waiting[0])}`, long: `Waiting for ${H.monthName(p.waiting[0])}'s numbers` };
      return { tone: 'muted', short: `First result after ${monthShort(cur)}`, long: `First result when ${H.monthName(cur)}'s numbers are in` };
    }
    const latest = p.results[p.results.length - 1].m, more = p.waiting.length ? ` · waiting for ${H.monthName(p.waiting[0])}` : '';
    if (g.kind === 'keep') {
      const word = p.reduction >= 0 ? 'under' : 'over';
      return { tone: p.onTrack ? 'good' : 'warn', short: `${fmt(Math.abs(p.reduction), 1)}% ${word}`, long: `${p.onTrack ? 'On track' : 'Over for now'} · ${fmt(Math.abs(p.reduction), 1)}% ${word} ${goalBenchName(g)}${p.results.length > 1 ? ' on average' : ` in ${H.monthName(latest)}`}${more}` };
    }
    const best = p.results.reduce((a, b) => (b.under > a.under ? b : a));
    return { tone: 'warn', short: `Best ${signed(-p.reduction, 1)}`, long: `Best month so far: ${signed(-p.reduction, 1)} in ${H.monthName(best.m)}${more}` };
  }
  function goalRow(g) {
    const p = P.goalProgress(s, g), st = goalState(g, p);
    return `<button class="prog-row" data-a="goal-detail" data-id="${g.id}" style="width:100%;border:0;background:none;text-align:left;display:block" aria-label="${esc(P.goalLabel(g))}: see how it's going">
      <div class="prog-top"><span class="chip-icon brand">${ic(g.kind === 'keep' ? 'ShieldCheck' : 'Target')}</span><div class="row-main"><div class="row-title">${esc(P.goalLabel(g))}</div><div class="row-sub">${esc(st.long)}</div></div><span class="pts">${g.est} pts</span>${ic('ChevronRight', 'sm muted')}</div>
      ${goalBar(g, p)}
      <div class="prog-meta"><span>${g.kind === 'keep' ? `At ${goalBenchName(g)} at the marker` : `Target −${g.target}% at the marker`}</span><span>${esc(timeFrame(g))}</span></div></button>`;
  }

  /* ---------- charts ---------- */
  function niceMax(v) { if (v <= 0) return 1; const e = 10 ** Math.floor(Math.log10(v)); for (const m of [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (m * e >= v) return m * e; return 10 * e; }
  function topRounded(x, y, w, h, r) {
    if (h <= 0) return '';
    r = Math.min(r, w / 2, h);
    return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
  }
  /* bars: [{value, proj, missing, cls, label, tip}] ; typical: number or array */
  function barChart({ bars, typical, height = 156, nowIndex = null, unitLabel, decimals = 0, desc }) {
    const W = 340, padL = 34, padB = 20, padT = 10, plotW = W - padL, plotH = height - padB - padT;
    const typs = typical == null ? [] : Array.isArray(typical) ? typical : [typical];
    const max = niceMax(Math.max(...bars.map((b) => Math.max(b.value || 0, b.proj || 0)), ...typs) * 1.05);
    const y = (v) => padT + plotH - (v / max) * plotH;
    const n = bars.length, slot = plotW / n, gap = n > 20 ? 2 : 4, bw = Math.max(2, slot - gap);
    let g = '';
    for (const t of [0, max / 2, max]) g += `<line class="grid" x1="${padL}" x2="${W}" y1="${y(t)}" y2="${y(t)}"/><text class="axis-text" x="${padL - 6}" y="${y(t) + 3}" text-anchor="end">${fmt(t, max < 10 ? 1 : 0)}</text>`;
    bars.forEach((b, i) => {
      const x = padL + i * slot + (slot - bw) / 2;
      if (b.missing) g += `<rect class="bar-missing" x="${x + 0.5}" y="${y(max * 0.3)}" width="${bw - 1}" height="${y(0) - y(max * 0.3)}" rx="3"/>`;
      if (b.proj && b.proj > (b.value || 0)) g += `<path class="${b.cls} bar-proj" style="--bi:${i}" d="${topRounded(x, y(b.proj), bw, y(0) - y(b.proj), 4)}"/>`;
      if (b.value) g += `<path class="${b.cls}" style="--bi:${i}" d="${topRounded(x, y(b.value), bw, y(0) - y(b.value), 4)}"/>`;
      if (b.label) g += `<text class="axis-text" x="${x + bw / 2}" y="${height - 5}" text-anchor="middle">${esc(b.label)}</text>`;
    });
    if (typs.length === 1) g += `<line class="typical" x1="${padL}" x2="${W}" y1="${y(typs[0])}" y2="${y(typs[0])}"/>`;
    else if (typs.length > 1) g += `<path class="typical" d="${typs.map((t, i) => `${i ? 'L' : 'M'}${padL + i * slot},${y(t)}H${padL + (i + 1) * slot}`).join('')}"/>`;
    if (nowIndex !== null) { const x = padL + nowIndex * slot + slot / 2; g += `<line class="now-line" x1="${x}" x2="${x}" y1="${padT - 4}" y2="${y(0)}"/><text class="axis-text" x="${x}" y="${padT - 6}" text-anchor="middle" style="fill:var(--ink);font-weight:600">now</text>`; }
    bars.forEach((b, i) => { if (b.tip) g += `<rect class="hit" x="${padL + i * slot}" y="${padT}" width="${slot}" height="${plotH}" data-tip="${esc(b.tip)}" data-x="${padL + i * slot + slot / 2}" data-y="${y(Math.max(b.value || 0, b.proj || 0, b.missing ? max * 0.3 : 0))}"/>`; });
    return `<div class="chart" data-chart><svg viewBox="0 0 ${W} ${height}" role="img" aria-label="${esc(desc || 'Bar chart')}">${g}</svg><div class="chart-tip" hidden></div></div>`;
  }
  /* points: [{value, label, tip}] ; typical: array, one per point. A gap in the line where a month is missing. */
  function lineChart({ points, typical, height = 110, desc }) {
    const W = 340, padL = 34, padR = 10, padB = 18, padT = 8, plotW = W - padL - padR, plotH = height - padB - padT, n = points.length;
    const max = niceMax(Math.max(...points.map((p) => p.value || 0), ...typical) * 1.05);
    const x = (i) => padL + (n === 1 ? plotW / 2 : (i * plotW) / (n - 1)), y = (v) => padT + plotH - (v / max) * plotH;
    let g = '';
    for (const t of [0, max / 2, max]) g += `<line class="grid" x1="${padL}" x2="${W}" y1="${y(t)}" y2="${y(t)}"/><text class="axis-text" x="${padL - 6}" y="${y(t) + 3}" text-anchor="end">${fmt(t, max < 10 ? 1 : 0)}</text>`;
    g += `<path class="typical" d="${typical.map((t, i) => `${i ? 'L' : 'M'}${x(i)},${y(t)}`).join('')}"/>`;
    let d = '', pen = false;
    points.forEach((p, i) => { if (p.value === null) { pen = false; return; } d += `${pen ? 'L' : 'M'}${x(i)},${y(p.value)}`; pen = true; });
    g += `<path class="line" d="${d}"/>`;
    const step = plotW / Math.max(1, n - 1);
    points.forEach((p, i) => {
      if (p.value !== null) g += `<circle class="dot" cx="${x(i)}" cy="${y(p.value)}" r="4"/>`;
      g += `<text class="axis-text" x="${x(i)}" y="${height - 4}" text-anchor="middle">${esc(p.label)}</text>`;
      if (p.tip) g += `<rect class="hit" x="${x(i) - step / 2}" y="${padT}" width="${step}" height="${plotH}" data-tip="${esc(p.tip)}" data-x="${x(i)}" data-y="${y(p.value === null ? 0 : p.value)}"/>`;
    });
    return `<div class="chart" data-chart><svg viewBox="0 0 ${W} ${height}" role="img" aria-label="${esc(desc || 'Line chart')}">${g}</svg><div class="chart-tip" hidden></div></div>`;
  }
  /* Part of a whole: a ring of up to six slices (the smallest fold into "Everything else"), with a 2px gap
     between slices, the total in the middle and a legend with each part's value and share. */
  const PIE = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300'];
  function pieChart({ parts, total, centre, desc }) {
    const R = 56, r0 = 34, C = 60;
    const slices = parts.length > PIE.length ? [...parts.slice(0, PIE.length - 1), { name: 'Everything else', value: H.sum(parts.slice(PIE.length - 1).map((p) => p.value)), fmt: parts[0].fmt }] : parts;
    const pt = (a, rad) => `${(C + rad * Math.sin(a)).toFixed(2)},${(C - rad * Math.cos(a)).toFixed(2)}`;
    let a0 = 0, g = '';
    slices.forEach((p, i) => {
      const share = p.value / total, a1 = a0 + share * 2 * Math.PI, mid = (a0 + a1) / 2, large = a1 - a0 > Math.PI ? 1 : 0;
      const tip = `${p.name}|${p.fmt(p.value)} a month · ${fmt(share * 100)}%`, [cx, cy] = pt(mid, (R + r0) / 2).split(',');
      const d = share >= 0.9999 ? `M${C},${C - R}A${R},${R} 0 1 1 ${C - 0.01},${C - R}ZM${C},${C - r0}A${r0},${r0} 0 1 0 ${C + 0.01},${C - r0}Z`
        : `M${pt(a0, R)}A${R},${R} 0 ${large} 1 ${pt(a1, R)}L${pt(a1, r0)}A${r0},${r0} 0 ${large} 0 ${pt(a0, r0)}Z`;
      g += `<path class="hit slice" style="--c:${PIE[i]};--bi:${i}" d="${d}" data-tip="${esc(tip)}" data-x="${cx}" data-y="${cy}"/>`;
      a0 = a1;
    });
    g += `<text class="pie-total" x="${C}" y="${C + 1}" text-anchor="middle">${esc(centre[0])}</text><text class="axis-text" x="${C}" y="${C + 13}" text-anchor="middle">${esc(centre[1])}</text>`;
    const legend = slices.map((p, i) => `<div class="pie-row"><i style="background:${PIE[i]}"></i><span>${esc(p.name)}</span><span class="num muted">${p.fmt(p.value)}</span><b class="num">${fmt((p.value / total) * 100)}%</b></div>`).join('');
    return `<div class="pie"><div class="chart pie-chart" data-chart><svg viewBox="0 0 120 120" role="img" aria-label="${esc(desc)}">${g}</svg><div class="chart-tip" hidden></div></div><div class="pie-legend">${legend}</div></div>`;
  }
  function bindCharts(root) {
    for (const chart of $$('[data-chart]', root)) {
      const svg = $('svg', chart), tip = $('.chart-tip', chart);
      const show = (el) => {
        if (Date.now() - (ui.swipedAt || 0) < 600) return; // not right after dragging to another month
        const box = svg.getBoundingClientRect(), vb = svg.viewBox.baseVal, sx = unfit(box.width) / vb.width;
        const [title, ...rest] = el.dataset.tip.split('|');
        tip.innerHTML = `<b>${esc(title)}</b>${rest.map((r) => `<br>${esc(r)}`).join('')}`;
        tip.hidden = false;
        const x = H.clamp(+el.dataset.x * sx, 60, unfit(box.width) - 60);
        tip.style.left = x + 'px'; tip.style.top = (+el.dataset.y * sx - 6) + 'px';
      };
      svg.addEventListener('pointerover', (e) => { if (e.target.classList.contains('hit')) show(e.target); });
      svg.addEventListener('click', (e) => { if (e.target.classList.contains('hit')) show(e.target); });
      chart.addEventListener('pointerleave', () => { tip.hidden = true; });
    }
  }

  /* ---------- usage ---------- */
  /* Months are entered by hand once they're over, so Usage shows the last 12 finished months. */
  function viewUsage() {
    const r = ui.usageRes, cls = r === 'water' ? 'bar-w' : 'bar-e', m = P.thisMonth(s);
    const bars = [], typs = [];
    for (let i = 12; i >= 1; i--) {
      const mm = H.addMonths(m, -i), v = P.monthValue(s, r, mm), typ = P.typicalMonth(s.profile, r, mm);
      typs.push(typ);
      bars.push({ value: v, cls, missing: v === null, label: i % 3 === 1 ? H.monthName(mm, 'short') : '',
        tip: v === null ? `${H.monthName(mm)} ${mm.slice(0, 4)}|Not entered yet` : `${H.monthName(mm)} ${mm.slice(0, 4)}|${fmtRes(r, v)} ${unit(r)} · ${kr(P.cost(s, r, v))}|Typical: ${fmtRes(r, typ)} ${unit(r)}` });
    }
    const logged = bars.filter((b) => !b.missing).map((b) => b.value), total = H.sum(logged);
    const stats = [['Last 12 months', `${fmtRes(r, total)} ${unit(r)}`], ['Average month', `${fmtRes(r, logged.length ? total / logged.length : 0)} ${unit(r)}`], ['Cost', kr(P.cost(s, r, total))]];
    const miss = missingMonths().filter((x) => !s.months[x]);
    const est = P.estimate(s.profile)[r];
    const parts = est.parts.map((p) => ({ name: p.name, value: (p.kwh || p.m3) / 12, fmt: (v) => (r === 'water' ? `${fmt(Math.round(v * 100) * 10)} L` : `${fmt(v)} kWh`) }));
    const sum = H.sum(parts.map((p) => p.value));
    const pie = pieChart({ parts, total: sum, centre: [r === 'water' ? fmt(sum, 1) : fmt(sum), r === 'water' ? 'm³ a month' : 'kWh a month'], desc: `Estimated ${r === 'water' ? 'water' : 'electricity'} use per month in a typical household like yours, by part of the home` });
    return `<section class="section"><button class="btn primary add-month" data-a="reading">${ic('Plus', 'sm')}Add monthly data</button>
        <p class="hint add-hint">${miss.length ? `${H.monthName(miss[0])} isn't entered yet${miss.length > 1 ? `, nor ${miss.length - 1} earlier month${miss.length > 2 ? 's' : ''}` : ''}. +10 points a month.` : 'Every month is entered. Add the next one when it ends.'}</p></section>
      <section class="section">${seg('usageRes', [['electricity', 'Electricity'], ['water', 'Water']])}</section>
      <section class="section">${sectionHead('Month by month', 'last 12 months')}
        <div class="card">
          <div class="headline-stat">${stats.map(([a, b]) => `<div><span>${a}</span><b class="num">${b}</b></div>`).join('')}</div>
          ${barChart({ bars, typical: typs, desc: `${resName(r)} per month for the last 12 months` })}
          <div class="legend"><span><i style="background:var(--${r === 'water' ? 'water' : 'elec'})"></i>Your ${r === 'water' ? 'water' : 'electricity'}</span><span><i class="dash"></i>Homes like yours</span><span><i style="border:1px dashed var(--line-2);background:none"></i>Not entered</span></div>
        </div></section>
      <section class="section">${sectionHead('A typical household like yours', 'estimate')}<div class="card">
        <p class="small" style="color:var(--ink-2);margin-bottom:12px">Where ${r === 'water' ? 'water' : 'electricity'} usually goes in a typical household like yours, per month. An estimate, not your own usage.</p>
        ${pie}
        <p class="hint" style="margin-top:12px">Based on ${esc(P.describeHome(s.profile))}.</p><button class="link" data-a="household">Edit your household</button></div></section>`;
  }

  /* ---------- plan ---------- */
  /* What electricity cost in an earlier month: the average price per day, against the month's average. */
  function priceHistory() {
    const m = shownMonth('priceMonth'), t = P.today(s), dim = H.daysIn(m), days = [];
    for (let i = 1; i <= dim; i++) { const d = `${m}-${String(i).padStart(2, '0')}`; days.push(d <= t ? { d, ...P.priceDay(s, d) } : { d }); }
    const known = days.filter((x) => x.avg !== undefined), avg = H.sum(known.map((x) => x.avg)) / known.length;
    const lo = known.reduce((a, b) => (b.avg < a.avg ? b : a)), hi = known.reduce((a, b) => (b.avg > a.avg ? b : a));
    const pm = H.addMonths(m, -1), pd = Array.from({ length: H.daysIn(pm) }, (_, i) => P.priceDay(s, `${pm}-${String(i + 1).padStart(2, '0')}`).avg), pAvg = H.sum(pd) / pd.length, vs = (avg / pAvg - 1) * 100;
    const hh = (h) => String(h).padStart(2, '0') + ':00';
    const bars = days.map((x, i) => ({ value: x.avg === undefined ? null : x.avg, cls: x.avg !== undefined && x.avg <= avg ? 'bar-e' : 'bar-gray', label: [1, 8, 15, 22, 29].includes(i + 1) ? String(i + 1) : '',
      tip: x.avg === undefined ? null : `${dateShort(x.d)}${x.d === t ? ' (today)' : ''}|Average ${fmt(x.avg, 2)} kr/kWh|Cheapest ${hh(x.minH)} · ${fmt(x.min, 2)} kr|Priciest ${hh(x.maxH)} · ${fmt(x.max, 2)} kr` }));
    return `<div class="card" data-swipe="priceMonth">${monthNav('priceMonth', m)}<div class="swipe-track">
      <div class="headline-stat"><div><span>${m === P.thisMonth(s) ? 'Average so far' : 'Average'}</span><b class="num">${fmt(avg, 2)} kr</b></div><div><span>Cheapest day</span><b class="num">${dateShort(lo.d)}</b></div><div><span>Priciest day</span><b class="num">${dateShort(hi.d)}</b></div></div>
      ${barChart({ bars, typical: avg, height: 150, desc: `Average electricity price per day in ${H.monthName(m)} ${m.slice(0, 4)}` })}
      <div class="legend"><span><i style="background:var(--elec)"></i>Below the month's average</span><span><i style="background:#C9CFC6"></i>Above</span><span><i class="dash"></i>Average</span></div>
      <p class="small muted" style="margin-top:8px">${fmt(Math.abs(vs), vs > -1 && vs < 1 ? 1 : 0)}% ${vs <= 0 ? 'cheaper' : 'dearer'} on average than ${H.monthName(pm)}. Cheapest day ${fmt(lo.avg, 2)} kr, priciest ${fmt(hi.avg, 2)} kr per kWh.</p>
    </div></div>`;
  }
  function finishOptions() {
    const n = P.now(s), at = (dayOffset, h) => { const d = new Date(n); d.setDate(d.getDate() + dayOffset); d.setHours(h, 0, 0, 0); return d; };
    const tonight = n.getHours() < 20 ? at(0, 22) : at(1, 22);
    return [['4h', 'Within 4 hours', new Date(n.getTime() + 4 * 36e5)], ['tonight', `By 22:00${n.getHours() < 20 ? '' : ' tomorrow'}`, tonight], ['morning', 'By 07:00 tomorrow', at(1, 7)], ['tomorrow', 'By tomorrow evening', at(1, 22)]];
  }
  function viewPlan() {
    const n = P.now(s), isToday = ui.planDay === 'today', day = isToday ? P.today(s) : H.addDays(P.today(s), 1);
    let priceBlock;
    if (ui.planDay === 'history') priceBlock = priceHistory();
    else if (!isToday && !P.tomorrowReady(s)) priceBlock = `<div class="card"><div class="alert info" style="margin:0">${ic('Clock', 'sm')}<span>Tomorrow's prices are published around 13:00, after the day-ahead power auction closes. They'll show here then.</span></div></div>`;
    else {
      const list = P.prices(s, day), green = P.greenHours(list), h = n.getHours(), cheapest = list.indexOf(Math.min(...list));
      const bars = list.map((v, i) => ({ value: v, cls: green.has(i) ? 'bar-e' : 'bar-gray', label: i % 6 === 0 ? String(i).padStart(2, '0') : '', tip: `${String(i).padStart(2, '0')}:00-${String(i + 1).padStart(2, '0')}:00|${fmt(v, 2)} kr/kWh${green.has(i) ? '|Green hour' : ''}` }));
      priceBlock = `<div class="card">
        <div class="price-now">${isToday ? `<span class="big-num num"><span data-live="price">${fmt(list[h], 2)}</span><small>kr/kWh now</small></span><span class="tag ${P.priceLevel(list[h], list)}">${{ low: 'Low', normal: 'Normal', high: 'High' }[P.priceLevel(list[h], list)]}</span>` : `<span class="big-num num">${fmt(Math.min(...list), 2)}<small>kr/kWh lowest</small></span>`}</div>
        <p class="small muted" style="margin-top:4px">Cheapest hour: ${String(cheapest).padStart(2, '0')}:00 at ${fmt(list[cheapest], 2)} kr · most expensive: ${String(list.indexOf(Math.max(...list))).padStart(2, '0')}:00 at ${fmt(Math.max(...list), 2)} kr</p>
        ${barChart({ bars, nowIndex: isToday ? h : null, height: 150, desc: `Electricity price per hour ${isToday ? 'today' : 'tomorrow'}` })}
        <div class="legend"><span><i style="background:var(--elec)"></i>Green hours (8 cheapest)</span><span><i style="background:#C9CFC6"></i>Other hours</span></div>
      </div>`;
    }
    const cyc = P.APPLIANCES.filter((a) => a.cycle && s.profile.appliances.includes(a.id));
    if (!ui.planApp || !cyc.some((a) => a.id === ui.planApp)) ui.planApp = cyc[0] && cyc[0].id;
    let planner;
    if (!cyc.length) planner = `<div class="card"><p class="small muted">Add a washing machine, dishwasher, tumble dryer or electric car to your household to plan runs.</p><button class="link" data-a="household">Edit household</button></div>`;
    else {
      const fo = finishOptions(), sel = fo.find((f) => f[0] === ui.planFinish) || fo[1], best = P.bestStart(s, ui.planApp, sel[2]), a = P.APPLIANCES.find((x) => x.id === ui.planApp);
      const startDay = best && (H.ymd(new Date(best.start)) === P.today(s) ? 'today' : 'tomorrow');
      planner = `<div class="card">
        <div class="app-chips" role="group" aria-label="Appliance">${cyc.map((x) => `<button data-a="plan-app" data-id="${x.id}" aria-pressed="${x.id === ui.planApp}">${ic(x.icon, 'sm')}${esc(x.cycle.name)}</button>`).join('')}</div>
        <label class="field"><span>Needs to be finished</span><select class="select" data-change="plan-finish">${fo.map(([id, label]) => `<option value="${id}"${id === sel[0] ? ' selected' : ''}>${label}</option>`).join('')}</select></label>
        ${best ? `<div class="result"><h3>Start ${startDay} at ${clock(best.start)}</h3><p>${a.cycle.hours} h, about ${fmt(best.kwh, 1)} kWh. Costs about ${kr(best.cost, 2)}${best.saving > 0.05 ? `, <b>${kr(best.saving, 2)} less</b> than starting at the next full hour` : ', the same as starting now'}.${best.green ? ' Runs in green hours.' : ''}</p>
          <div class="btn-row"><button class="btn primary" data-a="plan-make" data-start="${best.start}">Plan this run</button></div></div>`
          : `<div class="alert info">${ic('Info', 'sm')}<span>No full run fits before then${a.cycle.daytime ? ' between 07:00 and 22:00' : ''}. Try a later finish time.</span></div>`}
      </div>`;
    }
    const plans = s.plans.filter((p) => p.status === 'planned' || Date.now() - new Date(p.doneAt || 0).getTime() < 864e5).slice(0, 5);
    const planList = plans.length ? `<div class="list" style="margin-top:10px">${plans.map((p) => { const a = P.APPLIANCES.find((x) => x.id === p.appliance); const d = H.ymd(new Date(p.start)) === P.today(s) ? 'Today' : dateShort(p.start); return `<div class="row"><span class="chip-icon">${ic(a.icon)}</span><div class="row-main"><div class="row-title">${esc(a.cycle.name)}</div><div class="row-sub">${d} ${clock(p.start)}${p.green ? ' · green hours' : ''}</div></div>${p.status === 'planned' ? `<button class="btn secondary small" data-a="plan-done" data-id="${p.id}">Done</button>` : `<span class="tag low">${ic('Check', 'xs')}Done</span>`}</div>`; }).join('')}</div>` : '';
    const recs = P.recommendations(s), open = recs.filter((r) => !s.recs[r.id]), doing = recs.filter((r) => s.recs[r.id] && s.recs[r.id].status === 'accepted');
    const recCard = (r) => `<div class="rec"><div class="ch-head"><span class="chip-icon ${r.resource === 'water' ? 'water' : 'elec'}">${ic(r.icon)}</span><div style="flex:1"><h3>${esc(r.title)}</h3><p>${esc(r.detail)}</p></div></div>
      <div class="saving"><span class="tag brand">≈ ${kr(r.saveKr)} / month</span>${r.saveE ? `<span class="tag">${fmt(r.saveE, r.saveE < 10 ? 1 : 0)} kWh</span>` : ''}${r.saveW ? `<span class="tag">${fmt(Math.round(r.saveW * 100) * 10)} L</span>` : ''}${r.costOnly ? '<span class="tag">Saves money, not energy</span>' : ''}</div>
      <div class="btn-row"><button class="btn primary small" data-a="rec-accept" data-id="${r.id}">We'll do this</button><button class="btn secondary small" data-a="rec-dismiss" data-id="${r.id}">Not for us</button></div></div>`;
    const doingRow = (r) => { const since = s.recs[r.id].at, worth = r.costOnly ? kr(r.saveKr) : r.saveE ? `${fmt(r.saveE, r.saveE < 10 ? 1 : 0)} kWh` : `${fmt(Math.round(r.saveW * 100) * 10)} L`; return `<div class="row"><span class="chip-icon brand">${ic('Check')}</span><div class="row-main"><div class="row-title">${esc(r.title)}</div><div class="row-sub">Since ${dateShort(since)} · worth about ${worth} a month</div></div>${r.goal && !s.goals.some((g) => g.status === 'active' && g.source === r.id) ? `<button class="btn secondary small" data-a="goal" data-rec="${r.id}">Make goal</button>` : `<button class="btn ghost small" data-a="rec-stop" data-id="${r.id}">Stop</button>`}</div>`; };
    return `<section class="section">${sectionHead('Electricity price', 'Illustrative prices')}${seg('planDay', [['today', 'Today'], ['tomorrow', 'Tomorrow'], ['history', 'Past months']], 'small')}<div style="margin-top:12px">${priceBlock}</div></section>
      <section class="section">${sectionHead('Plan a run', 'Cheapest start')}${planner}${planList}</section>
      ${doing.length ? `<section class="section">${sectionHead("What you're doing", `${doing.length}`)}<div class="list">${doing.map(doingRow).join('')}</div></section>` : ''}
      <section class="section">${sectionHead('Ideas for your home', `${open.length} left`)}${open.length ? `<div class="list">${open.slice(0, 4).map(recCard).join('')}</div>` : '<div class="card empty">You have been through every idea for now.</div>'}</section>`;
  }

  /* ---------- goals ---------- */
  function viewGoals() {
    const wallet = `<section class="section"><div class="card wallet">
        <div class="main"><span>Points to spend</span><b class="num">${fmt(P.available(s))}<small>pts</small></b></div>
        <div><span>Points earned in total</span><b class="num">${fmt(P.lifetime(s))}<small>pts</small></b></div>
        <p class="wallet-note">You earn points by logging a month (+10) and reaching goals. Spend them on partner rewards: that lowers points to spend, never your total earned.</p>
      </div></section>`;
    const tabsHtml = `<section class="section">${seg('goalsSeg', [['goals', 'Goals'], ['rewards', 'Rewards']])}</section>`;
    let body = '';
    if (ui.goalsSeg === 'goals') {
      const active = s.goals.filter((g) => g.status === 'active'), past = s.goals.filter((g) => g.status !== 'active');
      const pastSub = (g) => `${timeFrame(g)} · ${g.kind === 'keep' ? `${fmt(Math.abs(g.result), 1)}% ${g.result >= 0 ? 'under' : 'over'} ${goalBenchName(g)}` : g.status === 'reached' ? `reached in ${H.monthName(g.settledFor || g.end)}, ${signed(-g.result, 1)}` : g.result > 0 ? `best month ${signed(-g.result, 1)}, not quite` : 'not this time'}`;
      body = `<section class="section">${sectionHead('Active', `<button class="link" data-a="goal">${ic('Plus', 'sm')}New goal</button>`)}
        ${active.length ? `<div class="list">${active.map(goalRow).join('')}</div>` : `<div class="card empty">No goal running. Cut back, or keep things steady, and we'll show what it's worth.<div class="btn-row" style="justify-content:center"><button class="btn primary small" data-a="goal" style="flex:none">New goal</button></div></div>`}</section>
        ${past.length ? `<section class="section">${sectionHead('Earlier')}<div class="list">${past.map((g) => `<div class="row"><span class="chip-icon ${g.status === 'reached' ? 'brand' : ''}">${ic(g.status === 'reached' ? 'CircleCheck' : 'Target')}</span><div class="row-main"><div class="row-title">${esc(P.goalLabel(g))}</div><div class="row-sub">${esc(pastSub(g))}</div></div>${g.status === 'reached' ? `<span class="pts">+${g.est}</span>` : ''}</div>`).join('')}</div></section>` : ''}`;
    } else {
      const redeemed = new Set(s.redemptions.map((v) => v.rewardId));
      body = `<section class="section">${sectionHead('Partner rewards', `${fmt(P.available(s))} pts to spend`)}
          <p class="hint" style="margin:-4px 0 10px">Every partner has to cut consumption, make things last, or be a lower-impact swap. No fast fashion, no gadgets.</p>
          <div class="list">${P.REWARDS.map((r) => { const short = r.cost - P.available(s); return `<button class="row" data-a="reward" data-id="${r.id}"><span class="chip-icon brand">${ic(r.icon)}</span><div class="row-main"><div class="row-title">${esc(r.name)}</div><div class="row-sub">${esc(r.partner)} · ${P.PARTNER_TEST[r.cat]}</div></div><div class="row-end">${redeemed.has(r.id) ? '<span class="tag low">Redeemed</span>' : `<span class="pts">${r.cost}</span>${short > 0 ? `<div class="small muted">${short} to go</div>` : ''}`}</div></button>`; }).join('')}</div></section>
        ${s.redemptions.length ? `<section class="section">${sectionHead('Your codes')}<div class="list">${s.redemptions.map((v) => { const r = P.REWARDS.find((x) => x.id === v.rewardId); return `<button class="row" data-a="reward" data-id="${r.id}"><div class="row-main"><div class="row-title">${esc(r.name)}</div><div class="row-sub">${esc(r.partner)} · ${dateShort(v.at)}</div></div><code class="num" style="font-size:13px">${esc(v.code)}</code></button>`; }).join('')}</div></section>` : ''}`;
    }
    return wallet + tabsHtml + body;
  }

  /* ---------- profile ---------- */
  function badgeTile(b) {
    const got = s.badges[b.id];
    return `<button class="badge${got ? '' : ' locked'}" data-a="badge" data-id="${b.id}" aria-label="${esc(b.name)}${got ? '' : ', locked'}"><span class="medal">${ic(got ? b.icon : 'Lock')}${got && got.pinned ? `<span class="pin">${ic('Pin')}</span>` : ''}</span>${esc(b.name)}</button>`;
  }
  function viewProfile() {
    const pinned = P.BADGES.filter((b) => s.badges[b.id] && s.badges[b.id].pinned);
    const earned = Object.keys(s.badges).length;
    return `<div class="profile-head">${avatar('lg')}<h2>${esc(s.profile.name)}</h2><p>${esc(P.describeHome(s.profile))}</p>
        ${pinned.length ? `<div class="pinned">${pinned.map((b) => `<span class="medal" title="${esc(b.name)}">${ic(b.icon)}</span>`).join('')}</div>` : ''}</div>
      <section class="section"><div class="stats"><div><span>Points earned</span><b class="num">${fmt(P.lifetime(s))}</b></div><div><span>Months logged</span><b class="num">${Object.keys(s.months).length}</b></div><div><span>Goals reached</span><b class="num">${s.goals.filter((g) => g.status === 'reached').length}</b></div><div><span>Rewards redeemed</span><b class="num">${s.redemptions.length}</b></div></div></section>
      <section class="section">${sectionHead('Badges', `${earned} of ${P.BADGES.length}`)}<div class="card"><div class="badges">${[...P.BADGES].sort((a, b) => !!s.badges[b.id] - !!s.badges[a.id]).map(badgeTile).join('')}</div><p class="hint" style="margin-top:8px">Tap a badge to see how it's earned. Pin up to three to the top of your profile.</p></div></section>
      <section class="section">${sectionHead('Household', `<button class="link" data-a="household">Edit</button>`)}<div class="list"><div class="row"><span class="chip-icon">${ic(P.HOUSING.find((h) => h.id === s.profile.housing).icon)}</span><div class="row-main"><div class="row-title">${esc(P.HOUSING.find((h) => h.id === s.profile.housing).name)}, ${s.profile.area} m²</div><div class="row-sub">${esc(P.APPLIANCES.filter((a) => s.profile.appliances.includes(a.id)).map((a) => (a.id === 'other' ? s.profile.otherNote || 'Something else' : a.name)).join(', ') || 'No appliances listed')}</div></div></div></div></section>
      <section class="section"><div class="list"><button class="row" data-a="settings"><span class="chip-icon">${ic('Settings')}</span><div class="row-main"><div class="row-title">Settings</div><div class="row-sub">Notifications, sounds and household</div></div>${ic('ChevronRight')}</button></div></section>
      <section class="section">${sectionHead('Points history', `${fmt(P.available(s))} to spend`)}<div class="list">${s.ledger.slice(-12).reverse().map((l) => `<div class="ledger-row"><span>${esc(l.reason)}<span class="muted"> · ${dateShort(l.at)}</span></span><b class="num ${l.amount < 0 ? 'neg' : 'pts'}">${l.amount > 0 ? '+' : '−'}${Math.abs(l.amount)}</b></div>`).join('')}</div></section>`;
  }

  /* ---------- settings ---------- */
  const switchBtn = (on, label, attrs) => `<button class="switch" role="switch" aria-checked="${!!on}" aria-label="${esc(label)}" ${attrs}></button>`;
  const toggleRow = (title, sub, on, attrs, lead = '') => `<div class="toggle-row">${lead}<div class="row-main"><div class="row-title" style="font-size:14.5px">${title}</div>${sub ? `<div class="row-sub">${sub}</div>` : ''}</div>${switchBtn(on, stripTags(title), attrs)}</div>`;
  function viewSettings() {
    const n = s.notify;
    return `<section class="section">${sectionHead('Notifications')}<div class="list">
        ${toggleRow('Price and saving tips', 'Cheap hours, price peaks and small things to try at home', n.tips, 'data-a="notify" data-key="tips"', `<span class="chip-icon elec">${ic('Moon', 'sm')}</span>`)}
        ${toggleRow('Reminders for planned runs', 'When it\'s time to start something you planned in Recommendations', n.plans !== false, 'data-a="notify" data-key="plans"', `<span class="chip-icon">${ic('CalendarClock', 'sm')}</span>`)}
      </div></section>
      <section class="section">${sectionHead('Sound')}<div class="list">${toggleRow('Sound effects', 'Taps, notifications and calls. Vibration where the phone supports it.', window.PBFX ? PBFX.enabled() : false, 'data-a="sound"', `<span class="chip-icon">${ic('Volume2', 'sm')}</span>`)}</div></section>
      <section class="section">${sectionHead('Household')}<div class="list"><button class="row" data-a="household"><span class="chip-icon">${ic(P.HOUSING.find((h) => h.id === s.profile.housing).icon)}</span><div class="row-main"><div class="row-title">Edit your household</div><div class="row-sub">${esc(P.describeHome(s.profile))}</div></div>${ic('ChevronRight')}</button></div><p class="hint">Changing this updates the "homes like yours" comparison.</p></section>`;
  }

  /* ---------- live data ---------- */
  /* Today's 24 hourly prices as small bars: green hours in green, past hours faded, this hour outlined. */
  function priceStrip(list, now, green) {
    const W = 150, Hh = 52, gap = 1.6, bw = W / 24 - gap, max = Math.max(...list) * 1.05;
    const bars = list.map((v, i) => { const bh = Math.max(3, v / max * (Hh - 6)), x = i * (bw + gap) + gap / 2; return `<rect class="${green.has(i) ? 'g' : 'o'}${i < now ? ' past' : ''}${i === now ? ' now' : ''}" x="${x.toFixed(1)}" y="${(Hh - bh).toFixed(1)}" width="${bw.toFixed(1)}" height="${bh.toFixed(1)}" rx="1.5"/>`; }).join('');
    return `<svg class="spark pstrip" viewBox="0 0 ${W} ${Hh}" preserveAspectRatio="none" aria-hidden="true">${bars}</svg>`;
  }
  function updateLive() {
    if (!s) return;
    const n = P.now(s), set = (k, v) => { for (const el of $$(`[data-live="${k}"]`)) if (el.textContent !== v) el.textContent = v; };
    set('price', fmt(P.priceAt(s, n), 2));
    $('#clock').textContent = clock(n);
  }
  const reduceMotion = () => window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  function tick() {
    if (!s) return;
    const results = P.sync(s);
    if (ui.lastDay && ui.lastDay !== P.today(s)) { render(); }
    ui.lastDay = P.today(s);
    // A new hour means a new price: redraw Home and Plan, where it's shown.
    const hour = P.now(s).getHours();
    if (ui.lastHour !== undefined && ui.lastHour !== hour && !ui.page && ['home', 'plan'].includes(ui.tab) && !ui.sheet && !(document.activeElement && /INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName))) render();
    ui.lastHour = hour;
    if (results.length) { celebrate(results); render(); }
    remindRuns();
    const t = Date.now();
    if (s.live) {
      // Household tips now and then, paused while a call is on screen.
      if (callBusy()) ui.nextNotify = Math.max(ui.nextNotify, t + 15000); // quiet during a call and just after it
      else if (t > ui.nextNotify) { ui.nextNotify = t + NOTIFY_GAP[0] + Math.random() * (NOTIFY_GAP[1] - NOTIFY_GAP[0]); pushTip(); }
    }
    updateLive();
    if (t - (ui.lastSave || 0) > 10000) { save(); ui.lastSave = t; }
  }
  const stripTags = (h) => h.replace(/<[^>]+>/g, '');
  /* When a planned run's start time comes, say so: a banner and a line in the bell's list. */
  function remindRuns() {
    const due = P.dueRuns(s);
    if (!due.length) return;
    if (s.notify.plans === false) { save(); return; }
    for (const p of due) {
      const a = P.APPLIANCES.find((x) => x.id === p.appliance), price = P.priceAt(s, P.now(s));
      const body = `Electricity is ${fmt(price, 2)} kr/kWh now${p.green ? ', a green hour' : ''}. Mark it done in Recommendations when it has run.`;
      addNote({ kind: 'plan', icon: 'CalendarClock', title: `Time to start: ${a.cycle.name.toLowerCase()}`, body, go: 'plan' }, { icon: 'CalendarClock', text: `<b>Time to start: ${esc(a.cycle.name.toLowerCase())}</b>`, sub: body, go: 'plan', sound: 'tip', tone: 'tip' });
    }
  }
  /* ---------- incoming notifications ----------
     A household tip every 2.5-4 minutes. Each one also lands in the bell's list. */
  const NOTIFY_GAP = [150000, 240000];
  const callBusy = () => !!(window.PBCall && PBCall.busy()) || !!(window.PBFeedback && PBFeedback.isBusy());
  function ringBell() { const b = $('[data-a="notes"]'); if (b) { b.classList.remove('ring'); void b.offsetWidth; b.classList.add('ring'); } }
  function addNote(n, toastOpts) {
    const item = P.note(s, n);
    if (toastOpts) toast({ ...toastOpts, sound: toastOpts.sound || (n.kind === 'tip' ? 'tip' : 'notify') });
    softRender(); ringBell(); save();
    return item;
  }
  function pushTip(force = false) {
    if (!s || (!force && !s.notify.tips)) return;
    const tip = P.nextTip(s);
    addNote(tip, { icon: tip.icon, text: `<b>${esc(tip.title)}</b>`, sub: tip.body, go: tip.go, tone: 'tip' });
  }
  /* Re-render only when it won't disturb typing or an open sheet. */
  function softRender() {
    if (ui.sheet) return;
    const a = document.activeElement;
    if (a && /INPUT|SELECT|TEXTAREA/.test(a.tagName) && $('#app').contains(a)) return;
    if (['home', 'goals'].includes(ui.tab) || ui.page) render(); else { const h = $('.top'); if (h) h.outerHTML = header(); }
  }

  /* ---------- toast ---------- */
  /* Banners drop in like a phone notification, slide away up, and can be swiped up to dismiss. */
  function toast(t) {
    if (document.body.dataset.call === 'ringing' || document.body.dataset.call === 'active') return; // a full-screen call hides banners
    ui.toasts.push(t); if (ui.toasts.length > 3) ui.toasts.shift();
    if (!ui.toastOn) nextToast();
  }
  function hideToast(then) {
    const el = $('#toast');
    clearTimeout(ui.toastTimer);
    if (el.hidden || reduceMotion()) { el.hidden = true; return then(); }
    el.classList.add('out');
    setTimeout(() => { el.classList.remove('out'); el.style.transform = ''; el.hidden = true; then(); }, 240);
  }
  function nextToast() {
    const el = $('#toast'), t = ui.toasts.shift();
    if (!t) { el.hidden = true; ui.toastOn = false; return; }
    ui.toastOn = true;
    el.innerHTML = `<span class="toast-icon${t.tone === 'tip' ? ' tip' : ''}">${ic(t.icon || 'Check', 'sm')}</span><div class="toast-text"><span class="toast-app">PowerBuddy<em>now</em></span>${t.text}${t.sub ? `<small>${esc(t.sub)}</small>` : ''}</div>`;
    el.hidden = false; el.classList.remove('out'); el.style.transform = ''; el.style.animation = 'none'; void el.offsetWidth; el.style.animation = '';
    if (t.sound && window.PBFX) { PBFX.play(t.sound); PBFX.vibrate(t.sound === 'notify' || t.sound === 'tip' ? [12, 60, 12] : 8); }
    el.onclick = () => {
      if (ui.toastSwiped) { ui.toastSwiped = false; return; }
      if (t.onTap) { hideToast(nextToast); t.onTap(); return; }
      if (t.go && s) { ui.page = null; ui.tab = t.go; closeSheet(true); render(); }
      hideToast(nextToast);
    };
    clearTimeout(ui.toastTimer); ui.toastTimer = setTimeout(() => hideToast(nextToast), 4600);
    $('#announcer').textContent = stripTags(t.text);
  }
  (() => {
    const el = $('#toast'); let y0 = null, dy = 0;
    el.addEventListener('pointerdown', (e) => { y0 = e.clientY; dy = 0; el.style.transition = 'none'; });
    window.addEventListener('pointermove', (e) => { if (y0 === null) return; dy = Math.min(0, unfit(e.clientY - y0)); el.style.transform = `translateY(${dy}px)`; });
    window.addEventListener('pointerup', () => {
      if (y0 === null) return; y0 = null; el.style.transition = '';
      if (dy < -24) { ui.toastSwiped = true; setTimeout(() => { ui.toastSwiped = false; }, 400); hideToast(nextToast); } else el.style.transform = '';
    });
  })();

  /* ---------- sheets ---------- */
  function openSheet(type, data = {}) {
    const el = $('#sheet'), wasOpen = !el.hidden && !el.classList.contains('closing');
    ui.sheet = { type, ...data }; renderSheet();
    if (!wasOpen) { el.classList.remove('anim'); void el.offsetWidth; el.classList.add('anim'); if (window.PBFX) PBFX.play('open'); }
  }
  /* Slides the sheet down before removing it. instant skips the animation (e.g. when navigating away). */
  function closeSheet(instant) {
    const had = !!ui.sheet; ui.sheet = null;
    const el = $('#sheet'), token = ++ui.sheetToken;
    if (el.hidden) return;
    const done = () => { if (token !== ui.sheetToken) return; el.classList.remove('closing', 'anim'); el.hidden = true; el.innerHTML = ''; emitRender(); };
    if (instant === true || reduceMotion()) return done();
    if (had && window.PBFX) PBFX.play('close');
    el.classList.add('closing');
    setTimeout(done, 230);
  }
  /* An open sheet is updated in place: only its title and body are replaced, so it doesn't slide up again
     (which looked like a reload) and, for the same sheet, keeps its scroll position and focus. */
  const focusKey = (n) => (n && n.dataset ? ['a', 'val', 'id', 'field', 'input', 'change'].map((k) => n.dataset[k] || '').join('|') : '');
  function renderSheet() {
    const el = $('#sheet'), sh = ui.sheet;
    if (!sh) return closeSheet();
    const open = !el.hidden && !el.classList.contains('closing') && $('.sheet', el);
    ++ui.sheetToken; el.classList.remove('closing');
    const [title, body] = SHEETS[sh.type](sh), gliders = el.hidden ? null : snapSegs(el);
    if (open) {
      const bodyEl = $('.sheet-body', open), same = el.dataset.type === sh.type, top = bodyEl.scrollTop;
      const active = same && open.contains(document.activeElement) ? focusKey(document.activeElement) : null;
      $('#sheet-title', open).innerHTML = title;
      bodyEl.innerHTML = body;
      bodyEl.scrollTop = same ? top : 0;
      if (active) { const again = $$('[data-a], [data-input], [data-change]', bodyEl).find((x) => focusKey(x) === active); if (again) again.focus({ preventScroll: true }); }
    } else {
      el.innerHTML = `<div class="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title"><div class="sheet-grip" aria-hidden="true"></div><div class="sheet-head"><h2 id="sheet-title">${title}</h2><button class="icon-btn" data-a="close" aria-label="Close">${ic('X')}</button></div><div class="sheet-body">${body}</div></div>`;
      bindSheetDrag(el);
    }
    const isNew = !open || el.dataset.type !== sh.type;
    el.dataset.type = sh.type;
    el.hidden = false;
    initSegs(el, gliders);
    emitRender();
    bindCharts(el);
    const first = $('.sheet-body input, .sheet-body select, .sheet-body button', el) || $('[data-a="close"]', el);
    if (first && !sh.noFocus && isNew) first.focus({ preventScroll: true });
    if (sh.type === 'goal') updateGoalSheet();
  }
  /* Pull the sheet down by its grip or title bar to dismiss it. */
  function bindSheetDrag(layer) {
    const sheet = $('.sheet', layer), handle = [$('.sheet-grip', layer), $('.sheet-head', layer)];
    let y0 = null, dy = 0;
    const down = (e) => { if (e.target.closest('button')) return; y0 = e.clientY; dy = 0; sheet.style.transition = 'none'; try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* not capturable */ } };
    const move = (e) => { if (y0 === null) return; dy = Math.max(0, unfit(e.clientY - y0)); sheet.style.transform = `translateY(${dy}px)`; };
    const up = () => {
      if (y0 === null) return; y0 = null; sheet.style.transition = 'transform .28s var(--spring)';
      if (dy > 110) { sheet.style.transform = 'translateY(100%)'; closeSheet(); } else sheet.style.transform = '';
    };
    for (const h of handle) { if (!h) continue; h.addEventListener('pointerdown', down); h.addEventListener('pointermove', move); h.addEventListener('pointerup', up); h.addEventListener('pointercancel', up); }
  }
  function field(label, html, error) { return `<label class="field"><span>${label}</span>${html}${error ? `<span class="field-error">${esc(error)}</span>` : ''}</label>`; }
  function missingMonths() { const out = []; for (let i = 1; i <= 12; i++) { const m = H.addMonths(P.thisMonth(s), -i); out.push(m); } return out; }
  const SHEETS = {
    notes() {
      const items = s.notes;
      const row = (n) => {
        const title = n.title || '', body = n.body || '', isNew = !n.read;
        const lead = `<span class="chip-icon ${n.kind === 'tip' ? 'elec' : n.kind === 'call' ? 'bad' : isNew ? 'brand' : ''}">${ic(n.icon || 'Bell')}</span>`;
        const inner = `${lead}<div class="row-main"><div class="row-title note-title">${esc(title)}</div>${body ? `<div class="row-sub">${esc(body)}</div>` : ''}<div class="row-sub note-when">${ago(n.at)}</div></div>`;
        const dot = isNew ? '<span class="dot" aria-label="New"></span>' : '';
        if (n.action === 'callback') return `<div class="row note${isNew ? ' unread' : ''}">${inner}<button class="btn primary small" data-a="callback" data-id="${n.id}">${ic('Phone', 'sm')}Call back</button></div>`;
        return n.go ? `<button class="row note${isNew ? ' unread' : ''}" data-a="note-go" data-go="${n.go}" data-id="${n.id}">${inner}${dot}</button>` : `<div class="row note${isNew ? ' unread' : ''}" data-a="note-read" data-id="${n.id}">${inner}${dot}</div>`;
      };
      // One list, newest first. Unread rows are marked in place, so reading them never regroups the list.
      return ['Notifications', `${items.length ? `${noteHead()}<div class="list">${items.map(row).join('')}</div>` : '<div class="empty">Nothing yet.</div>'}
        <div class="btn-row"><button class="btn secondary" data-a="settings">${ic('Settings', 'sm')}Notification settings</button></div>`];
    },
    estimate() {
      const p = s.profile, est = P.estimate(p), m = P.thisMonth(s);
      const rows = (r) => est[r].parts.map((x) => `<tr><td>${esc(x.name)}</td><td class="num">${r === 'water' ? fmt(x.m3, 1) + ' m³' : fmt(x.kwh) + ' kWh'}</td></tr>`).join('');
      return ['Homes like yours', `<p class="small" style="color:var(--ink-2)">We estimate a typical year for <b>${esc(P.describeHome(p))}</b>, add up what each part of the home usually uses, then spread it over the months. Winter months get more electricity for lighting${p.heating === 'heatpump' || p.heating === 'electric' ? ' and heating' : ''}.</p>
        <div class="card" style="margin-top:14px;padding:4px 16px"><details class="table" open><summary>Electricity: ${fmt(est.electricity.year)} kWh a year · ${fmt(P.typicalMonth(p, 'electricity', m))} in ${H.monthName(m)}</summary><table><tbody>${rows('electricity')}</tbody></table></details>
        <details class="table"><summary>Water: ${fmt(est.water.year)} m³ a year · ${fmt(P.typicalMonth(p, 'water', m), 1)} in ${H.monthName(m)}</summary><table><tbody>${rows('water')}</tbody></table></details></div>
        <div class="alert info">${ic('Info', 'sm')}<span>Figures are rounded estimates for a Danish home, built from typical appliance use. They're a reference point, not a bill.</span></div>
        <div class="btn-row"><button class="btn secondary" data-a="household">Edit household</button></div>`];
    },
    reading(sh) {
      const opts = missingMonths(), m = sh.month || opts.find((x) => !s.months[x]) || opts[0], e = sh.errors || {}, v = sh.values || {}, cur = s.months[m];
      const te = P.typicalMonth(s.profile, 'electricity', m), tw = P.typicalMonth(s.profile, 'water', m);
      // The months entered so far sit under the form: tap one to correct it, or a missing one to add it.
      const SRC = { bill: 'Entered', manual: 'Entered', sample: 'Sample' };
      const history = Array.from({ length: 12 }, (_, i) => H.addMonths(P.thisMonth(s), -1 - i)).map((mm) => {
        const x = s.months[mm], sel = mm === m;
        const inner = `<div class="row-main"><div class="row-title">${H.monthName(mm)} ${mm.slice(0, 4)}</div><div class="row-sub">${x ? `${fmt(x.e)} kWh · ${fmt(x.w, 1)} m³` : 'Not entered yet'}</div></div>`;
        const end = sel ? '<span class="tag brand">Editing</span>' : x ? `<span class="tag">${SRC[x.src] || x.src}</span>` : '<span class="tag warn">Add</span>';
        return `<button type="button" class="row month-row${sel ? ' on' : ''}" data-a="reading-pick" data-month="${mm}" aria-pressed="${sel}">${inner}${end}</button>`;
      }).join('');
      return [cur ? 'Correct a month' : 'Add monthly data', `<form data-form="reading" novalidate>
        <p class="small muted">Type in what you used in the month. Homes like yours use about ${fmt(te)} kWh and ${fmt(tw, 1)} m³ in ${H.monthName(m)}.</p>
        ${field('Month', `<select class="select" name="month" data-change="reading-month">${opts.map((x) => `<option value="${x}"${x === m ? ' selected' : ''}>${H.monthName(x)} ${x.slice(0, 4)}${s.months[x] ? ' (entered)' : ''}</option>`).join('')}</select>`, e.month)}
        ${field('Electricity', `<div class="input-unit"><input class="input" name="e" inputmode="decimal" value="${esc(v.e ?? (cur ? cur.e : ''))}" aria-invalid="${!!e.e}" autocomplete="off"><b>kWh</b></div>`, e.e)}
        ${field('Water', `<div class="input-unit"><input class="input" name="w" inputmode="decimal" value="${esc(v.w ?? (cur ? cur.w : ''))}" aria-invalid="${!!e.w}" autocomplete="off"><b>m³</b></div>`, e.w)}
        ${(sh.warnings || []).map((w) => `<div class="alert warn">${ic('CircleAlert', 'sm')}<span>${esc(w)}</span></div>`).join('')}
        <div class="btn-row"><button class="btn primary" type="submit">${sh.warnings && sh.warnings.length ? 'Save anyway' : 'Save'}</button></div>
        ${!s.ledger.some((l) => l.id === 'reading-' + m) ? '<p class="hint" style="text-align:center">+10 points for entering a month</p>' : ''}</form>
        <div class="section-head" style="margin-top:22px"><h2>Monthly consumption</h2><span class="meta">last 12 months</span></div>
        <div class="list">${history}</div>`];
    },
    goal(sh) {
      const r = sh.resource || 'electricity', keep = sh.kind === 'keep', months = sh.months || 1;
      const times = P.GOAL_TIMES.map((v) => [v, v === 1 ? 'This month' : `${v} months`]);
      return ['New goal', `<form data-form="goal">
        <p class="small muted">Goals are checked against the monthly numbers you enter, compared with your usual for that time of year.</p>
        <div class="field"><span>Your aim</span><div class="seg" role="group">${[['cut', 'Use less'], ['keep', 'Keep it steady']].map(([v, l]) => `<button type="button" data-a="goal-kind" data-val="${v}" aria-pressed="${(sh.kind || 'cut') === v}">${l}</button>`).join('')}</div>
          <p class="hint">${keep ? 'Already where you want to be? Stay there: at or under your usual, or under what similar homes use.' : 'Cut back by a set percentage compared with your usual.'}</p></div>
        <div class="field"><span>${keep ? 'What to keep steady' : 'What to cut'}</span><div class="seg" role="group">${[['electricity', 'Electricity'], ['water', 'Water'], ['both', 'Both']].map(([v, l]) => `<button type="button" data-a="goal-res" data-val="${v}" aria-pressed="${r === v}">${l}</button>`).join('')}</div></div>
        ${keep ? `<div class="field"><span>Stay at or under</span><div class="seg" role="group">${[['usual', 'Your usual'], ['typical', 'Similar homes']].map(([v, l]) => `<button type="button" data-a="goal-bench" data-val="${v}" aria-pressed="${(sh.bench || 'usual') === v}">${l}</button>`).join('')}</div></div>`
          : `<label class="field"><span>By how much: <b data-bind="target">${sh.target || 5}%</b></span><input class="range" type="range" name="target" min="3" max="30" step="1" value="${sh.target || 5}" data-input="goal"></label>`}
        <div class="field"><span>${keep ? 'How long to keep it up' : 'How long you\'ll give it'}</span><div class="seg" role="group">${times.map(([v, l]) => `<button type="button" data-a="goal-months" data-val="${v}" aria-pressed="${months === v}">${l}</button>`).join('')}</div>
          <p class="hint" data-bind="time"></p></div>
        <div data-bind="baseline" class="small" style="margin-top:14px;color:var(--ink-2)"></div>
        <div class="estimate"><div><p>Estimated reward</p><p class="small muted" data-bind="why"></p></div><b class="num" data-bind="points">–</b></div>
        <div data-bind="warn"></div>
        <div class="btn-row"><button class="btn primary" type="submit">Start goal</button></div></form>`];
    },
    reward(sh) {
      const r = P.REWARDS.find((x) => x.id === sh.id), v = s.redemptions.find((x) => x.rewardId === r.id), short = r.cost - P.available(s);
      return [esc(r.name), `<div class="ch-head"><span class="chip-icon brand">${ic(r.icon)}</span><div><div class="row-title">${esc(r.partner)}</div><span class="tag brand" style="margin-top:4px">${P.PARTNER_TEST[r.cat]}</span></div></div>
        <div class="alert info">${ic('Leaf', 'sm')}<span><b>Why this partner:</b> ${esc(r.why)}</span></div>
        ${v ? `<p class="small muted" style="margin-top:14px">Your code, redeemed ${dateShort(v.at)}. Show it in the shop or enter it online. It works once.</p><div class="code">${esc(v.code)}</div><div class="btn-row"><button class="btn secondary" data-a="copy" data-text="${esc(v.code)}">${ic('Copy', 'sm')}Copy code</button></div>`
          : `<div class="btn-row"><button class="btn primary" data-a="redeem" data-id="${r.id}"${short > 0 ? ' disabled' : ''}>${short > 0 ? `${short} more points needed` : `Redeem for ${r.cost} points`}</button></div><p class="hint" style="text-align:center">Codes are single-use and tied to your account.</p>`}`];
    },
    badge(sh) {
      const b = P.BADGES.find((x) => x.id === sh.id), got = s.badges[b.id];
      return [esc(b.name), `<div class="celebrate"><span class="medal xl" style="margin:0 auto;${got ? '' : 'background:var(--sunken);color:var(--faint);box-shadow:inset 0 0 0 2px var(--line-2)'}">${ic(got ? b.icon : 'Lock')}</span>
        <p style="margin-top:14px">${esc(b.how)}</p><p class="small muted" style="margin-top:6px">${got ? `Earned ${dateShort(got.at)}` : 'Not earned yet'}</p></div>
        ${got ? `<div class="btn-row"><button class="btn ${got.pinned ? 'secondary' : 'primary'}" data-a="pin" data-id="${b.id}">${ic('Pin', 'sm')}${got.pinned ? 'Unpin from profile' : 'Pin to profile'}</button></div>` : badgeHelp(b)}
        ${sh.error ? `<div class="alert warn">${esc(sh.error)}</div>` : ''}`];
    },
    /* How an active goal is holding up, month by month: each month's aim, and the result once its numbers are in. */
    goalDetail(sh) {
      const g = s.goals.find((x) => x.id === sh.id);
      if (!g) return ['Goal', '<div class="empty">This goal has ended.</div>'];
      const p = P.goalProgress(s, g), keep = g.kind === 'keep', cur = P.thisMonth(s), res = P.goalResources(g);
      const head = p.reduction === null ? 'No result yet' : keep ? (p.onTrack ? 'On track' : 'Over for now') : 'Not there yet';
      const rows = P.goalMonths(g).map((mm) => {
        const aim = (r) => (g.bench === 'typical' ? P.typicalMonth(s.profile, r, mm) : P.usual(s, r, mm)) * (1 - (keep ? 0 : g.target) / 100);
        const parts = res.map((r) => { const v = P.monthValue(s, r, mm); return `${res.length > 1 ? resName(r) + ': ' : ''}${v === null ? `aim ≤ ${fmtRes(r, aim(r))} ${unit(r)}` : `${fmtRes(r, v)} ${unit(r)}, aim ≤ ${fmtRes(r, aim(r))}`}`; }).join(' · ');
        const result = p.results.find((x) => x.m === mm);
        const end = result ? `<span class="tag ${result.under >= (keep ? 0 : g.target) ? 'low' : 'warn'}">${signed(-result.under, 1)}</span>`
          : mm < cur ? `<button class="btn secondary small" data-a="reading" data-month="${mm}">Add numbers</button>`
          : mm === cur ? '<span class="tag">This month</span>' : '<span class="tag">Later</span>';
        return `<div class="row"><div class="row-main"><div class="row-title">${H.monthName(mm)} ${mm.slice(0, 4)}</div><div class="row-sub">${parts}</div></div>${end}</div>`;
      }).join('');
      const how = keep ? `On average over the time frame, stay at or under ${goalBenchName(g)}. Each month counts once its numbers are in, after the month ends.`
        : `One month at ${signed(-g.target)} or better against your usual and the goal is reached. Each month counts once its numbers are in, after the month ends.`;
      const r0 = g.resource === 'both' ? 'electricity' : g.resource;
      return [esc(P.goalLabel(g)), `<div class="ch-head"><span class="chip-icon brand">${ic(keep ? 'ShieldCheck' : 'Target')}</span><div style="flex:1"><div class="row-title">${head}</div><p class="small muted">${esc(timeFrame(g))} · worth ${g.est} points</p></div></div>
        <div class="list" style="margin-top:14px">${rows}</div>
        <p class="hint">${how}</p>
        <div class="btn-row"><button class="btn primary" data-a="go" data-tab="plan">${ic('Lightbulb', 'sm')}Ideas to cut back</button><button class="btn secondary" data-a="go" data-tab="usage" data-res="${r0}">${ic('ChartColumn', 'sm')}See consumption</button></div>`];
    },
    household(sh) {
      const d = sh.d;
      return ['Your household', `<form data-form="household">${householdFields(d)}<p class="hint">Changing this updates the "homes like yours" estimate. Your logged months stay as they are.</p><div class="btn-row"><button class="btn primary" type="submit">Save</button></div></form>`];
    },
    celebrate(sh) {
      const main = sh.items.find((x) => x.type === 'goal') || sh.items[0];
      const badges = sh.items.filter((x) => x.type === 'badge'), pts = H.sum(sh.items.map((x) => x.points || 0));
      const moreGoals = sh.items.filter((x) => x.type === 'goal' && x !== main);
      return [main.type === 'badge' ? 'New badge' : moreGoals.length ? 'Goals reached' : 'Goal reached', `<div class="celebrate"><div class="burst">${ic(main.type === 'badge' ? P.BADGES.find((b) => b.id === main.id).icon : 'Target')}</div>
        <h3>${esc(main.title)}</h3>${moreGoals.length ? `<p style="margin-top:4px">Also reached: ${moreGoals.map((x) => esc(x.title)).join(', ')}</p>` : ''}${pts ? `<div class="gain">+${pts}</div><p>points</p>` : ''}
        ${badges.length && main.type !== 'badge' ? `<p style="margin-top:8px">${ic('Award', 'sm')} New badge: ${badges.map((b) => esc(b.title)).join(', ')}</p>` : badges.length > 1 ? `<p style="margin-top:8px">Also: ${badges.slice(1).map((b) => esc(b.title)).join(', ')}</p>` : ''}</div>
        <div class="btn-row"><button class="btn primary" data-a="close">Done</button></div>`];
    }
  };
  function updateGoalSheet() {
    const sh = ui.sheet; if (!sh || sh.type !== 'goal') return;
    const r = sh.resource || 'electricity', target = sh.target || 5, months = sh.months || 1, m = P.thisMonth(s), keep = sh.kind === 'keep', typical = keep && sh.bench === 'typical';
    const eff = P.efficient(s, r), pts = P.goalPoints({ kind: sh.kind, target, months, resource: r, efficient: eff }), end = H.addMonths(m, months - 1), last = P.lastEntered(s);
    const set = (k, html) => { const el = $(`[data-bind="${k}"]`); if (el) el.innerHTML = html; };
    set('target', `${target}%`); set('points', `≈ ${pts} pts`);
    const speed = { 1: ' × 1.5 for one month', 3: ' × 1.2 for three months' }[months] || '';
    set('why', `${keep ? `25 × ${months} month${months > 1 ? 's' : ''}` : `8 × ${target}%${speed}`}${r === 'both' ? ' × 1.5 for both' : ''}${eff ? ' × 1.25 because you already use less than similar homes' : ''}`);
    set('time', keep
      ? `On average, stay at or under ${typical ? 'similar homes' : 'your usual'} ${months > 1 ? `from ${H.monthName(m)} to the end of ${H.monthName(end)}` : `in ${H.monthName(m)}`}. Judged once every month's numbers are in.`
      : months > 1 ? `Get ${target}% under your usual in any month up to the end of ${H.monthName(end)}. As soon as one month's numbers show it, the goal is reached.`
        : `Get ${target}% under your usual in ${H.monthName(m)}. You'll see if you made it when you enter its numbers.`);
    const res = r === 'both' ? ['electricity', 'water'] : [r];
    const over = [];
    set('baseline', res.map((x) => {
      const u = typical ? P.typicalMonth(s.profile, x, m) : P.usual(s, x, m), aim = u * (1 - (keep ? 0 : target) / 100);
      const lv = last && P.monthValue(s, x, last), lu = last && (typical ? P.typicalMonth(s.profile, x, last) : P.usual(s, x, last));
      if (keep && lv && lv > lu * 1.05) over.push(Math.round((lv / lu - 1) * 100));
      return `<div style="margin-top:4px">${ic(x === 'water' ? 'Droplet' : 'Zap', 'xs')} ${typical ? 'Similar homes' : 'Your usual'} in ${H.monthName(m)}: <b>${fmtRes(x, u)} ${unit(x)}</b> → ${keep ? 'stay at or under it' : `aim for <b>${fmtRes(x, aim)} ${unit(x)}</b>`}.${lv ? ` ${H.monthName(last)} was ${fmt(Math.abs(lv / lu - 1) * 100)}% ${lv <= lu ? 'under' : 'over'} ${typical ? 'similar homes' : 'its usual'}.` : ''}</div>`;
    }).join(''));
    set('warn', !keep && target > 15 ? `<div class="alert warn">${ic('CircleAlert', 'sm')}<span>Over 15% is a big change in one go. It's worth more points, but a smaller step you keep is better than a big one you don't.</span></div>`
      : over.length ? `<div class="alert warn">${ic('CircleAlert', 'sm')}<span>${H.monthName(last)} was about ${Math.max(...over)}% over. Cutting back a little first might be the easier start.</span></div>` : '');
  }
  /* For a badge not earned yet: where you stand and what to do next. Uses the latest month entered. */
  function badgeHelp(b) {
    const last = P.lastEntered(s);
    const go = (label, attrs, primary = true) => `<button class="btn ${primary ? 'primary' : 'secondary'}" ${attrs}>${label}</button>`;
    const resRow = (r, cut) => { if (!last) return ''; const v = P.monthValue(s, r, last), u = P.usual(s, r, last); return `<div class="row"><span class="chip-icon ${r === 'water' ? 'water' : 'elec'}">${ic(r === 'water' ? 'Droplet' : 'Zap')}</span><div class="row-main"><div class="row-title">${resName(r)} in ${H.monthName(last)}</div><div class="row-sub">${fmtRes(r, v)} ${unit(r)}. ${cut ? `${cut}% under your usual would be ${fmtRes(r, u * (1 - cut / 100))}.` : `Your usual was ${fmtRes(r, u)}.`}</div></div>${delta(P.change(s, r, last), 1)}</div>`; };
    const usageBtns = (r = 'electricity') => go(`${ic('ChartColumn', 'sm')}See consumption`, `data-a="go" data-tab="usage" data-res="${r}"`, false) + go(`${ic('Lightbulb', 'sm')}Ideas to cut back`, 'data-a="go" data-tab="plan"');
    const latest = last ? ' Your latest month:' : ' Enter a month to see where you stand.';
    let text = '', rows = '', btns = '';
    const active = s.goals.find((g) => g.status === 'active');
    switch (b.id) {
      case 'first-reading': text = 'Type in one month of electricity and water. It takes a minute.'; btns = go('Add monthly data', 'data-a="reading"'); break;
      case 'steady': { const n = P.loggedStreak(s, H.addMonths(P.thisMonth(s), -1)); text = `You have ${n} month${n === 1 ? '' : 's'} in a row logged. Three earns it. Sample months don't count.`; btns = go('Add monthly data', 'data-a="reading"'); break; }
      case 'goal-getter': text = active ? `${P.goalLabel(active)} is running. ${goalState(active, P.goalProgress(s, active)).long}.` : 'Set a goal and reach it.'; btns = active ? go('See your goal', `data-a="goal-detail" data-id="${active.id}"`) : go('Set a goal', 'data-a="goal"'); break;
      case 'ten-club': text = 'Log a month 10% under your usual on either one.' + latest; rows = resRow('electricity', 10) + resRow('water', 10); btns = usageBtns(); break;
      case 'water-wise': text = 'Log a month with water 10% under your usual.' + latest; rows = resRow('water', 10); btns = usageBtns('water'); break;
      case 'balance': text = 'Log a month under your usual on both.' + latest; rows = resRow('electricity') + resRow('water'); btns = usageBtns(); break;
      case 'comeback': {
        const c = last ? P.change(s, 'electricity', last) : null;
        text = c !== null && c > 0 ? `${H.monthName(last)} was ${signed(c, 1)} on electricity. Log a month back under your usual to earn it.` : `This one is for bouncing back after a month over your usual. ${last ? `${H.monthName(last)} wasn't over` : 'Nothing is entered yet'}, so there's nothing to win back right now.`;
        rows = resRow('electricity'); btns = usageBtns(); break;
      }
      case 'off-peak': text = `${s.greenRuns} of 10 loads run in green hours so far.`; rows = `<div class="bar" style="margin-top:10px"><i style="width:${Math.min(1, s.greenRuns / 10) * 100}%"></i></div>`; btns = go('Plan a run', 'data-a="go" data-tab="plan"'); break;
      default: return '';
    }
    return `<div class="badge-help"><p class="small" style="font-weight:600">How to get there</p><p class="small" style="color:var(--ink-2);margin-top:4px">${esc(text)}</p>${rows && rows.startsWith('<div class="row') ? `<div class="list" style="margin-top:10px">${rows}</div>` : rows}<div class="btn-row">${btns}</div></div>`;
  }

  /* ---------- household fields (onboarding + edit) ---------- */
  function stepper(name, value, min, max, label) { return `<div class="stepper" role="group" aria-label="${label}"><button type="button" data-a="step" data-field="${name}" data-delta="-1" aria-label="Fewer ${label}"${value <= min ? ' disabled' : ''}>${ic('Minus')}</button><output>${value}</output><button type="button" data-a="step" data-field="${name}" data-delta="1" aria-label="More ${label}"${value >= max ? ' disabled' : ''}>${ic('Plus')}</button></div>`; }
  function householdFields(d, part = 'all') {
    const parts = {
      place: field('Region', `<select class="select" data-change="field" data-field="region">${P.REGIONS.map((r) => `<option value="${r.id}"${d.region === r.id ? ' selected' : ''}>${r.name} (price area ${r.area})</option>`).join('')}</select>`) + `<p class="hint">Your region sets your electricity price area and water price.</p>`,
      home: `<div class="choice-grid">${P.HOUSING.map((h) => `<button type="button" class="choice" data-a="choose" data-field="housing" data-val="${h.id}" aria-pressed="${d.housing === h.id}">${ic(h.icon)}${h.name}</button>`).join('')}</div>
        ${field(`Size: <b data-bind="area">${d.area} m²</b>`, `<input class="range" type="range" min="15" max="300" step="5" value="${d.area}" data-input="area" aria-label="Home size in square metres">`)}
        <div style="display:flex;gap:24px;margin-top:14px"><div><span class="small" style="font-weight:600;color:var(--ink-2);display:block;margin-bottom:6px">Adults</span>${stepper('adults', d.adults, d.children ? 0 : 1, 8, 'adults')}</div><div><span class="small" style="font-weight:600;color:var(--ink-2);display:block;margin-bottom:6px">Children</span>${stepper('children', d.children, 0, 8, 'children')}</div></div>`,
      heat: `<div class="choice-grid">${P.HEATING.map((h) => `<button type="button" class="choice" data-a="choose" data-field="heating" data-val="${h.id}" aria-pressed="${d.heating === h.id}">${ic(h.icon)}${h.name}<small>${h.note}</small></button>`).join('')}</div>
        <div class="field"><span>Hot water comes from</span></div><div class="seg" role="group" style="flex-wrap:wrap">${P.HOT_WATER.map((h) => `<button type="button" data-a="choose" data-field="hotWater" data-val="${h.id}" aria-pressed="${d.hotWater === h.id}">${h.name.replace('From the heating system', 'Heating system').replace('Electric water heater', 'Electric heater')}</button>`).join('')}</div>`,
      appliances: `<div class="check-list">${P.APPLIANCES.map((a) => `<button type="button" class="choice" role="checkbox" data-a="toggle-app" data-id="${a.id}" aria-checked="${d.appliances.includes(a.id)}">${ic(a.icon)}${a.name}</button>`).join('')}</div>
        ${d.appliances.includes('other') ? field('What else? (optional)', `<input class="input" data-input="other" value="${esc(d.otherNote || '')}" maxlength="40" placeholder="For example a sauna or an aquarium" autocomplete="off">`) + '<p class="hint">We add a small allowance for it to the estimate.</p>' : ''}`
    };
    if (part !== 'all') return parts[part];
    return `<div class="field"><span>Where</span></div>${parts.place}<div class="field"><span>Home</span></div>${parts.home}<div class="field"><span>Heating</span></div>${parts.heat}<div class="field"><span>Appliances</span></div>${parts.appliances}`;
  }

  /* ---------- onboarding ---------- */
  const OB_STEPS = ['welcome', 'name', 'place', 'home', 'heat', 'appliances', 'bills', 'consent', 'result'];
  const MARK = `<svg class="mark" viewBox="0 0 32 32" aria-hidden="true"><path d="M5 15.5 16 6l11 9.5V26a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1z" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/><path d="M9.5 19h3.5l2-4 2.5 7 2-3h3" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  function obProfile(d) { return { name: d.name.trim() || 'You', region: d.region, housing: d.housing, area: +d.area, adults: +d.adults, children: +d.children, heating: d.heating, hotWater: d.hotWater, appliances: d.appliances, otherNote: (d.otherNote || '').trim(), payment: d.payment }; }
  function obEstimateLine(d) {
    const p = obProfile(d), m = H.mkey(new Date());
    const w = P.typicalMonth(p, 'water', m);
    return `${ic('Gauge', 'sm')}<span>Homes like this use about <b>${fmt(P.typicalMonth(p, 'electricity', m))} kWh</b> of electricity and <b>${fmt(w, 1)} m³</b> of water (${fmt(Math.round(w * 10) * 100)} litres) in ${H.monthName(m)}.</span>`;
  }
  function viewOnboarding() {
    const ob = ui.ob, d = ob.d, step = OB_STEPS[ob.step], e = ob.errors || {};
    if (step === 'welcome') return `<div class="welcome">${MARK}<h1>Know what your home uses.</h1><p>PowerBuddy shows your electricity and water next to homes like yours, and helps you cut back.</p>
      <ul><li><span class="chip-icon elec">${ic('Gauge', 'sm')}</span>See usage and cost, month by month</li><li><span class="chip-icon water">${ic('Clock', 'sm')}</span>Run the washing machine when power is cheapest</li><li><span class="chip-icon brand">${ic('Target', 'sm')}</span>Set goals and earn rewards from sustainable partners</li></ul>
      <div class="actions"><button class="btn primary block" data-a="ob-next">Set up my home</button><button class="btn secondary block" data-a="ob-demo">Explore a demo home</button></div></div>`;
    const showEstimate = ['home', 'heat', 'appliances', 'bills'].includes(step);
    const progress = OB_STEPS.slice(1, -1).map((_, i) => `<i class="${i < ob.step ? 'on' : ''}"></i>`).join('');
    const bodies = {
      name: `<h1>What should we call you?</h1><p class="lead">We use it to greet you in the app. Your household details stay in this browser in the prototype.</p>${field('First name', `<input class="input" data-input="ob" data-field="name" value="${esc(d.name)}" maxlength="30" autocomplete="given-name" aria-invalid="${!!e.name}">`, e.name)}`,
      place: `<h1>Where do you live?</h1><p class="lead">PowerBuddy covers Denmark. Prices and water rates depend on where you are.</p>${field('Country', '<select class="select" disabled><option>Denmark</option></select>')}${householdFields(d, 'place')}`,
      home: `<h1>Tell us about your home</h1><p class="lead">This is what we compare you with. A family house and a one-room flat use very different amounts.</p>${householdFields(d, 'home')}${e.people ? `<span class="field-error">${esc(e.people)}</span>` : ''}`,
      heat: `<h1>How is it heated?</h1><p class="lead">Heating is the biggest swing in electricity use. If you're unsure, district heating is the most common in Danish cities.</p>${householdFields(d, 'heat')}`,
      appliances: `<h1>Which of these do you have?</h1><p class="lead">Pick what's in your home. It shapes the estimate and which tips we show.</p>${householdFields(d, 'appliances')}`,
      bills: `<h1>How do you pay for utilities?</h1><p class="lead">Many renters pay through their rent. That's fine: we'll estimate until you have numbers.</p>
        <div class="choice-grid"><button type="button" class="choice" data-a="choose" data-field="payment" data-val="bills" aria-pressed="${d.payment === 'bills'}">${ic('Receipt')}I get my own bills</button><button type="button" class="choice" data-a="choose" data-field="payment" data-val="rent" aria-pressed="${d.payment === 'rent'}">${ic('House')}It's in my rent</button></div>
        ${d.payment === 'bills' ? `<p class="small" style="margin-top:18px;font-weight:600">Your latest month (optional)</p>${field('Electricity', `<div class="input-unit"><input class="input" data-input="ob" data-field="billE" inputmode="decimal" value="${esc(d.billE)}" aria-invalid="${!!e.billE}"><b>kWh</b></div>`, e.billE)}${field('Water', `<div class="input-unit"><input class="input" data-input="ob" data-field="billW" inputmode="decimal" value="${esc(d.billW)}" aria-invalid="${!!e.billW}"><b>m³</b></div>`, e.billW)}` : ''}
        <label class="consent" style="border:0;margin-top:10px"><input type="checkbox" data-check="sample"${d.sample ? ' checked' : ''}><span>Fill the last 12 months with sample data<br><span class="muted small">Prototype only, so the charts have something to show.</span></span></label>`,
      consent: `<h1>Before we start</h1><p class="lead">Your household data stays in this browser in the prototype.</p>
        <label class="consent"><input type="checkbox" data-check="terms"${d.terms ? ' checked' : ''}><span>I accept the terms of use.</span></label>
        <label class="consent"><input type="checkbox" data-check="data"${d.data ? ' checked' : ''}><span>PowerBuddy may use my household details and readings to estimate usage and give suggestions. I can delete them at any time.</span></label>
        ${e.consent ? `<span class="field-error">${esc(e.consent)}</span>` : ''}`,
      result: (() => { const p = obProfile(d), m = H.mkey(new Date()), est = P.estimate(p); return `<div class="result-hero">${MARK.replace('class="mark"', 'class="mark" style="width:44px;height:44px;color:var(--brand)"')}<h1 style="margin-top:12px">Homes like yours</h1><p class="lead" style="margin-top:6px">${esc(P.describeHome(p))}</p>
        <div class="pair"><div><b class="num">${fmt(P.typicalMonth(p, 'electricity', m))}</b><span>kWh in ${H.monthName(m)}</span></div><div><b class="num">${fmt(P.typicalMonth(p, 'water', m), 1)}</b><span>m³ water in ${H.monthName(m)}</span></div></div></div>
        <p class="small" style="font-weight:600;margin-top:18px">Where electricity usually goes</p><div class="breakdown" style="margin-top:10px">${est.electricity.parts.slice(0, 4).map((x) => `<div class="bd-row"><span>${esc(x.name)}</span><span class="num muted">${fmt(x.kwh / est.electricity.year * 100)}%</span><div class="bar thin elec"><i style="width:${x.kwh / est.electricity.parts[0].kwh * 100}%"></i></div></div>`).join('')}</div>
        <p class="hint" style="margin-top:14px">We'll compare your own numbers with this every month. If something changes, you can update your household in the settings.</p>`; })()
    };
    const nextLabel = step === 'result' ? 'Go to my home' : step === 'consent' ? 'Create my profile' : 'Continue';
    return `<div class="ob"><div class="ob-top"><button class="icon-btn" data-a="ob-back" aria-label="Back">${ic('ChevronLeft')}</button>${step !== 'result' ? `<div class="ob-steps" aria-label="Step ${ob.step} of ${OB_STEPS.length - 2}">${progress}</div>` : '<div style="flex:1"></div>'}</div>
      <div class="ob-body" id="ob-body">${bodies[step]}</div>
      <div class="ob-foot">${showEstimate ? `<div class="ob-estimate" data-bind="ob-est">${obEstimateLine(d)}</div>` : ''}<button class="btn primary block" data-a="ob-next">${nextLabel}</button></div></div>`;
  }
  function focusOb() { const el = $('#ob-body input:not([type=checkbox]):not([type=range])'); if (el && ui.ob && OB_STEPS[ui.ob.step] === 'name') el.focus({ preventScroll: true }); }
  function obValidate() {
    const ob = ui.ob, d = ob.d, step = OB_STEPS[ob.step], e = {};
    if (step === 'name' && !d.name.trim()) e.name = 'Enter a name. A nickname is fine.';
    if (step === 'home' && d.adults + d.children < 1) e.people = 'At least one person lives here.';
    if (step === 'bills' && d.payment === 'bills') {
      if (d.billE !== '' && !(Number(d.billE) >= 0)) e.billE = 'Use a number, like 180.';
      if (d.billW !== '' && !(Number(d.billW) >= 0)) e.billW = 'Use a number, like 6.5.';
      if ((d.billE === '') !== (d.billW === '')) e[d.billE === '' ? 'billE' : 'billW'] = 'Add both numbers, or leave both empty.';
    }
    if (step === 'consent' && !(d.terms && d.data)) e.consent = 'Both are needed to create a profile.';
    ob.errors = e;
    return !Object.keys(e).length;
  }
  function finishOnboarding() {
    const d = ui.ob.d, m = H.addMonths(H.mkey(new Date()), -1);
    const bill = d.payment === 'bills' && d.billE !== '' ? { month: m, e: Number(d.billE), w: Number(d.billW) } : null;
    s = P.create(obProfile(d), { sample: d.sample, bill });
    ui.ob = null; ui.tab = 'home'; ui.page = null; save(); render();
    toast({ icon: 'House', text: `<b>Welcome, ${esc(s.profile.name)}</b>`, sub: '+20 points to start.' });
  }

  /* ---------- results → UI ---------- */
  function celebrate(results) {
    if (!results.length) return;
    openSheet('celebrate', { items: results, noFocus: false });
    if (window.PBFX) { setTimeout(() => PBFX.play('success'), 120); PBFX.vibrate([10, 40, 18]); }
  }

  /* ---------- actions ---------- */
  const A = {
    tab(el) { ui.page = null; ui.tab = el.dataset.tab; if (el.dataset.res) ui.usageRes = el.dataset.res; render(); $('#content').scrollTop = 0; },
    'month-step'(el) { stepMonth(el.dataset.key, +el.dataset.d); },
    seg(el) {
      const k = el.dataset.key; if (ui[k] === el.dataset.val) return;
      const opts = $$(`.seg [data-key="${k}"]`).map((b) => b.dataset.val);
      ui.segMotion = { key: k, dir: opts.indexOf(el.dataset.val) > opts.indexOf(ui[k]) ? 1 : -1 };
      ui[k] = el.dataset.val; render();
    },
    profile() { ui.page = 'profile'; render(); $('#content').scrollTop = 0; },
    settings() { closeSheet(true); if (ui.page !== 'settings') ui.backTo = ui.page; ui.page = 'settings'; render(); $('#content').scrollTop = 0; },
    back() { ui.page = ui.page === 'settings' ? ui.backTo || null : null; ui.backTo = null; render(); },
    /* Opening the list doesn't clear it: a notification is read when it's tapped, or with Read all. */
    notes() { openSheet('notes'); },
    'note-go'(el) { markRead(el.dataset.id); closeSheet(true); ui.page = null; ui.tab = el.dataset.go; render(); },
    'note-read'(el) { if (markRead(el.dataset.id)) readAllAnimated([el]); },
    'notes-read'() {
      const rows = $$('#sheet .row.note.unread');
      if (!s.notes.some((n) => !n.read)) return;
      s.notes.forEach((n) => { n.read = true; }); save(); refreshHeader();
      readAllAnimated(rows);
    },
    callback(el) { markRead(el.dataset.id); closeSheet(true); if (window.PBCall) PBCall.callBack(); },
    notify(el) { s.notify[el.dataset.key] = !s.notify[el.dataset.key]; save(); el.setAttribute('aria-checked', s.notify[el.dataset.key]); },

    sound(el) { if (!window.PBFX) return; PBFX.setEnabled(!PBFX.enabled()); el.setAttribute('aria-checked', PBFX.enabled()); },
    estimate() { openSheet('estimate'); },
    close() { closeSheet(); },
    reading(el) { openSheet('reading', { month: el.dataset.month }); },
    /* A month picked from the list under the form: load it into the form and scroll back up to it. */
    'reading-pick'(el) {
      const mm = el.dataset.month, x = s.months[mm];
      Object.assign(ui.sheet, { month: mm, errors: {}, warnings: [], values: x ? { e: x.e, w: x.w } : { e: '', w: '' } });
      renderSheet();
      const b = $('.sheet-body'); if (b) b.scrollTo({ top: 0, behavior: reduceMotion() ? 'auto' : 'smooth' });
      const inp = $('.sheet-body input[name="e"]'); if (inp) inp.focus({ preventScroll: true });
    },
    goal(el) { const r = el.dataset.rec && P.recommendations(s).find((x) => x.id === el.dataset.rec); openSheet('goal', { kind: 'cut', bench: 'usual', resource: r ? r.goal.resource : 'electricity', target: r ? r.goal.target : 5, months: 1, source: r ? r.id : 'custom' }); },
    'goal-res'(el) { ui.sheet.resource = el.dataset.val; segSelect(el.closest('.seg'), el); updateGoalSheet(); },
    'goal-kind'(el) {
      if (ui.sheet.kind === el.dataset.val) return;
      ui.sheet.kind = el.dataset.val;
      ui.sheet.noFocus = true; renderSheet();
    },
    'goal-bench'(el) { ui.sheet.bench = el.dataset.val; segSelect(el.closest('.seg'), el); updateGoalSheet(); },
    'goal-detail'(el) { openSheet('goalDetail', { id: el.dataset.id }); },
    /* Navigate from inside a sheet: close it, then go to the tab. */
    go(el) { closeSheet(true); A.tab(el); },
    'goal-months'(el) { ui.sheet.months = +el.dataset.val; segSelect(el.closest('.seg'), el); updateGoalSheet(); },
    reward(el) { openSheet('reward', { id: el.dataset.id }); },
    redeem(el) { try { P.redeem(s, el.dataset.id); save(); renderSheet(); render(); toast({ icon: 'Gift', text: '<b>Code ready</b>', sub: 'Saved under Your codes and on your profile' }); } catch (err) { toast({ icon: 'CircleAlert', text: esc(err.message) }); } },
    'rec-accept'(el) { P.setRec(s, el.dataset.id, 'accepted'); save(); const r = P.recommendations(s).find((x) => x.id === el.dataset.id); toast({ icon: 'Check', text: `<b>${esc(r.title)}</b>`, sub: r.goal ? 'Added to what you\'re doing. Make it a goal to earn points.' : 'Added to what you\'re doing' }); render(); },
    'rec-dismiss'(el) { P.setRec(s, el.dataset.id, 'dismissed'); save(); render(); },
    'rec-stop'(el) { delete s.recs[el.dataset.id]; save(); render(); },
    'plan-app'(el) { ui.planApp = el.dataset.id; render(); },
    'plan-make'(el) { const p = P.planRun(s, ui.planApp, +el.dataset.start); save(); toast({ icon: 'CalendarClock', text: `<b>Planned for ${clock(p.start)}</b>`, sub: `${p.green ? 'In green hours. ' : ''}${s.notify.plans !== false ? `We'll remind you at ${clock(p.start)}.` : 'Mark it done when it has run.'}` }); render(); },
    'plan-done'(el) { const res = P.markDone(s, el.dataset.id); save(); if (res.length) celebrate(res); render(); },
    copy(el) { copy(el.dataset.text); },
    badge(el) { openSheet('badge', { id: el.dataset.id }); },
    pin(el) { try { P.togglePin(s, el.dataset.id); ui.sheet.error = null; save(); renderSheet(); render(); } catch (err) { ui.sheet.error = err.message; renderSheet(); } },
    household() { const p = s.profile; openSheet('household', { d: { region: p.region, housing: p.housing, area: p.area, adults: p.adults, children: p.children, heating: p.heating, hotWater: p.hotWater, appliances: [...p.appliances], otherNote: p.otherNote || '' } }); },
    choose(el) { const d = currentDraft(); d[el.dataset.field] = el.dataset.val; rerenderDraft(); },
    'toggle-app'(el) { const d = currentDraft(), id = el.dataset.id; d.appliances = d.appliances.includes(id) ? d.appliances.filter((x) => x !== id) : [...d.appliances, id]; el.setAttribute('aria-checked', d.appliances.includes(id)); if (id === 'other') rerenderDraft(); updateObEstimate(); },
    step(el) { const d = currentDraft(), f = el.dataset.field; d[f] = H.clamp(d[f] + +el.dataset.delta, 0, 8); if (d.adults + d.children < 1) d[f] = 1; rerenderDraft(); },
    'ob-next'() { if (!obValidate()) return render(); if (OB_STEPS[ui.ob.step] === 'result') return finishOnboarding(); ui.ob.step++; render(); },
    'ob-back'() { ui.ob.errors = {}; if (ui.ob.step === 0) return; ui.ob.step--; render(); },
    'ob-demo'() { s = P.demo(); ui.ob = null; ui.tab = 'home'; save(); render(); toast({ icon: 'House', text: '<b>This is Freja\'s home</b>', sub: 'Two adults in a Copenhagen apartment. Everything here is simulated.' }); }
  };
  function refreshHeader() { const h = $('.top'); if (h && !ui.page) h.outerHTML = header(); }
  function markRead(id) { const n = s.notes.find((x) => x.id === id); if (!n || n.read) return false; n.read = true; save(); refreshHeader(); return true; }
  function noteHead() {
    const unread = s.notes.filter((n) => !n.read).length;
    return `<div class="note-group-row"><p class="note-group">${unread ? `${unread} new` : 'Recent'}</p>${unread ? `<button class="note-readall" data-a="notes-read">${ic('CheckCheck', 'xs')}Read all</button>` : ''}</div>`;
  }
  /* The dots fade and the highlight settles. The list stays where it is: nothing is rebuilt. */
  function readAllAnimated(rows) {
    if (window.PBFX) PBFX.play('tap');
    const unread = s.notes.filter((n) => !n.read).length, label = $('#sheet .note-group'), btn = $('#sheet .note-readall');
    if (label) label.textContent = unread ? `${unread} new` : 'Recent';
    if (btn && !unread) { btn.classList.add('gone'); btn.disabled = true; setTimeout(() => btn.remove(), 260); }
    const settle = () => rows.forEach((r) => { r.classList.remove('unread', 'reading'); r.style.removeProperty('--i'); const d = $('.dot', r); if (d) d.remove(); const c = $(':scope > .chip-icon.brand', r); if (c) c.classList.remove('brand'); });
    if (reduceMotion() || !rows.length) return settle();
    rows.forEach((r, i) => { r.style.setProperty('--i', i); r.classList.add('reading'); });
    setTimeout(settle, 380 + Math.min(rows.length, 8) * 35);
  }
  function currentDraft() { return ui.ob ? ui.ob.d : ui.sheet.d; }
  function rerenderDraft() { if (ui.ob) { const b = $('#ob-body'), top = b ? b.scrollTop : 0; render(); const nb = $('#ob-body'); if (nb) nb.scrollTop = top; } else { const b = $('.sheet-body'), top = b.scrollTop; ui.sheet.noFocus = true; renderSheet(); $('.sheet-body').scrollTop = top; } }
  function updateObEstimate() { const el = $('[data-bind="ob-est"]'); if (el && ui.ob) el.innerHTML = obEstimateLine(ui.ob.d); }
  async function copy(text) { try { await navigator.clipboard.writeText(text); toast({ icon: 'Copy', text: '<b>Copied</b>', sub: text }); } catch { toast({ icon: 'Copy', text: `<b>${esc(text)}</b>`, sub: 'Copy it from here' }); } }

  /* ---------- forms ---------- */
  const FORMS = {
    reading(form) {
      const fd = Object.fromEntries(new FormData(form)), values = { month: fd.month, e: fd.e.replace(',', '.'), w: fd.w.replace(',', '.') };
      const v = P.validateReading(s, values), sh = ui.sheet;
      if (!v.ok) { Object.assign(sh, { errors: v.errors, warnings: [], values, month: values.month }); return renderSheet(); }
      const sameWarnings = JSON.stringify(v.warnings) === JSON.stringify(sh.warnings || []);
      if (v.warnings.length && !(sh.warnings && sh.warnings.length && sameWarnings)) { Object.assign(sh, { errors: {}, warnings: v.warnings, values, month: values.month }); return renderSheet(); }
      const res = P.logReading(s, values); save(); closeSheet();
      toast({ icon: 'Receipt', text: `<b>${H.monthName(values.month)} saved</b>`, sub: s.ledger.some((l) => l.id === 'streak-' + values.month) ? '+10 points and a streak bonus' : '+10 points' });
      if (res.length) celebrate(res);
      render();
    },
    goal(form) {
      const sh = ui.sheet, g = P.createGoal(s, { kind: sh.kind, bench: sh.bench, resource: sh.resource || 'electricity', target: sh.target || 5, months: sh.months || 1, source: sh.source });
      save(); closeSheet(); ui.tab = 'goals'; ui.goalsSeg = 'goals'; render();
      toast({ icon: 'Target', text: `<b>${esc(P.goalLabel(g))} started</b>`, sub: `Worth about ${g.est} points if you make it` });
    },

    household() { Object.assign(s.profile, ui.sheet.d); s.profile.area = +s.profile.area; save(); closeSheet(); render(); toast({ icon: 'House', text: '<b>Household updated</b>', sub: 'The comparison now uses your new details' }); }
  };

  /* ---------- events ---------- */
  document.addEventListener('click', (e) => {
    const layer = $('#sheet');
    if (e.target === layer) return closeSheet();
    const el = e.target.closest('[data-a]');
    if (!el || el.disabled) return;
    const fn = A[el.dataset.a];
    if (fn) { e.preventDefault(); feedback(el); fn(el); }
  });
  /* A soft tick for taps and a two-note click for switches, plus a short vibration on phones that support it. */
  function feedback(el) {
    if (!window.PBFX) return;
    if (el.classList.contains('switch')) { PBFX.play('toggle', el.getAttribute('aria-checked') !== 'true'); PBFX.vibrate(10); return; }
    if (el.matches('.tab, .seg button, .btn, .choice, .app-chips button, .icon-btn, .row, .badge, .link')) { PBFX.play('tap'); PBFX.vibrate(6); }
  }
  document.addEventListener('submit', (e) => { const f = e.target.closest('[data-form]'); if (!f) return; e.preventDefault(); FORMS[f.dataset.form](f); });
  document.addEventListener('input', (e) => {
    const el = e.target;
    if (el.dataset.input === 'ob') { ui.ob.d[el.dataset.field] = el.value; if (ui.ob.errors[el.dataset.field]) { ui.ob.errors[el.dataset.field] = null; el.setAttribute('aria-invalid', 'false'); const err = el.closest('.field').querySelector('.field-error'); if (err) err.remove(); } }
    if (el.dataset.input === 'other') { currentDraft().otherNote = el.value; }
    if (el.dataset.input === 'area') { const d = currentDraft(); d.area = +el.value; const b = $('[data-bind="area"]'); if (b) b.textContent = `${d.area} m²`; updateObEstimate(); }
    if (el.dataset.input === 'goal') { ui.sheet.target = +el.value; updateGoalSheet(); }
  });
  document.addEventListener('change', (e) => {
    const el = e.target;
    if (el.dataset.check && ui.ob) { ui.ob.d[el.dataset.check] = el.checked; if (ui.ob.errors.consent && ui.ob.d.terms && ui.ob.d.data) { ui.ob.errors.consent = null; } }
    if (el.dataset.change === 'plan-finish') { ui.planFinish = el.value; render(); }
    if (el.dataset.change === 'field') { currentDraft()[el.dataset.field] = el.value; updateObEstimate(); }
    if (el.dataset.change === 'reading-month') { const f = el.form; ui.sheet.month = el.value; ui.sheet.values = { e: '', w: '' }; ui.sheet.errors = {}; ui.sheet.warnings = []; ui.sheet.values = s.months[el.value] ? { e: s.months[el.value].e, w: s.months[el.value].w } : { e: '', w: '' }; renderSheet(); void f; }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && ui.sheet) { closeSheet(); }
    if (e.key === 'Tab' && ui.sheet) {
      const items = $$('#sheet button:not([disabled]), #sheet input, #sheet select, #sheet summary').filter((x) => x.offsetParent !== null);
      if (!items.length) return;
      const first = items[0], last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); } else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });

  /* ---------- prototype controls (gear in the page corner) ---------- */
  window.PB_PROTOTYPE = {
    actions() {
      if (!s) return [{ label: 'Skip to the demo home', run: () => A['ob-demo']() }];
      return [
        { label: 'Jump to next month', hint: 'Moves to the 1st. Enter the month that just ended under Consumption to settle goals', run: () => { closeSheet(); const res = P.advanceToNextMonth(s); save(); render(); celebrate(res); toast({ icon: 'CalendarDays', text: `<b>It's now ${P.now(s).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })}</b>`, sub: `${H.monthName(H.addMonths(P.thisMonth(s), -1))} has ended. Enter its numbers under Consumption.` }); } },
        { label: 'Skip ahead 6 hours', hint: 'Prices and the clock move on', run: () => { P.advanceHours(s, 6); save(); render(); } },
        { label: 'Show a price tip now', run: () => pushTip(true) },
        { label: s.live ? 'Pause live updates' : 'Resume live updates', hint: 'Price tips', run: () => { s.live = !s.live; save(); render(); } },
        { label: 'Reset app', hint: 'Back to onboarding, where you can set up a home or skip to the demo. Feedback comments are kept.', run: resetApp }
      ];
    }
  };

  /* A fresh start: clears the household and restarts the visit, so Thomas calls again. */
  function resetApp() {
    s = null; save(); closeSheet(true);
    ui.ob = { step: 0, d: OB_DEFAULT(), errors: {} }; ui.page = null; ui.tab = 'home'; ui.priceMonth = null;
    if (window.PBCall) PBCall.reset();
    render();
  }

  /* Where the visitor is, as a stable key and a readable label. The feedback tool files comments under it. */
  const SHEET_NAMES = { goalDetail: 'Goal', notes: 'Notifications', estimate: 'Homes like yours', reading: 'Add monthly data', goal: 'New goal', reward: 'Reward', badge: 'Badge', household: 'Your household', celebrate: 'Celebration' };
  const SEG_NAMES = { goals: 'Goals', rewards: 'Rewards' };
  function pageInfo() {
    if (!s) { const step = ui.ob ? OB_STEPS[ui.ob.step] : 'welcome'; return { key: 'onboarding/' + step, label: 'Onboarding · ' + step.charAt(0).toUpperCase() + step.slice(1) }; }
    let key, label;
    if (ui.page) { key = ui.page; label = ui.page === 'profile' ? 'Profile' : 'Settings'; }
    else {
      const seg = ui.tab === 'goals' ? ui.goalsSeg : null;
      key = ui.tab + (seg ? '/' + seg : ''); label = ui.tab.charAt(0).toUpperCase() + ui.tab.slice(1) + (seg ? ' · ' + SEG_NAMES[seg] : '');
    }
    if (ui.sheet) return { key: 'sheet/' + ui.sheet.type, label: 'Sheet · ' + (SHEET_NAMES[ui.sheet.type] || ui.sheet.type), base: key };
    return { key, label };
  }
  /* Jump to a page by its key (used by the feedback tool's "go to" links). Sheets and onboarding steps can't be reopened. */
  function navigate(key) {
    if (!s || !key || /^(sheet|onboarding)\//.test(key)) return false;
    const [a, b] = key.split('/');
    closeSheet(true);
    if (a === 'profile' || a === 'settings') ui.page = a;
    else if (TAB_ORDER.includes(a)) { ui.page = null; ui.tab = a; if (a === 'goals' && SEG_NAMES[b]) ui.goalsSeg = b; }
    else return false;
    render(); return true;
  }
  /* For other prototype layers (the call) to add a notification. */
  function externalNote(n, toastOpts) { if (!s) { if (toastOpts) toast(toastOpts); return; } addNote(n, toastOpts); }

  // Inspection hook for tests and the prototype layers.
  window.PowerBuddy = { state: () => s, ui: () => ui, domain: P, pageInfo, navigate, note: externalNote, toast: (t) => toast(t) };
  // The sliding segmented control, shared with the feedback tool.
  window.PBSeg = { init: initSegs, select: segSelect, glide };
  // How much the phone is scaled down on this screen (1 = real size). The feedback tool records positions in phone pixels.
  window.PBFit = () => ui.fit || 1;

  /* App launch: the icon's mark opens up into the app, like starting a phone app. */
  (() => {
    if (reduceMotion()) return;
    const l = document.createElement('div');
    l.className = 'launch'; l.setAttribute('aria-hidden', 'true');
    l.innerHTML = MARK;
    $('#phone').appendChild(l);
    setTimeout(() => l.classList.add('go'), 420);
    setTimeout(() => l.remove(), 1100);
  })();

  render();
  setInterval(tick, 2000);
  setInterval(() => { const c = $('#clock'); if (c) c.textContent = clock(s ? P.now(s) : new Date()); }, 15000);
  $('#clock').textContent = clock(s ? P.now(s) : new Date());
})();
