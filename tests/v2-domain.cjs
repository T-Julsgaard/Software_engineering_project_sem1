/* Domain checks for PowerBuddy V2: estimates, points, goals, challenges, rewards, friends. Run: node tests/v2-domain.cjs */
const assert = require('node:assert/strict');
const P = require('../src/v2/domain.js');
let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log('PASS', name); };
const fresh = () => P.demo();

test('Typical usage grows with people, area and electric heating', () => {
  const small = { ...P.DEMO_PROFILE, adults: 1, area: 40 };
  const family = { ...P.DEMO_PROFILE, adults: 2, children: 2, area: 120, housing: 'detached' };
  const heated = { ...family, heating: 'electric' };
  const e = (p) => P.estimate(p).electricity.year;
  assert.ok(e(small) < e(P.DEMO_PROFILE));
  assert.ok(e(P.DEMO_PROFILE) < e(family));
  assert.ok(e(family) + 120 * 80 < e(heated));
  // A two-adult Danish apartment lands in the usual 1,900-2,600 kWh range.
  assert.ok(e(P.DEMO_PROFILE) > 1900 && e(P.DEMO_PROFILE) < 2600);
});

test('Winter months are estimated higher than summer for electricity', () => {
  assert.ok(P.typicalMonth(P.DEMO_PROFILE, 'electricity', '2026-12') > P.typicalMonth(P.DEMO_PROFILE, 'electricity', '2026-07'));
});

test('Goal points follow the published formula', () => {
  assert.equal(P.goalPoints({ target: 5, months: 1, resource: 'electricity', efficient: false }), 40);
  assert.equal(P.goalPoints({ target: 10, months: 1, resource: 'electricity', efficient: false }), 80);
  assert.equal(P.goalPoints({ target: 5, months: 2, resource: 'both', efficient: false }), 120);
  assert.equal(P.goalPoints({ target: 10, months: 1, resource: 'water', efficient: true }), 100);
});

test('Keep-steady goals: 25 points a month, on track while at or under the benchmark', () => {
  assert.equal(P.goalPoints({ kind: 'keep', target: 0, months: 3, resource: 'electricity', efficient: false }), 75);
  assert.equal(P.goalPoints({ kind: 'keep', target: 0, months: 1, resource: 'both', efficient: true }), 47);
  const s = fresh(), m = P.thisMonth(s);
  const g = P.createGoal(s, { kind: 'keep', bench: 'usual', resource: 'electricity', months: 3 });
  assert.equal(g.kind, 'keep'); assert.equal(g.target, 0); assert.equal(g.end, P.helpers.addMonths(m, 2));
  assert.match(P.goalLabel(g), /kept steady/);
  const p = P.goalProgress(s, g);
  assert.equal(p.onTrack, -P.change(s, 'electricity', m) >= 0);
  const t = P.createGoal(s, { kind: 'keep', bench: 'typical', resource: 'water', months: 1 });
  assert.match(P.goalLabel(t), /similar homes/);
  assert.ok(Math.abs(P.goalProgress(s, t).reduction + P.vsTypical(s, 'water', m)) < 1e-9);
  // Cutting goals are unchanged.
  const c = P.createGoal(s, { resource: 'water', target: 5, months: 1 });
  assert.equal(c.kind, 'cut'); assert.equal(c.est, 40);
});

test('A keep-steady goal settles when the month closes', () => {
  const s = fresh();
  s.goals = s.goals.filter((g) => g.status !== 'active');
  const g = P.createGoal(s, { kind: 'keep', bench: 'usual', resource: 'electricity', months: 1 });
  P.advanceToNextMonth(s);
  assert.ok(['reached', 'missed'].includes(g.status));
  assert.equal(g.status === 'reached', g.result >= 0);
});

test('Fridge and "something else" count towards the estimate', () => {
  const e = (p) => P.estimate(p).electricity;
  const base = { ...P.DEMO_PROFILE, appliances: [] };
  assert.equal(e({ ...base, appliances: ['fridgeonly'] }).year - e(base).year, 150);
  assert.ok(e({ ...base, appliances: ['fridgeonly'] }).year < e({ ...base, appliances: ['fridge'] }).year);
  const other = e({ ...base, appliances: ['other'], otherNote: 'Sauna' });
  assert.equal(other.year - e(base).year, 150);
  assert.ok(other.parts.some((x) => x.name === 'Other: Sauna'));
});

test('Upcoming prices: cheapest and priciest hours still to come', () => {
  const s = fresh(), up = P.upcomingPrices(s), t = P.now(s).getTime();
  if (up) { assert.ok(up.low.start > t && up.high.start > t); assert.ok(up.low.price <= up.high.price); }
});

test('A planned run is announced once when its start time comes', () => {
  const s = fresh(), start = P.now(s).getTime() + 36e5;
  s.plans = [];
  const p = P.planRun(s, 'washer', start);
  assert.equal(P.dueRuns(s).length, 0);
  P.advanceHours(s, 1.5);
  assert.deepEqual(P.dueRuns(s).map((x) => x.id), [p.id]);
  assert.equal(P.dueRuns(s).length, 0, 'only once');
  assert.equal(s.notify.plans, true);
});

test('Points are awarded once per id, lifetime never drops when spending', () => {
  const s = fresh(), before = P.available(s), life = P.lifetime(s);
  assert.equal(P.award(s, 'x-1', 10, 'Test'), true);
  assert.equal(P.award(s, 'x-1', 10, 'Test'), false);
  assert.equal(P.available(s), before + 10);
  P.award(s, 'x-2', 500, 'Top up');
  P.redeem(s, 'bike');
  assert.equal(P.lifetime(s), life + 510);
  assert.equal(P.available(s), before + 510 - 200);
});

test('Rewards are single-use and cannot be bought without points', () => {
  const s = fresh();
  s.ledger.push({ id: 'drain', amount: -P.available(s), reason: 'Test', at: new Date().toISOString() });
  assert.throws(() => P.redeem(s, 'led'), /more points/);
  P.award(s, 'gift', 300, 'Test');
  const a = P.redeem(s, 'led'), b = P.redeem(s, 'led');
  assert.equal(a.code, b.code);
  assert.match(a.code, /^PB-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  assert.equal(s.redemptions.filter((v) => v.rewardId === 'led').length, 1);
});

test('Every reward passes the partner test', () => {
  for (const r of P.REWARDS) assert.ok(P.PARTNER_TEST[r.cat], r.id);
});

test('Habit check-ins count once a day and complete the challenge', () => {
  const s = fresh(), c = s.ch.find((x) => x.tpl === 'showers');
  const n = c.checks.length;
  const r1 = P.checkIn(s, c.id);
  assert.ok(r1);
  assert.equal(P.checkIn(s, c.id), null, 'second check-in the same day is ignored');
  assert.equal(c.checks.length, n + 1);
  c.checks.push('2000-01-01');
  P.advanceHours(s, 24);
  const done = P.checkIn(s, c.id);
  assert.equal(done.type, 'challenge');
  assert.equal(c.status, 'done');
  assert.ok(s.ledger.some((l) => l.id === 'ch-' + c.id));
});

test('Joining alone gives no points; monthly challenges give a draw ticket', () => {
  const s = fresh(), c = s.ch.find((x) => x.tpl === 'standby'), before = P.available(s);
  P.joinChallenge(s, c.id);
  assert.equal(P.available(s), before);
  const cw = s.ch.find((x) => x.tpl === 'coldwash' && P.isActive(s, x));
  P.joinChallenge(s, cw.id);
  for (let i = 0; i < 5; i++) P.checkIn(s, cw.id);
  assert.equal(cw.status, 'done');
  assert.ok(s.tickets.some((t) => t.source === 'Cold-wash month'));
});

test('Reading validation catches errors and unlikely values', () => {
  const s = fresh(), m = P.helpers.addMonths(P.thisMonth(s), -1);
  assert.ok(P.validateReading(s, { month: m, e: '', w: '5' }).errors.e);
  assert.ok(P.validateReading(s, { month: m, e: '-3', w: '5' }).errors.e);
  assert.ok(P.validateReading(s, { month: P.thisMonth(s), e: '200', w: '5' }).errors.month);
  assert.equal(P.validateReading(s, { month: m, e: '2000', w: '6' }).warnings.length, 1);
  assert.equal(P.validateReading(s, { month: m, e: '200', w: '6', amountE: '50' }).warnings.length, 1);
  assert.equal(P.validateReading(s, { month: m, e: '200', w: '6' }).warnings.length, 0);
});

test('Logging a missing month gives 10 points once', () => {
  const s = fresh(), m = P.helpers.addMonths(P.thisMonth(s), -1), before = P.available(s);
  P.logReading(s, { month: m, e: 210, w: 6 });
  P.logReading(s, { month: m, e: 212, w: 6 });
  assert.ok(P.available(s) >= before + 10);
  assert.equal(s.ledger.filter((l) => l.id === 'reading-' + m).length, 1);
});

test('Closing a month settles goals and runs the draw', () => {
  const s = fresh(), m = P.thisMonth(s);
  P.advanceToNextMonth(s);
  assert.equal(s.months[m].src, 'meter');
  assert.ok(s.goals.every((g) => g.end > m || g.status !== 'active'));
  assert.ok(s.draws.some((d) => d.month === m));
  assert.ok(s.ch.some((c) => c.tpl === 'cut10' && c.start.startsWith(P.thisMonth(s))));
});

test('Friend codes: mutual only, unknown and own codes rejected', () => {
  const s = fresh();
  assert.throws(() => P.addByCode(s, 'nonsense'), /look like/);
  assert.throws(() => P.addByCode(s, 'NOBODY-1234'), /No one/);
  assert.throws(() => P.addByCode(s, s.profile.code), /own code/);
  const r = P.addByCode(s, 'SIGNE-3307');
  assert.equal(r.status, 'outgoing');
  assert.ok(!P.mutualFriends(s).some((f) => f.id === 'signe'));
  P.acceptFriend(s, 'signe');
  assert.ok(P.mutualFriends(s).some((f) => f.id === 'signe'));
});

test('Ranking compares % change, not absolute usage, and includes you', () => {
  const s = fresh(), rows = P.ranking(s, 'electricity');
  assert.ok(rows.some((r) => r.id === 'me'));
  for (let i = 1; i < rows.length; i++) assert.ok(rows[i - 1].pct <= rows[i].pct);
});

test('Sample months never earn streaks or badges', () => {
  const s = P.create({ ...P.DEMO_PROFILE, name: 'Test', level: 1 }, { sample: true });
  assert.ok(!s.badges['steady']);
  assert.ok(!s.badges['ten-club']);
});

test('Thomas is the only friend above his usual', () => {
  for (const f of [...P.FRIENDS, ...P.DIRECTORY]) {
    if (f.id === 'thomas') { assert.ok(f.e > 0 && f.w > 0); continue; }
    assert.ok(f.e < 0 && f.w < 0, f.id);
  }
  const s = fresh();
  for (const r of ['electricity', 'water']) assert.equal(P.ranking(s, r).at(-1).id, 'thomas');
});

test('Thomas only ever joins things or logs readings in the live feed', () => {
  const s = fresh();
  s.friends = s.friends.filter((f) => f.id === 'thomas');
  let seed = 1; const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 40; i++) { const ev = P.friendEvent(s, r); if (ev) assert.ok(['join', 'reading'].includes(ev.kind), ev.kind); }
});

test('Friends can be muted one by one', () => {
  const s = fresh();
  assert.equal(P.wantsFriend(s, 'vi'), true);
  P.setFriendMuted(s, 'vi', true);
  assert.equal(P.wantsFriend(s, 'vi'), false);
  assert.equal(P.wantsFriend(s, 'akshi'), true);
  P.setFriendMuted(s, 'vi', false);
  assert.equal(P.wantsFriend(s, 'vi'), true);
  assert.equal(s.notify.muted.length, 0);
});

test('The first tip is about cheap electricity tonight, and tips rotate', () => {
  const s = fresh();
  const first = P.nextTip(s);
  assert.match(first.title, /cheap/i);
  assert.match(first.body, /kr\/kWh/);
  const titles = [first, P.nextTip(s), P.nextTip(s), P.nextTip(s)].map((t) => t.title);
  assert.equal(new Set(titles).size, 4);
  const w = P.cheapWindow(s, 3);
  assert.ok(w.avg <= w.peak);
});

test('Older saves get notification settings and a history of notifications', () => {
  const s = JSON.parse(JSON.stringify(fresh()));
  delete s.notify; s.notes = s.notes.slice(0, 1);
  assert.equal(P.ensureNotify(s), true);
  assert.ok(s.notes.length >= 5);
  assert.equal(new Set(s.notes.map((n) => n.id)).size, s.notes.length);
  assert.equal(P.ensureNotify(s), false, 'runs once');
  assert.equal(P.validate(s), true);
});

test('Demo state survives a JSON round trip', () => {
  assert.equal(P.validate(JSON.parse(JSON.stringify(fresh()))), true);
  assert.equal(P.validate({ v: 1 }), false);
});

console.log(`${passed} V2 domain checks passed.`);
