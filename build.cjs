/* Builds each design version into one self-contained HTML file.
   V1 (original prototype) -> outputs/powerbuddy-v1.html
   V2 (overhaul)           -> outputs/powerbuddy.html */
const fs = require('node:fs');
const path = require('node:path');
const root = __dirname;
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const switcherCss = read('src/shared/switcher.css');
const switcherJs = read('src/shared/switcher.js');

function withSwitcher(html, version) {
  return html
    .replace(/<html lang="en"[^>]*>/, `<html lang="en" data-pb-version="${version}">`)
    .replace('</head>', `<style>${switcherCss}</style>\n</head>`)
    .replace('</body>', `<script>${switcherJs}</script>\n</body>`);
}

function buildV1() {
  const icons = JSON.parse(read('src/v1/icons.json'));
  const html = read('src/v1/shell.html')
    .replace('/* EMBED_CSS */', () => read('src/v1/style.css'))
    .replace('/* EMBED_ICONS */', () => '/* Bundled Lucide icon licensing:\n' + read('src/v1/ICON-LICENSE.txt') + '\n*/\nconst ICONS = ' + JSON.stringify(icons) + ';')
    .replace('/* EMBED_DOMAIN */', () => read('src/v1/domain.js'))
    .replace('/* EMBED_APP */', () => read('src/v1/app.js'));
  return withSwitcher(html, '1');
}

function buildV2() {
  const icons = JSON.parse(read('src/v2/icons.json'));
  // Thomas's recorded message (16 kHz mono WAV), embedded so the page stays a single file.
  const callAudio = 'data:audio/wav;base64,' + fs.readFileSync(path.join(root, 'src/v2/assets/thomas-call.wav')).toString('base64');
  const callJs = read('src/v2/call.js');
  if (!callJs.includes("'__CALL_AUDIO__'")) throw Error('call.js is missing the audio placeholder');
  const html = read('src/v2/shell.html')
    .replace('/* EMBED_CSS */', () => read('src/v2/style.css') + '\n' + read('src/v2/proto.css'))
    .replace('/* EMBED_ICONS */', () => '/* Bundled Lucide icons, ISC licence:\n' + read('src/v2/ICON-LICENSE.txt') + '\n*/\nconst ICONS = ' + JSON.stringify(icons) + ';')
    .replace('/* EMBED_FX */', () => read('src/v2/fx.js'))
    .replace('/* EMBED_DOMAIN */', () => read('src/v2/domain.js'))
    .replace('/* EMBED_APP */', () => read('src/v2/app.js'))
    .replace('/* EMBED_CALL */', () => callJs.replace("'__CALL_AUDIO__'", () => JSON.stringify(callAudio)))
    .replace('/* EMBED_FEEDBACK */', () => read('src/v2/feedback.js'));
  return withSwitcher(html, '2');
}

fs.mkdirSync(path.join(root, 'outputs'), { recursive: true });
for (const [file, html] of [['powerbuddy-v1.html', buildV1()], ['powerbuddy.html', buildV2()]]) {
  fs.writeFileSync(path.join(root, 'outputs', file), html);
  console.log(`Built outputs/${file} (${Math.round(Buffer.byteLength(html) / 1024)} KB)`);
}
