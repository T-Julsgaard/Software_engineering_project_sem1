# PowerBuddy

A household electricity and water app prototype by GreenBuddies, built with plain JavaScript, CSS and HTML.

**[Open the live demo](https://powerbuddy.julsgaard.dev/)**

Everything runs in your browser on fictional, simulated data. Nothing is sent anywhere.

## Two design versions

The gear in the top-right corner of the page switches between versions.

| Version | File | What it is |
| --- | --- | --- |
| **V2** (default) | `outputs/powerbuddy.html` | The overhaul: onboarding with a household profile, "homes like yours" estimates, live electricity and water prices, goals (cut back or keep steady), points, sustainable partner rewards and badges. |
| V1 | `outputs/powerbuddy-v1.html` | The original prototype, kept unchanged for comparison. |

In V2, the same gear menu also holds prototype controls: jump to next month (the month that just ended can then be entered under Consumption, which settles goals), skip ahead 6 hours, show a price tip, pause live updates, or **Reset app**.

Usage only ever comes in whole months, typed in by the household after the month ends: there is no daily or live consumption anywhere in the app. What's live is the electricity price, which is public hour by hour. Goals are judged on those monthly numbers only, so a goal shows no result until a month of it has been entered. Runs planned in Recommendations send a reminder when it's time to start them (can be turned off in Settings). Reset app clears the household, goes back to onboarding (where you can set up a home or skip to the demo) and restarts the visit, so Thomas calls again. Feedback comments are kept.

Home fits on one screen without scrolling: one recommendation (something to do in the house, such as switching off standby or starting the dishwasher in tonight's cheapest hours), your active goals (up to two), the live electricity price and "Your progress so far" (the last six months against homes like yours). On short phones it tightens to one line per row and the progress chart takes whatever height is left.

Usage data is entered by hand, one month at a time: **Add monthly data** at the top of Consumption opens a sheet with the form and, under it, the last 12 months: green once entered, red while missing (tap one to add or edit it). A month can have electricity, water or both, each with an optional price (kr for the month) on the same line; Consumption uses that price for the cost and estimates it otherwise. Consumption shows electricity or water month by month for the last 12 finished months, and a pie chart of where it usually goes in a typical household like yours (an estimate, not your own usage). The electricity price (Recommendations, Past months) can go back a year: use the arrows, or drag the chart sideways.

The gamification rules V2 implements are written up in [GAMIFICATION.md](GAMIFICATION.md).

## The call from Thomas and the feedback tool (V2)

The **Feedback** button is always in the bottom-right corner, from the first onboarding screen on, so visitors can comment before they have set anything up. Thomas's call points it out. After about three minutes of use (time with the page visible), the phone rings: an incoming call from Thomas, with a ringtone, vibration and the phone frame buzzing. Accepting plays his recorded message (`src/v2/assets/thomas-call.wav`, 16 kHz mono, embedded in the build). At 11 seconds the feedback panel opens with a spotlight while the call screen stays up until the call ends; the spotlight fades when the recording ends. Declining opens the feedback panel straight away. Declining or missing the call also leaves a "Call back" notification, and he tries once more two minutes later.

The feedback tool lets visitors press **Comment on something** (or `C`), click any element in the phone, and leave a note: change this text to ..., a bug, an idea or "remove this". Comments are filed under the page or sheet the visitor is on, pinned to their element, and listed per page in the panel, which sits in the top-right corner under the prototype gear while the phone stays centred. On narrower screens the panel becomes a drawer (closed until opened) or a bottom sheet.

Comments are stored in the browser for now (`localStorage`), behind a small async adapter in `src/v2/feedback.js`. To collect them online, replace it with `PBFeedback.setStore({ list, add, update, remove })`; the comment in that file sketches a Supabase version. Until then, each visitor sends their comments in from the panel's footer: **CSV** downloads a sheet for Excel or Google Sheets (semicolon-separated, UTF-8), **JSON** downloads every saved field, and **Copy all** puts a readable list on the clipboard to paste into a message. Every format has the comment itself (type, new wording, text, author, time) and what was selected: the page, the element type, its text, the card or section it sits in, the text around it, its position on the phone screen and a CSS selector. The `#` matches the comment's pin number on its page. Files are named after the visitor when they've entered a name, for example `powerbuddy-feedback-sven-2026-11-17.csv`.

Sound effects are synthesised with Web Audio (no audio files besides the recorded call) and can be switched off in Settings.

## Run locally

Open either HTML file in `outputs/` in a modern browser. Each is a single self-contained file that works offline.

## Develop

```
src/
  shared/   version switcher (embedded into both builds)
  v1/       original prototype
  v2/       overhaul: domain.js (rules, estimates, simulation), app.js (UI), style.css, shell.html,
            fx.js (sounds, haptics), call.js (Thomas's call), feedback.js + proto.css (feedback tool),
            assets/thomas-call.wav
```

Rebuild both versions and run the checks with Node.js (no packages needed):

```sh
node build.cjs
node tests/v2-domain.cjs
node tests/v1-domain.cjs
```

The older Playwright scripts in `tests/` (`browser.cjs`, `capture.cjs`, `final-check.cjs`, `finish.cjs`) target V1 and use machine-specific paths.

## GitHub Pages

The [deployment workflow](.github/workflows/pages.yml) publishes the committed `outputs/` files on every push to `main`: V2 as `index.html` and `powerbuddy.html`, V1 as `powerbuddy-v1.html`. Rebuild and commit the outputs after changing source files.

The site is served at [powerbuddy.julsgaard.dev](https://powerbuddy.julsgaard.dev/). The custom domain is set in the repository's Pages settings (a CNAME record for `powerbuddy` pointing to `t-julsgaard.github.io`, in Cloudflare as DNS only), so no `CNAME` file is needed in the deployed site.

Bundled Lucide icons are ISC licensed; the licence text is in `src/v1/ICON-LICENSE.txt` and `src/v2/ICON-LICENSE.txt` and is embedded in each output.
