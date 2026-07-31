#!/usr/bin/env node
/**
 * Test runner.
 *
 * Executes each suite in its own process — they load and mutate a full jsdom
 * window plus localStorage, so isolation keeps one suite's state out of the
 * next. Each suite prints a `##RESULT {...}` line that this aggregates.
 *
 *   node tests/run.js            run everything
 *   node tests/features.test.js  run one suite directly
 */
'use strict';

const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const SUITES = [
  'features.test.js',
  'errors.test.js',
  'mobile.test.js',
  'fab.test.js',
  'a11y.test.js',
];

const verbose = process.argv.includes('--verbose') || process.argv.includes('-v');
const results = [];
let totalPass = 0;
let totalFail = 0;

for (const suite of SUITES) {
  const file = path.join(__dirname, suite);
  if (!fs.existsSync(file)) {
    console.error(`missing suite: ${suite}`);
    process.exit(1);
  }

  const run = spawnSync(process.execPath, [file], { encoding: 'utf8' });
  const out = (run.stdout || '') + (run.stderr || '');

  const line = out.split('\n').find(l => l.startsWith('##RESULT '));
  if (!line) {
    // The suite crashed before reporting — show everything, it is the only clue.
    console.log(out);
    console.error(`\n${suite} did not report a result (exit ${run.status}).`);
    process.exit(1);
  }

  const res = JSON.parse(line.slice('##RESULT '.length));
  results.push(res);
  totalPass += res.pass;
  totalFail += res.fail;

  if (verbose || res.fail) {
    console.log(out.split('\n').filter(l => !l.startsWith('##RESULT ')).join('\n'));
  } else {
    console.log(`✓ ${res.name}  —  ${res.pass} passed`);
  }
}

console.log('\n' + '─'.repeat(56));
for (const r of results) {
  const status = r.fail ? `${r.fail} FAILED` : 'ok';
  console.log(`  ${r.name.padEnd(28)} ${String(r.pass).padStart(4)} passed   ${status}`);
}
console.log('─'.repeat(56));
console.log(`  ${'TOTAL'.padEnd(28)} ${String(totalPass).padStart(4)} passed   ${totalFail} failed`);
console.log('─'.repeat(56));

if (totalFail) {
  console.log('\nFailures:');
  for (const r of results) {
    for (const f of r.failures) console.log(`  [${r.name}] ${f}`);
  }
}

process.exit(totalFail ? 1 : 0);
