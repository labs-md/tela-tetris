#!/usr/bin/env node
/*
 * Arrange over stdin/stdout, for connectors written in any language.
 *
 *   node arrange/cli.js < request.json > response.json
 *   node arrange/cli.js request.json
 *
 * Reads one request (arrange/PROTOCOL.md), writes one response. Exits 0 when
 * the engine answered (check `status`), 1 when the input isn't JSON or the
 * request is invalid.
 */
'use strict';

const fs = require('fs');
const Arrange = require('./arrange.js');

const file = process.argv[2];
let text;
try {
  text = fs.readFileSync(file || 0, 'utf8');
} catch (e) {
  process.stderr.write(`arrange: cannot read ${file || 'stdin'}: ${e.message}\n`);
  process.exit(1);
}

let req;
try {
  req = JSON.parse(text);
} catch (e) {
  process.stdout.write(JSON.stringify({ protocol: Arrange.PROTOCOL, status: 'invalid', errors: [`not JSON: ${e.message}`] }) + '\n');
  process.exit(1);
}

const res = Arrange.run(req);
process.stdout.write(JSON.stringify(res, null, 2) + '\n');
process.exit(res.status === 'invalid' ? 1 : 0);
