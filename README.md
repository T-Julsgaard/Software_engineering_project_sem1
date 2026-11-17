# PowerBuddy

A household electricity and water app prototype by GreenBuddies, built with plain JavaScript, CSS and HTML.

**[Open the live demo](https://t-julsgaard.github.io/powerbuddy/)**

Everything runs in your browser on fictional, simulated data. Nothing is sent anywhere.

## Two design versions

The gear in the top-right corner of the page switches between versions.

| Version | File | What it is |
| --- | --- | --- |
| **V2** (default) | `outputs/powerbuddy.html` | The overhaul: onboarding with a household profile, "homes like yours" estimates, a live simulated meter, goals, challenges, points, sustainable partner rewards, the monthly Green draw, badges, friends, comparison and a feed. |
| V1 | `outputs/powerbuddy-v1.html` | The original prototype, kept unchanged for comparison. |

In V2, the same gear menu also holds prototype controls: jump to next month (settles goals, challenges and the draw), skip ahead 6 hours, trigger a friend update or a price tip, pause live data, restart onboarding, reset the demo home, get the call from Thomas now, or reset the call and feedback tool.

The gamification rules V2 implements are written up in [GAMIFICATION.md](GAMIFICATION.md).

## The call from Thomas and the feedback tool (V2)

After about three minutes of use (time with the page visible), the phone rings: an incoming call from Thomas, with a ringtone, vibration and the phone frame buzzing. Accepting plays his recorded message (`src/v2/assets/thomas-call.wav`, 16 kHz mono, embedded in the build). At 11 seconds the call drops into the Dynamic Island and the feedback tool appears with a spotlight, which fades when the recording ends. Declining or missing the call leaves a "Call back" notification, and he tries once more two minutes later.

The feedback tool lets visitors press **Comment on something** (or `C`), click any element in the phone, and leave a note: change this text to ..., a bug, an idea or "remove this". Comments are filed under the page or sheet the visitor is on, pinned to their element, and listed per page in the side panel. On narrow screens the panel becomes a drawer or bottom sheet.

Comments are stored in the browser for now (`localStorage`), behind a small async adapter in `src/v2/feedback.js`. To collect them online, replace it with `PBFeedback.setStore({ list, add, update, remove })`; the comment in that file sketches a Supabase version. Until then, **Export** downloads the comments as JSON and **Copy** puts a readable list on the clipboard.

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

Bundled Lucide icons are ISC licensed; the licence text is in `src/v1/ICON-LICENSE.txt` and `src/v2/ICON-LICENSE.txt` and is embedded in each output.
