/* PowerBuddy V2 sound and haptics. Every sound is synthesised with Web Audio: no audio files,
   nothing played before the visitor has interacted with the page. Exposes window.PBFX. */
const PBFX = (() => {
  'use strict';
  const PREF = 'pb.v2.sound';
  let ctx = null, out = null, enabled = true;
  try { enabled = localStorage.getItem(PREF) !== 'off'; } catch { /* storage unavailable */ }

  function ensure() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    if (!ctx) {
      ctx = new AC();
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -18; comp.ratio.value = 3;
      out = ctx.createGain(); out.gain.value = 0.7;
      out.connect(comp).connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
  }
  // Browsers only allow audio after a gesture: unlock on the first one.
  const unlock = () => ensure();
  for (const ev of ['pointerdown', 'keydown', 'touchstart']) document.addEventListener(ev, unlock, { capture: true, passive: true });

  const ready = () => enabled && ctx && ctx.state === 'running';

  /* One enveloped oscillator. t = start offset (s), d = length (s), g = peak gain. */
  function tone({ f, t = 0, d = 0.12, g = 0.08, type = 'sine', a = 0.004, to, dest = out, detune = 0 }) {
    const at = ctx.currentTime + t, o = ctx.createOscillator(), v = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f, at); o.detune.value = detune;
    if (to) o.frequency.exponentialRampToValueAtTime(to, at + d);
    v.gain.setValueAtTime(0.0001, at);
    v.gain.exponentialRampToValueAtTime(g, at + a);
    v.gain.exponentialRampToValueAtTime(0.0001, at + d);
    o.connect(v).connect(dest); o.start(at); o.stop(at + d + 0.05);
  }
  let noiseBuf = null;
  function noise({ t = 0, d = 0.05, g = 0.05, f = 2000, q = 1, type = 'bandpass', to }) {
    if (!noiseBuf) { noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate); const ch = noiseBuf.getChannelData(0); for (let i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1; }
    const at = ctx.currentTime + t, src = ctx.createBufferSource(), fl = ctx.createBiquadFilter(), v = ctx.createGain();
    src.buffer = noiseBuf; fl.type = type; fl.frequency.setValueAtTime(f, at); fl.Q.value = q;
    if (to) fl.frequency.exponentialRampToValueAtTime(to, at + d);
    v.gain.setValueAtTime(0.0001, at); v.gain.exponentialRampToValueAtTime(g, at + 0.006); v.gain.exponentialRampToValueAtTime(0.0001, at + d);
    src.connect(fl).connect(v).connect(out); src.start(at); src.stop(at + d + 0.05);
  }
  /* Glassy bell: a sine with two quiet inharmonic partials. */
  function bell(f, t, d, g) { tone({ f, t, d, g }); tone({ f: f * 2.76, t, d: d * 0.45, g: g * 0.22 }); tone({ f: f * 5.4, t, d: d * 0.2, g: g * 0.08 }); }
  /* Soft mallet for the ringtone. */
  function mallet(f, t, g = 0.08) { tone({ f, t, d: 0.42, g }); tone({ f: f * 4, t, d: 0.09, g: g * 0.25 }); tone({ f: f / 2, t, d: 0.3, g: g * 0.3, type: 'triangle' }); }

  const SOUNDS = {
    tap() { noise({ d: 0.018, g: 0.035, f: 3800, q: 0.9 }); tone({ f: 2100, d: 0.022, g: 0.012 }); },
    toggle(on = true) { tone({ f: on ? 880 : 660, d: 0.05, g: 0.035, type: 'triangle' }); tone({ f: on ? 1320 : 990, t: 0.04, d: 0.05, g: 0.025, type: 'triangle' }); },
    open() { noise({ d: 0.22, g: 0.018, f: 500, to: 1400, q: 0.7 }); },
    close() { noise({ d: 0.18, g: 0.014, f: 1300, to: 450, q: 0.7 }); },
    notify() { bell(1568, 0, 0.55, 0.06); bell(2093, 0.11, 0.9, 0.05); },
    tip() { bell(1175, 0, 0.5, 0.05); bell(1568, 0.1, 0.8, 0.045); },
    success() { [1047, 1319, 1568, 2093].forEach((f, i) => bell(f, i * 0.075, 0.7, 0.045)); },
    send() { noise({ d: 0.28, g: 0.03, f: 900, to: 4200, q: 1.4 }); tone({ f: 660, to: 1320, d: 0.16, g: 0.02 }); },
    pick() { tone({ f: 1480, d: 0.04, g: 0.02, type: 'triangle' }); },
    error() { tone({ f: 220, d: 0.12, g: 0.06, type: 'triangle' }); tone({ f: 185, t: 0.13, d: 0.16, g: 0.06, type: 'triangle' }); },
    /* One ring cycle (~1.4 s). An original pattern, not any phone maker's tone. */
    ring() { [659, 988, 831, 1319, 988, 1245].forEach((f, i) => mallet(f, i * 0.115, 0.075)); [659, 988, 831, 1319].forEach((f, i) => mallet(f, 0.78 + i * 0.115, 0.06)); },
    /* A phone vibrating on a table: low buzz with a rattle. */
    buzz(len = 0.42) { tone({ f: 155, d: len, g: 0.05, type: 'square', a: 0.02 }); tone({ f: 162, d: len, g: 0.03, type: 'sawtooth', a: 0.02 }); },
    ringback() { tone({ f: 425, d: 1.0, g: 0.05, a: 0.02 }); },
    hangup() { [0, 0.22, 0.44].forEach((t) => tone({ f: 480, t, d: 0.16, g: 0.05, a: 0.01 })); },
    connect() { tone({ f: 880, d: 0.08, g: 0.03 }); tone({ f: 1320, t: 0.07, d: 0.12, g: 0.03 }); }
  };

  function play(name, ...args) {
    if (!ready() || !SOUNDS[name]) return;
    try { SOUNDS[name](...args); } catch { /* never let a sound break the app */ }
  }
  function vibrate(pattern) {
    // Browsers refuse (and log an error) until the visitor has tapped the page once.
    if (!enabled || !navigator.vibrate || (navigator.userActivation && !navigator.userActivation.hasBeenActive)) return;
    try { navigator.vibrate(pattern); } catch { /* unsupported */ }
  }
  function setEnabled(on) { enabled = !!on; try { localStorage.setItem(PREF, on ? 'on' : 'off'); } catch { /* ignore */ } if (on) { ensure(); play('toggle', true); } }

  return { play, vibrate, setEnabled, enabled: () => enabled, context: () => ensure(), output: () => (ensure(), out), ready };
})();
window.PBFX = PBFX;
