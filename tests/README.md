# Tests

1356 assertions across seven suites. They load the real `index.html`,
`assets/styles.css` and `assets/app.js` into
[jsdom](https://github.com/jsdom/jsdom) and drive the actual application
functions — no application code is mocked.

**Requires Node 22 or newer** (jsdom 30 depends on whatwg-url 17, which does).

```bash
npm install     # jsdom, dev-only; the app itself has no dependencies
npm test        # run everything
```

| Command | What it runs |
|---|---|
| `npm test` | all seven suites, aggregated |
| `npm run test:verbose` | same, with every assertion printed |
| `npm run test:features` | core calculation, incentives, quantity, rounding, undo, quote, history |
| `npm run test:errors` | error reporting and recovery |
| `npm run test:mobile` | mobile layout, touch targets, sticky result bar, quote layouts |
| `npm run test:fab` | floating action button |
| `npm run test:modes` | solve modes, what-if, compare, Quick, wizard, sharing, theme |
| `npm run test:a11y` | accessibility, including axe-core |
| `npm run test:browser` | real Chromium (skips if none is installed) |
| `npm run coverage` | statement coverage of both bundles |
| `npm run lighthouse` | Lighthouse audit (needs `npm i -D lighthouse`) |

Failing suites print their full output; passing ones print a single line.
The runner exits non-zero if anything fails, so CI catches it.

## Suites

| File | Assertions | Covers |
|---|---|---|
| `features.test.js` | 929 | GST (presets, custom, decimal), incentive edit mode, add/delete/rename, %/₹ modes, quantity and order totals, rounding, undo/redo, quote maths, history search/filter/tags, share-state round trips |
| `errors.test.js` | 33 | every failure path logs; a clean run logs nothing; storage-quota and corrupt-payload recovery; global handlers |
| `mobile.test.js` | 78 | modal layering vs the bottom nav, touch-target sizes, viewport zoom policy, type scale, sticky result bar states, quote table vs card layouts |
| `fab.test.js` | 50 | FAB visibility rules, open/close and dismissal, ARIA state, deferred dispatch, error containment, z-index ordering |
| `browser.test.js` | 78 | serves the repo over HTTP and drives real Chromium: asset loading, CSS cascade and media queries, `defer` timing, clicks, dialog focus, mobile viewport and z-index layering |
| `modes.test.js` | 85 | price maths, the three solve modes, input and profit modes, what-if scenarios, comparison, Quick mode, wizard, share-link URL round trip, summary text, theming, auto-save, floor limits |
| `a11y.test.js` | 103 | contrast ratios computed from the palette, document structure, accessible names, keyboard operability, dialog focus trap and restore, live regions, reduced motion, plus axe-core over every visible state |

## How they work

The accessibility suite runs axe-core over each dialog **while it is open** —
axe only evaluates visible elements, so auditing the closed page reports
nothing. It also asserts the things axe marks "incomplete" under jsdom
(contrast, headings, landmarks) directly, since that is where the real
failures were.

Anything measured against a CSS transition is read under
`emulateMedia({ reducedMotion: 'reduce' })` rather than after a fixed timeout —
the app collapses `transition-duration` to ~0 there, so the value is
deterministic. A fixed wait made one assertion intermittently fail.

`readSource()` inlines `assets/styles.css` and `assets/app.js` into the markup
before handing it to jsdom. jsdom only fetches subresources with
`resources: 'usable'`, which needs a `file://` URL, and that yields an opaque
origin where `localStorage` throws — and the suite exercises storage heavily.
The content under test is identical to what ships; only the packaging differs.
`readMarkup()` and `readAsset()` return the files untouched, for assertions
about the split itself.

Because the harness inlines the assets, it cannot prove that the `href` and
`src` in `index.html` are correct, nor execute layout or `defer` semantics.
`browser.test.js` covers exactly that gap: it serves the repository over HTTP
and drives real Chromium.

It is also the only place axe-core's layout-dependent rules — colour-contrast
above all — are actually evaluated. Under jsdom axe reports them "incomplete",
which is how 14 failing summary labels went unnoticed for a long time. The
browser suite runs axe with values on screen and in both themes.

That suite is optional. Without a browser it reports **skipped** and the run
still passes, so contributors are not forced to download one. CI sets
`REQUIRE_BROWSER=1`, which turns the skip into a failure — otherwise a
misconfigured runner would quietly drop the coverage.

```bash
npx playwright install chromium
npm run test:browser
```

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

## Coverage

```bash
npm run coverage
```

The app runs inside jsdom as an inline script, so c8 and nyc report nothing
useful — V8 records the execution but attributes it to the document URL rather
than to `assets/app.js`. `tests/coverage.js` recovers the offsets (the harness
inlines deterministically) and folds in the browser suite's own Chromium
coverage, which Node cannot see because Chromium is a separate process.

Ranges are resolved **within** each source before being combined across sources.
V8 emits them outermost-first, and a script's outermost range spans the whole
file with a non-zero count — so OR-ing counts directly marks everything covered
and reports a meaningless 100%. That mistake was made and caught here; the
resolved-then-unioned figure is 82.6%.

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
