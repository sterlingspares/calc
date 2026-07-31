#!/usr/bin/env node
/**
 * Code coverage for the application bundles.
 *
 * The app is not a Node module — it runs inside jsdom, evaluated as an inline
 * script. Standard tooling (c8, nyc) therefore reports nothing useful: V8 does
 * record the execution, but attributes it to the document URL rather than to
 * assets/app.js, because the harness inlines both bundles into the page.
 *
 * That inlining is deterministic, so the offsets are recoverable. The harness
 * builds the script body as:
 *
 *     "\n" + app.js + "\n" + app-extra.js + "\n"
 *
 * which lets each V8 range be mapped back to whichever file it came from.
 *
 * Usage:  npm run coverage            summary per bundle
 *         npm run coverage -- --json  machine-readable, for the README badge
 */
'use strict';

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = path.join(__dirname, '..');
const DOC_URL = 'https://calc.sterlingspares.com/';

// jsdom suites: their execution shows up in Node's own V8 coverage.
const SUITES = [
  'features.test.js',
  'errors.test.js',
  'mobile.test.js',
  'fab.test.js',
  'modes.test.js',
  'a11y.test.js',
];

const asJson = process.argv.includes('--json');

const covDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pc-cov-'));
for (const suite of SUITES) {
  try {
    execFileSync(process.execPath, [path.join(__dirname, suite)], {
      env: Object.assign({}, process.env, { NODE_V8_COVERAGE: covDir }),
      stdio: 'ignore',
    });
  } catch (e) {
    // A failing suite still emits coverage; the runner reports the failure.
  }
}

// The browser suite runs Chromium out-of-process, so it reports its own
// coverage through a file rather than through NODE_V8_COVERAGE.
const browserOut = path.join(covDir, 'browser.json');
try {
  execFileSync(process.execPath, [path.join(__dirname, 'browser.test.js')], {
    env: Object.assign({}, process.env, { COVERAGE_OUT: browserOut }),
    stdio: 'ignore',
  });
} catch (e) { /* a failure still leaves usable coverage */ }

const appJs = fs.readFileSync(path.join(ROOT, 'assets/app.js'), 'utf8');
const extraJs = fs.readFileSync(path.join(ROOT, 'assets/app-extra.js'), 'utf8');

// Mirrors readSource() in harness.js: "\n" + app + "\n" + extra + "\n"
const APP_START = 1;
const APP_END = APP_START + appJs.length;
const EXTRA_START = APP_END + 1;
const EXTRA_END = EXTRA_START + extraJs.length;

const executed = new Uint8Array(EXTRA_END + 2);
let seenScript = false;

/**
 * Resolve one coverage source and union it into the accumulator.
 *
 * Ranges must be resolved WITHIN a source before combining across sources.
 * V8 emits them outermost-first, and the outermost range for a script spans the
 * whole file with a non-zero count — so applying `covered ||= count>0` directly
 * marks everything executed and yields a meaningless 100%. Writing the hit
 * value in order lets each nested range override its parent, which is what
 * block coverage means; only the resolved result is then OR-ed in.
 *
 * @param {Array} functions V8 function coverage entries
 * @param {number} base offset of this source within `executed`
 * @param {number} length byte length of the source
 */
function foldSource(functions, base, length) {
  const local = new Uint8Array(length);
  for (const fn of functions || []) {
    for (const r of fn.ranges) {
      const from = Math.max(0, r.startOffset);
      const to = Math.min(r.endOffset, length);
      const hit = r.count > 0 ? 1 : 0;
      for (let i = from; i < to; i++) local[i] = hit;
    }
  }
  for (let i = 0; i < length; i++) {
    if (local[i] && base + i < executed.length) executed[base + i] = 1;
  }
}

for (const file of fs.readdirSync(covDir)) {
  if (!file.endsWith('.json') || file === 'browser.json') continue;
  let data;
  try {
    data = JSON.parse(fs.readFileSync(path.join(covDir, file), 'utf8'));
  } catch (e) {
    continue;
  }
  for (const script of data.result || []) {
    if (script.url !== DOC_URL) continue;
    seenScript = true;
    // The inline script is "\n" + app + "\n" + extra + "\n"; offsets are
    // relative to that text, which is exactly the accumulator's coordinates.
    foldSource(script.functions, 0, executed.length);
  }
}

// Fold in the browser run. Those ranges are already per-file, so they only need
// shifting into this script's coordinate space.
if (fs.existsSync(browserOut)) {
  try {
    for (const entry of JSON.parse(fs.readFileSync(browserOut, 'utf8'))) {
      const isExtra = entry.url.endsWith('app-extra.js');
      foldSource(entry.functions,
                 isExtra ? EXTRA_START : APP_START,
                 isExtra ? extraJs.length : appJs.length);
    }
    seenScript = true;
  } catch (e) { /* browser coverage is optional */ }
}

if (!seenScript) {
  console.error('No coverage recorded for ' + DOC_URL + '.');
  console.error('The harness may no longer inline the bundles — check readSource().');
  process.exit(1);
}

/**
 * Percentage of a byte range that executed, ignoring whitespace so that
 * formatting does not move the number.
 * @param {number} from inclusive start offset
 * @param {number} to exclusive end offset
 * @param {string} src the file's text, for whitespace detection
 * @returns {{pct:number, covered:number, total:number}}
 */
function measure(from, to, src) {
  let covered = 0, total = 0;
  for (let i = from; i < to; i++) {
    const ch = src[i - from];
    if (ch === undefined || /\s/.test(ch)) continue;
    total++;
    if (executed[i]) covered++;
  }
  return { pct: total ? (covered / total) * 100 : 0, covered, total };
}

const app = measure(APP_START, APP_END, appJs);
const extra = measure(EXTRA_START, EXTRA_END, extraJs);
const all = {
  covered: app.covered + extra.covered,
  total: app.total + extra.total,
};
all.pct = all.total ? (all.covered / all.total) * 100 : 0;

fs.rmSync(covDir, { recursive: true, force: true });

if (asJson) {
  console.log(JSON.stringify({
    app: +app.pct.toFixed(1),
    extra: +extra.pct.toFixed(1),
    total: +all.pct.toFixed(1),
  }));
  process.exit(0);
}

const row = (name, m) =>
  `  ${name.padEnd(22)} ${m.pct.toFixed(1).padStart(5)}%   ` +
  `${m.covered.toLocaleString().padStart(8)} / ${m.total.toLocaleString()} bytes`;

console.log('\nStatement coverage (whitespace excluded)\n');
console.log(row('assets/app.js', app));
console.log(row('assets/app-extra.js', extra));
console.log('  ' + '─'.repeat(56));
console.log(row('TOTAL', all));
console.log('\n  Union of all seven suites — the six jsdom ones via NODE_V8_COVERAGE,');
console.log('  and the browser suite via Chromium\'s own V8 coverage.\n');
