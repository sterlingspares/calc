/**
 * Shared test harness.
 *
 * The app is a single HTML file with no build step, so the suites load
 * index.html into jsdom and drive the real functions and DOM. There is no
 * mocking of application code — only of browser APIs jsdom cannot provide
 * (clipboard, quota-exceeded storage).
 *
 * jsdom does not do layout, so anything positional (sizes, z-index, media
 * queries) is asserted against the stylesheet text via cssRule/mobileRule
 * rather than computed styles.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const APP_PATH = path.join(__dirname, '..', 'index.html');
const APP_URL = 'https://calc.sterlingspares.com/';

/** @returns {string} the raw index.html source */
function readSource() {
  return fs.readFileSync(APP_PATH, 'utf8');
}

/**
 * Load the app into a fresh jsdom window.
 * @param {Object} [opts]
 * @param {number} [opts.width] value reported by window.innerWidth, for the
 *   responsive branches (the app treats <=800 as mobile)
 * @param {string[][]} [opts.capture] when provided, console output is captured
 *   into this array as [level, message] pairs instead of reaching the terminal
 * @returns {{dom: JSDOM, w: Window, d: Document}}
 */
function loadApp(opts) {
  opts = opts || {};
  let vc;
  if (opts.capture) {
    vc = new VirtualConsole();
    vc.on('jsdomError', e => opts.capture.push(['jsdomError', e.message]));
    ['error', 'warn', 'log'].forEach(lvl =>
      vc.on(lvl, (...a) => opts.capture.push([lvl, a.map(String).join(' ')])));
  }

  const dom = new JSDOM(readSource(), {
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    url: APP_URL,
    virtualConsole: vc,
  });

  if (opts.width !== undefined) {
    Object.defineProperty(dom.window, 'innerWidth', {
      configurable: true,
      value: opts.width,
    });
  }
  return { dom, w: dom.window, d: dom.window.document };
}

/**
 * Extract one CSS declaration block by selector.
 * The selector must begin a line, so a descendant rule such as
 * `html[data-theme="dark"] .modal-overlay{...}` is not mistaken for the base
 * `.modal-overlay{...}` rule.
 * @param {string} src stylesheet or full-document text
 * @param {string} sel exact selector, e.g. '.fab-wrap'
 * @returns {string|null} the declarations, or null if not found
 */
function cssRule(src, sel) {
  const esc = sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = src.match(new RegExp('(^|\\n)' + esc + '\\{([^}]*)\\}'));
  return m ? m[2] : null;
}

/**
 * The text of the mobile-only @media block.
 * @param {string} src full-document text
 * @returns {string}
 */
function mobileBlock(src) {
  const i = src.indexOf('/* ── MOBILE-ONLY OVERRIDES');
  const j = src.indexOf('/* Suppress double-tap zoom', i);
  return src.slice(i, j);
}

/**
 * Extract a declaration block from inside the mobile @media block.
 * @param {string} src full-document text
 * @param {string} sel exact selector
 * @returns {string|null}
 */
function mobileRule(src, sel) {
  const esc = sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = mobileBlock(src).match(new RegExp('(^|\\n)\\s*' + esc + '\\{([^}]*)\\}'));
  return m ? m[2] : null;
}

/**
 * Numeric value of an element's text, with currency and separators stripped.
 * @param {Document} d
 * @param {string} id
 * @returns {number|null} null when the element is absent
 */
function numOf(d, id) {
  const e = d.getElementById(id);
  if (!e) return null;
  return parseFloat(e.textContent.replace(/[^0-9.\-]/g, ''));
}

/** Collects and prints assertion results for one suite. */
class Reporter {
  /** @param {string} name suite name shown in output */
  constructor(name) {
    this.name = name;
    this.passes = 0;
    this.fails = 0;
    this.failures = [];
  }

  /**
   * Assert a condition.
   * @param {string} name what is being asserted
   * @param {*} cond truthy to pass
   * @param {string} [extra] actual value, shown only on failure
   */
  ok(name, cond, extra) {
    if (cond) {
      this.passes++;
      console.log('  PASS  ' + name);
    } else {
      this.fails++;
      this.failures.push(name + (extra ? '  -> ' + extra : ''));
      console.log('  FAIL  ' + name + (extra ? '  -> ' + extra : ''));
    }
  }

  /** Print a section heading. @param {string} title */
  section(title) {
    console.log('\n' + title);
  }

  /**
   * Print the summary, emit the machine-readable line run.js parses, and exit.
   *
   * The explicit exit is required: a loaded jsdom window holds timers and other
   * handles open, so the event loop never drains on its own and the process
   * would hang after the last assertion. Output is written with fs.writeSync so
   * nothing is lost to buffering when stdout is a pipe.
   */
  finish() {
    const summary =
      '\n' + '='.repeat(56) + '\n' +
      `${this.name}  —  PASS: ${this.passes}   FAIL: ${this.fails}\n` +
      '='.repeat(56) + '\n' +
      '##RESULT ' + JSON.stringify({
        name: this.name,
        pass: this.passes,
        fail: this.fails,
        failures: this.failures,
      }) + '\n';
    fs.writeSync(1, summary);
    process.exit(this.fails ? 1 : 0);
  }
}

module.exports = {
  APP_PATH,
  APP_URL,
  readSource,
  loadApp,
  cssRule,
  mobileBlock,
  mobileRule,
  numOf,
  Reporter,
};
