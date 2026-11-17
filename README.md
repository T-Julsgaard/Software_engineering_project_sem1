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

In V2, the same gear menu also holds prototype controls: jump to next month (settles goals, challenges and the draw), skip ahead 6 hours, trigger a friend update, pause live data, restart onboarding, or reset the demo home.

The gamification rules V2 implements are written up in [GAMIFICATION.md](GAMIFICATION.md).

## Run locally

Open either HTML file in `outputs/` in a modern browser. Each is a single self-contained file that works offline.

## Develop

```
src/
  shared/   version switcher (embedded into both builds)
  v1/       original prototype
  v2/       overhaul: domain.js (rules, estimates, simulation), app.js (UI), style.css, shell.html
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
