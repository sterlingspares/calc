# Tests

388 assertions across four suites. They load the real `index.html` into
[jsdom](https://github.com/jsdom/jsdom) and drive the actual application
functions — no application code is mocked.

```bash
npm install     # jsdom, dev-only; the app itself has no dependencies
npm test        # run everything
```

| Command | What it runs |
|---|---|
| `npm test` | all four suites, aggregated |
| `npm run test:verbose` | same, with every assertion printed |
| `npm run test:features` | core calculation, incentives, quantity, rounding, undo, quote, history |
| `npm run test:errors` | error reporting and recovery |
| `npm run test:mobile` | mobile layout, touch targets, sticky result bar, quote layouts |
| `npm run test:fab` | floating action button |

Failing suites print their full output; passing ones print a single line.
The runner exits non-zero if anything fails, so CI catches it.

## Suites

| File | Assertions | Covers |
|---|---|---|
| `features.test.js` | 237 | GST (presets, custom, decimal), incentive edit mode, add/delete/rename, %/₹ modes, quantity and order totals, rounding, undo/redo, quote maths, history search/filter/tags, share-state round trips |
| `errors.test.js` | 33 | every failure path logs; a clean run logs nothing; storage-quota and corrupt-payload recovery; global handlers |
| `mobile.test.js` | 68 | modal layering vs the bottom nav, touch-target sizes, viewport zoom policy, type scale, sticky result bar states, quote table vs card layouts |
| `fab.test.js` | 50 | FAB visibility rules, open/close and dismissal, ARIA state, deferred dispatch, error containment, z-index ordering |

## How they work

`harness.js` provides the shared pieces:

- **`loadApp({width, capture})`** — a fresh jsdom window per suite. `width` sets
  `window.innerWidth` to exercise the responsive branches (the app treats ≤800px
  as mobile). `capture` collects console output for the error suite.
- **`cssRule(src, sel)` / `mobileRule(src, sel)`** — jsdom performs no layout, so
  anything positional (sizes, z-index, media queries) is asserted against the
  stylesheet text instead of computed styles. `cssRule` anchors the selector to
  the start of a line so a descendant rule such as
  `html[data-theme="dark"] .modal-overlay{…}` is not mistaken for the base rule.
- **`Reporter`** — collects results and prints a `##RESULT {…}` line that
  `run.js` parses.

Each suite runs in its own process. They load a full window and mutate
`localStorage`, so isolation keeps one suite's state out of the next.

`Reporter.finish()` exits explicitly rather than letting the event loop drain: a
loaded jsdom window holds timers open, so the process would otherwise hang after
the last assertion.

## Writing a test

```js
const { loadApp, numOf, Reporter } = require('./harness');

const R = new Reporter('My suite');
const ok = R.ok.bind(R);
const { w, d } = loadApp({ width: 390 });   // omit width for desktop

d.getElementById('mrp').value = '1000';
w.setCM('excl'); d.getElementById('cpd').value = '40';
w.setSM('excl'); d.getElementById('spd').value = '25';
w.calc();

ok('profit is 150', Math.abs(numOf(d, 'pvv') - 150) < 0.05);

R.finish();
```

Add the filename to `SUITES` in `run.js` and a `test:*` script in
`package.json`.

### A note on expected values

Discount modes are easy to get wrong when writing assertions. In
**Discount excl GST** mode the discount applies to the MRP *incl* GST and yields
the price *excl* GST — so MRP 1000 at 40% gives CP excl 600, not `1000 / 1.18 ×
0.6`. Several assertions were initially written against the wrong formula. If a
test disagrees with the app, check the formula before changing the code.
