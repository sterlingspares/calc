/**
 * Real-browser suite.
 *
 * The other five suites run in jsdom, and the harness inlines
 * assets/styles.css and assets/app.js before handing the document over. That
 * is deliberate — jsdom cannot fetch subresources without a file:// URL, which
 * breaks localStorage — but it means those suites bypass the `href` and `src`
 * in index.html entirely, and cannot execute CSS layout or `defer` semantics.
 *
 * This suite closes that gap: it serves the repository over HTTP and drives a
 * real Chromium, so a broken asset path, a cascade problem or a script-timing
 * regression is caught rather than assumed away.
 *
 * Skipping: if Playwright or a usable browser binary is unavailable the suite
 * reports "skipped" rather than failing, so contributors without browsers can
 * still run `npm test`. CI sets REQUIRE_BROWSER=1, which turns a skip into a
 * failure — otherwise a misconfigured runner would silently drop this coverage.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const http = require('http');
const { ROOT, Reporter } = require('./harness');

const REQUIRE_BROWSER = process.env.REQUIRE_BROWSER === '1';
const R = new Reporter('Browser suite');
const ok = R.ok.bind(R);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

/**
 * Serve the repository root, so the page loads its assets over real HTTP with
 * the same relative paths it will use in production.
 * @returns {Promise<{server: http.Server, origin: string}>}
 */
function serveRepo() {
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split('?')[0]);
    if (p === '/') p = '/index.html';
    const file = path.join(ROOT, p);
    // Refuse anything resolving outside the repo
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404);
      return res.end('not found');
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(fs.readFileSync(file));
  });
  return new Promise(resolve => {
    // Port 0 = let the OS pick, so parallel runs cannot collide
    server.listen(0, '127.0.0.1', () =>
      resolve({ server, origin: 'http://127.0.0.1:' + server.address().port }));
  });
}

/**
 * Launch Chromium, falling back to a browser already present on the machine
 * when the bundled build revision does not match.
 *
 * CI runs `playwright install chromium`, so the default path works there. This
 * sandbox ships a different revision under PLAYWRIGHT_BROWSERS_PATH, hence the
 * fallback.
 * @param {Object} chromium Playwright's chromium browser type
 * @returns {Promise<Object|null>} a browser, or null if none could be launched
 */
async function launchChromium(chromium) {
  try {
    return await chromium.launch();
  } catch (firstError) {
    const base = process.env.PLAYWRIGHT_BROWSERS_PATH;
    if (!base || !fs.existsSync(base)) throw firstError;
    // Look for an already-installed chrome binary next to the expected one
    for (const dir of fs.readdirSync(base)) {
      for (const rel of ['chrome-linux/chrome', 'chrome-linux/headless_shell',
                         'chrome-mac/Chromium.app/Contents/MacOS/Chromium']) {
        const exe = path.join(base, dir, rel);
        if (fs.existsSync(exe)) {
          console.log('  (using pre-installed browser at ' + exe + ')');
          return await chromium.launch({ executablePath: exe });
        }
      }
    }
    throw firstError;
  }
}

(async () => {
  /* ── Availability check ───────────────────────────────────────────── */
  let chromium;
  try {
    ({ chromium } = require('playwright'));
  } catch (e) {
    return R.skip('playwright is not installed', REQUIRE_BROWSER);
  }

  let browser;
  try {
    browser = await launchChromium(chromium);
  } catch (e) {
    return R.skip('no usable Chromium: ' + e.message.split('\n')[0], REQUIRE_BROWSER);
  }

  const { server, origin } = await serveRepo();

  // When tests/coverage.js drives this suite it sets COVERAGE_OUT. Chromium runs
  // out-of-process, so its execution is invisible to Node's V8 coverage; we
  // collect it here and hand it over through that file.
  const COVERAGE_OUT = process.env.COVERAGE_OUT;
  const coveragePages = [];
  const _newPage = browser.newPage.bind(browser);
  browser.newPage = async function (opts) {
    const p = await _newPage(opts);
    if (COVERAGE_OUT) {
      try { await p.coverage.startJSCoverage({ resetOnNavigation: false }); coveragePages.push(p); }
      catch (e) { /* coverage is best-effort */ }
    }
    return p;
  };

  const page = await browser.newPage();

  // First visit shows the onboarding overlay, which would intercept clicks.
  await page.addInitScript(() => {
    try { localStorage.setItem('ob-done', '1'); } catch (e) {}
  });

  const consoleErrors = [];
  const failedRequests = [];
  const responses = [];
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', e => consoleErrors.push('pageerror: ' + e.message));
  page.on('requestfailed', r => failedRequests.push(r.url()));
  page.on('response', r => responses.push([r.url().replace(origin, ''), r.status()]));

  await page.goto(origin + '/', { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.calc === 'function', null, { timeout: 10000 });

  /* ── 1. Assets actually load ──────────────────────────────────────── */
  R.section('\n=== 1. External assets load over HTTP ===');
  const css = responses.find(([u]) => u === '/assets/styles.css');
  const js = responses.find(([u]) => u === '/assets/app.js');
  ok('stylesheet served 200', css && css[1] === 200, JSON.stringify(css));
  ok('script served 200', js && js[1] === 200, JSON.stringify(js));
  // Only same-origin failures matter; fonts and the favicon are external hosts
  // and may be unreachable depending on where this runs.
  const localFailures = failedRequests.filter(u => u.startsWith(origin));
  ok('no same-origin request failed', localFailures.length === 0, localFailures.join(' | '));
  const appErrors = consoleErrors.filter(e => !/ERR_|net::|favicon|fonts\./.test(e));
  ok('no application console errors', appErrors.length === 0, appErrors.slice(0, 3).join(' | '));

  /* ── 2. CSS is parsed and applied ─────────────────────────────────── */
  R.section('\n=== 2. Stylesheet is applied (real cascade) ===');
  const bodyFont = await page.evaluate(() => getComputedStyle(document.body).fontFamily);
  ok('body font comes from the stylesheet', /DM Sans|ui-sans-serif/.test(bodyFont), bodyFont);
  const text3 = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--text3').trim());
  ok('custom properties resolve', text3 === '#736e68', text3);
  const navDisplay = await page.evaluate(() =>
    getComputedStyle(document.querySelector('.bottom-nav')).display);
  ok('media queries evaluate (desktop hides the bottom nav)', navDisplay === 'none', navDisplay);

  /* ── 3. Script executed with correct timing ───────────────────────── */
  R.section('\n=== 3. Deferred script ran after the DOM ===');
  ok('app functions are defined', await page.evaluate(() => typeof window.calc === 'function'));
  ok('JS-rendered incentive rows exist',
     await page.evaluate(() => document.querySelectorAll('#cp-inc-grid .inc-row').length) === 5);
  // Initialisation reads the DOM; if defer timing were wrong this would be empty
  ok('initialisation populated the summary',
     (await page.textContent('#s-mrp')).includes('100'), await page.textContent('#s-mrp'));

  /* ── 4. End-to-end calculation through the UI ─────────────────────── */
  R.section('\n=== 4. Calculation through the real UI ===');
  await page.fill('#mrp', '1000');
  await page.fill('#cpd', '40');
  await page.fill('#spd', '25');
  await page.waitForTimeout(150);
  ok('profit is 150', (await page.textContent('#pvv')).includes('150'),
     await page.textContent('#pvv'));
  ok('CP excl is 600', (await page.textContent('#s-cp')).includes('600'),
     await page.textContent('#s-cp'));
  ok('GP is 20%', (await page.textContent('#s-gp')).includes('20.00'),
     await page.textContent('#s-gp'));

  await page.fill('#qty', '3');
  await page.waitForTimeout(150);
  ok('order total reflects quantity', (await page.textContent('#s-tpr')).includes('450'),
     await page.textContent('#s-tpr'));
  await page.fill('#qty', '1');

  /* ── 5. Interaction ───────────────────────────────────────────────── */
  R.section('\n=== 5. Real clicks and keyboard ===');
  await page.click('#phdr-inc');
  ok('panel opens on click',
     await page.evaluate(() => document.getElementById('body-inc').style.display === 'block'));
  ok('aria-expanded follows', await page.getAttribute('#phdr-inc', 'aria-expanded') === 'true');

  await page.click('#cp-inc-edit-btn');
  ok('edit mode entered without toggling the panel',
     await page.evaluate(() =>
       document.getElementById('cp-inc-grid').classList.contains('edit-mode') &&
       document.getElementById('body-inc').style.display === 'block'));
  await page.click('#cp-inc-edit-btn');

  // The checkbox itself is opacity:0 (the accessible hidden-input toggle
  // pattern); a user clicks the visible track, so drive that.
  const ebToggle = page.locator('#ir-eb label.toggle');
  await ebToggle.click();
  await page.waitForTimeout(150);
  ok('toggling an incentive changes profit',
     (await page.textContent('#pvv')).includes('156'), await page.textContent('#pvv'));
  ok('the hidden checkbox is what actually changed',
     await page.evaluate(() => document.getElementById('it-eb').checked) === true);
  await ebToggle.click();

  /* ── 6. Dialogs and focus ─────────────────────────────────────────── */
  R.section('\n=== 6. Dialog behaviour in a real browser ===');
  await page.evaluate(() => window.openModal('settings'));
  await page.waitForTimeout(120);
  ok('dialog is visible',
     await page.evaluate(() =>
       getComputedStyle(document.getElementById('overlay-settings')).display !== 'none'));
  ok('focus moved into the dialog',
     await page.evaluate(() =>
       document.getElementById('overlay-settings').contains(document.activeElement)));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(120);
  ok('Escape closes it',
     await page.evaluate(() =>
       getComputedStyle(document.getElementById('overlay-settings')).display === 'none'));

  /* ── 7. Keyboard entry point ──────────────────────────────────────── */
  R.section('\n=== 7. Skip link is the first tab stop ===');
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.calc === 'function');
  await page.keyboard.press('Tab');
  const firstFocus = await page.evaluate(() => document.activeElement.className);
  ok('first Tab reaches the skip link', firstFocus.includes('skip-link'), firstFocus);
  // .skip-link animates in via `transition: top .15s`. A fixed wait sat right on
  // the boundary once font loading shifted the timing, so poll until it lands.
  let skipTop = null;
  try {
    await page.waitForFunction(
      () => document.querySelector('.skip-link').getBoundingClientRect().top >= 0,
      null, { timeout: 3000, polling: 50 });
    skipTop = await page.evaluate(() =>
      document.querySelector('.skip-link').getBoundingClientRect().top);
  } catch (e) {
    skipTop = await page.evaluate(() =>
      document.querySelector('.skip-link').getBoundingClientRect().top);
  }
  ok('skip link slides into view when focused', skipTop !== null && skipTop >= 0,
     'top ' + skipTop);

  /* ── 7b. Focus ring renders grey, not black ───────────────────────── */
  R.section('\n=== 7b. Focus ring colour (computed) ===');
  const ringColour = await page.evaluate(() => {
    const b = document.getElementById('cp-inc-edit-btn');
    b.focus();
    return getComputedStyle(b).outlineColor;
  });
  ok('a ring is painted on keyboard focus', /rgb/.test(ringColour), ringColour);
  const rgb = (ringColour.match(/\d+/g) || []).map(Number);
  ok('ring is grey, not near-black',
     rgb.length >= 3 && rgb[0] > 100 && rgb[1] > 100 && rgb[2] > 100, ringColour);
  ok('ring is neutral rather than tinted',
     rgb.length >= 3 && Math.max(...rgb.slice(0, 3)) - Math.min(...rgb.slice(0, 3)) < 30,
     ringColour);

  /* ── 7c. Edit expands the panel; collapsing means Done ────────────── */
  R.section('\n=== 7c. Edit and the accordion, in a real browser ===');
  await page.evaluate(() => {
    if (document.getElementById('body-inc').style.display === 'block') window.togglePanel('inc');
  });
  await page.click('#cp-inc-edit-btn');
  await page.waitForTimeout(120);
  ok('Edit expands the collapsed panel',
     await page.evaluate(() => document.getElementById('body-inc').style.display === 'block'));
  ok('edit mode is on', await page.evaluate(() => window.CP_EDIT_MODE === true));
  ok('delete badges are visible to the user',
     await page.locator('#cp-inc-grid .inc-del-btn').first().isVisible());

  await page.click('#phdr-inc');
  await page.waitForTimeout(120);
  ok('collapsing the panel exits edit mode',
     await page.evaluate(() => window.CP_EDIT_MODE === false));
  ok('button reads Edit again',
     (await page.textContent('#cp-inc-edit-btn')).trim() === 'Edit',
     await page.textContent('#cp-inc-edit-btn'));

  /* ── 7d. Custom rounding chip highlight (computed) ────────────────── */
  R.section('\n=== 7d. Rounding chip highlight ===');
  await page.evaluate(() => window.openModal('settings'));
  await page.waitForTimeout(150);

  // The chip animates via `transition: background .15s`. Sampling the computed
  // value against that transition made this section flaky, so run the whole
  // comparison under reduced motion — the app collapses transition-duration to
  // ~0 there, making every read deterministic. It also exercises that CSS.
  await page.emulateMedia({ reducedMotion: 'reduce' });

  const chipStyle = () => page.evaluate(() => {
    const w = document.getElementById('rnd-custom-wrap');
    const i = document.getElementById('rnd-custom');
    const s = getComputedStyle(w);
    return {
      on: w.classList.contains('on'),
      bg: s.backgroundColor,
      border: s.borderTopColor,
      fg: getComputedStyle(i).color,
    };
  });

  await page.evaluate(() => window.setRounding('off'));
  const offStyle = await chipStyle();
  await page.evaluate(() => window.setRounding('20'));
  const onStyle = await chipStyle();

  ok('chip is marked active only for a custom step',
     offStyle.on === false && onStyle.on === true,
     `off=${offStyle.on} on=${onStyle.on}`);

  ok('chip background changes when active', onStyle.bg !== offStyle.bg,
     offStyle.bg + ' -> ' + onStyle.bg);
  ok('chip border changes when active', onStyle.border !== offStyle.border,
     offStyle.border + ' -> ' + onStyle.border);
  ok('chip text colour changes when active', onStyle.fg !== offStyle.fg,
     offStyle.fg + ' -> ' + onStyle.fg);

  // The value itself is the non-colour cue, so the state is not colour-only
  ok('chip shows the step as a non-colour cue',
     await page.inputValue('#rnd-custom') === '20');

  // Highlighted text must stay legible on the new background
  const chipContrast = await page.evaluate(() => {
    const parse = c => (c.match(/[\d.]+/g) || []).slice(0, 3).map(Number);
    const lum = ([r, g, b]) => {
      const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    const w = document.getElementById('rnd-custom-wrap');
    const i = document.getElementById('rnd-custom');
    const [la, lb] = [lum(parse(getComputedStyle(i).color)), lum(parse(getComputedStyle(w).backgroundColor))];
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
  });
  ok('highlighted value meets 4.5:1 on the chip', chipContrast >= 4.5,
     chipContrast.toFixed(2) + ':1');

  // Only one control in the row may read as selected
  const selected = await page.evaluate(() =>
    ['rnd-off', 'rnd-1', 'rnd-5'].filter(id =>
      document.getElementById(id).className.includes('on')).length +
    (document.getElementById('rnd-custom-wrap').className.includes('on') ? 1 : 0));
  ok('exactly one rounding control reads as selected', selected === 1, 'got ' + selected);

  await page.evaluate(() => window.setRounding('off'));
  await page.emulateMedia({ reducedMotion: null });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(120);

  /* ── 7e. Deferred bundle loads on demand ──────────────────────────── */
  R.section('\n=== 7e. Deferred feature bundle ===');
  {
    // A fresh page: assert app-extra.js is NOT part of the initial critical path,
    // then that using a deferred feature pulls it in and works.
    const p2 = await browser.newPage();
    const loaded = [];
    const errs2 = [];
    p2.on('response', r => loaded.push(r.url().replace(origin, '')));
    p2.on('pageerror', e => errs2.push(String(e)));
    p2.on('console', m => { if (m.type() === 'error') errs2.push(m.text()); });
    await p2.addInitScript(() => { try { localStorage.setItem('ob-done', '1'); } catch (e) {} });
    await p2.goto(origin + '/', { waitUntil: 'load' });
    await p2.waitForFunction(() => typeof window.calc === 'function');

    ok('core bundle is on the critical path', loaded.indexOf('/assets/app.js') !== -1);
    // The bundle is warmed on idle, so "undefined right now" is racy. What
    // matters is that it is never a blocking script in the markup.
    ok('deferred bundle is not a blocking script',
       !/<script[^>]+src="assets\/app-extra\.js"/.test(fs.readFileSync(path.join(ROOT,'index.html'),'utf8')));
    ok('core works without waiting for it',
       await p2.evaluate(() => typeof window.calc === 'function'));
    ok('no error from the deferred bundle', errs2.length === 0, errs2.slice(0, 2).join(' | '));

    // Opening the quote builder must fetch the bundle and then render
    await p2.evaluate(() => window.openModal('quote'));
    await p2.waitForFunction(() => typeof window.qtRender === 'function', null, { timeout: 8000 });
    ok('opening quote loads the bundle', loaded.indexOf('/assets/app-extra.js') !== -1);
    ok('quote renders after the load',
       await p2.evaluate(() => !!document.getElementById('qt-table') ||
                               !!document.getElementById('qt-cards')));
    await p2.evaluate(() => window.qtAddLine());
    ok('deferred function is callable', await p2.evaluate(() => window.QUOTE.length) === 1);
    await p2.evaluate(() => window.closeModal('quote'));

    // Quick mode is the other entry point
    await p2.evaluate(() => window.setMode('quick'));
    await p2.waitForFunction(() => window.APP_MODE === 'quick', null, { timeout: 5000 });
    ok('quick mode activates through the deferred path',
       await p2.evaluate(() => window.APP_MODE === 'quick'));
    ok('quick mode cards were built',
       await p2.evaluate(() => document.querySelectorAll('#fc-stack .fc-card').length > 0) ||
       await p2.evaluate(() => !!document.getElementById('fc-mrp')));
    await p2.evaluate(() => window.setMode('default'));

    ok('still no page errors after using deferred features',
       errs2.length === 0, errs2.slice(0, 2).join(' | '));

    // The resize listener lives in core and must tolerate the bundle's absence
    const p3 = await browser.newPage();
    const errs3 = [];
    p3.on('pageerror', e => errs3.push(String(e)));
    await p3.addInitScript(() => { try { localStorage.setItem('ob-done', '1'); } catch (e) {} });
    await p3.goto(origin + '/', { waitUntil: 'load' });
    await p3.setViewportSize({ width: 400, height: 800 });
    await p3.waitForTimeout(400);
    ok('resizing before the bundle loads does not throw', errs3.length === 0,
       errs3.slice(0, 2).join(' | '));
    await p3.close();
    await p2.close();
  }

  /* ── 7f. axe-core in a real browser, with data on screen ──────────── */
  R.section('\n=== 7f. axe-core with real layout ===');
  {
    // The a11y suite runs axe under jsdom, where colour-contrast and any other
    // layout-dependent rule comes back "incomplete" rather than pass or fail.
    // This is the only place those rules are actually evaluated — and it must
    // run with values on screen, since most coloured text only exists then.
    const axeSrc = fs.readFileSync(require.resolve('axe-core'), 'utf8');
    const p4 = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await p4.addInitScript(() => { try { localStorage.setItem('ob-done', '1'); } catch (e) {} });
    await p4.goto(origin + '/', { waitUntil: 'load' });
    await p4.waitForFunction(() => typeof window.calc === 'function');
    await p4.fill('#mrp', '1000');
    await p4.fill('#cpd', '40');
    await p4.fill('#spd', '25');
    await p4.fill('#landed', '50');
    await p4.fill('#sp-landed', '30');
    await p4.fill('#qty', '5');
    await p4.evaluate(() => { window.saveToHistory(); window.togglePanel('hist'); });
    await p4.waitForTimeout(400);
    await p4.evaluate(axeSrc);

    const run = sel => p4.evaluate(s => window.axe.run(s ? document.querySelector(s) : document, {
      resultTypes: ['violations'],
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
    }), sel);

    const full = await run(null);
    const describe = v => v.map(x =>
      `${x.id}(${x.nodes.length}): ${(x.nodes[0].any[0] || {}).message || ''}`.slice(0, 120)).join(' | ');
    ok('populated page has no WCAG violations', full.violations.length === 0,
       describe(full.violations));

    // Contrast specifically — the rule jsdom can never evaluate
    const contrast = await p4.evaluate(() => window.axe.run(document, {
      resultTypes: ['violations'], runOnly: ['color-contrast'],
    }));
    ok('no colour-contrast violations with data on screen',
       contrast.violations.length === 0,
       contrast.violations.map(v => v.nodes.length + ' nodes, worst ' +
         ((v.nodes[0].any[0] || {}).data || {}).contrastRatio).join(' | '));

    // And in dark theme, where the whole palette changes
    await p4.evaluate(() => window.toggleDarkMode(true));
    await p4.waitForTimeout(300);
    const darkContrast = await p4.evaluate(() => window.axe.run(document, {
      resultTypes: ['violations'], runOnly: ['color-contrast'],
    }));
    ok('no colour-contrast violations in dark theme',
       darkContrast.violations.length === 0,
       darkContrast.violations.map(v => v.nodes.length + ' nodes, worst ' +
         ((v.nodes[0].any[0] || {}).data || {}).contrastRatio).join(' | '));
    // Icons are not text, so axe will not flag them. Measure the FAB menu
    // directly in both themes — this is where --accent-as-foreground failed.
    const iconContrast = async () => p4.evaluate(() => {
      if (!window.FAB_OPEN) window.toggleFab();
      const item = document.querySelector('.fab-item');
      const svg = item && item.querySelector('svg');
      if (!svg) return null;
      const px = c => (c.match(/[\d.]+/g) || []).slice(0, 3).map(Number);
      const lum = ([r, g, b]) => {
        const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
        return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
      };
      const a = lum(px(getComputedStyle(svg).color));
      const b = lum(px(getComputedStyle(item).backgroundColor));
      return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    });
    await p4.setViewportSize({ width: 390, height: 800 });
    await p4.waitForTimeout(200);
    const darkIcon = await iconContrast();
    ok('FAB menu icons are visible in dark theme', darkIcon !== null && darkIcon >= 3,
       (darkIcon === null ? 'no icon found' : darkIcon.toFixed(2) + ':1'));
    await p4.evaluate(() => { window.closeFab(); window.toggleDarkMode(false); });
    await p4.waitForTimeout(250);
    const lightIcon = await iconContrast();
    ok('and in light theme', lightIcon !== null && lightIcon >= 3,
       (lightIcon === null ? 'no icon found' : lightIcon.toFixed(2) + ':1'));
    await p4.evaluate(() => window.closeFab());
    await p4.close();
  }

  /* ── 7g. Non-text contrast, WCAG 1.4.11 ───────────────────────────── */
  R.section('\n=== 7g. Control boundaries (WCAG 1.4.11) ===');
  {
    // axe's colour-contrast rule only judges TEXT. The outline that tells you
    // where a pill button ends is not text, so nothing in the suite looked at
    // it — and every bordered control in the dark theme sat between 1:1 and
    // 2.38:1 against its surroundings. Reported as "outlines on pill shaped
    // buttons have no contrast", which was exactly right.
    //
    // 1.4.11 wants 3:1 for the visual information that identifies a control or
    // its state. A control passes on EITHER its border or its own fill: a
    // filled button is identified by the fill, so its border may be soft.
    const p5 = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
    await p5.goto(origin + '/');
    await p5.waitForTimeout(500);
    await p5.evaluate(() => {
      const g = id => document.getElementById(id);
      g('mrp').value = '1000'; window.setCM('excl'); g('cpd').value = '40';
      window.setSM('excl'); g('spd').value = '25'; window.calc();
      window.openModal('settings');
    });
    await p5.waitForTimeout(300);

    // The preset manager and the text-entry dialog that replaced window.prompt()
    // bring their own buttons and field; measure those too rather than only what
    // happens to be on screen.
    const measureIn = async (setup) => { await p5.evaluate(setup); await p5.waitForTimeout(200); };

    const measure = () => p5.evaluate(() => {
      const px = c => { const m = c.match(/[\d.]+/g) || [0, 0, 0, 1];
        return { r: +m[0], g: +m[1], b: +m[2], a: m[3] === undefined ? 1 : +m[3] }; };
      const over = (f, b) => ({ r: f.r * f.a + b.r * (1 - f.a), g: f.g * f.a + b.g * (1 - f.a),
                                b: f.b * f.a + b.b * (1 - f.a), a: 1 });
      const lum = c => { const s = [c.r, c.g, c.b].map(v => { v /= 255;
        return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
        return 0.2126 * s[0] + 0.7152 * s[1] + 0.0722 * s[2]; };
      const ratio = (a, b) => { const x = lum(a), y = lum(b);
        return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
      // First painted colour behind the element, compositing any translucency
      const behind = el => { let n = el.parentElement, acc = null;
        while (n) { const c = px(getComputedStyle(n).backgroundColor);
          if (c.a > 0) { acc = acc ? over(acc, c) : c; if (c.a === 1) return acc; }
          n = n.parentElement; }
        return acc || { r: 255, g: 255, b: 255, a: 1 }; };

      const SEL = 'button,select,.pill,.preset-btn,.preset-select,.btn-reset,' +
                  '.panel-edit-btn,.modal-close,.hbtn,.btn-whatif,.solver-input,' +
                  '.floor-input-wrap,.gst-custom-wrap,.rnd-custom-wrap';
      const bad = [];
      let checked = 0;
      document.querySelectorAll(SEL).forEach(el => {
        const r = el.getBoundingClientRect();
        if (r.width < 2 || r.height < 2) return;
        const cs = getComputedStyle(el);
        if (cs.visibility === 'hidden' || cs.display === 'none' || +cs.opacity < 0.5) return;
        if ((parseFloat(cs.borderTopWidth) || 0) < 0.5) return;
        const bc = px(cs.borderTopColor);
        if (bc.a === 0) return;
        const bg = behind(el);
        const own = px(cs.backgroundColor);
        const adj = own.a > 0 ? over(own, bg) : bg;
        checked++;
        const borderCr = ratio(bc.a < 1 ? over(bc, adj) : bc, adj);
        const fillCr = own.a > 0 ? ratio(over(own, bg), bg) : 1;
        if (borderCr < 3 && fillCr < 3) {
          bad.push((el.id || el.className || el.tagName) + ' ' +
                   borderCr.toFixed(2) + '/' + fillCr.toFixed(2));
        }
      });
      return { checked, bad };
    });

    const darkNT = await measure();
    ok('every bordered control is identifiable in dark theme',
       darkNT.bad.length === 0 && darkNT.checked > 8,
       'checked ' + darkNT.checked + '; below 3:1 -> ' + darkNT.bad.slice(0, 6).join(' | '));

    await p5.evaluate(() => window.toggleDarkMode(false));
    await p5.waitForTimeout(250);
    const lightNT = await measure();
    ok('and in light theme',
       lightNT.bad.length === 0 && lightNT.checked > 8,
       'checked ' + lightNT.checked + '; below 3:1 -> ' + lightNT.bad.slice(0, 6).join(' | '));

    // The selected state is information too — in dark theme a chosen pill was
    // filled with --accent, which is within 1.09:1 of the surfaces around it,
    // so the only cue was how bright its label was.
    const selectedFill = () => p5.evaluate(() => {
      const on = document.querySelector('.pill.on');
      if (!on) return null;
      const px = c => { const m = c.match(/[\d.]+/g) || [0, 0, 0, 1];
        return { r: +m[0], g: +m[1], b: +m[2], a: m[3] === undefined ? 1 : +m[3] }; };
      const lum = c => { const s = [c.r, c.g, c.b].map(v => { v /= 255;
        return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
        return 0.2126 * s[0] + 0.7152 * s[1] + 0.0722 * s[2]; };
      const ratio = (a, b) => { const x = lum(a), y = lum(b);
        return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
      let n = on.parentElement, bg = null;
      while (n && !bg) { const c = px(getComputedStyle(n).backgroundColor); if (c.a === 1) bg = c; n = n.parentElement; }
      return ratio(px(getComputedStyle(on).backgroundColor), bg || { r: 255, g: 255, b: 255 });
    });
    const lightSel = await selectedFill();
    ok('a selected pill is distinguishable in light theme', lightSel !== null && lightSel >= 3,
       lightSel === null ? 'no .pill.on found' : lightSel.toFixed(2) + ':1');
    await p5.evaluate(() => window.toggleDarkMode(true));
    await p5.waitForTimeout(250);
    const darkSel = await selectedFill();
    ok('and in dark theme', darkSel !== null && darkSel >= 3,
       darkSel === null ? 'no .pill.on found' : darkSel.toFixed(2) + ':1');

    // White label on the dark selected fill must still be readable as text.
    const selectedLabel = await p5.evaluate(() => {
      const on = document.querySelector('.pill.on');
      if (!on) return null;
      const px = c => (c.match(/[\d.]+/g) || []).slice(0, 3).map(Number);
      const lum = a => { const s = a.map(v => { v /= 255;
        return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
        return 0.2126 * s[0] + 0.7152 * s[1] + 0.0722 * s[2]; };
      const x = lum(px(getComputedStyle(on).color)), y = lum(px(getComputedStyle(on).backgroundColor));
      return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
    });
    ok('and its label still meets 4.5:1', selectedLabel !== null && selectedLabel >= 4.5,
       selectedLabel === null ? 'no .pill.on' : selectedLabel.toFixed(2) + ':1');

    // Same again with the preset dialogs open.
    await measureIn(() => {
      window.closeModal('settings');
      window.PRESETS = { 'Bosch Q3': window.capturePreset() };
      window.openPresetManager();
    });
    const pmDark = await measure();
    ok('preset manager controls are identifiable in dark theme',
       pmDark.bad.length === 0 && pmDark.checked > 4,
       'checked ' + pmDark.checked + '; below 3:1 -> ' + pmDark.bad.slice(0, 6).join(' | '));
    await measureIn(() => { window.closeModal('presets');
      window.askPrompt({ title: 'Save preset', label: 'Preset name', value: 'x', onOk: function () {} }); });
    const prDark = await measure();
    ok('the text-entry dialog is too', prDark.bad.length === 0,
       'below 3:1 -> ' + prDark.bad.slice(0, 6).join(' | '));
    await p5.evaluate(() => { window.closePrompt(); window.PRESETS = {}; });

    await p5.close();
  }

  /* ── 8. Mobile viewport ───────────────────────────────────────────── */
  R.section('\n=== 8. Mobile viewport ===');
  await page.setViewportSize({ width: 390, height: 780 });
  await page.waitForTimeout(200);
  ok('bottom nav appears',
     await page.evaluate(() =>
       getComputedStyle(document.querySelector('.bottom-nav')).display !== 'none'));
  await page.fill('#mrp', '1000');
  await page.fill('#cpd', '40');
  await page.fill('#spd', '25');
  await page.waitForTimeout(200);
  ok('sticky result bar is shown',
     await page.evaluate(() =>
       getComputedStyle(document.getElementById('mini-result')).display !== 'none'));
  ok('result bar mirrors the profit',
     (await page.textContent('#mini-pr')).includes('150'), await page.textContent('#mini-pr'));
  ok('FAB is shown',
     await page.evaluate(() =>
       getComputedStyle(document.getElementById('fab-wrap')).display !== 'none'));

  // The nav must not cover a dialog — the defect this layering was written for
  await page.evaluate(() => window.openModal('quote'));
  await page.waitForTimeout(150);
  const layering = await page.evaluate(() => {
    const z = el => parseInt(getComputedStyle(el).zIndex, 10);
    return {
      modal: z(document.getElementById('overlay-quote')),
      nav: z(document.querySelector('.bottom-nav')),
    };
  });
  ok('dialog layers above the bottom nav', layering.modal > layering.nav,
     JSON.stringify(layering));
  ok('quote uses the card layout on mobile',
     await page.evaluate(() =>
       getComputedStyle(document.getElementById('qt-table')).display === 'none'));
  await page.keyboard.press('Escape');

  if (COVERAGE_OUT) {
    const entries = [];
    for (const p of coveragePages) {
      try {
        for (const e of await p.coverage.stopJSCoverage()) {
          if (/\/assets\/app(-extra)?\.js$/.test(e.url)) {
            entries.push({ url: e.url.replace(origin, ''), functions: e.functions });
          }
        }
      } catch (e) { /* page may already be closed */ }
    }
    fs.writeFileSync(COVERAGE_OUT, JSON.stringify(entries));
  }

  await browser.close();
  await new Promise(r => server.close(r));
  R.finish();
})().catch(e => {
  console.error(e);
  process.exit(1);
});
