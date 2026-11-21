'use strict';
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
fs.copyFileSync(path.join(root, 'arrange/arrange.js'), path.join(root, 'connectors/planner/arrange.js'));
console.log('Updated connectors/planner/arrange.js from the shared engine.');
