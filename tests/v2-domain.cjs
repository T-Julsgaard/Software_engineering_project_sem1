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

test('Demo state survives a JSON round trip', () => {
  assert.equal(P.validate(JSON.parse(JSON.stringify(fresh()))), true);
  assert.equal(P.validate({ v: 1 }), false);
});

console.log(`${passed} V2 domain checks passed.`);
