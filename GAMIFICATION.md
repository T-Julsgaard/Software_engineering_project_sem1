# PowerBuddy gamification

Working spec for goals, challenges, points, rewards, badges, profiles, friends and the feed. Draft, open for team edits.

**Status:** implemented in the V2 prototype (`outputs/powerbuddy.html`, rules in `src/v2/domain.js`). Challenge names and dates are relative to the current month there, so the mock feed shifts with the calendar.

It covers US-07, US-08 and US-09 from the Technical Overview, plus the social features we added later (profiles, friends, feed).

## Ground rules

These come straight from our own documents and should hold for every feature below.

1. **Statistics first, game second.** Interviews showed some users care more about the numbers than about rewards. Everything social is opt-in, and Home stays a consumption overview.
2. **Rewards must not create new consumption.** The Product Description cites research [6] that shopping discounts can work against sustainability. Partners therefore have to pass the partner test below.
3. **Compare fairly.** A family of five uses more than a single student. Friends compare *percentage change against their own baseline*, never raw kWh or DKK.
4. **Private by default.** Bills, DKK amounts and exact consumption never leave the household unless the user turns that on (Technical Overview 1.2.1).
5. **Points are earned once.** Every award is tied to a unique event, so it cannot be claimed twice (Technical Overview 1.2.2; the current ledger already works like this).

## The loop

```
Log a reading -> see progress -> set a goal / join a challenge -> earn points + badges
      ^                                                                   |
      |                       friends see it in their feed <--------------+
      +---------- redeem points with a sustainable partner / win the monthly draw
```

## 1. Goals (personal)

A goal is the user's own target. Participants in the mockup session saw no real difference between suggested and self-made goals, so there is **one goal flow**. It opens either empty or pre-filled from an accepted recommendation.

A goal has one of two aims, since saving isn't only about cutting: a household that's already doing well should be rewarded for staying there.

- **Use less**: cut by a set percentage against your usual.
- **Keep it steady**: stay at or under a benchmark, either your usual or what similar homes use.

| Field | Use less | Keep it steady |
| --- | --- | --- |
| Resource | Electricity, water or both | Electricity, water or both |
| Target | Cut 3-30% (suggested 5-15%) | At or under your usual, or under similar homes |
| Period | 1, 2 or 3 months | 1, 3 or 6 months |
| Baseline | Average of the last 3 complete months (falls back to the last complete month) | The same, or the "homes like yours" estimate |

Tapping an active goal opens its detail: this month's aim in kWh or m³, how much of it is used, the daily pace needed for the rest of the month, and links to usage and ideas.

**Points estimate**, shown live while the user adjusts the target:

```
points = round(8 x target% x months x resourceFactor x stretchFactor)
resourceFactor = 1.5 if both resources, else 1
stretchFactor  = 1.25 if the household is already below the typical use for its size, else 1
```

| Goal | Estimate |
| --- | --- |
| Electricity -5%, 1 month | 40 pts |
| Electricity -10%, 1 month | 80 pts |
| Both -5%, 2 months | 120 pts |
| Water -10%, 1 month, already-efficient household | 100 pts |

The stretch factor matters because cutting 10% is harder for a household that's already frugal. It also stops efficient households feeling punished.

Keep-it-steady goals use a flat rate instead of the target:

```
points = round(25 x months x resourceFactor x stretchFactor)
```

So keeping electricity steady for 3 months is worth 75 points, about the same per month as a 3% cut.

Goals are assessed only on **complete readings**, the same way the current `assessGoal` works. A goal that is missed shows "Not this time. Your usage was 3% lower anyway" and costs nothing. There is no guilt messaging.

## 2. Challenges (shared, time-boxed)

Challenges are created by PowerBuddy and run for everyone over the same dates. That shared timing is what makes them social. Users earn points **while participating**, not only at the end.

| Earned for | Points |
| --- | --- |
| Joining | 0 (joining alone is free, to avoid farming) |
| Each weekly check-in or qualifying action | 5-10 |
| Completing | 30-150, depending on difficulty |
| Completing a monthly challenge | + 1 ticket for the monthly draw |

### Challenge types

| Type | How progress is measured | Example |
| --- | --- | --- |
| **Reduction** | Next complete reading vs baseline | *Darker December*: electricity -10% in December. 150 pts + draw ticket |
| **Habit** | Self-reported check-ins | *Five-minute showers*: 7 days of short showers. 60 pts |
| **Off-peak** | Plans completed in cheap hours (uses the existing price planner) | *Green-hour laundry*: 4 loads in the cheapest hours this month. 80 pts |
| **Quick win** | One-off self-report | *Standby sweep*: unplug standby devices for a weekend. 30 pts |
| **Friends** | Combined % change of a team of 2-4 friends | *Friends' league*: team average -8% this month. 100 pts each + Team player badge |

Mock challenge list for the prototype:

1. Darker December. Electricity -10% vs your baseline. Reduction, 1-31 Dec, 150 pts, draw ticket.
2. Five-minute showers. 7 short-shower days. Habit, 1 week, 60 pts.
3. Green-hour laundry. 4 loads started in green hours. Off-peak, 1 month, 80 pts.
4. Cold-wash month. 5 loads at 30 °C or below. Habit, 1 month, 50 pts.
5. Standby sweep. Unplug standby devices for a weekend. Quick win, 30 pts.
6. Friends' league. Team average -8%. Friends, 1 month, 100 pts.

## 3. Points

Two numbers. Keeping them separate is the main design decision in this section.

- **Lifetime points**: never go down. Shown on the profile and used for friend comparisons. Spending points must never make someone look worse to friends.
- **Available points**: the wallet. Spent on rewards.

Regular earners besides goals and challenges (these drive the "users regularly update their data" metric from our team agreement):

| Action | Points |
| --- | --- |
| Log a complete monthly reading | 10 |
| 3-month logging streak | 25 bonus |
| First goal set | 10 |

Target earn rate for an active user: about 150-250 points a month, which is enough for one partner discount every month or two.

## 4. Rewards

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

Redeeming gives a one-time code (`PB-XXXX-XXXX`) shown once and stored in "My rewards". Codes are single-use, which matches the accountability requirement.

### The monthly Green draw

Completing a monthly challenge gives one ticket. **Tickets can only be earned, never bought with points**, so it stays a free prize draw and not a gambling loop. On the 1st of each month one winner is drawn among friends-and-everyone. In the prototype it's mocked.

Prize ideas:

- A month of organic veg boxes (or a plant-based meal kit; HelloFresh works too, but a local veg box fits our story better)
- A night in a Green Key-certified cabin
- A smart-plug starter kit
- A tree planted in the household's name, with a certificate
- A full bike service

## 5. Badges

Badges carry no money value. They are recognition, shown on the profile. The user pins up to 3 to the top of it.

| Badge | Earned by |
| --- | --- |
| First reading | Logging the first complete reading |
| Steady logger | 3 months logged in a row |
| Goal getter | First goal reached |
| 10% club | Any month with -10% or better on one resource |
| Water wise | Water -10% vs baseline |
| Both in balance | Both resources down in the same month |
| Off-peak pro | 10 appliance runs in green hours |
| Comeback | Back below baseline after a month above it |
| Good company | First mutual friend |
| Team player | Finishing a Friends' league challenge |

"Comeback" is deliberate: it rewards recovering, not only being perfect.

## 6. Profile

- Name, initials avatar, household summary ("2 residents · apartment · Copenhagen")
- Lifetime points and level-free stats: months logged, goals reached, challenges completed
- Pinned badges plus the full badge shelf (locked badges are shown greyed out, with how to earn them)
- Active goal and challenges
- **Share profile**: a friend code (`FREJA-4821`) and a share link/QR
- **Privacy** settings (see 7)

## 7. Friends and comparison

- **Add a friend** by code or link. The friendship is **mutual**: a request has to be accepted before anything is shared.
- **Compare** (you vs one friend), on fair metrics:
  - % change this month vs own baseline, electricity and water
  - Logging streak, challenges completed, lifetime points, badges
  - Exact kWh/m³ per person, only if *both* have turned on "Share exact usage"
- **Friends' ranking**: sorted by % reduction this month, not by absolute usage.
- Never shared: bills, DKK, address, readings history.

Privacy settings (defaults in bold):

| Setting | Default |
| --- | --- |
| Show my activity in friends' feeds | **On** |
| Share % change with friends | **On** |
| Share exact usage per person | **Off** |
| Appear in Friends' league invites | **On** |

## 8. Feed

A chronological list of friends' milestones. It only contains *achievements*, never raw numbers, so it stays positive and private.

Event types: reached a goal · completed a challenge · joined a challenge · earned a badge · logging streak · teamed up · won the Green draw.

Interaction is a single **Cheer** button with a count, and no comments (no moderation needed for the prototype).

### Mock feed

| Who | Event | When | Cheers |
| --- | --- | --- | --- |
| Vi | Completed **Darker December** at -12% electricity · +150 pts | 2 h ago | 5 |
| Mikael | Earned the **Off-peak pro** badge | 5 h ago | 3 |
| Piotr | Reached a goal: water -8% in October | 1 Nov | 6 |
| Akshi | Joined **Five-minute showers** | Yesterday | 2 |
| Maninder | Is on a **4-month logging streak** | 2 days ago | 4 |
| Thomas & Mathias | Teamed up for **Friends' league** | 2 days ago | 7 |
| Konstantina | Earned the **Comeback** badge | 3 days ago | 8 |
| Mathias | Completed **Standby sweep** · +30 pts | 4 days ago | 1 |
| Akshi | Won the **October Green draw**: a month of veg boxes | 1 Nov | 12 |
| Piotr | Earned the **10% club** badge | 6 days ago | 3 |

Mock friend stats (this month vs own baseline):

| Friend | Household | Electricity | Water | Streak | Lifetime pts |
| --- | --- | --- | --- | --- | --- |
| Akshi | 2 · apartment | -6% | -9% | 3 mo | 640 |
| Mikael | 1 · apartment | -11% | -2% | 5 mo | 910 |
| Piotr | 3 · house | -4% | -8% | 2 mo | 480 |
| Vi | 2 · apartment | -12% | -5% | 6 mo | 1,120 |
| Thomas | 3 · apartment | -7% | -3% | 4 mo | 720 |
| Mathias | 1 · apartment | +2% | -4% | 1 mo | 260 |
| Maninder | 4 · house | -5% | -6% | 4 mo | 830 |
| Konstantina | 2 · apartment | -9% | -1% | 2 mo | 540 |

## 9. Where it lives in the app

Proposed navigation (bottom bar, 5 tabs):

| Tab | Contains |
| --- | --- |
| Home | Monthly overview, one next step, active goal/challenge glimpse |
| Usage | Charts and readings |
| Plan | Electricity prices and laundry planner |
| Goals | My goals, challenges, rewards shop |
| Friends | Feed, friends' ranking, compare, add friend |

The **profile** opens from the avatar in the header (badges, points, my rewards, privacy, share code).

## 10. Domain additions

This extends the application domain model (Technical Overview fig. 4). `GoalTracker` grows into the following:

- `Profile`: displayName, avatar, householdSummary, friendCode, privacy
- `Friendship`: friendId, status (`pending` | `mutual`), since
- `Goal`: resource, targetPct, months, baselinePeriod, estimatedPoints, status
- `Challenge`: id, type, start, end, rule, points, givesTicket
- `Participation`: challengeId, joinedAt, checkIns[], status
- `Badge` / `EarnedBadge`: id, earnedAt, pinned
- `LedgerEntry` (exists): unique id per award, so awards are idempotent
- `Partner` / `Reward`: partner test category, reason, cost
- `Redemption` (exists): single-use code
- `DrawTicket`: month, sourceChallengeId
- `FeedEvent`: actorId, type, refId, at, cheers

## Open questions for the team

1. 5 tabs (above), or keep 4 and put Friends inside Goals?
2. Real partner names in the prototype, or fictional ones only? Fictional is safer for a hand-in.
3. Should friends' league teams be picked by the user or matched automatically?
