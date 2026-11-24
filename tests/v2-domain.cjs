/* Domain checks for PowerBuddy V2: estimates, monthly usage, points, goals, rewards and badges. Run: node tests/v2-domain.cjs */
const assert = require('node:assert/strict');
const P = require('../src/v2/domain.js');
let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log('PASS', name); };
const fresh = () => P.demo();
const { addMonths } = P.helpers;

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

test('Usage is monthly only: nothing is known about the current month', () => {
  const s = fresh(), m = P.thisMonth(s);
  assert.equal(P.monthValue(s, 'electricity', m), null);
  assert.equal(P.change(s, 'electricity', m), null);
  assert.equal(s.days, undefined);
  assert.equal(P.lastEntered(s), addMonths(m, -2), 'the demo has last month still to enter');
  P.advanceHours(s, 30);
  assert.equal(P.monthValue(s, 'electricity', P.thisMonth(s)), null, 'time passing adds no usage by itself');
});

test('Goal points: a cut is worth more with a shorter time frame; keeping steady pays per month', () => {
  assert.equal(P.goalPoints({ kind: 'cut', target: 5, months: 1, resource: 'electricity', efficient: false }), 60);
  assert.equal(P.goalPoints({ kind: 'cut', target: 5, months: 3, resource: 'electricity', efficient: false }), 48);
  assert.equal(P.goalPoints({ kind: 'cut', target: 5, months: 6, resource: 'electricity', efficient: false }), 40);
  assert.equal(P.goalPoints({ kind: 'cut', target: 10, months: 6, resource: 'both', efficient: false }), 120);
  assert.equal(P.goalPoints({ kind: 'cut', target: 10, months: 6, resource: 'water', efficient: true }), 100);
  assert.equal(P.goalPoints({ kind: 'keep', months: 3, resource: 'electricity', efficient: false }), 75);
  assert.equal(P.goalPoints({ kind: 'keep', months: 1, resource: 'both', efficient: true }), 47);
});

test('A new goal has no result until a month of it is entered', () => {
  const s = fresh();
  const g = P.createGoal(s, { kind: 'cut', resource: 'electricity', target: 5, months: 3 });
  assert.equal(g.end, addMonths(P.thisMonth(s), 2));
  const p = P.goalProgress(s, g);
  assert.equal(p.reduction, null); assert.equal(p.onTrack, null); assert.equal(p.results.length, 0);
  assert.deepEqual(P.GOAL_TIMES, [1, 3, 6]);
  assert.equal(P.createGoal(s, { kind: 'cut', resource: 'water', target: 5, months: 2 }).months, 1, 'only the offered time frames');
});

test('Use less: reached as soon as one month in the time frame gets there', () => {
  const s = fresh(); s.goals = s.goals.filter((g) => g.status !== 'active');
  const start = P.thisMonth(s), g = P.createGoal(s, { kind: 'cut', resource: 'electricity', target: 10, months: 3 });
  P.advanceToNextMonth(s);
  assert.equal(g.status, 'active', 'moving on a month settles nothing by itself');
  const u = P.usual(s, 'electricity', start);
  P.logReading(s, { month: start, e: u * 0.97, w: P.usual(s, 'water', start) });
  assert.equal(g.status, 'active', '3% under is not 10%');
  assert.ok(Math.abs(P.goalProgress(s, g).reduction - 3) < 0.2);
  P.advanceToNextMonth(s);
  const m2 = addMonths(start, 1), res = P.logReading(s, { month: m2, e: P.usual(s, 'electricity', m2) * 0.88, w: 5 });
  assert.equal(g.status, 'reached'); assert.equal(g.settledFor, m2);
  assert.ok(res.some((r) => r.type === 'goal'));
  assert.ok(s.ledger.some((l) => l.id === 'goal-' + g.id && l.amount === g.est));
});

test('Use less: missed only once every month of the time frame is entered', () => {
  const s = fresh(); s.goals = s.goals.filter((g) => g.status !== 'active');
  const start = P.thisMonth(s), g = P.createGoal(s, { kind: 'cut', resource: 'electricity', target: 10, months: 1 });
  P.advanceToNextMonth(s); P.advanceToNextMonth(s);
  assert.equal(g.status, 'active');
  assert.deepEqual(P.goalProgress(s, g).waiting, [start]);
  P.logReading(s, { month: start, e: P.usual(s, 'electricity', start) * 1.02, w: 5 });
  assert.equal(g.status, 'missed');
});

test('Keep it steady: judged on the average of the time frame, once it is all entered', () => {
  const s = fresh(); s.goals = s.goals.filter((g) => g.status !== 'active');
  const start = P.thisMonth(s), g = P.createGoal(s, { kind: 'keep', bench: 'usual', resource: 'electricity', months: 3 });
  assert.match(P.goalLabel(g), /kept steady/); assert.equal(g.target, 0);
  for (let i = 0; i < 3; i++) {
    P.advanceToNextMonth(s);
    const m = addMonths(start, i);
    P.logReading(s, { month: m, e: P.usual(s, 'electricity', m) * (i === 0 ? 1.04 : 0.97), w: 5 });
    if (i < 2) assert.equal(g.status, 'active');
  }
  assert.equal(g.status, 'reached');
  assert.ok(g.result >= 0);
  const t = P.createGoal(s, { kind: 'keep', bench: 'typical', resource: 'water', months: 1 });
  assert.match(P.goalLabel(t), /similar homes/);
});

test('The demo has a goal with one month in and one waiting', () => {
  const s = fresh(), g = s.goals.find((x) => x.id === 'g-steady'), p = P.goalProgress(s, g);
  assert.equal(p.results.length, 1);
  assert.deepEqual(p.waiting, [addMonths(P.thisMonth(s), -1)]);
  assert.equal(P.goalProgress(s, s.goals.find((x) => x.id === 'g-now')).reduction, null);
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

test('No challenges, draw or friends are left in the state', () => {
  const s = fresh();
  for (const k of ['ch', 'tickets', 'draws', 'friends', 'feed', 'privacy', 'days']) assert.equal(s[k], undefined, k);
  assert.equal(P.CHALLENGES, undefined); assert.equal(P.FRIENDS, undefined);
  assert.ok(!P.BADGES.some((b) => ['company', 'team'].includes(b.id)));
  assert.ok(!s.ledger.some((l) => l.id.startsWith('ch-') || l.id.startsWith('chk-')));
});

test('Reading validation catches errors and unlikely values', () => {
  const s = fresh(), m = addMonths(P.thisMonth(s), -1);
  assert.ok(P.validateReading(s, { month: m, e: '', w: '5' }).errors.e);
  assert.ok(P.validateReading(s, { month: m, e: '-3', w: '5' }).errors.e);
  assert.ok(P.validateReading(s, { month: P.thisMonth(s), e: '200', w: '5' }).errors.month);
  assert.equal(P.validateReading(s, { month: m, e: '2000', w: '6' }).warnings.length, 1);
  assert.equal(P.validateReading(s, { month: m, e: '200', w: '6' }).warnings.length, 0);
});

test('Logging a missing month gives 10 points once', () => {
  const s = fresh(), m = addMonths(P.thisMonth(s), -1), before = P.available(s);
  P.logReading(s, { month: m, e: 210, w: 6 });
  P.logReading(s, { month: m, e: 212, w: 6 });
  assert.ok(P.available(s) >= before + 10);
  assert.equal(s.ledger.filter((l) => l.id === 'reading-' + m).length, 1);
});

test('Sample months never earn streaks or badges', () => {
  const s = P.create({ ...P.DEMO_PROFILE, name: 'Test', level: 1 }, { sample: true });
  assert.ok(!s.badges['steady']);
  assert.ok(!s.badges['ten-club']);
});

test('Tips rotate, the first is about cheap electricity tonight, and none compare a month in progress', () => {
  const s = fresh();
  const tips = [P.nextTip(s), P.nextTip(s), P.nextTip(s), P.nextTip(s)];
  assert.match(tips[0].title, /cheap/i);
  assert.match(tips[0].body, /kr\/kWh/);
  assert.equal(new Set(tips.map((t) => t.title)).size, 4);
  for (const t of tips) assert.doesNotMatch(t.title + t.body, /heading|so far|this month/i);
  const w = P.cheapWindow(s, 3);
  assert.ok(w.avg <= w.peak);
});

test('Demo state survives a JSON round trip; older saves are not loaded', () => {
  assert.equal(P.validate(JSON.parse(JSON.stringify(fresh()))), true);
  assert.equal(P.validate({ v: 2 }), false);
});

console.log(`${passed} V2 domain checks passed.`);
