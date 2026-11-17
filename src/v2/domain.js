/* PowerBuddy V2 domain: household model, typical-usage estimates, simulated meter data,
   prices, goals, challenges, points, rewards, badges and friends. No DOM access. */
const PBD = (() => {
  const VERSION = 2;
  const KEY = 'greenbuddies.powerbuddy.v2';
  const DAY = 864e5;

  /* ---------- small helpers ---------- */
  const pad = (n) => String(n).padStart(2, '0');
  const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const mkey = (d) => ymd(d).slice(0, 7);
  const parseDay = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d || 1); };
  const daysIn = (m) => new Date(+m.slice(0, 4), +m.slice(5, 7), 0).getDate();
  const addMonths = (m, n) => mkey(new Date(+m.slice(0, 4), +m.slice(5, 7) - 1 + n, 1));
  const addDays = (day, n) => { const d = parseDay(day); d.setDate(d.getDate() + n); return ymd(d); };
  const monthIndex = (m) => +m.slice(5, 7) - 1;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const round = (v, d = 0) => { const f = 10 ** d; return Math.round(v * f) / f; };
  const sum = (a) => a.reduce((x, y) => x + y, 0);
  function hash(str) { let h = 2166136261; for (const c of String(str)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
  function rng(seed) {
    let a = typeof seed === 'number' ? seed : hash(seed);
    return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  const wobble = (key, spread) => 1 + (rng(key)() * 2 - 1) * spread;
  const clone = (x) => JSON.parse(JSON.stringify(x));
  const now = (s) => new Date(Date.now() + ((s && s.offset) || 0));
  const today = (s) => ymd(now(s));
  const thisMonth = (s) => mkey(now(s));
  const hourOf = (d) => d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600;
  const monthName = (m, style = 'long') => new Date(+m.slice(0, 4), monthIndex(m), 1).toLocaleString('en-GB', { month: style });

  /* ---------- household catalogue ---------- */
  const REGIONS = [
    { id: 'capital', name: 'Capital Region', area: 'DK2', water: 76 },
    { id: 'zealand', name: 'Zealand', area: 'DK2', water: 72 },
    { id: 'southern', name: 'Southern Denmark', area: 'DK1', water: 68 },
    { id: 'central', name: 'Central Jutland', area: 'DK1', water: 66 },
    { id: 'north', name: 'North Jutland', area: 'DK1', water: 70 }
  ];
  const HOUSING = [
    { id: 'apartment', name: 'Apartment', icon: 'Building2', base: 350 },
    { id: 'terraced', name: 'Terraced house', icon: 'Building', base: 450 },
    { id: 'detached', name: 'Detached house', icon: 'House', base: 550 },
    { id: 'room', name: 'Shared or student room', icon: 'BedSingle', base: 200 }
  ];
  const HEATING = [
    { id: 'district', name: 'District heating', icon: 'Waves', note: 'Heat comes from the city network, not your electricity.' },
    { id: 'heatpump', name: 'Heat pump', icon: 'Fan', note: 'Runs on electricity: roughly 35 kWh per m² a year.' },
    { id: 'electric', name: 'Electric heaters', icon: 'Zap', note: 'Usually the largest electricity use in homes that have it.' },
    { id: 'gas', name: 'Gas or oil boiler', icon: 'Flame', note: 'Only the boiler pump uses electricity.' }
  ];
  const HOT_WATER = [
    { id: 'heating', name: 'From the heating system' },
    { id: 'electric', name: 'Electric water heater' },
    { id: 'heatpump', name: 'Heat pump' }
  ];
  const persons = (p) => p.adults + p.children;
  const washCycles = (p) => 60 + 50 * persons(p);
  const dishCycles = (p) => 100 + 40 * persons(p);
  const APPLIANCES = [
    { id: 'fridge', name: 'Fridge-freezer', icon: 'Refrigerator', kwh: () => 260 },
    { id: 'freezer', name: 'Separate freezer', icon: 'Snowflake', kwh: () => 200 },
    { id: 'washer', name: 'Washing machine', icon: 'WashingMachine', kwh: (p) => washCycles(p) * 0.6, water: (p) => washCycles(p) * 0.05, cycle: { kwh: 0.8, hours: 2, name: 'Laundry', daytime: true } },
    { id: 'dryer', name: 'Tumble dryer', icon: 'Wind', kwh: (p) => washCycles(p) * 0.6 * 1.6, cycle: { kwh: 1.6, hours: 2, name: 'Tumble dryer', daytime: true } },
    { id: 'dishwasher', name: 'Dishwasher', icon: 'Sparkles', kwh: (p) => dishCycles(p) * 0.9, water: (p) => dishCycles(p) * 0.012, cycle: { kwh: 0.9, hours: 3, name: 'Dishwasher' } },
    { id: 'cooking', name: 'Electric hob and oven', icon: 'CookingPot', kwh: (p) => 150 + 90 * persons(p) },
    { id: 'tv', name: 'TV and gaming', icon: 'Tv', kwh: () => 180 },
    { id: 'office', name: 'Home office', icon: 'Laptop', kwh: () => 200 },
    { id: 'ev', name: 'Electric car', icon: 'Car', kwh: () => 2200, cycle: { kwh: 28, hours: 5, name: 'Car charging' } },
    { id: 'bathtub', name: 'Bathtub', icon: 'Bath', water: (p) => 3 + 2 * persons(p) },
    { id: 'garden', name: 'Garden watering', icon: 'Flower2', water: () => 8 }
  ];
  const appliance = (id) => APPLIANCES.find((a) => a.id === id);

  /* Monthly shape of a year (each row sums to 12). Heating follows the cold months much harder. */
  const SEASON_E = [1.17, 1.10, 1.03, 0.95, 0.88, 0.82, 0.80, 0.84, 0.92, 1.03, 1.15, 1.31];
  const SEASON_HEAT = [1.9, 1.7, 1.4, 0.9, 0.4, 0.1, 0.05, 0.05, 0.3, 0.9, 1.4, 1.9].map((v, _, a) => v * 12 / sum(a));
  const SEASON_W = [0.97, 0.95, 0.97, 0.99, 1.02, 1.06, 1.07, 1.06, 1.0, 0.98, 0.96, 0.97];
  /* Daily shape (relative weight per hour). */
  const HOURS_E = [0.55, 0.5, 0.48, 0.47, 0.48, 0.55, 0.8, 1.1, 1.05, 0.9, 0.85, 0.85, 0.9, 0.85, 0.85, 0.95, 1.15, 1.45, 1.55, 1.4, 1.2, 1.0, 0.85, 0.68];
  const HOURS_W = [0.1, 0.05, 0.05, 0.05, 0.1, 0.4, 1.6, 2.2, 1.6, 1.0, 0.8, 0.8, 0.9, 0.7, 0.6, 0.7, 0.9, 1.3, 1.5, 1.3, 1.1, 1.0, 0.8, 0.4];
  const CO2_PER_KWH = 0.12;

  /* ---------- typical usage for a household like this ---------- */
  function estimate(p) {
    const housing = HOUSING.find((h) => h.id === p.housing) || HOUSING[0];
    const has = (id) => p.appliances.includes(id);
    const e = [
      { id: 'base', name: 'Lighting, standby and network', kwh: housing.base + 4 * p.area },
      { id: 'people', name: 'Personal devices and small appliances', kwh: 250 * p.adults + 180 * p.children }
    ];
    for (const a of APPLIANCES) if (a.kwh && has(a.id)) e.push({ id: a.id, name: a.name, kwh: a.kwh(p) });
    if (p.heating === 'heatpump') e.push({ id: 'heating', name: 'Heat pump (heating)', kwh: 35 * p.area, heat: true });
    if (p.heating === 'electric') e.push({ id: 'heating', name: 'Electric heaters', kwh: 90 * p.area, heat: true });
    if (p.heating === 'gas' && p.housing !== 'apartment') e.push({ id: 'heating', name: 'Boiler pump', kwh: 150, heat: true });
    if (p.hotWater === 'electric') e.push({ id: 'hotwater', name: 'Electric water heater', kwh: 700 * persons(p) });
    if (p.hotWater === 'heatpump') e.push({ id: 'hotwater', name: 'Hot water (heat pump)', kwh: 300 * persons(p) });
    const w = [{ id: 'people', name: 'Showers, taps and toilets', m3: 30 * p.adults + 24 * p.children }];
    for (const a of APPLIANCES) if (a.water && has(a.id)) w.push({ id: a.id, name: a.name, m3: a.water(p) });
    if (!has('dishwasher')) w.push({ id: 'handwash', name: 'Washing up by hand', m3: 1.5 * persons(p) });
    e.sort((a, b) => b.kwh - a.kwh); w.sort((a, b) => b.m3 - a.m3);
    return { electricity: { year: sum(e.map((x) => x.kwh)), parts: e }, water: { year: sum(w.map((x) => x.m3)), parts: w } };
  }
  function typicalMonth(p, resource, m) {
    const est = estimate(p), i = monthIndex(m);
    if (resource === 'water') return est.water.year / 12 * SEASON_W[i];
    const heat = sum(est.electricity.parts.filter((x) => x.heat).map((x) => x.kwh));
    return ((est.electricity.year - heat) * SEASON_E[i] + heat * SEASON_HEAT[i]) / 12;
  }
  const seasonFactor = (p, resource, m) => typicalMonth(p, resource, m) / ((resource === 'water' ? estimate(p).water.year : estimate(p).electricity.year) / 12);
  const describeHome = (p) => {
    const h = HOUSING.find((x) => x.id === p.housing), heat = HEATING.find((x) => x.id === p.heating), r = REGIONS.find((x) => x.id === p.region);
    const people = [p.adults && `${p.adults} adult${p.adults > 1 ? 's' : ''}`, p.children && `${p.children} child${p.children > 1 ? 'ren' : ''}`].filter(Boolean).join(', ');
    return `${h.name} · ${p.area} m² · ${people} · ${heat.name.toLowerCase()} · ${r.name}`;
  };

  /* ---------- prices (illustrative all-in DKK/kWh, not real tariffs) ---------- */
  const SPOT = [0.55, 0.5, 0.48, 0.47, 0.5, 0.6, 0.85, 1.15, 1.1, 0.9, 0.7, 0.55, 0.45, 0.42, 0.48, 0.62, 0.95, 1.35, 1.45, 1.25, 1.0, 0.85, 0.72, 0.62];
  function prices(s, day) {
    const area = (REGIONS.find((r) => r.id === s.profile.region) || REGIONS[0]).area;
    const r = rng('price' + day + area), level = 0.8 + r() * 0.45, solar = 0.6 + r() * 0.5;
    return SPOT.map((v, h) => {
      const dip = h >= 10 && h <= 15 ? solar : 1;
      const spot = v * level * dip * (0.9 + r() * 0.2) * (area === 'DK1' ? 0.96 : 1);
      const tariff = h >= 17 && h < 21 ? 0.62 : h < 6 ? 0.08 : 0.24;
      return round(1.25 * spot + tariff + 0.95, 2);
    });
  }
  const tomorrowReady = (s) => now(s).getHours() >= 13;
  function greenHours(list) { return new Set(list.map((v, h) => [v, h]).sort((a, b) => a[0] - b[0]).slice(0, 8).map((x) => x[1])); }
  function priceLevel(v, list) { const sorted = [...list].sort((a, b) => a - b); return v <= sorted[7] ? 'low' : v >= sorted[16] ? 'high' : 'normal'; }
  const priceAt = (s, d) => prices(s, ymd(d))[d.getHours()];
  /* Cheapest start for an appliance cycle between now and a finish-by time (hours on the hour). */
  function bestStart(s, applianceId, finishBy) {
    const a = appliance(applianceId).cycle, start = now(s), first = new Date(start); first.setMinutes(0, 0, 0); first.setHours(first.getHours() + 1);
    const costFrom = (t) => { let c = 0; const step = new Date(t); for (let i = 0; i < a.hours; i++) { c += priceAt(s, step) * a.kwh / a.hours; step.setHours(step.getHours() + 1); } return c; };
    const options = [];
    for (let t = new Date(first); t.getTime() + a.hours * 36e5 <= finishBy.getTime(); t.setHours(t.getHours() + 1)) {
      const nextDay = ymd(t) !== today(s);
      if (a.daytime && (t.getHours() < 7 || t.getHours() + a.hours > 22)) continue;
      if (nextDay && !tomorrowReady(s)) break;
      options.push({ start: t.getTime(), cost: costFrom(t) });
    }
    if (!options.length) return null;
    const best = options.reduce((a, b) => (b.cost < a.cost ? b : a));
    const startDay = ymd(new Date(best.start)), list = prices(s, startDay), green = greenHours(list).has(new Date(best.start).getHours());
    return { ...best, nowCost: options[0].cost, saving: options[0].cost - best.cost, green, hours: a.hours, kwh: a.kwh };
  }

  /* ---------- simulated meter data ---------- */
  function cumShare(resource, h) {
    const w = resource === 'water' ? HOURS_W : HOURS_E, total = sum(w), whole = Math.floor(h);
    return (sum(w.slice(0, whole)) + (h - whole) * (w[whole] || 0)) / total;
  }
  function savingsPerDay(s, resource, day) {
    let save = 0;
    for (const r of recommendations(s)) {
      const st = s.recs[r.id];
      if (st && st.status === 'accepted' && st.at.slice(0, 10) <= day) save += (resource === 'water' ? r.saveW : r.saveE) / 30;
    }
    return save;
  }
  /* What the (simulated) meter measures for one day. Deterministic per household and date. */
  function dayValue(s, resource, day) {
    const m = day.slice(0, 7), d = parseDay(day), weekend = d.getDay() === 0 || d.getDay() === 6;
    const habit = (s.profile.momentum && s.profile.momentum[resource === 'water' ? 'w' : 'e']) || 1;
    const base = typicalMonth(s.profile, resource, m) / daysIn(m) * s.profile.level * habit * (weekend ? 1.12 : 0.952) * wobble(s.seed + resource + day, resource === 'water' ? 0.16 : 0.11);
    let v = base - savingsPerDay(s, resource, day);
    if (resource === 'water') {
      const showers = s.ch.find((c) => c.tpl === 'showers' && c.checks.includes(day));
      if (showers) v *= 0.93;
    }
    return Math.max(base * 0.5, v);
  }
  function sampleMonth(s, resource, m, monthsAgo) {
    const trend = 1 + 0.0045 * monthsAgo;
    return typicalMonth(s.profile, resource, m) * s.profile.level * trend * wobble(s.seed + 'bill' + resource + m, 0.05);
  }
  /* Generate meter days up to yesterday and close finished months. Returns notes created. */
  function sync(s) {
    const t = today(s), created = [];
    let d = s.lastSync ? addDays(s.lastSync, 1) : s.feedStart;
    while (d < t) { s.days[d] = { e: round(dayValue(s, 'electricity', d), 3), w: round(dayValue(s, 'water', d), 4) }; s.lastSync = d; d = addDays(d, 1); }
    const cur = thisMonth(s);
    for (let m = s.feedStart.slice(0, 7); m < cur; m = addMonths(m, 1)) {
      if (!s.closed.includes(m)) {
        const days = Object.keys(s.days).filter((k) => k.startsWith(m));
        if (days.length) s.months[m] = { e: round(sum(days.map((k) => s.days[k].e)), 1), w: round(sum(days.map((k) => s.days[k].w)), 2), src: 'meter' };
        s.closed.push(m);
        created.push(...closeMonth(s, m));
      }
    }
    ensureChallenges(s);
    created.push(...expireChallenges(s));
    created.push(...evalBadges(s));
    return created;
  }
  const key = (resource) => (resource === 'water' ? 'w' : 'e');
  function todaySoFar(s, resource) { const n = now(s); return dayValue(s, resource, ymd(n)) * cumShare(resource, hourOf(n)); }
  function monthSoFar(s, resource, m = thisMonth(s)) {
    const k = key(resource);
    return sum(Object.keys(s.days).filter((d) => d.startsWith(m)).map((d) => s.days[d][k])) + (m === thisMonth(s) ? todaySoFar(s, resource) : 0);
  }
  function recentDaily(s, resource) {
    const k = key(resource), last = Object.keys(s.days).sort().slice(-7);
    return last.length ? sum(last.map((d) => s.days[d][k])) / last.length : typicalMonth(s.profile, resource, thisMonth(s)) / daysIn(thisMonth(s)) * s.profile.level;
  }
  function projected(s, resource) {
    const n = now(s), m = thisMonth(s), left = daysIn(m) - n.getDate() + (1 - cumShare(resource, hourOf(n)));
    return monthSoFar(s, resource) + left * recentDaily(s, resource);
  }
  /* Value of a month: logged/metered, projected (current) or null (missing). */
  function monthValue(s, resource, m) {
    if (s.months[m]) return s.months[m][key(resource)];
    if (m === thisMonth(s)) return projected(s, resource);
    return null;
  }
  /* "Your usual": the last three logged months before m, adjusted for season. */
  function usual(s, resource, m) {
    const k = key(resource), prior = Object.keys(s.months).filter((x) => x < m).sort().slice(-3);
    if (!prior.length) return typicalMonth(s.profile, resource, m) * s.profile.level;
    const base = sum(prior.map((x) => s.months[x][k] / seasonFactor(s.profile, resource, x))) / prior.length;
    return base * seasonFactor(s.profile, resource, m);
  }
  const change = (s, resource, m) => { const v = monthValue(s, resource, m), u = usual(s, resource, m); return v === null ? null : (v - u) / u * 100; };
  const vsTypical = (s, resource, m) => { const v = monthValue(s, resource, m); return v === null ? null : (v - typicalMonth(s.profile, resource, m)) / typicalMonth(s.profile, resource, m) * 100; };
  const rate = (s, resource) => (resource === 'water' ? (REGIONS.find((r) => r.id === s.profile.region) || REGIONS[0]).water : 2.35);
  const cost = (s, resource, amount) => amount * rate(s, resource);
  function liveWatts(s, t) {
    const d = new Date(t), h = d.getHours(), daily = dayValue(s, 'electricity', ymd(d));
    const base = daily * HOURS_E[h] / sum(HOURS_E) * 1000;
    const fridge = Math.floor(t / 420000) % 3 === 0 ? 85 : 0;
    return base * (0.93 + 0.14 * rng(Math.floor(t / 2000))()) + fridge;
  }

  /* ---------- points ---------- */
  function award(s, id, amount, reason) {
    if (s.ledger.some((l) => l.id === id)) return false;
    s.ledger.push({ id, amount, reason, at: now(s).toISOString() });
    return true;
  }
  const available = (s) => sum(s.ledger.map((l) => l.amount));
  const lifetime = (s) => sum(s.ledger.filter((l) => l.amount > 0).map((l) => l.amount));
  function note(s, n) {
    const item = { id: 'n' + s.seq++, at: now(s).toISOString(), read: false, ...n };
    s.notes.unshift(item); s.notes = s.notes.slice(0, 60);
    return item;
  }
  function post(s, item) {
    if (item.actor === 'me' && !s.privacy.feed) return null;
    const entry = { id: 'f' + s.seq++, at: now(s).toISOString(), cheers: 0, cheered: false, ...item };
    s.feed.unshift(entry); s.feed = s.feed.slice(0, 80);
    return entry;
  }

  /* ---------- readings ---------- */
  /* Sample months (prototype filler) never count towards streaks or badges. */
  const real = (s, m) => s.months[m] && s.months[m].src !== 'sample';
  function loggedStreak(s, m) { let n = 0; for (let x = m; real(s, x); x = addMonths(x, -1)) n++; return n; }
  function validateReading(s, input) {
    const errors = {}, warnings = [], m = input.month;
    if (!/^\d{4}-\d{2}$/.test(m || '')) errors.month = 'Choose a month.';
    else if (m >= thisMonth(s)) errors.month = 'Only finished months can be logged.';
    else if (s.months[m] && s.months[m].src === 'meter') errors.month = `${monthName(m)} already comes from your meter.`;
    const e = Number(input.e), w = Number(input.w);
    if (input.e === '' || input.e == null || !Number.isFinite(e)) errors.e = 'Enter electricity in kWh.'; else if (e < 0) errors.e = 'Usage cannot be negative.';
    if (input.w === '' || input.w == null || !Number.isFinite(w)) errors.w = 'Enter water in m³.'; else if (w < 0) errors.w = 'Usage cannot be negative.';
    if (!Object.keys(errors).length) {
      const te = typicalMonth(s.profile, 'electricity', m), tw = typicalMonth(s.profile, 'water', m);
      if (e > te * 2.5) warnings.push(`${round(e)} kWh is ${round(e / te, 1)}× what homes like yours use in ${monthName(m)}. Is there an extra digit?`);
      if (e < te * 0.3) warnings.push(`${round(e)} kWh is very low for ${monthName(m)}. Was the home empty, or is a digit missing?`);
      if (w > tw * 2.5) warnings.push(`${w} m³ is ${round(w / tw, 1)}× the usual water use for a home like yours. Check the decimal point.`);
      if (w < tw * 0.3) warnings.push(`${w} m³ of water is unusually low. Check the decimal point.`);
      const ae = Number(input.amountE), aw = Number(input.amountW);
      if (input.amountE && e > 0 && (ae / e < 1 || ae / e > 5)) warnings.push(`The electricity bill works out at ${round(ae / e, 2)} kr per kWh. It's normally 1.5-3.5 kr. Check the amount or the kWh.`);
      if (input.amountW && w > 0 && (aw / w < 30 || aw / w > 130)) warnings.push(`The water bill works out at ${round(aw / w)} kr per m³. It's normally 50-90 kr. Check the amount or the m³.`);
    }
    return { errors, warnings, ok: !Object.keys(errors).length };
  }
  function logReading(s, input) {
    const m = input.month, existed = !!s.months[m];
    s.months[m] = { e: round(Number(input.e), 1), w: round(Number(input.w), 2), src: 'manual' };
    const out = [];
    if (award(s, 'reading-' + m, 10, `Logged ${monthName(m)}`)) {
      const streak = loggedStreak(s, m);
      if (streak >= 3 && streak % 3 === 0) award(s, 'streak-' + m, 25, `${streak}-month logging streak`);
      if (!existed) post(s, { actor: 'me', kind: 'reading', title: monthName(m) });
    }
    out.push(...evalBadges(s));
    return out;
  }

  /* ---------- recommendations ---------- */
  function recommendations(s) {
    const p = s.profile, has = (id) => p.appliances.includes(id), n = persons(p), out = [];
    const m = thisMonth(s), heat = estimate(p).electricity.parts.find((x) => x.heat);
    out.push({ id: 'shower', icon: 'ShowerHead', resource: 'water', title: 'One minute less in the shower', detail: `A normal shower head runs about 8 litres a minute. For ${n} ${n === 1 ? 'person' : 'people'} that's roughly ${round(n * 0.2 * 1000, -1)} litres a month.`, saveE: p.hotWater === 'electric' ? n * 9 : 0, saveW: n * 0.2, goal: { resource: 'water', target: 5 } });
    out.push({ id: 'standby', icon: 'Plug', resource: 'electricity', title: 'Switch off standby at the wall', detail: 'TV boxes, consoles and chargers left on standby typically draw about 10 W around the clock.', saveE: 7.2, saveW: 0, goal: { resource: 'electricity', target: 3 } });
    if (has('washer')) out.push({ id: 'wash30', icon: 'WashingMachine', resource: 'electricity', title: 'Wash at 30 °C instead of 40 °C', detail: 'Most of a wash cycle\'s energy goes into heating water. Modern detergents clean well at 30 °C.', saveE: round(washCycles(p) / 12 * 0.28, 1), saveW: 0, goal: { resource: 'electricity', target: 3 } });
    if (has('washer')) out.push({ id: 'fullloads', icon: 'WashingMachine', resource: 'water', title: 'Only run full loads', detail: 'Waiting for a full drum cuts about one wash in five, and the water and energy that go with it.', saveE: round(washCycles(p) / 12 * 0.2 * 0.6, 1), saveW: round(washCycles(p) / 12 * 0.2 * 0.05, 2), goal: { resource: 'both', target: 3 } });
    if (has('dryer')) out.push({ id: 'linedry', icon: 'Wind', resource: 'electricity', title: 'Line-dry half your laundry', detail: 'A tumble dryer uses about twice the energy of the wash itself.', saveE: round(washCycles(p) * 0.6 * 1.6 / 12 * 0.5, 1), saveW: 0, goal: { resource: 'electricity', target: 5 } });
    if (has('dishwasher')) out.push({ id: 'ecodish', icon: 'Sparkles', resource: 'electricity', title: 'Use the dishwasher\'s eco programme', detail: 'It runs longer but at a lower temperature, using about 20% less electricity.', saveE: round(dishCycles(p) / 12 * 0.18, 1), saveW: 0, goal: { resource: 'electricity', target: 3 } });
    if (has('cooking')) out.push({ id: 'lids', icon: 'CookingPot', resource: 'electricity', title: 'Put a lid on the pot', detail: 'Water boils faster with a lid, and you can turn the hob down sooner.', saveE: round((150 + 90 * n) / 12 * 0.1, 1), saveW: 0, goal: { resource: 'electricity', target: 3 } });
    if (heat && p.heating !== 'gas') out.push({ id: 'heat1', icon: 'Thermometer', resource: 'electricity', title: 'Turn the heating down 1 °C', detail: 'Each degree saves around 5% of the heating energy.', saveE: round(heat.kwh * SEASON_HEAT[monthIndex(m)] / 12 * 0.05, 1), saveW: 0, goal: { resource: 'electricity', target: 5 } });
    out.push({ id: 'aerator', icon: 'Droplet', resource: 'water', title: 'Fit tap aerators', detail: 'A small insert that mixes air into the flow. Same feel, about a third less water at the tap.', saveE: 0, saveW: round(n * 0.08, 2), goal: { resource: 'water', target: 3 } });
    if (has('washer')) out.push({ id: 'shiftwash', icon: 'Clock', resource: 'electricity', costOnly: true, title: 'Run laundry in green hours', detail: 'Same energy, lower price: start the machine when electricity is cheapest. It saves money, not kWh.', saveE: 0, saveW: 0, saveKr: round(washCycles(p) / 12 * 0.8 * 1.1) });
    if (has('ev')) out.push({ id: 'evnight', icon: 'Car', resource: 'electricity', costOnly: true, title: 'Charge the car at night', detail: 'Night prices are often a krone or more lower per kWh. It saves money, not kWh.', saveE: 0, saveW: 0, saveKr: round(2200 / 12 * 0.9) });
    for (const r of out) r.saveKr = r.saveKr ?? round(cost(s, 'electricity', r.saveE) + cost(s, 'water', r.saveW));
    return out.sort((a, b) => b.saveKr - a.saveKr);
  }
  function setRec(s, id, status) { s.recs[id] = { status, at: now(s).toISOString() }; }

  /* ---------- goals ---------- */
  function efficient(s, resource) {
    const m = thisMonth(s), check = (r) => usual(s, r, m) < typicalMonth(s.profile, r, m);
    return resource === 'both' ? check('electricity') && check('water') : check(resource);
  }
  function goalPoints({ target, months, resource, efficient: eff }) { return Math.round(8 * target * months * (resource === 'both' ? 1.5 : 1) * (eff ? 1.25 : 1)); }
  function goalMonths(g) { const out = []; for (let m = g.start; m <= g.end; m = addMonths(m, 1)) out.push(m); return out; }
  const goalResources = (g) => (g.resource === 'both' ? ['electricity', 'water'] : [g.resource]);
  function goalProgress(s, g) {
    const ms = goalMonths(g).filter((m) => m <= thisMonth(s));
    const per = goalResources(g).map((r) => { const c = ms.map((m) => change(s, r, m)).filter((v) => v !== null); return c.length ? -sum(c) / c.length : 0; });
    const reduction = Math.min(...per);
    return { reduction, onTrack: reduction >= g.target, monthsIn: ms.length };
  }
  function createGoal(s, { resource, target, months, source }) {
    const start = thisMonth(s), eff = efficient(s, resource);
    const g = { id: 'g' + s.seq++, resource, target, months, start, end: addMonths(start, months - 1), est: goalPoints({ target, months, resource, efficient: eff }), status: 'active', source: source || 'custom', at: now(s).toISOString() };
    s.goals.unshift(g);
    award(s, 'first-goal', 10, 'First goal set');
    return g;
  }
  const goalLabel = (g) => `${g.resource === 'both' ? 'Electricity and water' : g.resource === 'water' ? 'Water' : 'Electricity'} −${g.target}%`;

  /* ---------- challenges ---------- */
  const CHALLENGES = {
    cut10: { title: 'Ten percent month', kind: 'reduction', resource: 'electricity', target: 10, points: 150, ticket: true, icon: 'Zap', blurb: 'Use 10% less electricity than usual this month.', how: 'Measured from your meter when the month closes, against your usual for the month.' },
    showers: { title: 'Five-minute showers', kind: 'habit', goal: 7, per: 5, points: 60, icon: 'ShowerHead', blurb: 'Keep showers under five minutes on 7 days within two weeks.', how: 'Check in once a day. Self-reported, 5 points per check-in.' },
    greenwash: { title: 'Green-hour laundry', kind: 'offpeak', goal: 4, per: 8, points: 80, ticket: true, icon: 'WashingMachine', blurb: 'Run 4 loads in the cheapest hours this month.', how: 'Plan a load in Plan and mark it done. 8 points per load.' },
    coldwash: { title: 'Cold-wash month', kind: 'habit', goal: 5, per: 5, points: 50, ticket: true, icon: 'Snowflake', blurb: 'Wash 5 loads at 30 °C or lower this month.', how: 'Check in after each load. Self-reported, 5 points per check-in.' },
    standby: { title: 'Standby sweep', kind: 'quick', goal: 1, per: 0, points: 30, icon: 'Plug', blurb: 'Switch off everything on standby for one weekend.', how: 'Check in once when you have done it.' },
    league: { title: "Friends' league", kind: 'team', resource: 'electricity', target: 8, points: 100, ticket: true, icon: 'Users', blurb: 'Team up with friends. The team average must be 8% under usual this month.', how: 'Everyone is measured against their own usual, so household size does not matter.' }
  };
  function instance(tpl, start, end) { return { id: `${tpl}-${start}`, tpl, start, end, joined: false, joinedAt: null, checks: [], status: 'open', team: [] }; }
  function ensureChallenges(s) {
    const m = thisMonth(s), start = m + '-01', end = `${m}-${pad(daysIn(m))}`;
    for (const tpl of ['cut10', 'greenwash', 'coldwash', 'standby', 'league']) if (!s.ch.some((c) => c.tpl === tpl && c.start === start)) s.ch.push(instance(tpl, start, end));
    if (!s.ch.some((c) => c.tpl === 'showers' && c.end >= today(s))) s.ch.push(instance('showers', today(s), addDays(today(s), 13)));
  }
  const tplOf = (c) => CHALLENGES[c.tpl];
  const isActive = (s, c) => c.status === 'open' && c.start <= today(s) && c.end >= today(s);
  function joinChallenge(s, id, team = []) {
    const c = s.ch.find((x) => x.id === id);
    if (!c || c.joined) return;
    c.joined = true; c.joinedAt = now(s).toISOString(); c.team = team;
    post(s, { actor: 'me', kind: c.tpl === 'league' ? 'team' : 'join', title: tplOf(c).title, with: team });
  }
  function completeChallenge(s, c, detail) {
    const t = tplOf(c);
    c.status = 'done'; c.doneAt = now(s).toISOString();
    award(s, 'ch-' + c.id, t.points, t.title);
    if (t.ticket) s.tickets.push({ id: 't-' + c.id, month: c.start.slice(0, 7), source: t.title });
    post(s, { actor: 'me', kind: 'challenge', title: t.title, detail, pts: t.points });
    note(s, { icon: 'Trophy', title: `${t.title} complete`, body: `+${t.points} points${t.ticket ? ' and a ticket for the Green draw' : ''}.` });
    return { type: 'challenge', id: c.id, title: t.title, points: t.points, ticket: !!t.ticket };
  }
  function checkIn(s, id) {
    const c = s.ch.find((x) => x.id === id), t = c && tplOf(c), d = today(s);
    if (!c || !c.joined || !isActive(s, c) || !['habit', 'quick'].includes(t.kind)) return null;
    if (c.tpl !== 'coldwash' && c.checks.includes(d)) return null;
    const stamp = c.tpl === 'coldwash' ? d + '#' + (c.checks.length + 1) : d;
    c.checks.push(stamp);
    if (t.per) award(s, `chk-${c.id}-${stamp}`, t.per, `${t.title} check-in`);
    if (c.checks.length >= t.goal) return completeChallenge(s, c);
    return { type: 'checkin', points: t.per };
  }
  const canCheckIn = (s, c) => c.joined && isActive(s, c) && ['habit', 'quick'].includes(tplOf(c).kind) && (c.tpl === 'coldwash' || !c.checks.includes(today(s)));
  function challengeProgress(s, c) {
    const t = tplOf(c);
    if (t.kind === 'reduction') { const r = -(change(s, t.resource, c.start.slice(0, 7)) || 0); return { value: r, goal: t.target, label: `${r >= 0 ? '−' : '+'}${Math.abs(round(r, 1))}% so far`, ratio: clamp(r / t.target, 0, 1) }; }
    if (t.kind === 'team') { const r = teamReduction(s, c); return { value: r, goal: t.target, label: `Team ${r >= 0 ? '−' : '+'}${Math.abs(round(r, 1))}%`, ratio: clamp(r / t.target, 0, 1) }; }
    return { value: c.checks.length, goal: t.goal, label: `${c.checks.length} of ${t.goal}`, ratio: c.checks.length / t.goal };
  }
  function teamReduction(s, c) {
    const mine = -(change(s, 'electricity', c.start.slice(0, 7)) || 0);
    const others = c.team.map((id) => person(id)).filter(Boolean).map((f) => -f.e);
    return sum([mine, ...others]) / (others.length + 1);
  }
  function expireChallenges(s) {
    for (const c of s.ch) if (c.status === 'open' && c.end < today(s)) c.status = c.joined ? 'missed' : 'closed';
    return [];
  }
  const participants = (c) => FRIENDS.filter((f) => (hash(f.id + c.tpl + c.start) % 10) < 4).map((f) => f.id);

  /* ---------- month close: goals, measured challenges, draw ---------- */
  function closeMonth(s, m) {
    const out = [];
    for (const g of s.goals.filter((x) => x.status === 'active' && x.end <= m)) {
      const p = goalProgress(s, g);
      g.status = p.onTrack ? 'reached' : 'missed'; g.result = round(p.reduction, 1);
      if (p.onTrack) {
        award(s, 'goal-' + g.id, g.est, goalLabel(g));
        post(s, { actor: 'me', kind: 'goal', title: `${goalLabel(g)} in ${monthName(m)}`, pts: g.est });
        note(s, { icon: 'Target', title: 'Goal reached', body: `${goalLabel(g)}: you cut ${round(p.reduction, 1)}%. +${g.est} points.` });
        out.push({ type: 'goal', title: goalLabel(g), points: g.est });
      } else {
        note(s, { icon: 'Target', title: 'Not this time', body: p.reduction > 0 ? `${goalLabel(g)} was the aim. You still used ${round(p.reduction, 1)}% less than usual.` : `${goalLabel(g)} was the aim. Want to try a smaller step this month?` });
      }
    }
    for (const c of s.ch.filter((x) => x.status === 'open' && x.start.slice(0, 7) === m && x.joined)) {
      const t = tplOf(c);
      if (t.kind === 'reduction') { const r = -change(s, t.resource, m); if (r >= t.target) out.push(completeChallenge(s, c, `−${round(r)}% electricity`)); else c.status = 'missed'; }
      if (t.kind === 'team') { const r = teamReduction(s, c); if (r >= t.target) { out.push(completeChallenge(s, c, `team −${round(r)}%`)); s.leagueWins = (s.leagueWins || 0) + 1; } else c.status = 'missed'; }
    }
    const streak = loggedStreak(s, m);
    if (streak >= 3 && streak % 3 === 0) award(s, 'streak-' + m, 25, `${streak}-month logging streak`);
    award(s, 'reading-' + m, 10, `${monthName(m)} recorded`);
    runDraw(s, m);
    return out;
  }
  function runDraw(s, m) {
    if (s.draws.some((d) => d.month === m)) return;
    const tickets = s.tickets.filter((t) => t.month === m).length, r = rng(s.seed + 'draw' + m), prize = PRIZES[Math.floor(r() * PRIZES.length)];
    const youWin = tickets > 0 && r() < 0.12 * tickets;
    const winner = youWin ? 'me' : FRIENDS[Math.floor(r() * FRIENDS.length)].id;
    s.draws.unshift({ month: m, winner, prize: prize.name, tickets });
    if (youWin) { note(s, { icon: 'Ticket', title: `You won the ${monthName(m)} Green draw`, body: `${prize.name}. We'll email the details.` }); post(s, { actor: 'me', kind: 'draw', title: `${monthName(m)} Green draw`, detail: prize.name }); }
    else if (tickets) note(s, { icon: 'Ticket', title: `${monthName(m)} Green draw`, body: `Not this time: ${friendName(winner)} won ${prize.name.toLowerCase()}.` });
  }

  /* ---------- rewards ---------- */
  const PARTNER_TEST = { consumption: 'Cuts consumption', life: 'Makes things last', swap: 'Lower-impact swap' };
  const REWARDS = [
    { id: 'shower', name: '25% off a low-flow shower head', partner: 'Vandklog', cost: 150, cat: 'consumption', icon: 'ShowerHead', why: 'A 6 L/min head uses up to 40% less water than an older 10-12 L/min one.' },
    { id: 'led', name: '20% off a 4-pack of LED bulbs', partner: 'Lyskilde', cost: 120, cat: 'consumption', icon: 'Lightbulb', why: 'An LED uses about 85% less electricity than a halogen bulb.' },
    { id: 'repair', name: 'A seat at the repair café', partner: 'Nørrebro Repair Collective', cost: 80, cat: 'life', icon: 'Wrench', why: 'Fixing a toaster or a jacket beats buying a new one.' },
    { id: 'bike', name: 'Free bike tune-up', partner: 'Cykelkælderen', cost: 200, cat: 'life', icon: 'Bike', why: 'Keeps a bike, and its rider, on the road for longer.' },
    { id: 'furniture', name: '15% off second-hand furniture', partner: 'Genbrugsloftet', cost: 180, cat: 'life', icon: 'Sofa', why: 'Second-hand furniture avoids most of the footprint of making new.' },
    { id: 'vegbox', name: '25% off your first organic veg box', partner: 'Markkassen', cost: 160, cat: 'swap', icon: 'Carrot', why: 'Seasonal vegetables from Zealand farms, delivered in a returnable crate.' },
    { id: 'refill', name: '10% off at a refill shop', partner: 'Fyld Op', cost: 90, cat: 'swap', icon: 'PackageOpen', why: 'Bring your own containers for soap, oats and pasta.' }
  ];
  const PRIZES = [
    { name: 'A month of organic veg boxes', icon: 'Carrot' },
    { name: 'A night in a Green Key cabin', icon: 'TentTree' },
    { name: 'A smart-plug starter kit', icon: 'PlugZap' },
    { name: 'A tree planted in your name', icon: 'TreePine' },
    { name: 'A full bike service', icon: 'Bike' }
  ];
  function redeem(s, rewardId) {
    const r = REWARDS.find((x) => x.id === rewardId);
    if (!r) throw Error('Reward not found.');
    const prev = s.redemptions.find((x) => x.rewardId === rewardId);
    if (prev) return prev;
    if (available(s) < r.cost) throw Error(`You need ${r.cost - available(s)} more points.`);
    const g = rng(s.seed + rewardId + s.seq), chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const part = () => Array.from({ length: 4 }, () => chars[Math.floor(g() * chars.length)]).join('');
    const v = { id: 'v' + s.seq++, rewardId, code: `PB-${part()}-${part()}`, at: now(s).toISOString() };
    s.redemptions.unshift(v);
    award(s, 'claim-' + v.id, -r.cost, r.name);
    return v;
  }

  /* ---------- badges ---------- */
  const BADGES = [
    { id: 'first-reading', name: 'First reading', icon: 'Receipt', how: 'Log your first month of usage.' },
    { id: 'steady', name: 'Steady logger', icon: 'CalendarDays', how: 'Have three months in a row logged.' },
    { id: 'goal-getter', name: 'Goal getter', icon: 'Target', how: 'Reach a goal you set.' },
    { id: 'ten-club', name: '10% club', icon: 'TrendingDown', how: 'Finish a month 10% under your usual on electricity or water.' },
    { id: 'water-wise', name: 'Water wise', icon: 'Droplet', how: 'Finish a month with water 10% under your usual.' },
    { id: 'balance', name: 'Both in balance', icon: 'Activity', how: 'Finish a month under your usual on both electricity and water.' },
    { id: 'off-peak', name: 'Off-peak pro', icon: 'Clock', how: 'Run 10 appliance loads in green hours.' },
    { id: 'comeback', name: 'Comeback', icon: 'RotateCcw', how: 'Get back under your usual after a month above it.' },
    { id: 'company', name: 'Good company', icon: 'Users', how: 'Have your first mutual friend.' },
    { id: 'team', name: 'Team player', icon: 'HandHeart', how: "Finish a Friends' league with your team." }
  ];
  function earnedBadgeIds(s) {
    const ids = new Set(), ms = Object.keys(s.months).filter((m) => real(s, m)).sort();
    if (ms.length) ids.add('first-reading');
    if (ms.some((m) => loggedStreak(s, m) >= 3)) ids.add('steady');
    if (s.goals.some((g) => g.status === 'reached')) ids.add('goal-getter');
    let prevAbove = false;
    for (const m of ms) {
      if (Object.keys(s.months).filter((x) => x < m).length < 3) continue;
      const ce = change(s, 'electricity', m), cw = change(s, 'water', m);
      if (ce <= -10 || cw <= -10) ids.add('ten-club');
      if (cw <= -10) ids.add('water-wise');
      if (ce < 0 && cw < 0) ids.add('balance');
      if (prevAbove && ce < 0) ids.add('comeback');
      prevAbove = ce > 0;
    }
    if (s.greenRuns >= 10) ids.add('off-peak');
    if (s.friends.some((f) => f.status === 'mutual')) ids.add('company');
    if (s.leagueWins) ids.add('team');
    return ids;
  }
  function evalBadges(s, silent = s.setup) {
    const out = [];
    for (const id of earnedBadgeIds(s)) {
      if (s.badges[id]) continue;
      s.badges[id] = { at: now(s).toISOString(), pinned: false };
      if (silent) continue;
      const b = BADGES.find((x) => x.id === id);
      post(s, { actor: 'me', kind: 'badge', title: b.name });
      note(s, { icon: 'Award', title: `New badge: ${b.name}`, body: b.how });
      out.push({ type: 'badge', id, title: b.name });
    }
    return out;
  }
  function togglePin(s, id) {
    const b = s.badges[id]; if (!b) return;
    if (!b.pinned && Object.values(s.badges).filter((x) => x.pinned).length >= 3) throw Error('You can pin up to three badges. Unpin one first.');
    b.pinned = !b.pinned;
  }

  /* ---------- plans (appliance runs) ---------- */
  function planRun(s, applianceId, startTs) {
    const a = appliance(applianceId), list = prices(s, ymd(new Date(startTs))), h = new Date(startTs).getHours();
    const p = { id: 'p' + s.seq++, appliance: applianceId, start: startTs, kwh: a.cycle.kwh, hours: a.cycle.hours, green: greenHours(list).has(h), status: 'planned' };
    s.plans.unshift(p);
    return p;
  }
  function markDone(s, planId) {
    const p = s.plans.find((x) => x.id === planId);
    if (!p || p.status !== 'planned') return [];
    p.status = 'done'; p.doneAt = now(s).toISOString();
    const out = [];
    if (p.green) {
      s.greenRuns++;
      const c = s.ch.find((x) => x.tpl === 'greenwash' && x.joined && isActive(s, x));
      if (c && ['washer', 'dryer'].includes(p.appliance) && !c.checks.includes(p.id)) {
        c.checks.push(p.id); award(s, `chk-${c.id}-${p.id}`, CHALLENGES.greenwash.per, 'Green-hour load');
        if (c.checks.length >= CHALLENGES.greenwash.goal && c.status === 'open') out.push(completeChallenge(s, c));
        else out.push({ type: 'checkin', points: CHALLENGES.greenwash.per });
      }
    }
    out.push(...evalBadges(s));
    return out;
  }

  /* ---------- friends (mock) ---------- */
  const FRIENDS = [
    { id: 'akshi', name: 'Akshi', home: '2 people · apartment', city: 'Frederiksberg', e: -6, w: -9, streak: 3, pts: 640, perE: 92, perW: 2.9, share: true, badges: ['first-reading', 'steady', 'goal-getter', 'water-wise', 'company'], done: 5 },
    { id: 'mikael', name: 'Mikael', home: '1 person · apartment', city: 'Nørrebro', e: -11, w: -2, streak: 5, pts: 910, perE: 118, perW: 3.4, share: true, badges: ['first-reading', 'steady', 'goal-getter', 'ten-club', 'off-peak', 'company'], done: 8 },
    { id: 'piotr', name: 'Piotr', home: '3 people · house', city: 'Valby', e: -4, w: -8, streak: 2, pts: 480, perE: 101, perW: 3.1, share: false, badges: ['first-reading', 'ten-club', 'company'], done: 4 },
    { id: 'vi', name: 'Vi', home: '2 people · apartment', city: 'Østerbro', e: -12, w: -5, streak: 6, pts: 1120, perE: 84, perW: 2.6, share: true, badges: ['first-reading', 'steady', 'goal-getter', 'ten-club', 'balance', 'off-peak', 'company', 'team'], done: 11 },
    { id: 'thomas', name: 'Thomas', home: '3 people · apartment', city: 'Amager', e: -7, w: -3, streak: 4, pts: 720, perE: 97, perW: 3.0, share: true, badges: ['first-reading', 'steady', 'balance', 'company', 'team'], done: 6 },
    { id: 'mathias', name: 'Mathias', home: '1 person · apartment', city: 'Vesterbro', e: 2, w: -4, streak: 1, pts: 260, perE: 131, perW: 3.6, share: false, badges: ['first-reading', 'company', 'team'], done: 2 },
    { id: 'maninder', name: 'Maninder', home: '4 people · house', city: 'Roskilde', e: -5, w: -6, streak: 4, pts: 830, perE: 88, perW: 2.8, share: true, badges: ['first-reading', 'steady', 'goal-getter', 'balance', 'company'], done: 7 },
    { id: 'konstantina', name: 'Konstantina', home: '2 people · apartment', city: 'Christianshavn', e: -9, w: -1, streak: 2, pts: 540, perE: 95, perW: 3.2, share: true, badges: ['first-reading', 'comeback', 'company'], done: 4 }
  ];
  const DIRECTORY = [
    { id: 'signe', name: 'Signe', home: '2 people · terraced house', city: 'Aarhus', e: -3, w: -7, streak: 2, pts: 310, perE: 104, perW: 3.3, share: true, badges: ['first-reading', 'company'], done: 2, code: 'SIGNE-3307' },
    { id: 'jonas', name: 'Jonas', home: '1 person · student room', city: 'Odense', e: -8, w: 1, streak: 3, pts: 450, perE: 76, perW: 3.0, share: false, badges: ['first-reading', 'steady', 'company'], done: 3, code: 'JONAS-5120' }
  ];
  for (const f of FRIENDS) f.code = f.name.toUpperCase() + '-' + (1000 + (hash(f.id) % 9000));
  const people = () => [...FRIENDS, ...DIRECTORY];
  const person = (id) => people().find((f) => f.id === id);
  const friendName = (id) => (id === 'me' ? 'You' : (person(id) || { name: 'Someone' }).name);
  const mutualFriends = (s) => s.friends.filter((f) => f.status === 'mutual').map((f) => person(f.id)).filter(Boolean);
  function addByCode(s, code) {
    const c = String(code || '').trim().toUpperCase();
    if (!/^[A-Z]+-\d{4}$/.test(c)) throw Error('Friend codes look like NAME-1234.');
    if (c === s.profile.code) throw Error('That is your own code.');
    const p = people().find((x) => x.code === c);
    if (!p) throw Error('No one has that code. Check it with your friend.');
    const existing = s.friends.find((f) => f.id === p.id);
    if (existing && existing.status === 'mutual') throw Error(`You and ${p.name} are already friends.`);
    if (existing && existing.status === 'incoming') { acceptFriend(s, p.id); return { person: p, status: 'mutual' }; }
    if (!existing) s.friends.push({ id: p.id, status: 'outgoing', at: now(s).toISOString() });
    return { person: p, status: 'outgoing' };
  }
  function acceptFriend(s, id) {
    const f = s.friends.find((x) => x.id === id); if (!f) return [];
    f.status = 'mutual'; f.at = now(s).toISOString();
    note(s, { icon: 'Users', title: `You and ${friendName(id)} are now friends`, body: 'You can compare progress and see each other in the feed.' });
    return evalBadges(s);
  }
  function declineFriend(s, id) { s.friends = s.friends.filter((x) => x.id !== id); }
  function ranking(s, resource) {
    const m = thisMonth(s), mine = change(s, resource, m);
    const rows = mutualFriends(s).map((f) => ({ id: f.id, name: f.name, pct: resource === 'water' ? f.w : f.e }));
    rows.push({ id: 'me', name: 'You', pct: round(mine, 1) });
    return rows.sort((a, b) => a.pct - b.pct);
  }

  /* Simulated activity from friends while the app is open. */
  const EVENT_POOL = [
    (f) => ({ kind: 'join', title: pick(f, ['Five-minute showers', 'Cold-wash month', 'Ten percent month', 'Green-hour laundry']) }),
    (f) => ({ kind: 'challenge', title: pick(f, ['Standby sweep', 'Five-minute showers', 'Cold-wash month']), pts: null }),
    (f) => { const b = BADGES.filter((x) => !f.badges.includes(x.id)); return b.length ? { kind: 'badge', title: pick(f, b).name } : null; },
    (f) => ({ kind: 'streak', title: `${f.streak + 1}-month logging streak` }),
    (f) => ({ kind: 'reading', title: 'a meter reading' })
  ];
  function pick(f, list) { return list[hash(f.id + list.length + Date.now()) % list.length]; }
  function friendEvent(s, r) {
    const friends = mutualFriends(s); if (!friends.length) return null;
    for (let tries = 0; tries < 6; tries++) {
      const f = friends[Math.floor(r() * friends.length)], ev = EVENT_POOL[Math.floor(r() * EVENT_POOL.length)](f);
      if (!ev) continue;
      if (ev.kind === 'challenge') ev.pts = Object.values(CHALLENGES).find((c) => c.title === ev.title).points;
      const dup = s.feed.slice(0, 25).some((x) => x.actor === f.id && x.kind === ev.kind && x.title === ev.title);
      if (dup) continue;
      if (ev.kind === 'badge') f.badges.push(BADGES.find((b) => b.name === ev.title).id);
      if (ev.kind === 'streak') f.streak++;
      if (ev.pts) f.pts += ev.pts;
      return post(s, { actor: f.id, ...ev, cheers: Math.floor(r() * 2) });
    }
    return null;
  }
  function cheer(s, feedId) {
    const f = s.feed.find((x) => x.id === feedId); if (!f || f.actor === 'me') return;
    f.cheered = !f.cheered; f.cheers += f.cheered ? 1 : -1;
  }
  /* A friend cheers one of your recent posts. */
  function friendCheers(s, r) {
    const friends = mutualFriends(s), mine = s.feed.filter((x) => x.actor === 'me' && (x.by || []).length < friends.length).slice(0, 5);
    if (!mine.length || !friends.length) return null;
    const item = mine[Math.floor(r() * mine.length)], who = friends.filter((f) => !(item.by || []).includes(f.id));
    if (!who.length) return null;
    const f = who[Math.floor(r() * who.length)];
    item.by = [...(item.by || []), f.id]; item.cheers++;
    return { friend: f, item };
  }

  /* ---------- creating state ---------- */
  function base(profile, seed, offset = 0) {
    return { v: VERSION, seed, offset, seq: 1, profile, privacy: { feed: true, percent: true, exact: false, league: true }, months: {}, days: {}, closed: [], lastSync: null, feedStart: null, recs: {}, plans: [], greenRuns: 0, goals: [], ch: [], ledger: [], redemptions: [], tickets: [], draws: [], badges: {}, friends: [], feed: [], notes: [], live: true };
  }
  function friendCode(name, seed) { return (name || 'HOME').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 10) + '-' + (1000 + (hash(name + seed) % 9000)); }
  function seedSocial(s, includePending = true) {
    for (const f of FRIENDS) if (f.id !== 'konstantina') s.friends.push({ id: f.id, status: 'mutual', at: s.created });
    if (includePending) s.friends.push({ id: 'konstantina', status: 'incoming', at: now(s).toISOString() });
    const n = now(s).getTime(), h = 36e5, monthStart = new Date(now(s).getFullYear(), now(s).getMonth(), 1, 9).getTime(), prev = monthName(addMonths(thisMonth(s), -1));
    const items = [
      ['vi', 'challenge', 'Five-minute showers', null, 60, 2 * h, 5],
      ['mikael', 'badge', 'Off-peak pro', null, null, 5 * h, 3],
      ['piotr', 'join', 'Ten percent month', null, null, 26 * h, 2],
      ['akshi', 'join', 'Five-minute showers', null, null, 30 * h, 2],
      ['maninder', 'streak', '4-month logging streak', null, null, 50 * h, 4],
      ['thomas', 'team', "Friends' league", null, null, 54 * h, 7, ['mathias']],
      ['konstantina', 'badge', 'Comeback', null, null, 74 * h, 8],
      ['mathias', 'challenge', 'Standby sweep', null, 30, 98 * h, 1],
      ['vi', 'goal', `Electricity −12% in ${prev}`, null, 115, n - monthStart + 2 * h, 9],
      ['akshi', 'draw', `${prev} Green draw`, 'A month of organic veg boxes', null, n - monthStart, 12],
      ['piotr', 'goal', `Water −8% in ${prev}`, null, 64, n - monthStart + 3 * h, 6],
      ['mikael', 'badge', '10% club', null, null, n - monthStart + 4 * h, 3]
    ];
    s.feed = items.map(([actor, kind, title, detail, pts, ago, cheers, w], i) => ({ id: 'seed' + i, actor, kind, title, detail, pts, with: w, at: new Date(n - Math.max(ago, 600000)).toISOString(), cheers, cheered: false })).sort((a, b) => b.at.localeCompare(a.at));
    s.draws.push({ month: addMonths(thisMonth(s), -1), winner: 'akshi', prize: 'A month of organic veg boxes', tickets: 0 });
  }
  /* Fresh household from onboarding. */
  function create(profile, { sample = true, bill = null, offset = 0 } = {}) {
    const seed = hash(profile.name + JSON.stringify(profile) + Date.now()) % 1e6;
    const s = base({ ...profile, level: profile.level || round(0.94 + (seed % 100) / 100 * 0.2, 2) }, seed, offset);
    s.created = now(s).toISOString(); s.setup = true;
    s.profile.code = friendCode(profile.name, seed);
    const cur = thisMonth(s);
    s.feedStart = cur + '-01';
    if (sample) for (let i = 12; i >= 1; i--) { const m = addMonths(cur, -i); s.months[m] = { e: round(sampleMonth(s, 'electricity', m, i), 1), w: round(sampleMonth(s, 'water', m, i), 2), src: 'sample' }; }
    if (bill) s.months[bill.month] = { e: round(bill.e, 1), w: round(bill.w, 2), src: 'manual' };
    seedSocial(s);
    sync(s);
    evalBadges(s, true);
    for (const m of Object.keys(s.months)) if (s.months[m].src === 'manual') award(s, 'reading-' + m, 10, `Logged ${monthName(m)}`);
    award(s, 'welcome', 20, 'Welcome to PowerBuddy');
    delete s.setup;
    note(s, { icon: 'House', title: 'Your home is set up', body: 'Your usage is now compared with homes like yours.' });
    return s;
  }
  /* The demo household: Freja, two adults in a Copenhagen apartment. */
  const DEMO_PROFILE = { name: 'Freja', region: 'capital', housing: 'apartment', area: 68, adults: 2, children: 0, heating: 'district', hotWater: 'heating', appliances: ['fridge', 'washer', 'cooking', 'tv', 'office'], payment: 'bills', level: 1.07, momentum: { e: 0.955, w: 0.99 } };
  function demo(offset = 0) {
    const s = base(clone(DEMO_PROFILE), 4821, offset);
    s.created = now(s).toISOString(); s.setup = true;
    s.profile.code = 'FREJA-4821';
    const cur = thisMonth(s), prev = addMonths(cur, -1), t = today(s);
    s.feedStart = cur + '-01';
    for (let i = 12; i >= 2; i--) { const m = addMonths(cur, -i); s.months[m] = { e: round(sampleMonth(s, 'electricity', m, i), 1), w: round(sampleMonth(s, 'water', m, i), 2), src: 'bill' }; }
    // Award history, oldest first.
    const months = Object.keys(s.months).sort();
    months.forEach((m, i) => { s.ledger.push({ id: 'reading-' + m, amount: 10, reason: `Logged ${monthName(m)}`, at: `${addMonths(m, 1)}-05T18:00:00.000Z` }); if ((i + 1) % 3 === 0) s.ledger.push({ id: 'streak-' + m, amount: 25, reason: `${i + 1}-month logging streak`, at: `${addMonths(m, 1)}-05T18:00:00.000Z` }); });
    const m3 = addMonths(cur, -3), m2 = addMonths(cur, -2);
    s.goals.push({ id: 'g-past', resource: 'electricity', target: 5, months: 1, start: m3, end: m3, est: 40, status: 'reached', result: 6.2, source: 'custom', at: `${m3}-02T10:00:00.000Z` });
    s.ledger.push({ id: 'first-goal', amount: 10, reason: 'First goal set', at: `${m3}-02T10:00:00.000Z` });
    s.ledger.push({ id: 'goal-g-past', amount: 40, reason: 'Electricity −5%', at: `${m2}-01T09:00:00.000Z` });
    s.ledger.push({ id: 'ch-standby-' + m2, amount: 30, reason: 'Standby sweep', at: `${m2}-14T11:00:00.000Z` });
    s.ledger.push({ id: 'ch-coldwash-' + prev, amount: 50, reason: 'Cold-wash month', at: `${prev}-24T19:00:00.000Z` });
    s.ledger.push({ id: 'chk-coldwash-' + prev, amount: 25, reason: 'Cold-wash check-ins', at: `${prev}-24T19:00:00.000Z` });
    s.redemptions.push({ id: 'v-demo', rewardId: 'repair', code: 'PB-7KQM-R2DX', at: `${prev}-26T12:00:00.000Z` });
    s.ledger.push({ id: 'claim-v-demo', amount: -80, reason: 'A seat at the repair café', at: `${prev}-26T12:00:00.000Z` });
    s.greenRuns = 7;
    // Active goal and challenges this month.
    s.goals.unshift({ id: 'g-now', resource: 'water', target: 5, months: 1, start: cur, end: cur, est: 40, status: 'active', source: 'shower', at: `${cur}-01T09:30:00.000Z` });
    s.recs.shower = { status: 'accepted', at: `${cur}-01T09:30:00.000Z` };
    s.recs.shiftwash = { status: 'accepted', at: `${prev}-10T09:30:00.000Z` };
    sync(s);
    const sh = s.ch.find((c) => c.tpl === 'showers');
    sh.start = addDays(t, -6); sh.end = addDays(t, 7); sh.id = 'showers-' + sh.start; sh.joined = true; sh.joinedAt = sh.start + 'T07:00:00.000Z';
    sh.checks = [-6, -5, -4, -2, -1].map((n) => addDays(t, n));
    sh.checks.forEach((d) => s.ledger.push({ id: `chk-${sh.id}-${d}`, amount: 5, reason: 'Five-minute showers check-in', at: d + 'T07:30:00.000Z' }));
    const gw = s.ch.find((c) => c.tpl === 'greenwash' && c.start === cur + '-01');
    gw.joined = true; gw.joinedAt = cur + '-02T08:00:00.000Z';
    for (let i = 0; i < 2; i++) {
      const start = new Date(now(s).getFullYear(), now(s).getMonth(), Math.max(1, now(s).getDate() - 6 + i * 3), 13).getTime();
      const p = { id: 'p-demo' + i, appliance: 'washer', start, kwh: 0.8, hours: 2, green: true, status: 'done', doneAt: new Date(start + 72e5).toISOString() };
      if (p.start < now(s).getTime()) { s.plans.push(p); gw.checks.push(p.id); s.ledger.push({ id: `chk-${gw.id}-${p.id}`, amount: 8, reason: 'Green-hour load', at: p.doneAt }); s.greenRuns++; }
    }
    // Recompute the meter days now that showers check-ins exist.
    s.days = {}; s.lastSync = null; sync(s);
    seedSocial(s);
    s.feed.push({ id: 'seed-me1', actor: 'me', kind: 'challenge', title: 'Cold-wash month', pts: 50, at: `${prev}-24T19:00:00.000Z`, cheers: 4, by: ['vi', 'akshi', 'mikael', 'thomas'], cheered: false });
    s.feed.sort((a, b) => b.at.localeCompare(a.at));
    evalBadges(s, true);
    for (const id of Object.keys(s.badges)) s.badges[id].at = `${prev}-05T18:00:00.000Z`;
    ['steady', 'goal-getter', 'company'].forEach((id) => { if (s.badges[id]) s.badges[id].pinned = true; });
    s.ledger.sort((a, b) => a.at.localeCompare(b.at));
    delete s.setup;
    note(s, { icon: 'Receipt', title: `${monthName(prev)} isn't logged yet`, body: 'Add it from your bill to keep your streak going. +10 points.' });
    return s;
  }

  /* ---------- persistence ---------- */
  function validate(x) {
    if (!x || typeof x !== 'object' || x.v !== VERSION) return false;
    const arrays = ['closed', 'plans', 'goals', 'ch', 'ledger', 'redemptions', 'tickets', 'draws', 'friends', 'feed', 'notes'];
    if (arrays.some((k) => !Array.isArray(x[k]))) return false;
    if (!x.profile || !Array.isArray(x.profile.appliances) || !x.months || !x.days || !x.badges || !x.recs) return false;
    if (x.ledger.some((l) => typeof l.id !== 'string' || !Number.isInteger(l.amount))) return false;
    if (new Set(x.ledger.map((l) => l.id)).size !== x.ledger.length) return false;
    return available(x) >= 0;
  }
  function advanceToNextMonth(s) {
    const n = now(s), target = new Date(n.getFullYear(), n.getMonth() + 1, 1, 9, 0, 0).getTime();
    s.offset += target - n.getTime();
    return sync(s);
  }
  function advanceHours(s, h) { s.offset += h * 36e5; return sync(s); }

  return {
    VERSION, KEY, REGIONS, HOUSING, HEATING, HOT_WATER, APPLIANCES, CHALLENGES, REWARDS, PRIZES, PARTNER_TEST, BADGES, FRIENDS, DIRECTORY, CO2_PER_KWH, DEMO_PROFILE,
    helpers: { ymd, mkey, addMonths, addDays, daysIn, monthName, round, clamp, sum, rng, hash, parseDay, hourOf },
    now, today, thisMonth, estimate, typicalMonth, describeHome, persons,
    prices, tomorrowReady, greenHours, priceLevel, priceAt, bestStart,
    sync, dayValue, todaySoFar, monthSoFar, projected, monthValue, usual, change, vsTypical, rate, cost, liveWatts, cumShare,
    available, lifetime, award, note, post, validateReading, logReading, loggedStreak,
    recommendations, setRec, efficient, goalPoints, goalProgress, createGoal, goalLabel, goalMonths,
    tplOf, isActive, joinChallenge, checkIn, canCheckIn, challengeProgress, participants, teamReduction,
    redeem, evalBadges, togglePin, planRun, markDone,
    person, friendName, mutualFriends, addByCode, acceptFriend, declineFriend, ranking, friendEvent, cheer, friendCheers,
    create, demo, validate, advanceToNextMonth, advanceHours, clone
  };
})();
if (typeof module !== 'undefined') module.exports = PBD;
