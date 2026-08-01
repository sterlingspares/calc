/**
 * Regenerate the two screenshots the README embeds.
 *
 *   npm run screenshots
 *
 * These had drifted twice — labels renamed, a header button added — because
 * they were produced by hand and nothing tied them to the app. Driving the real
 * page through the same worked example the README walks through keeps the
 * picture and the prose describing the same numbers.
 *
 * Needs Chromium (`npx playwright install chromium`).
 */
'use strict';

const fs = require('fs');
const path = require('path');
const http = require('http');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'docs');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
};

/** Serve the repo root so fonts and both bundles load exactly as they ship. */
function serveRepo() {
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split('?')[0]);
    if (p === '/') p = '/index.html';
    const file = path.join(ROOT, p);
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404);
      return res.end('not found');
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(fs.readFileSync(file));
  });
  return new Promise(resolve => {
    server.listen(0, '127.0.0.1', () =>
      resolve({ server, origin: 'http://127.0.0.1:' + server.address().port }));
  });
}

/** Same fallback the browser suite uses when the bundled revision is absent. */
async function launchChromium(chromium) {
  try { return await chromium.launch(); } catch (firstError) {
    const base = process.env.PLAYWRIGHT_BROWSERS_PATH;
    if (!base || !fs.existsSync(base)) throw firstError;
    for (const dir of fs.readdirSync(base)) {
      for (const rel of ['chrome-linux/chrome', 'chrome-linux/headless_shell',
                         'chrome-mac/Chromium.app/Contents/MacOS/Chromium']) {
        const exe = path.join(base, dir, rel);
        if (fs.existsSync(exe)) return await chromium.launch({ executablePath: exe });
      }
    }
    throw firstError;
  }
}

/**
 * MRP ₹1,000 at 18% GST, bought at 40% off, sold at 25% off, with a 2% cash
 * discount and 1% early-bird rebate — the example in the README's own table.
 * Runs in the page.
 */
function workedExample() {
  window.setGST(18);
  const mrp = document.getElementById('mrp');
  mrp.value = '1000';
  // Through the input handler, so the figure is grouped the way a typed one is
  mrp.dispatchEvent(new Event('input', { bubbles: true }));
  window.setCM('excl'); document.getElementById('cpd').value = '40';
  window.setSM('excl'); document.getElementById('spd').value = '25';
  ['cd', 'eb'].forEach(k => {
    const cb = document.getElementById('it-' + k);
    if (cb && !cb.checked) { cb.checked = true; window.syncToggle(k); }
  });
  document.getElementById('iv-cd').value = '2';
  document.getElementById('iv-eb').value = '1';
  window.calc();
}

/** Put the page back to how a first-time visitor finds it, post-calculation. */
function tidyUp() {
  // Auto-save fires 900ms after a calculation, which expands History and pushes
  // the footer off a full-page shot.
  window.HISTORY.length = 0;
  window.renderHistory();
  const h = document.getElementById('phdr-hist');
  if (h && h.getAttribute('aria-expanded') === 'true') h.click();
}

const SHOTS = [
  { file: 'screenshot.png', width: 1200, height: 820, fullPage: true },
  { file: 'screenshot-mobile.png', width: 390, height: 900, fullPage: false },
];

/**
 * Two pictures for the Tools section: the menu open, and the currency converter.
 * Separately, not composed — the converter is a modal with a blurred backdrop,
 * so a menu shown behind it photographs as a smear.
 */
async function toolsShots(browser, origin) {
  const page = await browser.newPage({
    viewport: { width: 1100, height: 560 }, deviceScaleFactor: 2,
  });
  await page.addInitScript(() => { try { localStorage.setItem('ob-done', '1') } catch (e) {} });
  await page.goto(origin + '/', { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.calc === 'function');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.evaluate(workedExample);
  await page.waitForTimeout(600);
  await page.evaluate(tidyUp);

  await page.evaluate(() => window.openTools());
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(OUT, 'screenshot-tools.png'),
                          clip: { x: 340, y: 0, width: 760, height: 300 } });
  console.log('  wrote docs/screenshot-tools.png');
  await page.evaluate(() => window.closeTools());

  // Fixed rates, so the picture does not change with the day's market
  await page.evaluate(() => {
    window.FX.rates = { INR: 1, USD: 0.012, EUR: 0.011, GBP: 0.0094 };
    window.FX.fetched = window.nowMs();
  });
  await page.waitForFunction(() => typeof window._renderCcyConvImpl === 'function',
                             null, { timeout: 8000 });
  await page.evaluate(() => {
    window.openCcyConv();
    document.getElementById('cc-from-amt').value = '250';
    window.renderCcyConv('from');
  });
  // openCcyConv focuses and selects the first field on a 30ms timer, so the
  // blur has to come after that or the figure photographs highlighted.
  await page.waitForTimeout(400);
  await page.evaluate(() => document.getElementById('cc-from-amt').blur());
  await page.waitForTimeout(200);
  await page.locator('#overlay-ccyconv .modal').screenshot({
    path: path.join(OUT, 'screenshot-currency.png') });
  console.log('  wrote docs/screenshot-currency.png');
  await page.close();
}

(async () => {
  let chromium;
  try { ({ chromium } = require('playwright')); }
  catch (e) { console.error('playwright is not installed — npm install'); process.exit(1); }

  const { server, origin } = await serveRepo();
  const browser = await launchChromium(chromium);

  for (const shot of SHOTS) {
    const page = await browser.newPage({
      viewport: { width: shot.width, height: shot.height },
      deviceScaleFactor: 2,
    });
    // Skip the first-run tour, which would cover the whole page
    await page.addInitScript(() => { try { localStorage.setItem('ob-done', '1') } catch (e) {} });
    await page.goto(origin + '/', { waitUntil: 'load' });
    await page.waitForFunction(() => typeof window.calc === 'function');
    // Count-up animations settle instantly here, so the figures are final
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.evaluate(workedExample);
    await page.waitForTimeout(1300);
    await page.evaluate(tidyUp);
    await page.waitForTimeout(200);
    const file = path.join(OUT, shot.file);
    await page.screenshot({ path: file, fullPage: shot.fullPage });
    console.log('  wrote docs/' + shot.file);
    await page.close();
  }

  await toolsShots(browser, origin);

  await browser.close();
  await new Promise(r => server.close(r));
})();
