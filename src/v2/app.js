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
  const AV = ['#3E6B5A', '#6B5B95', '#A65E36', '#2F6CA3', '#80553F', '#4F7C2E', '#9A4A66', '#55687A', '#7A6A2E', '#3F7F86'];
  const avatar = (id, cls = '') => (id === 'me'
    ? `<span class="avatar me ${cls}" aria-hidden="true">${esc(initials(s.profile.name))}</span>`
    : `<span class="avatar ${cls}" style="background:${AV[H.hash(id) % AV.length]}" aria-hidden="true">${esc(initials(P.friendName(id)))}</span>`);
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
  const ui = { tab: 'home', page: null, goalsSeg: 'goals', friendsSeg: 'feed', rankRes: 'electricity', usageRes: 'electricity', usageRange: 'month', planDay: 'today', planApp: null, planFinish: 'tonight', sheet: null, ob: s ? null : { step: 0, d: OB_DEFAULT(), errors: {} }, fresh: new Set(), toasts: [], lastDay: null, nextNotify: Date.now() + 12000, notifySeq: 0, sheetToken: 0 };
  if (s) { P.ensureNotify(s); P.sync(s); }

  /* ---------- render ---------- */
  const TAB_ORDER = ['home', 'usage', 'plan', 'goals', 'friends'];
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
    // Switching a segment (Goals / Challenges, Feed / Ranking...) is not navigation: the page and its controls stay put.
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
    c.classList.remove('tight', 'fits');
    const need = () => { const last = c.lastElementChild; return last ? last.offsetTop - c.offsetTop + last.offsetHeight + parseFloat(getComputedStyle(c).paddingBottom) : 0; };
    if (need() > c.clientHeight + 1) c.classList.add('tight');
    if (need() <= c.clientHeight + 1) { c.classList.add('fits'); c.scrollTop = 0; }
  }
  addEventListener('resize', () => { fitHome(); for (const seg of $$('.seg-glide')) glide(seg); });

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
    return { home: viewHome, usage: viewUsage, plan: viewPlan, goals: viewGoals, friends: viewFriends }[ui.tab]();
  }
  function header() {
    if (ui.page === 'profile') return `<header class="top"><button class="icon-btn" data-a="back" aria-label="Back">${ic('ChevronLeft')}</button><div class="top-title"><h1>Profile</h1><p>Visible to your friends: name, badges and goals</p></div><button class="icon-btn" data-a="settings" aria-label="Settings">${ic('Settings')}</button></header>`;
    if (ui.page === 'settings') return `<header class="top"><button class="icon-btn" data-a="back" aria-label="Back">${ic('ChevronLeft')}</button><div class="top-title"><h1>Settings</h1><p>Notifications, privacy and your household</p></div></header>`;
    const region = P.REGIONS.find((r) => r.id === s.profile.region);
    const t = {
      home: [`${s.profile.name}'s home`, region.name],
      usage: ['Usage', 'Electricity and water, measured and logged'],
      plan: ['Plan', 'Plan runs in cheap hours. We remind you.'],
      goals: ['Goals', 'Your goals, challenges and rewards'],
      friends: ['Friends', `${P.mutualFriends(s).length} friends`]
    }[ui.tab];
    const unread = s.notes.filter((n) => !n.read).length;
    return `<header class="top">
      <button class="icon-btn" data-a="profile" aria-label="Your profile">${avatar('me', 'sm')}</button>
      <div class="top-title"><h1>${esc(t[0])}</h1><p>${esc(t[1])}</p></div>
      <button class="icon-btn" data-a="notes" aria-label="Notifications${unread ? `, ${unread} unread` : ''}">${ic('Bell')}${unread ? `<span class="count">${unread > 9 ? '9+' : unread}</span>` : ''}</button>
    </header>`;
  }
  function tabs() {
    const items = [['home', 'Home', 'House'], ['usage', 'Usage', 'ChartColumn'], ['plan', 'Plan', 'CalendarClock'], ['goals', 'Goals', 'Target'], ['friends', 'Friends', 'Users']];
    return `<nav class="tabs" aria-label="Main">${items.map(([id, label, icon]) => `<button class="tab" data-a="tab" data-tab="${id}"${ui.tab === id ? ' aria-current="page"' : ''}>${ic(icon)}<span>${label}</span></button>`).join('')}</nav>`;
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
        const mx = e.clientX - x0, my = e.clientY - y0;
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
  function missingMonth() {
    const last = H.addMonths(P.thisMonth(s), -1);
    return s.months[last] ? null : last;
  }
  function viewHome() {
    const m = P.thisMonth(s), n = P.now(s), dim = H.daysIn(m), dayN = n.getDate();
    const te = P.typicalMonth(s.profile, 'electricity', m), tw = P.typicalMonth(s.profile, 'water', m), vt = P.vsTypical(s, 'electricity', m);
    // Live prices, not live usage: prices are public, while usage only reaches us a day later from the meter.
    const list = P.prices(s, P.today(s)), h = n.getHours(), green = P.greenHours(list), level = P.priceLevel(list[h], list), up = P.upcomingPrices(s);
    const day = (ts) => (H.ymd(new Date(ts)) === P.today(s) ? '' : 'tomorrow, '), hhmm = (ts) => clock(ts), slot = `${String(h).padStart(2, '0')}:00–${String((h + 1) % 24).padStart(2, '0')}:00`;
    const region = P.REGIONS.find((r) => r.id === s.profile.region);
    const live = `<section class="section"><button class="card live ${s.live ? '' : 'paused'}" data-a="tab" data-tab="plan" aria-label="Prices right now. Open Plan for the whole day.">
      <div class="live-head"><span class="pulse" aria-hidden="true"></span><span>Prices right now</span>${s.live ? '' : '<span class="tag">Paused</span>'}<span class="tag ${level}">${{ low: 'Low', normal: 'Normal', high: 'High' }[level]}</span></div>
      <div class="live-main"><div><div class="big-num num"><span data-live="price">${fmt(list[h], 2)}</span><small>kr/kWh</small></div><div class="small muted live-sub">Electricity, ${slot}</div></div>
      ${priceStrip(list, h, green)}</div>
      <div class="live-stats">
        <div><span>Cheapest next</span>${up ? `<b class="num">${hhmm(up.low.start)}</b> <em>${day(up.low.start)}${fmt(up.low.price, 2)} kr</em>` : '<b>–</b>'}</div>
        <div><span>Priciest next</span>${up ? `<b class="num">${hhmm(up.high.start)}</b> <em>${day(up.high.start)}${fmt(up.high.price, 2)} kr</em>` : '<b>–</b>'}</div>
        <div><span>Water</span><b class="num">${fmt(P.rate(s, 'water'))}</b> <em>kr/m³</em></div>
      </div><p class="live-foot">Water costs the same all day in ${esc(region.name)}, about ${fmt(P.rate(s, 'water') / 10, 1)} øre a litre.</p></button></section>`;
    const rows = ['electricity', 'water'].map((r) => `<button class="res-row" data-a="tab" data-tab="usage" data-res="${r}" style="width:100%;border:0;background:none;text-align:left">
        <span class="chip-icon ${r === 'water' ? 'water' : 'elec'}">${ic(r === 'water' ? 'Droplet' : 'Zap')}</span>
        <div><div class="val num"><span data-live="so-${r}">${fmtRes(r, P.monthSoFar(s, r))}</span><small>${unit(r)}</small></div><div class="sub">so far · heading for ${fmtRes(r, P.projected(s, r))} ${unit(r)}</div></div>
        <div class="row-end">${delta(P.change(s, r, m))}<span>vs your usual</span></div></button>`).join('');
    const month = `<section class="section">${sectionHead(`${H.monthName(m)} so far`, `Day ${dayN} of ${dim}`)}
      <div class="list">${rows}
        <div class="compare-line">${ic('Users', 'sm')}<div>Homes like yours use about <b>${fmt(te)} kWh</b> and <b>${fmt(tw, 1)} m³</b> in ${H.monthName(m)}. You're heading for <b>${fmt(Math.abs(vt))}% ${vt <= 0 ? 'below' : 'above'}</b> that on electricity. <button class="link" data-a="estimate" style="padding:0">How we estimate</button></div></div>
      </div></section>`;
    let todo = '';
    const miss = missingMonth();
    if (miss) {
      todo = `<section class="section"><div class="card todo"><span class="chip-icon brand">${ic('Receipt')}</span><div style="flex:1"><h3>${H.monthName(miss)} isn't logged</h3><p>Add the numbers from your bill to keep your streak going.</p>
        <div class="btn-row"><button class="btn primary small" data-a="reading" data-month="${miss}">Add ${H.monthName(miss)}</button><span class="pts" style="align-self:center">+10 points</span></div></div></div></section>`;
    } else {
      const rec = P.recommendations(s).find((r) => !s.recs[r.id]);
      if (rec) todo = `<section class="section"><div class="card todo"><span class="chip-icon ${rec.resource === 'water' ? 'water' : 'elec'}">${ic(rec.icon)}</span><div style="flex:1"><h3>${esc(rec.title)}</h3><p>${savingText(rec)}</p>
        <div class="btn-row"><button class="btn secondary small" data-a="tab" data-tab="plan">See ideas for your home</button></div></div></div></section>`;
    }
    // Kept deliberately short: goals, challenges and the friends feed live in their own tabs.
    return live + month + todo;
  }
  function savingText(r) {
    if (r.costOnly) return `Saves about ${kr(r.saveKr)} a month. Same energy, lower price.`;
    const parts = [r.saveE ? `${fmt(r.saveE, r.saveE < 10 ? 1 : 0)} kWh` : '', r.saveW ? `${fmt(Math.round(r.saveW * 100) * 10)} litres` : ''].filter(Boolean);
    return `About ${parts.join(' and ')} a month, worth ${kr(r.saveKr)}.`;
  }
  /* Goals come in two kinds: cut (use X% less than usual) and keep (stay at or under your usual, or under similar homes). */
  const goalBenchName = (g) => (g.bench === 'typical' ? 'similar homes' : 'your usual');
  /* Fill of the progress bar; the marker in the middle is the target. */
  const goalRatio = (g, p) => H.clamp(g.kind === 'keep' ? 0.5 + p.reduction / 20 : p.reduction / (g.target * 2), 0, 1);
  function goalStatus(g, p) {
    if (g.kind === 'keep') return `${p.onTrack ? 'On track' : 'Over for now'} · ${fmt(Math.abs(p.reduction), 1)}% ${p.reduction >= 0 ? 'under' : 'over'} ${goalBenchName(g)}`;
    return `${p.onTrack ? 'On track' : 'Behind for now'} · ${p.reduction >= 0 ? '−' : '+'}${fmt(Math.abs(p.reduction), 1)}% so far`;
  }
  function goalRow(g) {
    const p = P.goalProgress(s, g), ratio = goalRatio(g, p);
    const ends = H.monthName(g.end) + ' ' + g.end.slice(0, 4);
    return `<button class="prog-row" data-a="goal-detail" data-id="${g.id}" style="width:100%;border:0;background:none;text-align:left;display:block" aria-label="${esc(P.goalLabel(g))}: see how it's going">
      <div class="prog-top"><span class="chip-icon brand">${ic(g.kind === 'keep' ? 'ShieldCheck' : 'Target')}</span><div class="row-main"><div class="row-title">${esc(P.goalLabel(g))}</div><div class="row-sub">${goalStatus(g, p)}</div></div><span class="pts">${g.est} pts</span>${ic('ChevronRight', 'sm muted')}</div>
      <div class="target-bar" aria-hidden="true"><i style="width:${ratio * 100}%;background:${p.onTrack ? 'var(--good)' : 'var(--gold)'}"></i><b style="left:50%"></b></div>
      <div class="prog-meta"><span>${g.kind === 'keep' ? `At ${goalBenchName(g)} at the marker` : `Target −${g.target}% at the marker`}</span><span>Ends ${esc(ends)}</span></div></button>`;
  }
  function challengeRow(c) {
    const t = P.tplOf(c), p = P.challengeProgress(s, c), can = P.canCheckIn(s, c);
    const dots = ['habit', 'quick', 'offpeak'].includes(t.kind) && t.goal <= 8;
    return `<div class="prog-row">
      <div class="prog-top"><span class="chip-icon">${ic(t.icon)}</span><button class="row-main" data-a="challenge" data-id="${c.id}" style="border:0;background:none;text-align:left;padding:0"><div class="row-title">${esc(t.title)}</div><div class="row-sub">${esc(p.label)} · ends ${dateShort(c.end)}</div></button>
      ${can ? `<button class="btn primary small" data-a="checkin" data-id="${c.id}">Check in</button>` : `<span class="pts">${t.points} pts</span>`}</div>
      ${dots ? `<div class="dots" aria-hidden="true">${Array.from({ length: t.goal }, (_, i) => `<i class="${i < p.value ? 'on' : ''}"></i>`).join('')}</div>` : `<div class="bar" aria-hidden="true"><i style="width:${p.ratio * 100}%"></i></div>`}
    </div>`;
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
  function bindCharts(root) {
    for (const chart of $$('[data-chart]', root)) {
      const svg = $('svg', chart), tip = $('.chart-tip', chart);
      const show = (el) => {
        if (Date.now() - (ui.swipedAt || 0) < 600) return; // not right after dragging to another month
        const box = svg.getBoundingClientRect(), vb = svg.viewBox.baseVal, sx = box.width / vb.width;
        const [title, ...rest] = el.dataset.tip.split('|');
        tip.innerHTML = `<b>${esc(title)}</b>${rest.map((r) => `<br>${esc(r)}`).join('')}`;
        tip.hidden = false;
        const x = H.clamp(+el.dataset.x * sx, 60, box.width - 60);
        tip.style.left = x + 'px'; tip.style.top = (+el.dataset.y * sx - 6) + 'px';
      };
      svg.addEventListener('pointerover', (e) => { if (e.target.classList.contains('hit')) show(e.target); });
      svg.addEventListener('click', (e) => { if (e.target.classList.contains('hit')) show(e.target); });
      chart.addEventListener('pointerleave', () => { tip.hidden = true; });
    }
  }

  /* ---------- usage ---------- */
  function viewUsage() {
    const r = ui.usageRes, cls = r === 'water' ? 'bar-w' : 'bar-e', m = P.thisMonth(s), k = r === 'water' ? 'w' : 'e';
    let chart, stats, title, nav = '', note = '';
    if (ui.usageRange === 'month') {
      const mm = shownMonth('usageMonth'), isCur = mm === m, dim = H.daysIn(mm), t = P.today(s), typ = P.typicalMonth(s.profile, r, mm) / dim, bars = [];
      const hist = isCur ? null : P.monthDays(s, r, mm), x = r === 'water' ? 1000 : 1, est = hist && hist.source === 'split';
      for (let i = 1; i <= dim; i++) {
        const d = `${mm}-${String(i).padStart(2, '0')}`, isToday = isCur && d === t, past = isCur ? d < t : true;
        const v = !isCur ? hist.values[i - 1] : past ? (s.days[d] ? s.days[d][k] : null) : isToday ? P.todaySoFar(s, r) : null;
        const full = isToday ? P.dayValue(s, r, d) : null;
        bars.push({ value: v === null ? null : v * x, proj: full === null ? null : full * x, cls, label: [1, 8, 15, 22, 29].includes(i) ? String(i) : '', missing: past && v === null,
          tip: v !== null ? `${dateShort(d)}${isToday ? ' (so far)' : est ? ' (estimated)' : ''}|${fmtRes(r, v * x)} ${r === 'water' ? 'litres' : 'kWh'}|Typical: ${r === 'water' ? fmt(typ * 1000) + ' litres' : fmt(typ, 1) + ' kWh'}` : null });
      }
      title = 'Day by day';
      nav = monthNav('usageMonth', mm);
      chart = barChart({ bars, typical: typ * x, desc: `${resName(r)} per day in ${H.monthName(mm)} ${mm.slice(0, 4)}` });
      if (isCur) {
        const so = P.monthSoFar(s, r), pr = P.projected(s, r);
        stats = [['So far', `${fmtRes(r, so)} ${unit(r)}`], ['Heading for', `${fmtRes(r, pr)} ${unit(r)}`], ['Cost so far', kr(P.cost(s, r, so))]];
      } else {
        const total = s.months[mm] ? s.months[mm][k] : null, vsTyp = total === null ? null : (total / P.typicalMonth(s.profile, r, mm) - 1) * 100;
        stats = [['Used', total === null ? '–' : `${fmtRes(r, total)} ${unit(r)}`], ['vs homes like yours', signed(vsTyp)], ['Cost', total === null ? '–' : kr(P.cost(s, r, total))]];
        if (total === null) note = `<div class="alert info">${ic('Receipt', 'sm')}<span>${H.monthName(mm)} isn't logged yet.</span><button class="link" data-a="reading" data-month="${mm}" style="margin-left:auto;padding:0">Add it</button></div>`;
        else if (est) note = `<p class="hint">Your bill gives the month's total. The daily split is estimated from your usual pattern.</p>`;
      }
    } else {
      const bars = [], typs = [];
      for (let i = 12; i >= 0; i--) {
        const mm = H.addMonths(m, -i), v = s.months[mm] ? s.months[mm][k] : null, isCur = i === 0, typ = P.typicalMonth(s.profile, r, mm);
        typs.push(typ);
        bars.push({ value: isCur ? P.monthSoFar(s, r) : v, proj: isCur ? P.projected(s, r) : null, cls, missing: !isCur && v === null, label: i % 3 === 0 ? H.monthName(mm, 'short') : '',
          tip: isCur ? `${H.monthName(mm)} (so far)|${fmtRes(r, P.monthSoFar(s, r))} ${unit(r)}, heading for ${fmtRes(r, P.projected(s, r))}|Typical: ${fmtRes(r, typ)} ${unit(r)}` : v === null ? `${H.monthName(mm)} ${mm.slice(0, 4)}|Not logged yet` : `${H.monthName(mm)} ${mm.slice(0, 4)}|${fmtRes(r, v)} ${unit(r)} · ${kr(P.cost(s, r, v))}|Typical: ${fmtRes(r, typ)} ${unit(r)}` });
      }
      title = 'The last 12 months';
      chart = barChart({ bars, typical: typs, desc: `${resName(r)} per month for the last 12 months` });
      const logged = bars.slice(0, 12).filter((b) => b.value !== null && !b.missing).map((b) => b.value), total = H.sum(logged);
      stats = [['Last 12 months', `${fmtRes(r, total)} ${unit(r)}`], ['Average month', `${fmtRes(r, logged.length ? total / logged.length : 0)} ${unit(r)}`], ['Cost', kr(P.cost(s, r, total))]];
    }
    const est = P.estimate(s.profile)[r], parts = est.parts.slice(0, 6), maxPart = Math.max(...parts.map((p) => p.kwh || p.m3));
    const breakdown = parts.map((p) => { const v = (p.kwh || p.m3) / 12; return `<div class="bd-row"><span>${esc(p.name)}</span><span class="num muted">${r === 'water' ? fmt(Math.round(v * 100) * 10) + ' L' : fmt(v) + ' kWh'}</span><div class="bar thin ${r === 'water' ? 'water' : 'elec'}"><i style="width:${(p.kwh || p.m3) / maxPart * 100}%"></i></div></div>`; }).join('');
    const months = []; for (let i = 1; i <= 12; i++) months.push(H.addMonths(m, -i));
    const SRC = { bill: 'From bill', manual: 'Entered', meter: 'Meter', sample: 'Sample' };
    const readings = months.map((mm) => { const x = s.months[mm]; return `<div class="row"><div class="row-main"><div class="row-title">${H.monthName(mm)} ${mm.slice(0, 4)}</div><div class="row-sub">${x ? `${fmt(x.e)} kWh · ${fmt(x.w, 1)} m³` : 'Missing'}</div></div>${x ? `<span class="tag">${SRC[x.src] || x.src}</span>` : `<button class="btn secondary small" data-a="reading" data-month="${mm}">Add</button>`}</div>`; }).join('');
    return `<section class="section">${seg('usageRes', [['electricity', 'Electricity'], ['water', 'Water']])}</section>
      <section class="section">${sectionHead(title, '')}${seg('usageRange', [['month', 'Month'], ['year', '12 months']], 'small')}
        <div class="card" style="margin-top:12px"${nav ? ' data-swipe="usageMonth"' : ''}>${nav}<div class="swipe-track">
          <div class="headline-stat">${stats.map(([a, b]) => `<div><span>${a}</span><b class="num">${b}</b></div>`).join('')}</div>
          ${chart}
          <div class="legend"><span><i style="background:var(--${r === 'water' ? 'water' : 'elec'})"></i>Your ${r === 'water' ? 'water' : 'electricity'}</span><span><i class="dash"></i>Homes like yours</span>${ui.usageRange === 'year' ? '<span><i style="border:1px dashed var(--line-2);background:none"></i>Not logged</span>' : ''}</div>
          ${note}</div>
        </div></section>
      <section class="section">${sectionHead('Where it probably goes', 'per month, estimated')}<div class="card"><div class="breakdown">${breakdown}</div>
        <p class="hint" style="margin-top:12px">Based on ${esc(P.describeHome(s.profile))}.</p><button class="link" data-a="household">Edit your household</button></div></section>
      <section class="section">${sectionHead('Months', `<button class="link" data-a="reading">Add a reading</button>`)}<div class="list">${readings}</div></section>`;
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
    const doingRow = (r) => { const since = s.recs[r.id].at, days = Math.max(0, (P.now(s) - new Date(since)) / 864e5); const saved = r.costOnly ? `${kr(r.saveKr / 30 * days)} saved` : r.saveE ? `${fmt(r.saveE / 30 * days, 1)} kWh saved` : `${fmt(r.saveW / 30 * days * 1000)} L saved`; return `<div class="row"><span class="chip-icon brand">${ic('Check')}</span><div class="row-main"><div class="row-title">${esc(r.title)}</div><div class="row-sub">Since ${dateShort(since)} · about ${saved}</div></div>${r.goal && !s.goals.some((g) => g.status === 'active' && g.source === r.id) ? `<button class="btn secondary small" data-a="goal" data-rec="${r.id}">Make goal</button>` : `<button class="btn ghost small" data-a="rec-stop" data-id="${r.id}">Stop</button>`}</div>`; };
    return `<section class="section">${sectionHead('Electricity price', 'Illustrative prices')}${seg('planDay', [['today', 'Today'], ['tomorrow', 'Tomorrow'], ['history', 'Past months']], 'small')}<div style="margin-top:12px">${priceBlock}</div></section>
      <section class="section">${sectionHead('Plan a run', 'Cheapest start')}${planner}${planList}</section>
      ${doing.length ? `<section class="section">${sectionHead("What you're doing", `${doing.length}`)}<div class="list">${doing.map(doingRow).join('')}</div></section>` : ''}
      <section class="section">${sectionHead('Ideas for your home', `${open.length} left`)}${open.length ? `<div class="list">${open.slice(0, 4).map(recCard).join('')}</div>` : '<div class="card empty">You have been through every idea for now.</div>'}</section>`;
  }

  /* ---------- goals ---------- */
  function viewGoals() {
    const m = P.thisMonth(s), tickets = s.tickets.filter((t) => t.month === m).length;
    const wallet = `<section class="section"><div class="card wallet"><div class="main"><span>Available</span><b class="num">${fmt(P.available(s))}</b></div><div><span>Earned</span><b class="num">${fmt(P.lifetime(s))}</b></div><div><span>Draw tickets</span><b class="num">${tickets}</b></div></div></section>`;
    const tabsHtml = `<section class="section">${seg('goalsSeg', [['goals', 'Goals'], ['challenges', 'Challenges'], ['rewards', 'Rewards']])}</section>`;
    let body = '';
    if (ui.goalsSeg === 'goals') {
      const active = s.goals.filter((g) => g.status === 'active'), past = s.goals.filter((g) => g.status !== 'active');
      body = `<section class="section">${sectionHead('Active', `<button class="link" data-a="goal">${ic('Plus', 'sm')}New goal</button>`)}
        ${active.length ? `<div class="list">${active.map(goalRow).join('')}</div>` : `<div class="card empty">No goal running. Set one for ${H.monthName(m)}: cut back, or keep things steady, and we'll show what it's worth.<div class="btn-row" style="justify-content:center"><button class="btn primary small" data-a="goal" style="flex:none">New goal</button></div></div>`}
        <p class="hint">Goals are measured against your usual: your last three logged months, adjusted for the season. Tap a goal to see how it's going.</p></section>
        ${past.length ? `<section class="section">${sectionHead('Earlier')}<div class="list">${past.map((g) => `<div class="row"><span class="chip-icon ${g.status === 'reached' ? 'brand' : ''}">${ic(g.status === 'reached' ? 'CircleCheck' : 'Target')}</span><div class="row-main"><div class="row-title">${esc(P.goalLabel(g))}</div><div class="row-sub">${H.monthName(g.start)}${g.end !== g.start ? ' – ' + H.monthName(g.end) : ''} ${g.end.slice(0, 4)} · ${g.kind === 'keep' ? `${fmt(Math.abs(g.result), 1)}% ${g.result >= 0 ? 'under' : 'over'} ${goalBenchName(g)}` : g.status === 'reached' ? `cut ${fmt(g.result, 1)}%` : g.result > 0 ? `cut ${fmt(g.result, 1)}%, not quite` : 'not this time'}</div></div>${g.status === 'reached' ? `<span class="pts">+${g.est}</span>` : ''}</div>`).join('')}</div></section>` : ''}`;
    } else if (ui.goalsSeg === 'challenges') {
      const joined = s.ch.filter((c) => c.joined && P.isActive(s, c)), open = s.ch.filter((c) => !c.joined && P.isActive(s, c)), done = s.ch.filter((c) => c.status === 'done' || c.status === 'missed').slice(-6).reverse();
      body = `${joined.length ? `<section class="section">${sectionHead('Joined', `${joined.length}`)}<div class="list">${joined.map(challengeRow).join('')}</div></section>` : ''}
        <section class="section">${sectionHead('Open to join', `${open.length}`)}${open.length ? `<div class="list">${open.map((c) => { const t = P.tplOf(c), who = P.participants(c).filter((id) => P.mutualFriends(s).some((f) => f.id === id)); return `<button class="row" data-a="challenge" data-id="${c.id}"><span class="chip-icon">${ic(t.icon)}</span><div class="row-main"><div class="row-title">${esc(t.title)}</div><div class="row-sub">${esc(t.blurb)}</div>${who.length ? `<div class="faces" style="margin-top:6px">${who.slice(0, 3).map((id) => avatar(id, 'sm')).join('')}<em>${who.length} friend${who.length > 1 ? 's' : ''} in</em></div>` : ''}</div><div class="row-end"><span class="pts">${t.points}</span>${t.ticket ? `<div>${ic('Ticket', 'xs')}</div>` : ''}</div></button>`; }).join('')}</div>` : '<div class="card empty">You have joined everything running right now.</div>'}
        <p class="hint">${ic('Ticket', 'xs')} Monthly challenges also give a ticket for the Green draw. Joining is free and gives no points by itself.</p></section>
        ${done.length ? `<section class="section">${sectionHead('Finished')}<div class="list">${done.map((c) => `<div class="row"><span class="chip-icon ${c.status === 'done' ? 'brand' : ''}">${ic(c.status === 'done' ? 'CircleCheck' : P.tplOf(c).icon)}</span><div class="row-main"><div class="row-title">${esc(P.tplOf(c).title)}</div><div class="row-sub">${c.status === 'done' ? 'Completed' : 'Ended before the target'} · ${dateShort(c.end)}</div></div>${c.status === 'done' ? `<span class="pts">+${P.tplOf(c).points}</span>` : ''}</div>`).join('')}</div></section>` : ''}`;
    } else {
      const next = new Date(P.now(s).getFullYear(), P.now(s).getMonth() + 1, 1), last = s.draws[0];
      const redeemed = new Set(s.redemptions.map((v) => v.rewardId));
      // This month's draw, the challenges that give a ticket for it, and last month's result, each labelled so it's clear which is which.
      const ticketCh = s.ch.filter((c) => P.tplOf(c).ticket && c.start.slice(0, 7) === m);
      const chStatus = (c) => (c.status === 'done' ? `<span class="tag low">${ic('Ticket', 'xs')}Ticket earned</span>` : c.joined && P.isActive(s, c) ? `<span class="small muted">${esc(P.challengeProgress(s, c).label)}</span>` : P.isActive(s, c) ? '<span class="small muted">Not joined</span>' : '<span class="small muted">Ended</span>');
      body = `<section class="section"><div class="card draw"><div class="ch-head"><span class="chip-icon gold">${ic('Ticket')}</span><div style="flex:1"><div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap"><h3>The ${H.monthName(m)} Green draw</h3><span class="tag brand">This month</span></div><p class="small muted">Open now, drawn ${dateShort(next)}. You have ${tickets} ticket${tickets === 1 ? '' : 's'}. Tickets come only from finishing this month's challenges; they can't be bought.</p></div></div>
          <p class="small draw-label">Prizes in this draw (one is drawn)</p>
          <div class="prize-list">${P.PRIZES.map((p) => `<span class="tag gold">${ic(p.icon, 'xs')}${esc(p.name)}</span>`).join('')}</div>
          ${ticketCh.length ? `<p class="small draw-label">Challenges that give a ticket in ${H.monthName(m)}</p><div class="draw-ch">${ticketCh.map((c) => `<button class="draw-ch-row" data-a="challenge" data-id="${c.id}"><span class="chip-icon sm">${ic(P.tplOf(c).icon, 'sm')}</span><span class="row-main row-title">${esc(P.tplOf(c).title)}</span>${chStatus(c)}${ic('ChevronRight', 'sm muted')}</button>`).join('')}</div>` : ''}
          ${last ? `<p class="small" style="margin-top:12px">${ic('Trophy', 'xs')} Last draw, ${H.monthName(last.month)}: <b>${esc(P.friendName(last.winner))}</b> won ${esc(last.prize.toLowerCase())}.</p>` : ''}</div></section>
        <section class="section">${sectionHead('Partner rewards', `${fmt(P.available(s))} pts to spend`)}
          <p class="hint" style="margin:-4px 0 10px">Every partner has to cut consumption, make things last, or be a lower-impact swap. No fast fashion, no gadgets.</p>
          <div class="list">${P.REWARDS.map((r) => { const short = r.cost - P.available(s); return `<button class="row" data-a="reward" data-id="${r.id}"><span class="chip-icon brand">${ic(r.icon)}</span><div class="row-main"><div class="row-title">${esc(r.name)}</div><div class="row-sub">${esc(r.partner)} · ${P.PARTNER_TEST[r.cat]}</div></div><div class="row-end">${redeemed.has(r.id) ? '<span class="tag low">Redeemed</span>' : `<span class="pts">${r.cost}</span>${short > 0 ? `<div class="small muted">${short} to go</div>` : ''}`}</div></button>`; }).join('')}</div></section>
        ${s.redemptions.length ? `<section class="section">${sectionHead('Your codes')}<div class="list">${s.redemptions.map((v) => { const r = P.REWARDS.find((x) => x.id === v.rewardId); return `<button class="row" data-a="reward" data-id="${r.id}"><div class="row-main"><div class="row-title">${esc(r.name)}</div><div class="row-sub">${esc(r.partner)} · ${dateShort(v.at)}</div></div><code class="num" style="font-size:13px">${esc(v.code)}</code></button>`; }).join('')}</div></section>` : ''}`;
    }
    return wallet + tabsHtml + body;
  }

  /* ---------- friends ---------- */
  /* The challenge a feed item names: this month's run if there is one, otherwise the latest. */
  function challengeByTitle(title) {
    const all = s.ch.filter((c) => P.tplOf(c) && P.tplOf(c).title === title);
    return all.find((c) => P.isActive(s, c)) || all.sort((a, b) => b.start.localeCompare(a.start))[0] || null;
  }
  function visibleFeed() {
    const mutual = new Set(P.mutualFriends(s).map((f) => f.id));
    return s.feed.filter((f) => f.actor === 'me' || mutual.has(f.actor));
  }
  /* In the feed itself, challenge and badge names open their details. Toasts and the bell list get plain text. */
  function feedText(f, linked = false) {
    const who = f.actor === 'me' ? 'You' : P.friendName(f.actor);
    const target = !linked ? null : ['join', 'challenge', 'team'].includes(f.kind) && challengeByTitle(f.title) ? 'feed-challenge' : f.kind === 'badge' && P.BADGES.some((b) => b.name === f.title) ? 'feed-badge' : null;
    const t = target ? `<button class="feed-link" data-a="${target}" data-title="${esc(f.title)}">${esc(f.title)}</button>` : `<b>${esc(f.title)}</b>`;
    const withNames = (f.with || []).map((id) => esc(P.friendName(id))).join(', ');
    const text = {
      join: `joined ${t}`, challenge: `completed ${t}${f.detail ? ` at ${esc(f.detail)}` : ''}`, badge: `earned the ${t} badge`, goal: `reached a goal: ${t}`,
      streak: `is on a ${t}`, team: `teamed up for ${t}${withNames ? ` with ${withNames}` : ''}`, draw: `won the ${t}${f.detail ? `: ${esc(f.detail.toLowerCase())}` : ''}`,
      reading: f.actor === 'me' ? `logged ${t}` : 'logged a meter reading'
    }[f.kind] || esc(f.title);
    return `<b>${esc(who)}</b> ${text}`;
  }
  function feedItem(f) {
    const mine = f.actor === 'me';
    const cheer = mine
      ? `<span class="cheer static" title="${esc((f.by || []).map(P.friendName).join(', '))}">${ic('Heart', 'xs')}${f.cheers}</span>`
      : `<button class="cheer" data-a="cheer" data-id="${f.id}" aria-pressed="${!!f.cheered}" aria-label="Cheer ${esc(P.friendName(f.actor))}, ${f.cheers} cheers">${ic('Heart', 'xs')}${f.cheers}</button>`;
    return `<div class="feed-item${ui.fresh.has(f.id) ? ' new' : ''}">${mine ? avatar('me') : `<button data-a="friend" data-id="${f.actor}" style="border:0;background:none;padding:0" aria-label="Compare with ${esc(P.friendName(f.actor))}">${avatar(f.actor)}</button>`}
      <div class="feed-text">${feedText(f, true)}<div class="feed-meta"><span>${ago(f.at)}</span>${f.pts ? `<span class="pts">+${f.pts} pts</span>` : ''}</div></div>${cheer}</div>`;
  }
  function viewFriends() {
    const incoming = s.friends.filter((f) => f.status === 'incoming'), outgoing = s.friends.filter((f) => f.status === 'outgoing');
    const requests = incoming.map((f) => { const p = P.person(f.id); return `<div class="card"><div class="ch-head">${avatar(f.id)}<div style="flex:1"><h3 style="font-size:15px;font-weight:650">${esc(p.name)} wants to be friends</h3><p class="small muted">${esc(p.home)} · ${esc(p.city)}. You'll see each other's progress in the feed, never bills or exact usage.</p></div></div><div class="btn-row"><button class="btn primary small" data-a="friend-accept" data-id="${f.id}">Accept</button><button class="btn secondary small" data-a="friend-decline" data-id="${f.id}">Not now</button></div></div>`; }).join('');
    const pending = outgoing.map((f) => `<div class="row">${avatar(f.id)}<div class="row-main"><div class="row-title">${esc(P.friendName(f.id))}</div><div class="row-sub">Request sent · waiting for them to accept</div></div><span class="tag warn">Pending</span></div>`).join('');
    let body;
    if (ui.friendsSeg === 'feed') {
      const items = visibleFeed();
      body = items.length ? `<div class="list">${items.map(feedItem).join('')}</div>` : '<div class="card empty">Nothing yet. Add a friend to see their progress here.</div>';
    } else {
      const rows = P.ranking(s, ui.rankRes), maxAbs = Math.max(5, ...rows.map((r) => Math.abs(r.pct)));
      body = `${seg('rankRes', [['electricity', 'Electricity'], ['water', 'Water']], 'small')}
        <p class="hint" style="margin:10px 0">This month, each person against their own usual, so household size doesn't matter. <button class="link" data-a="rank-info" style="padding:0;font-size:13px">How it's worked out</button></p>
        <div class="list">${rows.map((r, i) => `<button class="rank-row${r.id === 'me' ? ' me' : ''}" data-a="${r.id === 'me' ? 'profile' : 'friend'}" data-id="${r.id}"><span class="rank-n">${i + 1}</span>${avatar(r.id)}<div style="min-width:0"><div class="row-title">${esc(r.name)}</div><div class="rank-bar"><i style="width:${Math.abs(r.pct) / maxAbs * 100}%;background:${r.pct <= 0 ? 'var(--good)' : 'var(--bad)'}"></i></div></div><span class="num" style="text-align:right;font-weight:650;color:${r.pct <= 0 ? 'var(--good)' : 'var(--bad)'}">${signed(r.pct, 1)}</span></button>`).join('')}</div>`;
    }
    return `${incoming.length ? `<section class="section">${requests}</section>` : ''}
      <section class="section"><div class="btn-row" style="margin:0"><button class="btn secondary" data-a="add-friend">${ic('UserPlus', 'sm')}Add a friend</button><button class="btn secondary" data-a="share">${ic('Share2', 'sm')}Share my code</button></div>${pending ? `<div class="list" style="margin-top:10px">${pending}</div>` : ''}</section>
      <section class="section">${seg('friendsSeg', [['feed', 'Feed'], ['ranking', 'Ranking']])}</section>
      <section class="section" style="margin-top:12px">${body}</section>`;
  }

  /* ---------- profile ---------- */
  function challengesDone() { return s.ledger.filter((l) => l.id.startsWith('ch-')).length; }
  function badgeTile(b) {
    const got = s.badges[b.id];
    return `<button class="badge${got ? '' : ' locked'}" data-a="badge" data-id="${b.id}" aria-label="${esc(b.name)}${got ? '' : ', locked'}"><span class="medal">${ic(got ? b.icon : 'Lock')}${got && got.pinned ? `<span class="pin">${ic('Pin')}</span>` : ''}</span>${esc(b.name)}</button>`;
  }
  function viewProfile() {
    const pinned = P.BADGES.filter((b) => s.badges[b.id] && s.badges[b.id].pinned);
    const earned = Object.keys(s.badges).length;
    return `<div class="profile-head">${avatar('me', 'lg')}<h2>${esc(s.profile.name)}</h2><p>${esc(P.describeHome(s.profile))}</p>
        ${pinned.length ? `<div class="pinned">${pinned.map((b) => `<span class="medal" title="${esc(b.name)}">${ic(b.icon)}</span>`).join('')}</div>` : ''}</div>
      <section class="section"><div class="card"><div class="share"><div style="flex:1"><span class="small muted">Your friend code</span><div class="num" style="font-size:22px;font-weight:700;letter-spacing:.04em">${esc(s.profile.code)}</div><p class="hint">Friends add you with this code. Friendship is mutual: nothing is shared until you both accept.</p></div></div><div class="btn-row"><button class="btn secondary small" data-a="copy-code">${ic('Copy', 'sm')}Copy</button><button class="btn secondary small" data-a="share">${ic('QrCode', 'sm')}Show QR</button></div></div></section>
      <section class="section"><div class="stats"><div><span>Points earned</span><b class="num">${fmt(P.lifetime(s))}</b></div><div><span>Months logged</span><b class="num">${Object.keys(s.months).length}</b></div><div><span>Goals reached</span><b class="num">${s.goals.filter((g) => g.status === 'reached').length}</b></div><div><span>Challenges done</span><b class="num">${challengesDone()}</b></div></div></section>
      <section class="section">${sectionHead('Badges', `${earned} of ${P.BADGES.length}`)}<div class="card"><div class="badges">${[...P.BADGES].sort((a, b) => !!s.badges[b.id] - !!s.badges[a.id]).map(badgeTile).join('')}</div><p class="hint" style="margin-top:8px">Tap a badge to see how it's earned. Pin up to three to the top of your profile.</p></div></section>
      <section class="section">${sectionHead('Household', `<button class="link" data-a="household">Edit</button>`)}<div class="list"><div class="row"><span class="chip-icon">${ic(P.HOUSING.find((h) => h.id === s.profile.housing).icon)}</span><div class="row-main"><div class="row-title">${esc(P.HOUSING.find((h) => h.id === s.profile.housing).name)}, ${s.profile.area} m²</div><div class="row-sub">${esc(P.APPLIANCES.filter((a) => s.profile.appliances.includes(a.id)).map((a) => (a.id === 'other' ? s.profile.otherNote || 'Something else' : a.name)).join(', ') || 'No appliances listed')}</div></div></div></div></section>
      <section class="section"><div class="list"><button class="row" data-a="settings"><span class="chip-icon">${ic('Settings')}</span><div class="row-main"><div class="row-title">Settings</div><div class="row-sub">Notifications, privacy, sounds and household</div></div>${ic('ChevronRight')}</button></div></section>
      <section class="section">${sectionHead('Points history', `${fmt(P.available(s))} available`)}<div class="list">${s.ledger.slice(-12).reverse().map((l) => `<div class="ledger-row"><span>${esc(l.reason)}<span class="muted"> · ${dateShort(l.at)}</span></span><b class="num ${l.amount < 0 ? 'neg' : 'pts'}">${l.amount > 0 ? '+' : '−'}${Math.abs(l.amount)}</b></div>`).join('')}</div></section>`;
  }

  /* ---------- settings ---------- */
  const switchBtn = (on, label, attrs) => `<button class="switch" role="switch" aria-checked="${!!on}" aria-label="${esc(label)}" ${attrs}></button>`;
  const toggleRow = (title, sub, on, attrs, lead = '') => `<div class="toggle-row">${lead}<div class="row-main"><div class="row-title" style="font-size:14.5px">${title}</div>${sub ? `<div class="row-sub">${sub}</div>` : ''}</div>${switchBtn(on, stripTags(title), attrs)}</div>`;
  function viewSettings() {
    const n = s.notify, friends = P.mutualFriends(s), muted = friends.filter((f) => !P.wantsFriend(s, f.id)).length;
    const priv = [['feed', 'Show my activity in friends\' feeds', 'Goals, challenges and badges. Never numbers.'], ['percent', 'Share % change with friends', 'Used for the ranking and comparisons.'], ['exact', 'Share exact usage per person', 'Only shown to friends who share theirs too.'], ['league', "Appear in Friends' league invites", 'Friends can add you to their team.']];
    return `<section class="section">${sectionHead('Notifications')}<div class="list">
        ${toggleRow('Price and saving tips', 'Cheap hours, price peaks and how your month is going', n.tips, 'data-a="notify" data-key="tips"', `<span class="chip-icon elec">${ic('Moon', 'sm')}</span>`)}
        ${toggleRow('Reminders for planned runs', 'When it\'s time to start something you planned in Plan', n.plans !== false, 'data-a="notify" data-key="plans"', `<span class="chip-icon">${ic('CalendarClock', 'sm')}</span>`)}
        ${toggleRow('Cheers on your posts', 'When a friend cheers something you did', n.cheers, 'data-a="notify" data-key="cheers"', `<span class="chip-icon">${ic('Heart', 'sm')}</span>`)}
      </div></section>
      <section class="section">${sectionHead('From friends', friends.length ? `<button class="link" data-a="notify-all" data-on="${muted ? 1 : 0}">${muted ? 'Turn all on' : 'Turn all off'}</button>` : '')}
        ${friends.length ? `<div class="list">${friends.map((f) => toggleRow(esc(f.name), P.wantsFriend(s, f.id) ? '' : 'Muted · still shown in your feed', P.wantsFriend(s, f.id), `data-a="notify-friend" data-id="${f.id}"`, avatar(f.id, 'sm'))).join('')}</div>` : '<div class="card empty">Add a friend to choose their notifications.</div>'}
        <p class="hint">Muting a friend only stops their notifications. Their updates stay in your feed.</p></section>
      <section class="section">${sectionHead('Sound')}<div class="list">${toggleRow('Sound effects', 'Taps, notifications and calls. Vibration where the phone supports it.', window.PBFX ? PBFX.enabled() : false, 'data-a="sound"', `<span class="chip-icon">${ic('Volume2', 'sm')}</span>`)}</div></section>
      <section class="section">${sectionHead('Privacy')}<div class="list">${priv.map(([k, t, d]) => toggleRow(t, d, s.privacy[k], `data-a="privacy" data-key="${k}"`)).join('')}</div><p class="hint">Bills, kroner amounts and your address are never shared.</p></section>
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
    set('so-electricity', fmt(P.monthSoFar(s, 'electricity')));
    set('so-water', fmt(P.monthSoFar(s, 'water'), 1));
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
      // One stream of incoming notifications, paused while a call is on screen.
      if (callBusy()) ui.nextNotify = Math.max(ui.nextNotify, t + 15000); // quiet during a call and just after it
      else if (t > ui.nextNotify) { ui.nextNotify = t + NOTIFY_GAP[0] + Math.random() * (NOTIFY_GAP[1] - NOTIFY_GAP[0]); pushNotification(NOTIFY_PATTERN[ui.notifySeq++ % NOTIFY_PATTERN.length]); }
      for (const f of s.friends.filter((x) => x.status === 'outgoing' && P.now(s).getTime() - new Date(x.at).getTime() > 7000)) {
        const res = P.acceptFriend(s, f.id);
        toast({ who: f.id, text: `<b>${esc(P.friendName(f.id))}</b> accepted your request`, sub: 'You can now compare progress', go: 'friends', sound: 'notify' });
        if (res.length) celebrate(res);
        softRender(); save();
      }
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
      const body = `Electricity is ${fmt(price, 2)} kr/kWh now${p.green ? ', a green hour' : ''}. Mark it done in Plan when it has run.`;
      addNote({ kind: 'plan', icon: 'CalendarClock', title: `Time to start: ${a.cycle.name.toLowerCase()}`, body, go: 'plan' }, { icon: 'CalendarClock', text: `<b>Time to start: ${esc(a.cycle.name.toLowerCase())}</b>`, sub: body, go: 'plan', sound: 'tip', tone: 'tip' });
    }
  }
  /* ---------- incoming notifications ----------
     One every 40-64 s (~52 s on average): 35% fewer than the previous 26-42 s gap, which was already
     35% fewer than the first builds. The second is always a household tip, so it isn't only friends.
     Each one also lands in the bell's list. */
  const NOTIFY_GAP = [40000, 64000];
  const NOTIFY_PATTERN = ['friend', 'tip', 'cheer', 'friend', 'friend', 'tip', 'cheer', 'friend'];
  const callBusy = () => !!(window.PBCall && PBCall.busy()) || !!(window.PBFeedback && PBFeedback.isBusy());
  function ringBell() { const b = $('[data-a="notes"]'); if (b) { b.classList.remove('ring'); void b.offsetWidth; b.classList.add('ring'); } }
  function addNote(n, toastOpts) {
    const item = P.note(s, n);
    if (toastOpts) toast({ ...toastOpts, sound: toastOpts.sound || (n.kind === 'tip' ? 'tip' : 'notify') });
    softRender(); ringBell(); save();
    return item;
  }
  function pushNotification(kind, force = false) {
    if (!s) return;
    if (kind === 'friend') {
      const ev = P.friendEvent(s, Math.random);
      if (!ev) return;
      ui.fresh.add(ev.id);
      if (!force && !P.wantsFriend(s, ev.actor)) { softRender(); save(); return; } // muted: feed only
      addNote({ kind: 'friend', actor: ev.actor, feedId: ev.id, icon: 'Users', go: 'friends' }, { who: ev.actor, text: feedText(ev), sub: 'Just now · tap to open the feed', go: 'friends' });
    } else if (kind === 'cheer') {
      if (!force && !s.notify.cheers) return;
      const c = P.friendCheers(s, Math.random);
      if (!c) return;
      if (!force && !P.wantsFriend(s, c.friend.id)) { save(); return; }
      addNote({ kind: 'cheer', actor: c.friend.id, icon: 'Heart', title: `${c.friend.name} cheered you`, body: stripTags(feedText(c.item)), go: 'friends' }, { who: c.friend.id, text: `<b>${esc(c.friend.name)}</b> cheered you`, sub: stripTags(feedText(c.item)), go: 'friends' });
    } else if (kind === 'tip') {
      if (!force && !s.notify.tips) return;
      const tip = P.nextTip(s);
      addNote(tip, { icon: tip.icon, text: `<b>${esc(tip.title)}</b>`, sub: tip.body, go: tip.go, tone: 'tip' });
    }
  }
  /* Notification text for the bell list. Friend notes are worded from their feed item. */
  function noteText(n) {
    if (n.kind === 'friend') { const f = s.feed.find((x) => x.id === n.feedId); return { title: f ? stripTags(feedText(f)) : `${P.friendName(n.actor)} has an update`, body: '' }; }
    return { title: n.title || '', body: n.body || '' };
  }
  /* Re-render only when it won't disturb typing or an open sheet. */
  function softRender() {
    if (ui.sheet) return;
    const a = document.activeElement;
    if (a && /INPUT|SELECT|TEXTAREA/.test(a.tagName) && $('#app').contains(a)) return;
    if (['home', 'friends', 'goals'].includes(ui.tab) || ui.page) render(); else { const h = $('.top'); if (h) h.outerHTML = header(); }
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
    el.innerHTML = `${t.who ? avatar(t.who) : `<span class="toast-icon${t.tone === 'tip' ? ' tip' : ''}">${ic(t.icon || 'Check', 'sm')}</span>`}<div class="toast-text"><span class="toast-app">PowerBuddy<em>now</em></span>${t.text}${t.sub ? `<small>${esc(t.sub)}</small>` : ''}</div>`;
    el.hidden = false; el.classList.remove('out'); el.style.transform = ''; el.style.animation = 'none'; void el.offsetWidth; el.style.animation = '';
    if (t.sound && window.PBFX) { PBFX.play(t.sound); PBFX.vibrate(t.sound === 'notify' || t.sound === 'tip' ? [12, 60, 12] : 8); }
    el.onclick = () => {
      if (ui.toastSwiped) { ui.toastSwiped = false; return; }
      if (t.onTap) { hideToast(nextToast); t.onTap(); return; }
      if (t.go && s) { ui.page = null; ui.tab = t.go; if (t.go === 'friends') ui.friendsSeg = 'feed'; closeSheet(true); render(); }
      hideToast(nextToast);
    };
    clearTimeout(ui.toastTimer); ui.toastTimer = setTimeout(() => hideToast(nextToast), 4600);
    $('#announcer').textContent = stripTags(t.text);
  }
  (() => {
    const el = $('#toast'); let y0 = null, dy = 0;
    el.addEventListener('pointerdown', (e) => { y0 = e.clientY; dy = 0; el.style.transition = 'none'; });
    window.addEventListener('pointermove', (e) => { if (y0 === null) return; dy = Math.min(0, e.clientY - y0); el.style.transform = `translateY(${dy}px)`; });
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
  function renderSheet() {
    const el = $('#sheet'), sh = ui.sheet;
    if (!sh) return closeSheet();
    ++ui.sheetToken; el.classList.remove('closing');
    const [title, body] = SHEETS[sh.type](sh), gliders = el.hidden ? null : snapSegs(el);
    el.innerHTML =`<div class="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title"><div class="sheet-grip" aria-hidden="true"></div><div class="sheet-head"><h2 id="sheet-title">${title}</h2><button class="icon-btn" data-a="close" aria-label="Close">${ic('X')}</button></div><div class="sheet-body">${body}</div></div>`;
    el.hidden = false;
    initSegs(el, gliders);
    bindSheetDrag(el);
    emitRender();
    bindCharts(el);
    const first = $('.sheet-body input, .sheet-body select, .sheet-body button', el) || $('[data-a="close"]', el);
    if (first && !sh.noFocus) first.focus({ preventScroll: true });
    if (sh.type === 'goal') updateGoalSheet();
  }
  /* Pull the sheet down by its grip or title bar to dismiss it. */
  function bindSheetDrag(layer) {
    const sheet = $('.sheet', layer), handle = [$('.sheet-grip', layer), $('.sheet-head', layer)];
    let y0 = null, dy = 0;
    const down = (e) => { if (e.target.closest('button')) return; y0 = e.clientY; dy = 0; sheet.style.transition = 'none'; try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* not capturable */ } };
    const move = (e) => { if (y0 === null) return; dy = Math.max(0, e.clientY - y0); sheet.style.transform = `translateY(${dy}px)`; };
    const up = () => {
      if (y0 === null) return; y0 = null; sheet.style.transition = 'transform .28s var(--spring)';
      if (dy > 110) { sheet.style.transform = 'translateY(100%)'; closeSheet(); } else sheet.style.transform = '';
    };
    for (const h of handle) { if (!h) continue; h.addEventListener('pointerdown', down); h.addEventListener('pointermove', move); h.addEventListener('pointerup', up); h.addEventListener('pointercancel', up); }
  }
  function field(label, html, error) { return `<label class="field"><span>${label}</span>${html}${error ? `<span class="field-error">${esc(error)}</span>` : ''}</label>`; }
  function missingMonths() { const out = []; for (let i = 1; i <= 12; i++) { const m = H.addMonths(P.thisMonth(s), -i); if (!s.months[m] || s.months[m].src !== 'meter') out.push(m); } return out; }
  const SHEETS = {
    notes() {
      const items = s.notes;
      const row = (n) => {
        const { title, body } = noteText(n), isNew = !n.read;
        const lead = n.actor ? avatar(n.actor) : `<span class="chip-icon ${n.kind === 'tip' ? 'elec' : n.kind === 'call' ? 'bad' : isNew ? 'brand' : ''}">${ic(n.icon || 'Bell')}</span>`;
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
      return [cur ? 'Correct a month' : 'Add a reading', `<form data-form="reading" novalidate>
        <p class="small muted">From your bill or meter. Homes like yours use about ${fmt(te)} kWh and ${fmt(tw, 1)} m³ in ${H.monthName(m)}.</p>
        ${field('Month', `<select class="select" name="month" data-change="reading-month">${opts.map((x) => `<option value="${x}"${x === m ? ' selected' : ''}>${H.monthName(x)} ${x.slice(0, 4)}${s.months[x] ? ' (logged)' : ''}</option>`).join('')}</select>`, e.month)}
        ${field('Electricity', `<div class="input-unit"><input class="input" name="e" inputmode="decimal" value="${esc(v.e ?? (cur ? cur.e : ''))}" aria-invalid="${!!e.e}" autocomplete="off"><b>kWh</b></div>`, e.e)}
        ${field('Water', `<div class="input-unit"><input class="input" name="w" inputmode="decimal" value="${esc(v.w ?? (cur ? cur.w : ''))}" aria-invalid="${!!e.w}" autocomplete="off"><b>m³</b></div>`, e.w)}
        <details style="margin-top:14px"><summary class="link" style="display:inline-flex;cursor:pointer">Add the billed amounts (optional)</summary>
          ${field('Electricity bill', `<div class="input-unit"><input class="input" name="amountE" inputmode="decimal" value="${esc(v.amountE || '')}"><b>kr</b></div>`)}
          ${field('Water bill', `<div class="input-unit"><input class="input" name="amountW" inputmode="decimal" value="${esc(v.amountW || '')}"><b>kr</b></div>`)}
          <p class="hint">We use these to check that the amounts match the usage.</p></details>
        ${(sh.warnings || []).map((w) => `<div class="alert warn">${ic('CircleAlert', 'sm')}<span>${esc(w)}</span></div>`).join('')}
        <div class="btn-row"><button class="btn primary" type="submit">${sh.warnings && sh.warnings.length ? 'Save anyway' : 'Save'}</button></div>
        ${!s.ledger.some((l) => l.id === 'reading-' + m) ? '<p class="hint" style="text-align:center">+10 points for logging a month</p>' : ''}</form>`];
    },
    goal(sh) {
      const r = sh.resource || 'electricity', keep = sh.kind === 'keep';
      return ['New goal', `<form data-form="goal">
        <p class="small muted">Starts ${H.monthName(P.thisMonth(s))}. Measured against your usual, adjusted for the season.</p>
        <div class="field"><span>Your aim</span><div class="seg" role="group">${[['cut', 'Use less'], ['keep', 'Keep it steady']].map(([v, l]) => `<button type="button" data-a="goal-kind" data-val="${v}" aria-pressed="${(sh.kind || 'cut') === v}">${l}</button>`).join('')}</div>
          <p class="hint">${keep ? 'Already where you want to be? Stay there: at or under your usual, or under what similar homes use.' : 'Cut back by a set percentage compared with your usual.'}</p></div>
        <div class="field"><span>${keep ? 'What to keep steady' : 'What to cut'}</span><div class="seg" role="group">${[['electricity', 'Electricity'], ['water', 'Water'], ['both', 'Both']].map(([v, l]) => `<button type="button" data-a="goal-res" data-val="${v}" aria-pressed="${r === v}">${l}</button>`).join('')}</div></div>
        ${keep ? `<div class="field"><span>Stay at or under</span><div class="seg" role="group">${[['usual', 'Your usual'], ['typical', 'Similar homes']].map(([v, l]) => `<button type="button" data-a="goal-bench" data-val="${v}" aria-pressed="${(sh.bench || 'usual') === v}">${l}</button>`).join('')}</div></div>`
          : `<label class="field"><span>By how much: <b data-bind="target">${sh.target || 5}%</b></span><input class="range" type="range" name="target" min="3" max="30" step="1" value="${sh.target || 5}" data-input="goal"></label>`}
        <div class="field"><span>For how long</span><div class="seg" role="group">${goalDurations(sh.kind).map((v) => `<button type="button" data-a="goal-months" data-val="${v}" aria-pressed="${(sh.months || 1) === v}">${v} month${v > 1 ? 's' : ''}</button>`).join('')}</div></div>
        <div data-bind="baseline" class="small" style="margin-top:14px;color:var(--ink-2)"></div>
        <div class="estimate"><div><p>Estimated reward</p><p class="small muted" data-bind="why"></p></div><b class="num" data-bind="points">–</b></div>
        <div data-bind="warn"></div>
        <div class="btn-row"><button class="btn primary" type="submit">Start goal</button></div></form>`];
    },
    challenge(sh) {
      const c = s.ch.find((x) => x.id === sh.id), t = P.tplOf(c), p = P.challengeProgress(s, c), who = P.participants(c).filter((id) => P.mutualFriends(s).some((f) => f.id === id));
      const period = `${dateShort(c.start)} – ${dateShort(c.end)}`;
      let action;
      if (!c.joined && !P.isActive(s, c)) action = `<div class="alert info">${ic('Clock', 'sm')}<span>This round has ended. A new one starts next month.</span></div>`;
      else if (c.joined) action = `<div class="card" style="margin-top:14px"><div class="row-title">${esc(p.label)}</div><div class="bar" style="margin-top:10px"><i style="width:${p.ratio * 100}%"></i></div>${c.team.length ? `<p class="small muted" style="margin-top:8px">Team: you, ${c.team.map((id) => esc(P.friendName(id))).join(', ')}</p>` : ''}</div>${P.canCheckIn(s, c) ? `<div class="btn-row"><button class="btn primary" data-a="checkin" data-id="${c.id}">Check in for today</button></div>` : ''}`;
      else if (t.kind === 'team') { const sel = sh.team || []; action = `<div class="field"><span>Pick 1-3 teammates</span></div><div class="check-list">${P.mutualFriends(s).map((f) => `<button type="button" class="choice" data-a="team-pick" data-id="${f.id}" aria-pressed="${sel.includes(f.id)}">${avatar(f.id, 'sm')}${esc(f.name)}</button>`).join('')}</div><div class="btn-row"><button class="btn primary" data-a="join" data-id="${c.id}"${sel.length ? '' : ' disabled'}>Start the league${sel.length ? ` with ${sel.length}` : ''}</button></div>`; }
      else action = `<div class="btn-row"><button class="btn primary" data-a="join" data-id="${c.id}">Join challenge</button></div>`;
      return [esc(t.title), `<div class="ch-head"><span class="chip-icon">${ic(t.icon)}</span><div><p>${esc(t.blurb)}</p><p class="small muted" style="margin-top:4px">${period}</p></div></div>
        <div class="list" style="margin-top:14px"><div class="row"><div class="row-main"><div class="row-title">Reward</div><div class="row-sub">${t.points} points${t.per ? `, including ${t.per} per check-in` : ''}${t.ticket ? ' + a Green draw ticket' : ''}</div></div>${ic('Gift')}</div>
        <div class="row"><div class="row-main"><div class="row-title">How it's measured</div><div class="row-sub">${esc(t.how)}</div></div>${ic('Gauge')}</div>
        ${who.length ? `<div class="row"><div class="faces">${who.map((id) => avatar(id, 'sm')).join('')}</div><div class="row-main"><div class="row-sub">${who.map((id) => esc(P.friendName(id))).join(', ')} ${who.length > 1 ? 'are' : 'is'} in</div></div></div>` : ''}</div>${action}
        ${ui.page || ui.tab !== 'goals' || ui.goalsSeg !== 'challenges' ? `<div style="text-align:center;margin-top:10px"><button class="link" data-a="goto-challenges">See all challenges${ic('ChevronRight', 'sm')}</button></div>` : ''}`];
    },
    reward(sh) {
      const r = P.REWARDS.find((x) => x.id === sh.id), v = s.redemptions.find((x) => x.rewardId === r.id), short = r.cost - P.available(s);
      return [esc(r.name), `<div class="ch-head"><span class="chip-icon brand">${ic(r.icon)}</span><div><div class="row-title">${esc(r.partner)}</div><span class="tag brand" style="margin-top:4px">${P.PARTNER_TEST[r.cat]}</span></div></div>
        <div class="alert info">${ic('Leaf', 'sm')}<span><b>Why this partner:</b> ${esc(r.why)}</span></div>
        ${v ? `<p class="small muted" style="margin-top:14px">Your code, redeemed ${dateShort(v.at)}. Show it in the shop or enter it online. It works once.</p><div class="code">${esc(v.code)}</div><div class="btn-row"><button class="btn secondary" data-a="copy" data-text="${esc(v.code)}">${ic('Copy', 'sm')}Copy code</button></div>`
          : `<div class="btn-row"><button class="btn primary" data-a="redeem" data-id="${r.id}"${short > 0 ? ' disabled' : ''}>${short > 0 ? `${short} more points needed` : `Redeem for ${r.cost} points`}</button></div><p class="hint" style="text-align:center">Codes are single-use and tied to your account.</p>`}`];
    },
    friend(sh) {
      const f = P.person(sh.id), m = P.thisMonth(s), me = { e: P.change(s, 'electricity', m), w: P.change(s, 'water', m), streak: P.loggedStreak(s, H.addMonths(m, -1)) || P.loggedStreak(s, H.addMonths(m, -2)), pts: P.lifetime(s), done: challengesDone(), badges: Object.keys(s.badges).length };
      const row = (label, a, b, lowerWins, f2 = (x) => fmt(x)) => `<tr><td>${label}</td><td class="num ${(lowerWins ? a < b : a > b) ? 'win' : ''}">${f2(a)}</td><td class="num ${(lowerWins ? b < a : b > a) ? 'win' : ''}">${f2(b)}</td></tr>`;
      const exact = s.privacy.exact && f.share;
      const isFriend = P.mutualFriends(s).some((x) => x.id === f.id);
      return [`You and ${esc(f.name)}`, `<div class="ch-head">${avatar(f.id, 'lg')}<div><div class="row-title" style="font-size:18px">${esc(f.name)}</div><p class="small muted">${esc(f.home)} · ${esc(f.city)}</p><div class="faces" style="margin-top:8px">${f.badges.slice(0, 5).map((id) => { const b = P.BADGES.find((x) => x.id === id); return `<span class="medal" style="width:28px;height:28px;margin-right:4px" title="${esc(b.name)}">${ic(b.icon, 'xs')}</span>`; }).join('')}</div></div></div>
        <table class="compare-table"><thead><tr><th>This month</th><th>You</th><th>${esc(f.name)}</th></tr></thead><tbody>
        ${row('Electricity vs usual', H.round(me.e, 1), f.e, true, (x) => signed(x, 1))}
        ${row('Water vs usual', H.round(me.w, 1), f.w, true, (x) => signed(x, 1))}
        ${row('Logging streak', me.streak, f.streak, false, (x) => `${x} mo`)}
        ${row('Challenges done', me.done, f.done, false)}
        ${row('Points earned', me.pts, f.pts, false)}
        ${row('Badges', me.badges, f.badges.length, false)}
        ${exact ? row('kWh per person', H.round(P.projected(s, 'electricity') / P.persons(s.profile)), f.perE, true) : ''}
        </tbody></table>
        ${exact ? '' : `<div class="alert info">${ic('EyeOff', 'sm')}<span>Exact usage is hidden. It's only shown when you both turn on <b>Share exact usage</b>${f.share ? ` (${esc(f.name)} has)` : ''}.</span></div>`}
        ${isFriend ? `<div class="list" style="margin-top:14px">${toggleRow(`Notifications from ${esc(f.name)}`, 'Their goals, challenges and badges. The feed always shows them.', P.wantsFriend(s, f.id), `data-a="notify-friend" data-id="${f.id}"`, `<span class="chip-icon">${ic('Bell', 'sm')}</span>`)}</div>` : ''}
        ${isFriend ? `<div class="btn-row"><button class="btn secondary" data-a="league-with" data-id="${f.id}">${ic('Users', 'sm')}Start a Friends' league</button></div>` : ''}`];
    },
    addFriend(sh) {
      return ['Add a friend', `<form data-form="add-friend" novalidate><p class="small muted">Ask your friend for their code. It's on their profile.</p>
        ${field('Friend code', `<input class="input" name="code" placeholder="NAME-1234" autocapitalize="characters" autocomplete="off" value="${esc(sh.value || '')}" aria-invalid="${!!sh.error}">`, sh.error)}
        <div class="btn-row"><button class="btn primary" type="submit">Send request</button></div>
        <p class="hint">Prototype: try <b>SIGNE-3307</b> or <b>JONAS-5120</b>.</p></form>`];
    },
    share() {
      return ['Your code', `<div class="share" style="flex-direction:column;text-align:center">${qr(s.profile.code)}<div><div class="num" style="font-size:24px;font-weight:700;letter-spacing:.05em">${esc(s.profile.code)}</div><p class="hint">Friends scan this or type the code in <b>Add a friend</b>. Mock code for the prototype.</p></div></div>
        <div class="btn-row"><button class="btn primary" data-a="copy-code">${ic('Copy', 'sm')}Copy code</button><button class="btn secondary" data-a="copy" data-text="https://powerbuddy.example/add/${esc(s.profile.code)}">${ic('Share2', 'sm')}Copy link</button></div>`];
    },
    badge(sh) {
      const b = P.BADGES.find((x) => x.id === sh.id), got = s.badges[b.id];
      const friendsWith = P.mutualFriends(s).filter((f) => f.badges.includes(b.id));
      return [esc(b.name), `<div class="celebrate"><span class="medal xl" style="margin:0 auto;${got ? '' : 'background:var(--sunken);color:var(--faint);box-shadow:inset 0 0 0 2px var(--line-2)'}">${ic(got ? b.icon : 'Lock')}</span>
        <p style="margin-top:14px">${esc(b.how)}</p><p class="small muted" style="margin-top:6px">${got ? `Earned ${dateShort(got.at)}` : 'Not earned yet'}${friendsWith.length ? ` · ${friendsWith.length} of your friends have it` : ''}</p></div>
        ${got ? `<div class="btn-row"><button class="btn ${got.pinned ? 'secondary' : 'primary'}" data-a="pin" data-id="${b.id}">${ic('Pin', 'sm')}${got.pinned ? 'Unpin from profile' : 'Pin to profile'}</button></div>` : badgeHelp(b)}
        ${sh.error ? `<div class="alert warn">${esc(sh.error)}</div>` : ''}`];
    },
    /* How an active goal is holding up: this month's budget, the pace needed, and what to do about it. */
    goalDetail(sh) {
      const g = s.goals.find((x) => x.id === sh.id);
      if (!g) return ['Goal', '<div class="empty">This goal has ended.</div>'];
      const p = P.goalProgress(s, g), m = P.thisMonth(s), n = P.now(s), dim = H.daysIn(m), keep = g.kind === 'keep';
      const months = P.goalMonths(g), period = months.length > 1 ? `${H.monthName(g.start)} – ${H.monthName(g.end)} ${g.end.slice(0, 4)}` : `${H.monthName(g.start)} ${g.start.slice(0, 4)}`;
      const benchLabel = g.bench === 'typical' ? 'Similar homes' : 'Your usual';
      const cards = P.goalResources(g).map((r) => {
        const bench = g.bench === 'typical' ? P.typicalMonth(s.profile, r, m) : P.usual(s, r, m), aim = bench * (1 - (keep ? 0 : g.target) / 100);
        const so = P.monthSoFar(s, r), pr = P.projected(s, r), left = dim - n.getDate() + (1 - P.cumShare(r, H.hourOf(n)));
        const perDay = (aim - so) / left, pace = (pr - so) / left, through = (n.getDate() - 1 + P.cumShare(r, H.hourOf(n))) / dim;
        const day = (v) => (r === 'water' ? `${fmt(Math.max(0, v) * 1000)} litres` : `${fmt(Math.max(0, v), 1)} kWh`);
        const ok = pr <= aim;
        const advice = so >= aim ? `This month's budget of ${fmtRes(r, aim)} ${unit(r)} is used up. Using less for the rest of the month still helps the next one.`
          : `To make it, keep to about <b>${day(perDay)} a day</b> for the rest of ${H.monthName(m)}. Lately it's been ${day(pace)} a day${ok ? ', so you\'re on pace' : ''}.`;
        return `<div class="card" style="margin-top:12px"><div class="row-title" style="display:flex;align-items:center;gap:8px"><span class="chip-icon ${r === 'water' ? 'water' : 'elec'}" style="width:28px;height:28px">${ic(r === 'water' ? 'Droplet' : 'Zap', 'sm')}</span>${resName(r)} in ${H.monthName(m)}${delta(-(P.underBy(s, g, r, m) || 0), 1)}</div>
          <div class="headline-stat" style="margin-top:10px"><div><span>${benchLabel}</span><b class="num">${fmtRes(r, bench)} ${unit(r)}</b></div><div><span>Aim</span><b class="num">≤ ${fmtRes(r, aim)}</b></div><div><span>Heading for</span><b class="num" style="color:${ok ? 'var(--good)' : 'var(--gold)'}">${fmtRes(r, pr)}</b></div></div>
          <div class="target-bar" aria-hidden="true"><i style="width:${H.clamp(so / aim, 0, 1) * 100}%;background:${so / aim <= through + 0.02 ? 'var(--good)' : 'var(--gold)'}"></i><b style="left:${through * 100}%"></b></div>
          <div class="prog-meta"><span>${fmtRes(r, so)} of ${fmtRes(r, aim)} ${unit(r)} used</span><span>Marker: day ${n.getDate()} of ${dim}</span></div>
          <p class="small" style="margin-top:10px;color:var(--ink-2)">${advice}</p></div>`;
      }).join('');
      const history = months.length > 1 ? `<div class="list" style="margin-top:12px">${months.map((mm) => { const u = mm > m ? null : Math.min(...P.goalResources(g).map((r) => P.underBy(s, g, r, mm) ?? 0)); return `<div class="row"><div class="row-main"><div class="row-title">${H.monthName(mm)}</div><div class="row-sub">${u === null ? 'Not started' : `${fmt(Math.abs(u), 1)}% ${u >= 0 ? 'under' : 'over'} ${goalBenchName(g)}${mm === m ? ' so far' : ''}`}</div></div>${u === null ? '' : ic(u >= (keep ? 0 : g.target) ? 'CircleCheck' : 'Clock', 'sm')}</div>`; }).join('')}</div>` : '';
      const res = g.resource === 'both' ? 'electricity' : g.resource;
      return [esc(P.goalLabel(g)), `<div class="ch-head"><span class="chip-icon brand">${ic(keep ? 'ShieldCheck' : 'Target')}</span><div style="flex:1"><div class="row-title">${p.onTrack ? 'On track' : keep ? 'Over for now' : 'Behind for now'}</div><p class="small muted">${period} · worth ${g.est} points · ${keep ? `stay at or under ${goalBenchName(g)}` : `${g.target}% under your usual`}</p></div><span class="tag ${p.onTrack ? 'low' : 'warn'}">${goalStatus(g, p).split(' · ')[1]}</span></div>
        ${cards}${history}
        <p class="hint">The bar is what you've used of this month's aim. The marker is how far through the month we are: staying left of it keeps you on pace.</p>
        <div class="btn-row"><button class="btn primary" data-a="go" data-tab="plan">${ic('Lightbulb', 'sm')}Ideas to cut back</button><button class="btn secondary" data-a="go" data-tab="usage" data-res="${res}">${ic('ChartColumn', 'sm')}See usage</button></div>`];
    },
    /* Akshi asked how the ranking is calculated: worked through with the visitor's own numbers. */
    rankInfo() {
      const m = P.thisMonth(s), r = ui.rankRes, u = P.usual(s, r, m), pr = P.projected(s, r), c = P.change(s, r, m);
      const row = (icon, title, text) => `<div class="row"><span class="chip-icon">${ic(icon, 'sm')}</span><div class="row-main"><div class="row-title">${title}</div><div class="row-sub">${text}</div></div></div>`;
      return ['How the ranking works', `<p class="small" style="color:var(--ink-2)">Everyone is ranked by how this month compares with <b>their own usual</b>, in percent. The lowest number comes first.</p>
        <div class="list" style="margin-top:14px">
          ${row('CalendarDays', 'Your usual', `The average of your last three logged months, adjusted for the season. For ${H.monthName(m)} that's ${fmtRes(r, u)} ${unit(r)} of ${r === 'water' ? 'water' : 'electricity'}.`)}
          ${row('Activity', 'This month', `What you've used so far, plus the rest of the month at your pace over the last 7 days. You're heading for ${fmtRes(r, pr)} ${unit(r)}.`)}
          ${row('TrendingDown', 'Your number', `${fmtRes(r, pr)} against ${fmtRes(r, u)} is ${signed(c, 1)}. Under your usual shows green, over shows red.`)}
        </div>
        <div class="alert info">${ic('Users', 'sm')}<span>A family of four will always use more than a student. Comparing each home with itself means the same effort counts the same in any home.</span></div>
        <p class="hint">Numbers settle as the month goes on. Only friends who share their % change are ranked, and nobody sees anyone's kWh or bills here.</p>
        <div class="btn-row"><button class="btn secondary" data-a="settings">${ic('EyeOff', 'sm')}Privacy settings</button></div>`];
    },
    household(sh) {
      const d = sh.d;
      return ['Your household', `<form data-form="household">${householdFields(d)}<p class="hint">Changing this updates the "homes like yours" estimate. Your logged months stay as they are.</p><div class="btn-row"><button class="btn primary" type="submit">Save</button></div></form>`];
    },
    celebrate(sh) {
      const main = sh.items.find((x) => x.type === 'challenge' || x.type === 'goal') || sh.items[0];
      const badges = sh.items.filter((x) => x.type === 'badge'), pts = H.sum(sh.items.map((x) => x.points || 0)), ticket = sh.items.some((x) => x.ticket);
      const title = main.type === 'badge' ? 'New badge' : main.type === 'goal' ? 'Goal reached' : 'Challenge complete';
      return [title, `<div class="celebrate"><div class="burst">${ic(main.type === 'badge' ? P.BADGES.find((b) => b.id === main.id).icon : main.type === 'goal' ? 'Target' : 'Trophy')}</div>
        <h3>${esc(main.title)}</h3>${pts ? `<div class="gain">+${pts}</div><p>points</p>` : ''}${ticket ? `<p style="margin-top:8px">${ic('Ticket', 'sm')} You're in the Green draw</p>` : ''}
        ${badges.length && main.type !== 'badge' ? `<p style="margin-top:8px">${ic('Award', 'sm')} New badge: ${badges.map((b) => esc(b.title)).join(', ')}</p>` : badges.length > 1 ? `<p style="margin-top:8px">Also: ${badges.slice(1).map((b) => esc(b.title)).join(', ')}</p>` : ''}
        <p class="small muted" style="margin-top:12px">${s.privacy.feed ? 'Your friends will see this in their feed.' : 'Your activity is hidden from friends.'}</p></div>
        <div class="btn-row"><button class="btn primary" data-a="close">Done</button></div>`];
    }
  };
  function qr(code) {
    const n = 21, r = H.rng('qr' + code), cells = [];
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const inF = [[0, 0], [n - 7, 0], [0, n - 7]].find(([fx, fy]) => x >= fx && x < fx + 7 && y >= fy && y < fy + 7);
      let on;
      if (inF) { const dx = x - inF[0], dy = y - inF[1]; on = dx === 0 || dx === 6 || dy === 0 || dy === 6 || (dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4); }
      else on = r() < 0.48;
      if (on) cells.push(`<rect x="${x}" y="${y}" width="1.02" height="1.02"/>`);
    }
    return `<svg class="qr" viewBox="-1 -1 ${n + 2} ${n + 2}" role="img" aria-label="Mock QR code for ${esc(code)}" fill="#16211B">${cells.join('')}</svg>`;
  }
  /* Keeping steady is a longer habit than a one-off cut, so it runs for longer. */
  const goalDurations = (kind) => (kind === 'keep' ? [1, 3, 6] : [1, 2, 3]);
  function updateGoalSheet() {
    const sh = ui.sheet; if (!sh || sh.type !== 'goal') return;
    const r = sh.resource || 'electricity', target = sh.target || 5, months = sh.months || 1, m = P.thisMonth(s), keep = sh.kind === 'keep', typical = keep && sh.bench === 'typical';
    const eff = P.efficient(s, r), pts = P.goalPoints({ kind: sh.kind, target, months, resource: r, efficient: eff });
    const set = (k, html) => { const el = $(`[data-bind="${k}"]`); if (el) el.innerHTML = html; };
    set('target', `${target}%`); set('points', `≈ ${pts} pts`);
    set('why', `${keep ? '25' : `8 × ${target}%`} × ${months} month${months > 1 ? 's' : ''}${r === 'both' ? ' × 1.5 for both' : ''}${eff ? ' × 1.25 because you already use less than similar homes' : ''}`);
    const res = r === 'both' ? ['electricity', 'water'] : [r];
    const over = [];
    set('baseline', res.map((x) => {
      const u = typical ? P.typicalMonth(s.profile, x, m) : P.usual(s, x, m), pr = P.projected(s, x), aim = u * (1 - (keep ? 0 : target) / 100);
      if (keep && pr > u * 1.05) over.push(Math.round((pr / u - 1) * 100));
      return `<div style="margin-top:4px">${ic(x === 'water' ? 'Droplet' : 'Zap', 'xs')} ${typical ? 'Similar homes' : 'Usual'} ${H.monthName(m)}: <b>${fmtRes(x, u)} ${unit(x)}</b> → ${keep ? 'stay at or under it' : `aim for <b>${fmtRes(x, aim)} ${unit(x)}</b>`}. Heading for ${fmtRes(x, pr)}.</div>`;
    }).join(''));
    set('warn', !keep && target > 15 ? `<div class="alert warn">${ic('CircleAlert', 'sm')}<span>Over 15% is a big change in one go. It's worth more points, but a smaller step you keep is better than a big one you don't.</span></div>`
      : over.length ? `<div class="alert warn">${ic('CircleAlert', 'sm')}<span>You're heading about ${Math.max(...over)}% over this month. Cutting back a little first might be the easier start.</span></div>` : '');
  }
  /* For a badge not earned yet: where you stand and what to do next. */
  function badgeHelp(b) {
    const m = P.thisMonth(s), prev = H.addMonths(m, -1);
    const go = (label, attrs, primary = true) => `<button class="btn ${primary ? 'primary' : 'secondary'}" ${attrs}>${label}</button>`;
    const resRow = (r, cut) => { const u = P.usual(s, r, m), pr = P.projected(s, r); return `<div class="row"><span class="chip-icon ${r === 'water' ? 'water' : 'elec'}">${ic(r === 'water' ? 'Droplet' : 'Zap')}</span><div class="row-main"><div class="row-title">${resName(r)} this month</div><div class="row-sub">Heading for ${fmtRes(r, pr)} ${unit(r)}. ${cut ? `${cut}% under your usual is ${fmtRes(r, u * (1 - cut / 100))}.` : `Your usual is ${fmtRes(r, u)}.`}</div></div>${delta(P.change(s, r, m), 1)}</div>`; };
    const usageBtns = (r = 'electricity') => go(`${ic('ChartColumn', 'sm')}This month's usage`, `data-a="go" data-tab="usage" data-res="${r}"`, false) + go(`${ic('Lightbulb', 'sm')}Ideas to cut back`, 'data-a="go" data-tab="plan"');
    let text = '', rows = '', btns = '';
    const active = s.goals.find((g) => g.status === 'active');
    switch (b.id) {
      case 'first-reading': text = 'Add a month from your bill or meter. It takes a minute.'; btns = go('Add a reading', 'data-a="reading"'); break;
      case 'steady': { const n = P.loggedStreak(s, prev); text = `You have ${n} month${n === 1 ? '' : 's'} in a row logged. Three earns it. Sample months don't count.`; btns = go('Add a reading', 'data-a="reading"'); break; }
      case 'goal-getter': text = active ? `${P.goalLabel(active)} is running. ${P.goalProgress(s, active).onTrack ? "It's on track." : "It's behind for now."}` : 'Set a goal for this month and reach it.'; btns = active ? go('See your goal', `data-a="goal-detail" data-id="${active.id}"`) : go('Set a goal', 'data-a="goal"'); break;
      case 'ten-club': text = 'Finish this month 10% under your usual on either one:'; rows = resRow('electricity', 10) + resRow('water', 10); btns = usageBtns(); break;
      case 'water-wise': text = 'Finish this month with water 10% under your usual:'; rows = resRow('water', 10); btns = usageBtns('water'); break;
      case 'balance': text = 'Finish this month under your usual on both:'; rows = resRow('electricity') + resRow('water'); btns = usageBtns(); break;
      case 'comeback': {
        const last = P.change(s, 'electricity', prev);
        text = last !== null && last > 0 ? `${H.monthName(prev)} was ${signed(last, 1)} on electricity. Finish ${H.monthName(m)} under your usual to earn it:` : `This one is for bouncing back after a month over your usual. ${H.monthName(prev)} wasn't over, so there's nothing to win back right now.`;
        rows = resRow('electricity'); btns = usageBtns(); break;
      }
      case 'off-peak': text = `${s.greenRuns} of 10 loads run in green hours so far.`; rows = `<div class="bar" style="margin-top:10px"><i style="width:${Math.min(1, s.greenRuns / 10) * 100}%"></i></div>`; btns = go('Plan a run', 'data-a="go" data-tab="plan"'); break;
      case 'company': text = 'Add a friend, and once they accept, it\'s yours.'; btns = go('Add a friend', 'data-a="add-friend"'); break;
      case 'team': text = "Team up with friends in this month's Friends' league and hit the team target."; btns = go("See Friends' league", 'data-a="goto-challenges"'); break;
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
    if (step === 'welcome') return `<div class="welcome">${MARK}<h1>Know what your home uses.</h1><p>PowerBuddy shows your electricity and water next to homes like yours, and helps you cut back with friends.</p>
      <ul><li><span class="chip-icon elec">${ic('Gauge', 'sm')}</span>See usage and cost, month by month</li><li><span class="chip-icon water">${ic('Clock', 'sm')}</span>Run the washing machine when power is cheapest</li><li><span class="chip-icon brand">${ic('Users', 'sm')}</span>Set goals, join challenges, earn rewards from sustainable partners</li></ul>
      <div class="actions"><button class="btn primary block" data-a="ob-next">Set up my home</button><button class="btn secondary block" data-a="ob-demo">Explore a demo home</button></div></div>`;
    const showEstimate = ['home', 'heat', 'appliances', 'bills'].includes(step);
    const progress = OB_STEPS.slice(1, -1).map((_, i) => `<i class="${i < ob.step ? 'on' : ''}"></i>`).join('');
    const bodies = {
      name: `<h1>What should we call you?</h1><p class="lead">Your first name is shown to friends you add. Nothing else is, unless you choose to share it.</p>${field('First name', `<input class="input" data-input="ob" data-field="name" value="${esc(d.name)}" maxlength="30" autocomplete="given-name" aria-invalid="${!!e.name}">`, e.name)}`,
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
        ${e.consent ? `<span class="field-error">${esc(e.consent)}</span>` : ''}
        <p class="hint" style="margin-top:14px">Friends only see your name, badges and goals. You can change this in the settings.</p>`,
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
    toast({ icon: 'House', text: `<b>Welcome, ${esc(s.profile.name)}</b>`, sub: '+20 points to start. The GreenBuddies team are your demo friends.' });
  }

  /* ---------- results → UI ---------- */
  function celebrate(results) {
    const big = results.filter((r) => r.type !== 'checkin');
    const pts = H.sum(results.filter((r) => r.type === 'checkin').map((r) => r.points || 0));
    if (big.length) { openSheet('celebrate', { items: big, noFocus: false }); if (window.PBFX) { setTimeout(() => PBFX.play('success'), 120); PBFX.vibrate([10, 40, 18]); } }
    else if (pts) toast({ icon: 'Check', text: `<b>+${pts} points</b>`, sub: 'Checked in. Keep it going.', sound: 'success' });
  }

  /* ---------- actions ---------- */
  const A = {
    tab(el) { ui.page = null; ui.tab = el.dataset.tab; if (el.dataset.res) { ui.usageRes = el.dataset.res; ui.usageRange = 'month'; ui.usageMonth = null; } render(); $('#content').scrollTop = 0; },
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
    'note-go'(el) { markRead(el.dataset.id); closeSheet(true); ui.page = null; ui.tab = el.dataset.go; if (ui.tab === 'friends') ui.friendsSeg = 'feed'; render(); },
    'note-read'(el) { if (markRead(el.dataset.id)) readAllAnimated([el]); },
    'notes-read'() {
      const rows = $$('#sheet .row.note.unread');
      if (!s.notes.some((n) => !n.read)) return;
      s.notes.forEach((n) => { n.read = true; }); save(); refreshHeader();
      readAllAnimated(rows);
    },
    callback(el) { markRead(el.dataset.id); closeSheet(true); if (window.PBCall) PBCall.callBack(); },
    notify(el) { s.notify[el.dataset.key] = !s.notify[el.dataset.key]; save(); el.setAttribute('aria-checked', s.notify[el.dataset.key]); },
    'notify-friend'(el) {
      const on = !P.wantsFriend(s, el.dataset.id); P.setFriendMuted(s, el.dataset.id, !on); save(); el.setAttribute('aria-checked', on);
      if (ui.page === 'settings' && !ui.sheet) {
        const main = el.closest('.toggle-row').querySelector('.row-main'); let sub = main.querySelector('.row-sub');
        if (on && sub) sub.remove();
        else if (!on && !sub) { sub = document.createElement('div'); sub.className = 'row-sub'; sub.textContent = 'Muted · still shown in your feed'; main.appendChild(sub); }
        const all = $('[data-a="notify-all"]'), muted = P.mutualFriends(s).some((f) => !P.wantsFriend(s, f.id));
        if (all) { all.dataset.on = muted ? 1 : 0; all.textContent = muted ? 'Turn all on' : 'Turn all off'; }
      }
    },
    'notify-all'(el) { const on = el.dataset.on === '1'; for (const f of P.mutualFriends(s)) P.setFriendMuted(s, f.id, !on); save(); render(); },
    sound(el) { if (!window.PBFX) return; PBFX.setEnabled(!PBFX.enabled()); el.setAttribute('aria-checked', PBFX.enabled()); },
    estimate() { openSheet('estimate'); },
    close() { closeSheet(); },
    reading(el) { openSheet('reading', { month: el.dataset.month }); },
    goal(el) { const r = el.dataset.rec && P.recommendations(s).find((x) => x.id === el.dataset.rec); openSheet('goal', { kind: 'cut', bench: 'usual', resource: r ? r.goal.resource : 'electricity', target: r ? r.goal.target : 5, months: 1, source: r ? r.id : 'custom' }); },
    'goal-res'(el) { ui.sheet.resource = el.dataset.val; segSelect(el.closest('.seg'), el); updateGoalSheet(); },
    'goal-kind'(el) {
      if (ui.sheet.kind === el.dataset.val) return;
      ui.sheet.kind = el.dataset.val; if (!goalDurations(ui.sheet.kind).includes(ui.sheet.months)) ui.sheet.months = 1;
      ui.sheet.noFocus = true; renderSheet();
    },
    'goal-bench'(el) { ui.sheet.bench = el.dataset.val; segSelect(el.closest('.seg'), el); updateGoalSheet(); },
    'goal-detail'(el) { openSheet('goalDetail', { id: el.dataset.id }); },
    'rank-info'() { openSheet('rankInfo'); },
    /* Navigate from inside a sheet: close it, then go to the tab. */
    go(el) { closeSheet(true); A.tab(el); },
    'goal-months'(el) { ui.sheet.months = +el.dataset.val; segSelect(el.closest('.seg'), el); updateGoalSheet(); },
    challenge(el) { openSheet('challenge', { id: el.dataset.id }); },
    'feed-challenge'(el) { const c = challengeByTitle(el.dataset.title); if (c) openSheet('challenge', { id: c.id }); else A['goto-challenges'](); },
    'feed-badge'(el) { const b = P.BADGES.find((x) => x.name === el.dataset.title); if (b) openSheet('badge', { id: b.id }); },
    'goto-challenges'() { closeSheet(true); ui.page = null; ui.tab = 'goals'; ui.goalsSeg = 'challenges'; render(); $('#content').scrollTop = 0; },
    'team-pick'(el) { const t = ui.sheet.team || (ui.sheet.team = []), id = el.dataset.id; if (t.includes(id)) t.splice(t.indexOf(id), 1); else if (t.length < 3) t.push(id); renderSheet(); },
    'league-with'(el) { const c = s.ch.find((x) => x.tpl === 'league' && P.isActive(s, x)); if (!c) return; openSheet('challenge', { id: c.id, team: c.joined ? [] : [el.dataset.id] }); },
    join(el) { const c = s.ch.find((x) => x.id === el.dataset.id); P.joinChallenge(s, c.id, ui.sheet && ui.sheet.team ? [...ui.sheet.team] : []); save(); toast({ icon: P.tplOf(c).icon, text: `<b>Joined ${esc(P.tplOf(c).title)}</b>`, sub: P.tplOf(c).how }); renderSheet(); render(); },
    checkin(el) { const res = P.checkIn(s, el.dataset.id); if (!res) return; save(); if (ui.sheet && ui.sheet.type === 'challenge') closeSheet(); celebrate([res, ...P.evalBadges(s)]); render(); },
    reward(el) { openSheet('reward', { id: el.dataset.id }); },
    redeem(el) { try { P.redeem(s, el.dataset.id); save(); renderSheet(); render(); toast({ icon: 'Gift', text: '<b>Code ready</b>', sub: 'Saved under Your codes and on your profile' }); } catch (err) { toast({ icon: 'CircleAlert', text: esc(err.message) }); } },
    'rec-accept'(el) { P.setRec(s, el.dataset.id, 'accepted'); save(); const r = P.recommendations(s).find((x) => x.id === el.dataset.id); toast({ icon: 'Check', text: `<b>${esc(r.title)}</b>`, sub: r.goal ? 'Added to what you\'re doing. Make it a goal to earn points.' : 'Added to what you\'re doing' }); render(); },
    'rec-dismiss'(el) { P.setRec(s, el.dataset.id, 'dismissed'); save(); render(); },
    'rec-stop'(el) { delete s.recs[el.dataset.id]; save(); render(); },
    'plan-app'(el) { ui.planApp = el.dataset.id; render(); },
    'plan-make'(el) { const p = P.planRun(s, ui.planApp, +el.dataset.start); save(); toast({ icon: 'CalendarClock', text: `<b>Planned for ${clock(p.start)}</b>`, sub: `${p.green ? 'In green hours. ' : ''}${s.notify.plans !== false ? `We'll remind you at ${clock(p.start)}.` : 'Mark it done when it has run.'}` }); render(); },
    'plan-done'(el) { const res = P.markDone(s, el.dataset.id); save(); if (res.length) celebrate(res); render(); },
    friend(el) { if (el.dataset.id === 'me') return A.profile(); openSheet('friend', { id: el.dataset.id }); },
    'friend-accept'(el) { const res = P.acceptFriend(s, el.dataset.id); save(); toast({ who: el.dataset.id, text: `<b>You and ${esc(P.friendName(el.dataset.id))} are friends</b>`, sub: 'Compare progress from the ranking' }); if (res.length) celebrate(res); render(); },
    'friend-decline'(el) { P.declineFriend(s, el.dataset.id); save(); render(); },
    'add-friend'() { openSheet('addFriend'); },
    share() { openSheet('share'); },
    'copy-code'() { copy(s.profile.code); },
    copy(el) { copy(el.dataset.text); },
    cheer(el) { P.cheer(s, el.dataset.id); save(); const f = s.feed.find((x) => x.id === el.dataset.id); el.setAttribute('aria-pressed', f.cheered); el.innerHTML = `${ic('Heart', 'xs')}${f.cheers}`; },
    badge(el) { openSheet('badge', { id: el.dataset.id }); },
    pin(el) { try { P.togglePin(s, el.dataset.id); ui.sheet.error = null; save(); renderSheet(); render(); } catch (err) { ui.sheet.error = err.message; renderSheet(); } },
    privacy(el) { s.privacy[el.dataset.key] = !s.privacy[el.dataset.key]; save(); el.setAttribute('aria-checked', s.privacy[el.dataset.key]); },
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
      const fd = Object.fromEntries(new FormData(form)), values = { month: fd.month, e: fd.e.replace(',', '.'), w: fd.w.replace(',', '.'), amountE: (fd.amountE || '').replace(',', '.'), amountW: (fd.amountW || '').replace(',', '.') };
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
    'add-friend'(form) {
      const code = new FormData(form).get('code');
      try { const r = P.addByCode(s, code); save(); closeSheet(); render(); toast({ who: r.person.id, text: r.status === 'mutual' ? `<b>You and ${esc(r.person.name)} are friends</b>` : `<b>Request sent to ${esc(r.person.name)}</b>`, sub: r.status === 'mutual' ? '' : 'You\'ll be friends once they accept' }); }
      catch (err) { ui.sheet.error = err.message; ui.sheet.value = code; renderSheet(); }
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
    if (el.matches('.tab, .seg button, .btn, .choice, .app-chips button, .icon-btn, .cheer, .row, .rank-row, .badge, .link, .feed-link')) { PBFX.play('tap'); PBFX.vibrate(6); }
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
        { label: 'Jump to next month', hint: 'Closes this month: goals, challenges and the Green draw settle', run: () => { closeSheet(); const res = P.advanceToNextMonth(s); save(); render(); celebrate(res); toast({ icon: 'CalendarDays', text: `<b>It's now ${P.now(s).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })}</b>`, sub: `${H.monthName(H.addMonths(P.thisMonth(s), -1))} is closed. Check your notifications.` }); } },
        { label: 'Skip ahead 6 hours', hint: 'Prices, live meter and today\'s total move on', run: () => { P.advanceHours(s, 6); save(); render(); } },
        { label: 'Show a friend update now', run: () => pushNotification('friend', true) },
        { label: 'Show a price tip now', run: () => pushNotification('tip', true) },
        { label: s.live ? 'Pause live updates' : 'Resume live updates', hint: 'Friend updates and tips', run: () => { s.live = !s.live; save(); render(); } },
        { label: 'Reset app', hint: 'Back to onboarding, where you can set up a home or skip to the demo. Feedback comments are kept.', run: resetApp }
      ];
    }
  };

  /* A fresh start: clears the household and restarts the visit, so Thomas calls again. */
  function resetApp() {
    s = null; save(); closeSheet(true);
    ui.ob = { step: 0, d: OB_DEFAULT(), errors: {} }; ui.page = null; ui.tab = 'home'; ui.usageMonth = null; ui.priceMonth = null;
    if (window.PBCall) PBCall.reset();
    render();
  }

  /* Where the visitor is, as a stable key and a readable label. The feedback tool files comments under it. */
  const SHEET_NAMES = { goalDetail: 'Goal', rankInfo: 'How the ranking works', notes: 'Notifications', estimate: 'Homes like yours', reading: 'Add a reading', goal: 'New goal', challenge: 'Challenge', reward: 'Reward', friend: 'Compare with a friend', addFriend: 'Add a friend', share: 'Your code', badge: 'Badge', household: 'Your household', celebrate: 'Celebration' };
  const SEG_NAMES = { goals: 'Goals', challenges: 'Challenges', rewards: 'Rewards', feed: 'Feed', ranking: 'Ranking' };
  function pageInfo() {
    if (!s) { const step = ui.ob ? OB_STEPS[ui.ob.step] : 'welcome'; return { key: 'onboarding/' + step, label: 'Onboarding · ' + step.charAt(0).toUpperCase() + step.slice(1) }; }
    let key, label;
    if (ui.page) { key = ui.page; label = ui.page === 'profile' ? 'Profile' : 'Settings'; }
    else {
      const seg = ui.tab === 'goals' ? ui.goalsSeg : ui.tab === 'friends' ? ui.friendsSeg : null;
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
    else if (TAB_ORDER.includes(a)) { ui.page = null; ui.tab = a; if (a === 'goals' && b) ui.goalsSeg = b; if (a === 'friends' && b) ui.friendsSeg = b; }
    else return false;
    render(); return true;
  }
  /* For other prototype layers (the call) to add a notification. */
  function externalNote(n, toastOpts) { if (!s) { if (toastOpts) toast(toastOpts); return; } addNote(n, toastOpts); }

  // Inspection hook for tests and the prototype layers.
  window.PowerBuddy = { state: () => s, ui: () => ui, domain: P, pageInfo, navigate, note: externalNote, toast: (t) => toast(t) };
  // The sliding segmented control, shared with the feedback tool.
  window.PBSeg = { init: initSegs, select: segSelect, glide };

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
