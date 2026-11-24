# PowerBuddy gamification

Working spec for goals, points, rewards, badges and the profile. Draft, open for team edits.

**Status:** implemented in the V2 prototype (`outputs/powerbuddy.html`, rules in `src/v2/domain.js`).

It covers US-07, US-08 and US-09 from the Technical Overview.

**Scope change (November 2026):** challenges, the monthly Green draw, friends, the feed and friend notifications have been removed. Gamification is now **goals and rewards** only, with points and badges in support.

## Ground rules

These come straight from our own documents and should hold for every feature below.

1. **Statistics first, game second.** Interviews showed some users care more about the numbers than about rewards. Home stays a consumption overview.
2. **Usage is monthly.** The app only gets a household's usage as whole months, typed in after the month ends. Nothing in the app may suggest daily or live consumption, "so far this month" figures or a projected month. The only live data is the electricity price, which is public hour by hour.
3. **Rewards must not create new consumption.** The Product Description cites research [6] that shopping discounts can work against sustainability. Partners therefore have to pass the partner test below.
4. **Compare fairly.** A family of five uses more than a single student, so goals compare a household with its own usual, or with homes like it, never in raw kWh against others.
5. **Private by default.** Household data stays on the device in the prototype. Nothing is shared with other users.
6. **Points are earned once.** Every award is tied to a unique event, so it cannot be claimed twice (Technical Overview 1.2.2).

## The loop

```
Enter last month's numbers -> see progress -> set a goal -> earn points + badges
            ^                                                   |
            +------ redeem points with a sustainable partner <--+
```

## 1. Goals

A goal is the household's own target. Participants in the mockup session saw no real difference between suggested and self-made goals, so there is **one goal flow**. It opens either empty or pre-filled from an accepted recommendation.

A goal has one of two aims, since saving isn't only about cutting: a household that's already doing well should be rewarded for staying there.

- **Use less**: cut by a set percentage against your usual.
- **Keep it steady**: stay at or under a benchmark, either your usual or what similar homes use.

| Field | Use less | Keep it steady |
| --- | --- | --- |
| Resource | Electricity, water or both | Electricity, water or both |
| Target | Cut 3-30% (suggested 5-15%) | At or under your usual, or under similar homes |
| Time frame | This month, 3 months or 6 months | This month, 3 months or 6 months |
| Baseline | Average of the last 3 entered months, adjusted for the season | The same, or the "homes like yours" estimate |

### The time frame is time to get there, not months stacked on top of each other

- **Use less**: the time frame is how long the household gives itself to reach the cut. The goal is reached the first time a month in the time frame is the target % under its usual. If no month gets there, it's missed once every month of the time frame is entered.
- **Keep it steady**: the time frame is how long to keep it up. The goal is judged on the average over the time frame, once every month of it is entered.

Because usage arrives monthly, a goal shows **no result until a month of it is entered**. Home and the Goals tab say so ("First result after Nov", "Waiting for Oct") instead of showing a guess. Tapping a goal opens it month by month: each month's aim in kWh or m³, the result once entered, and an "Add numbers" button for a finished month that's still missing.

**Points estimate**, shown live while the user sets up the goal:

```
use less:       points = round(8 x target% x speedFactor x resourceFactor x stretchFactor)
keep it steady: points = round(25 x months x resourceFactor x stretchFactor)
speedFactor    = 1.5 for this month, 1.2 for 3 months, 1 for 6 months
resourceFactor = 1.5 if both resources, else 1
stretchFactor  = 1.25 if the household is already below the typical use for its size, else 1
```

| Goal | Estimate |
| --- | --- |
| Electricity -5%, this month | 60 pts |
| Electricity -5%, within 3 months | 48 pts |
| Electricity -5%, within 6 months | 40 pts |
| Both -10%, within 6 months | 120 pts |
| Water -10%, within 6 months, already-efficient household | 100 pts |
| Electricity kept steady for 3 months | 75 pts |

A shorter time frame for a cut is harder, so it's worth more. Keeping steady for longer is harder, so it's worth more per month held. The stretch factor matters because cutting 10% is harder for a household that's already frugal.

A goal that is missed shows "Not this time. Your best month was still 3% under your usual" and costs nothing. There is no guilt messaging.

## 2. Points

Two numbers, shown at the top of the Goals tab with a line explaining them:

- **Points to spend**: the wallet. Spent on rewards.
- **Points earned in total**: never goes down. Spending points doesn't make it drop.

| Action | Points |
| --- | --- |
| Log a month's numbers | 10 |
| 3-month logging streak | 25 bonus |
| First goal set | 10 |
| Reaching a goal | its estimate (see above) |

Target earn rate for an active household: about 100-200 points a month, enough for one partner discount every month or two.

## 3. Rewards

### The partner test

A partner is listed only if the reward does at least one of these:

1. **Reduces consumption directly**, e.g. low-flow shower head, LED bulbs, smart plug, radiator reflector foil.
2. **Extends the life of things**, e.g. repair café, bike service, second-hand shop.
3. **Is a lower-impact swap**, e.g. refill shop, local organic veg box, plant-based meal kit.

Each reward card shows its reason ("Why this partner: cuts your shower water by up to 40%"). Fast fashion, new electronics, fast delivery and general store credit are excluded.

Category 1 is the strongest story: the reward helps you hit the next goal.

### Mock catalogue (fictional partners)

| Reward | Partner | Cost | Why |
| --- | --- | --- | --- |
| 25% off a low-flow shower head | Vandklog | 150 | Cuts water use |
| 20% off LED bulbs (4-pack) | Lyskilde | 120 | Cuts electricity |
| Seat at a repair café | Nørrebro Repair Collective | 80 | Extends product life |
| Free bike tune-up | Cykelkælderen | 200 | Extends product life |
| 15% off second-hand furniture | Genbrugsloftet | 180 | Second-hand |
| 25% off first organic veg box | Markkassen | 160 | Local, low-impact food |
| 10% off at a refill shop | Fyld Op | 90 | Less packaging |

Redeeming gives a one-time code (`PB-XXXX-XXXX`), kept under "Your codes". Codes are single-use, which matches the accountability requirement.

## 4. Badges

Badges carry no money value. They are recognition, shown on the profile. The user pins up to 3 to the top of it. Every usage badge is judged on entered months.

| Badge | Earned by |
| --- | --- |
| First reading | Logging the first month |
| Steady logger | 3 months logged in a row |
| Goal getter | First goal reached |
| 10% club | A month 10% or more under your usual on one resource |
| Water wise | A month with water 10% under your usual |
| Both in balance | A month under your usual on both resources |
| Off-peak pro | 10 appliance runs in green hours |
| Comeback | A month back under your usual after one over it |

"Comeback" is deliberate: it rewards recovering, not only being perfect.

## 5. Profile

- Name, initials avatar, household summary ("Apartment · 68 m² · 2 adults · district heating · Capital Region")
- Stats: points earned, months logged, goals reached, rewards redeemed
- Pinned badges plus the full badge shelf (locked badges are shown greyed out, with how to earn them)
- Household details and settings, and the points history

## 6. Where it lives in the app

Bottom bar, 4 tabs:

| Tab | Contains |
| --- | --- |
| Home | One thing to do at home, active goals, the live electricity price, progress over the last six months |
| Usage | Monthly data entry and charts |
| Plan | Electricity prices, the appliance planner, ideas for the home |
| Goals | Points, goals, rewards |

The **profile** opens from the avatar in the header (badges, stats, household, settings).

## 7. Domain additions

This extends the application domain model (Technical Overview fig. 4). `GoalTracker` grows into the following:

- `Goal`: kind (`cut` | `keep`), benchmark (`usual` | `typical`), resource, targetPct, timeFrameMonths, start, end, estimatedPoints, status
- `MonthlyReading`: month, kWh, m³, source (entered or sample)
- `Badge` / `EarnedBadge`: id, earnedAt, pinned
- `LedgerEntry` (exists): unique id per award, so awards are idempotent
- `Partner` / `Reward`: partner test category, reason, cost
- `Redemption` (exists): single-use code

## Open questions for the team

1. Real partner names in the prototype, or fictional ones only? Fictional is safer for a hand-in.
2. Should a missed "use less" goal offer to restart with a smaller step straight away?
