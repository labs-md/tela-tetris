'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const root = path.resolve(__dirname, '..');
const output = path.join(root, 'dist/demo');
fs.rmSync(output, { recursive: true, force: true });
fs.mkdirSync(output, { recursive: true });

function copy(source, destination = source) {
  const target = path.join(output, destination);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(path.join(root, source), target);
}

// Explicit runtime assets only, including this demo's short-lived ingestion token.
for (const file of ['index.html', 'game.js', 'garments.js', 'score-events.js', 'score-setup.js', 'connect.html']) {
  copy('connectors/telatetris/' + file, file);
}
for (const file of fs.readdirSync(path.join(root, 'connectors/telatetris/fonts'))) {
  copy('connectors/telatetris/fonts/' + file, 'fonts/' + file);
}
copy('arrange/arrange.js', 'arrange/arrange.js');
copy('LICENSE', 'ARRANGE-LICENSE.txt');
for (const file of ['index.html', 'planner.css', 'planner.js', 'planner-worker.js', 'arrange.js', 'presets.js', 'woodworking.js', 'ui-sdk.js']) {
  copy('connectors/planner/' + file, 'planner/' + file);
}
for (const file of fs.readdirSync(path.join(root, 'connectors/planner/fonts'))) {
  copy('connectors/planner/fonts/' + file, 'planner/fonts/' + file);
}
copy('connectors/planner/vendor/ui-sdk/LICENSE', 'planner/UI-SDK-LICENSE.txt');

function rewrite(file, from, to) {
  const target = path.join(output, file);
  const source = fs.readFileSync(target, 'utf8');
  if (!source.includes(from)) throw new Error('Demo rewrite no longer matches: ' + file);
  fs.writeFileSync(target, source.replace(from, to));
}

rewrite('index.html', '../../arrange/arrange.js', 'arrange/arrange.js');
rewrite('game.js', '../planner/index.html', 'planner/index.html');

// Cache versions describe the shipped bytes, including public-demo rewrites.
for (const file of ['index.html', 'connect.html']) {
  const target = path.join(output, file);
  fs.writeFileSync(target, fs.readFileSync(target, 'utf8').replace(/src="([^"?]+)\?v=[^"]+"/g, (_, asset) => {
    const hash = crypto.createHash('sha256').update(fs.readFileSync(path.join(output, asset))).digest('hex').slice(0, 12);
    return 'src="' + asset + '?v=' + hash + '"';
  }));
}
console.log('Built unified pitch demo at dist/demo: game → planner, with embedded short-lived score credentials.');
