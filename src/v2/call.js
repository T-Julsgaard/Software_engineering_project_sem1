/* PowerBuddy V2: a simulated phone call from Thomas, the designer.
   After about three minutes of use the phone rings. Accepting plays his recorded message; at 11 s
   (where he says the comment tool can be used) the call drops to the Dynamic Island and the
   feedback tool appears with a spotlight, which fades when the recording ends.
   Declined or missed calls leave a "Call back" notification, and he tries once more later. */
(() => {
  'use strict';
  const AUDIO_SRC = '__CALL_AUDIO__';
  const KEY = 'pb.v2.call';
  const RING_AFTER = 180e3;   // ms of visible use before the first call
  const RING_FOR = 30e3;      // unanswered calls stop ringing after this
  const RETRY_AFTER = 120e3;  // a missed call is retried once, this much later
  const CUE = 11;             // s into the recording: "you can use this tool to make comments"
  const FALLBACK_LENGTH = 23.25;
  const CALLER = { name: 'Thomas', initial: 'T', sub: 'mobile' };

  const fresh = () => ({ used: 0, status: 'waiting', unlocked: false, attempts: 0, missedAt: 0 });
  let st = fresh();
  try { st = Object.assign(fresh(), JSON.parse(localStorage.getItem(KEY) || '{}')); } catch { /* storage unavailable */ }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch { /* ignore */ } };

  const $ = (sel, root = document) => root.querySelector(sel);
  const icon = (name, cls = '') => `<svg class="i ${cls}" viewBox="0 0 24 24" aria-hidden="true">${(typeof ICONS !== 'undefined' && ICONS[name]) || ''}</svg>`;
  const fx = (name, ...a) => window.PBFX && PBFX.play(name, ...a);
  const reduce = () => window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const mmss = (sec) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;

  const phone = $('#phone'), device = $('#device') || phone, island = $('#island');
  const root = document.createElement('div');
  root.className = 'call'; root.hidden = true;
  root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'true'); root.setAttribute('aria-labelledby', 'call-name');
  root.innerHTML = `<div class="call-backdrop"></div>
    <div class="call-statusbar" aria-hidden="true"><span class="call-clock"></span><span class="call-icons">${($('.status-icons') || { innerHTML: '' }).innerHTML}</span></div>
    <button class="call-min" type="button" data-call="minimize" aria-label="Back to the app, keep the call going">${icon('ChevronDown')}</button>
    <div class="call-head">
      <div class="call-avatar" aria-hidden="true"><span>${CALLER.initial}</span></div>
      <h2 class="call-name" id="call-name">${CALLER.name}</h2>
      <p class="call-sub" aria-live="polite">${CALLER.sub}</p>
    </div>
    <div class="call-wave" aria-hidden="true">${'<i></i>'.repeat(28)}</div>
    <div class="call-controls">
      <div class="call-ctl c-decline"><button type="button" class="call-btn red" data-call="decline" aria-label="Decline">${icon('Phone', 'hang')}</button><span>Decline</span></div>
      <div class="call-ctl c-accept"><button type="button" class="call-btn green" data-call="accept" aria-label="Accept">${icon('Phone')}</button><span>Accept</span></div>
      <div class="call-ctl c-end"><button type="button" class="call-btn red" data-call="end" aria-label="End call">${icon('Phone', 'hang')}</button><span>End</span></div>
    </div>`;
  phone.appendChild(root);
  const sub = $('.call-sub', root), bars = [...root.querySelectorAll('.call-wave i')];

  let phase = null;          // null | 'incoming' | 'outgoing' | 'active' | 'ended'
  let minimized = false, cued = false, ringTimer = 0, missTimer = 0, raf = 0, startedAt = 0;
  let audio = null, analyser = null, freq = null, audioOK = false, t0 = 0;

  const setBody = (v) => { document.body.dataset.call = v || ''; };
  function show(p) {
    phase = p; root.dataset.phase = p; root.hidden = false; root.classList.remove('leaving', 'to-island');
    setBody(p === 'active' ? 'active' : 'ringing');
    $('.call-clock', root).textContent = $('#clock') ? $('#clock').textContent : '';
  }
  function hide(after = 0) {
    setTimeout(() => {
      if (reduce()) { root.hidden = true; return; }
      root.classList.add('leaving');
      setTimeout(() => { root.hidden = true; root.classList.remove('leaving'); }, 320);
    }, after);
  }

  /* ---------- ringing ---------- */
  function buzz() {
    device.classList.remove('buzz'); void device.offsetWidth; device.classList.add('buzz');
    fx('buzz', 0.42); setTimeout(() => phase === 'incoming' && fx('buzz', 0.42), 620);
    if (window.PBFX) PBFX.vibrate([420, 200, 420]);
  }
  function ring() {
    if (phase) return;
    document.activeElement && document.activeElement.blur && document.activeElement.blur();
    cued = false; minimized = false;
    sub.textContent = CALLER.sub;
    show('incoming');
    const cycle = () => { if (phase !== 'incoming') return; fx('ring'); buzz(); ringTimer = setTimeout(cycle, 3000); };
    cycle();
    missTimer = setTimeout(() => missed(false), RING_FOR);
    setTimeout(() => { const b = $('[data-call="accept"]', root); if (b && phase === 'incoming') b.focus({ preventScroll: true }); }, 350);
  }
  function stopRinging() { clearTimeout(ringTimer); clearTimeout(missTimer); device.classList.remove('buzz'); }
  function missed(declined) {
    if (phase !== 'incoming') return;
    stopRinging(); phase = null; setBody(''); hide();
    st.status = 'missed'; st.attempts++; st.missedAt = st.used; save();
    const opts = { icon: 'PhoneMissed', text: `<b>Missed call</b> · ${CALLER.name}`, sub: 'Tap to call back', sound: 'notify', onTap: () => callBack() };
    if (window.PowerBuddy) PowerBuddy.note({ kind: 'call', icon: 'PhoneMissed', title: `Missed call from ${CALLER.name}`, body: declined ? 'You declined. He wanted to show you something in the app.' : 'He wanted to show you something in the app.', action: 'callback' }, opts);
  }

  /* ---------- the call ---------- */
  async function connect() {
    stopRinging();
    show('active'); minimized = false;
    st.status = 'done'; save();
    sub.textContent = '0:00';
    fx('connect');
    startedAt = performance.now();
    await startAudio();
    loop();
  }
  async function startAudio() {
    audio = new Audio(AUDIO_SRC); audio.preload = 'auto';
    audio.addEventListener('ended', () => end('finished'));
    try {
      const ctx = window.PBFX && PBFX.context();
      if (ctx) {
        await ctx.resume().catch(() => {});
        if (ctx.state === 'running') {
          const src = ctx.createMediaElementSource(audio);
          analyser = ctx.createAnalyser(); analyser.fftSize = 256; analyser.smoothingTimeConstant = 0.7;
          src.connect(analyser); analyser.connect(ctx.destination);
          freq = new Uint8Array(analyser.frequencyBinCount);
        }
      }
    } catch { analyser = null; }
    t0 = performance.now();
    try { await audio.play(); audioOK = true; } catch { audioOK = false; } // without audio the timeline still runs, so the tool still appears
  }
  const pos = () => (audioOK && audio ? audio.currentTime : (performance.now() - t0) / 1000);
  function loop() {
    cancelAnimationFrame(raf);
    const step = () => {
      if (phase !== 'active') return;
      const p = pos(), talk = (performance.now() - startedAt) / 1000;
      sub.textContent = mmss(talk);
      const it = $('.isl-time', island); if (it) it.textContent = mmss(talk);
      drawWave(p);
      if (!cued && p >= CUE) cue();
      if (!audioOK && p >= FALLBACK_LENGTH) return end('finished');
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
  }
  let level = new Array(28).fill(0.1);
  function drawWave(p) {
    let vals;
    if (analyser && freq) {
      analyser.getByteFrequencyData(freq);
      vals = bars.map((_, i) => { const a = 2 + Math.floor(i * 1.3), v = (freq[a] + freq[a + 1]) / 510; return v; });
    } else {
      vals = bars.map((_, i) => 0.25 + 0.55 * Math.abs(Math.sin(p * 7 + i * 0.6)) * (0.6 + 0.4 * Math.sin(p * 2.1 + i)));
    }
    level = level.map((l, i) => l + (Math.max(0.08, vals[i]) - l) * 0.35);
    bars.forEach((b, i) => { b.style.transform = `scaleY(${level[i].toFixed(3)})`; });
    const mini = island.querySelectorAll('.isl-wave i');
    mini.forEach((b, i) => { b.style.transform = `scaleY(${Math.max(0.2, level[i * 5 + 2]).toFixed(3)})`; });
  }
  /* 11 s in: drop to the island so the app and the new tool are visible, and spotlight the tool. */
  function cue() {
    cued = true; st.unlocked = true; save();
    minimize();
    if (window.PBFeedback) PBFeedback.reveal({ spotlight: true });
  }
  function minimize() {
    if (phase !== 'active' || minimized) return;
    minimized = true; setBody('minimized');
    island.innerHTML = `<span class="isl-phone">${icon('Phone', 'xs')}</span><span class="isl-time">${sub.textContent}</span><span class="isl-wave">${'<i></i>'.repeat(5)}</span>`;
    island.setAttribute('role', 'button'); island.setAttribute('tabindex', '0'); island.setAttribute('aria-label', `Call with ${CALLER.name}. Open the call screen`); island.removeAttribute('aria-hidden');
    island.classList.remove('ended'); island.classList.add('live');
    if (reduce()) { root.hidden = true; return; }
    root.classList.add('to-island');
    setTimeout(() => { if (minimized) { root.hidden = true; root.classList.remove('to-island'); } }, 420);
  }
  function expand() {
    if (phase !== 'active' || !minimized) return;
    minimized = false; setBody('active');
    resetIsland();
    root.hidden = false; root.classList.remove('to-island', 'leaving');
    root.classList.add('from-island'); setTimeout(() => root.classList.remove('from-island'), 420);
  }
  function resetIsland() {
    island.classList.remove('live', 'ended'); island.innerHTML = '';
    island.removeAttribute('role'); island.removeAttribute('tabindex'); island.removeAttribute('aria-label'); island.setAttribute('aria-hidden', 'true');
  }
  function end(reason) {
    if (phase !== 'active') return;
    phase = 'ended'; cancelAnimationFrame(raf);
    if (audio) { audio.pause(); audio = null; }
    analyser = null; freq = null;
    fx('hangup');
    st.status = 'done'; st.unlocked = true; save();
    setBody('');
    if (minimized) {
      island.classList.add('ended');
      island.innerHTML = `<span class="isl-phone">${icon('Phone', 'xs hang')}</span><span class="isl-text">Call ended</span>`;
      setTimeout(() => { resetIsland(); phase = null; }, 1700);
    } else {
      root.dataset.phase = 'ended'; sub.textContent = 'Call ended';
      hide(1100); setTimeout(() => { phase = null; }, 1450);
    }
    minimized = false;
    if (window.PBFeedback) { if (cued) PBFeedback.endSpotlight(); else PBFeedback.reveal({ spotlight: true, brief: true }); }
    void reason;
  }

  /* Calling him back from a missed call: a short ringback, then the same call. */
  function callBack() {
    if (phase) return;
    cued = false; minimized = false;
    sub.textContent = 'calling…';
    show('outgoing');
    let n = 0;
    const ringback = () => { if (phase !== 'outgoing') return; fx('ringback'); if (++n < 2) ringTimer = setTimeout(ringback, 2200); };
    ringback();
    missTimer = setTimeout(() => { if (phase === 'outgoing') connect(); }, 3400);
  }
  function cancelOutgoing() { if (phase !== 'outgoing') return; stopRinging(); phase = null; setBody(''); fx('hangup'); hide(); }

  /* ---------- input ---------- */
  root.addEventListener('click', (e) => {
    const b = e.target.closest('[data-call]'); if (!b) return;
    const a = b.dataset.call;
    if (a === 'accept' && phase === 'incoming') connect();
    else if (a === 'decline' && phase === 'incoming') { fx('hangup'); missed(true); }
    else if (a === 'end') { if (phase === 'outgoing') cancelOutgoing(); else end('user'); }
    else if (a === 'minimize') minimize();
  });
  island.addEventListener('click', () => { if (island.classList.contains('live') && !island.classList.contains('ended')) expand(); });
  island.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && island.classList.contains('live')) { e.preventDefault(); expand(); } });

  /* ---------- the usage clock ---------- */
  const typing = () => { const a = document.activeElement; return a && /INPUT|TEXTAREA|SELECT/.test(a.tagName) && a.type !== 'range' && a.type !== 'checkbox'; };
  setInterval(() => {
    if (document.visibilityState !== 'visible') return;
    st.used += 1000;
    if (st.used % 5000 === 0) save();
    if (phase || typing()) return;
    const busyFeedback = window.PBFeedback && PBFeedback.isBusy();
    if (busyFeedback) return;
    if (st.status === 'waiting' && st.used >= RING_AFTER) ring();
    else if (st.status === 'missed' && st.attempts < 2 && st.used - st.missedAt >= RETRY_AFTER) ring();
  }, 1000);

  // A call that was accepted earlier (even if the page was reloaded mid-call) keeps the tool unlocked.
  if (st.status === 'done' && !st.unlocked) { st.unlocked = true; save(); }

  /* ---------- prototype menu ---------- */
  const base = window.PB_PROTOTYPE && window.PB_PROTOTYPE.actions;
  if (window.PB_PROTOTYPE) {
    window.PB_PROTOTYPE.actions = () => {
      const left = Math.max(0, RING_AFTER - st.used) / 1000;
      return [...(base ? base() : []),
        { label: `Get the call from ${CALLER.name} now`, hint: st.status === 'waiting' ? `Otherwise it rings after 3 minutes of use (${mmss(left)} left)` : 'Rings the phone again', run: () => { if (!phase) ring(); } },
        { label: 'Reset the call and feedback tool', hint: 'Locks the tool again and restarts the 3-minute timer. Comments are kept.', run: () => { reset(); } }];
    };
  }
  function reset() {
    stopRinging(); cancelAnimationFrame(raf);
    if (audio) { audio.pause(); audio = null; }
    phase = null; minimized = false; cued = false; setBody(''); root.hidden = true; resetIsland();
    st = fresh(); save();
    if (window.PBFeedback) PBFeedback.lock();
  }

  window.PBCall = { busy: () => phase === 'incoming' || phase === 'outgoing' || phase === 'active', ring, callBack, unlocked: () => st.unlocked, state: () => ({ ...st, phase, minimized, cued }) };
})();
