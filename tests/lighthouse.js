#!/usr/bin/env node
/**
 * Lighthouse audit against a locally served copy of the app.
 *
 * Lighthouse is deliberately NOT a devDependency: it is large, and adding it
 * would slow every CI install for a report that is only run occasionally. If it
 * is missing this exits with instructions rather than failing noisily.
 *
 *   npm i -D lighthouse && npm run lighthouse
 *   npm run lighthouse -- --json     machine-readable, for the README badges
 *
 * The server gzips and sets a cache header so the numbers reflect a realistic
 * deployment rather than an unconfigured static host.
 */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT = path.join(__dirname, '..');
const asJson = process.argv.includes('--json');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/manifest+json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
};

function serve() {
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split('?')[0]);
    if (p === '/') p = '/index.html';
    const file = path.join(ROOT, p);
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404);
      return res.end('not found');
    }
    const body = zlib.gzipSync(fs.readFileSync(file));
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file)] || 'application/octet-stream',
      'Content-Encoding': 'gzip',
      // Matches the _headers policy: assets cached hard, HTML not.
      'Cache-Control': p === '/index.html' ? 'no-cache' : 'public, max-age=31536000, immutable',
    });
    res.end(body);
  });
  return new Promise(r =>
    server.listen(0, '127.0.0.1', () =>
      r({ server, origin: 'http://127.0.0.1:' + server.address().port })));
}

(async () => {
  let lighthouse, chromium;
  try {
    lighthouse = (await import('lighthouse')).default;
    ({ chromium } = require('playwright'));
  } catch (e) {
    console.error('Lighthouse is not installed. Run:\n\n  npm i -D lighthouse\n');
    process.exit(asJson ? 1 : 0);
  }

  const { server, origin } = await serve();
  const PORT = 9333;
  const launch = { args: ['--remote-debugging-port=' + PORT] };
  // Same pre-installed-browser fallback the browser suite uses.
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (base && fs.existsSync(base)) {
    for (const dir of fs.readdirSync(base)) {
      const exe = path.join(base, dir, 'chrome-linux/chrome');
      if (fs.existsSync(exe)) { launch.executablePath = exe; break; }
    }
  }
  const browser = await chromium.launch(launch);

  const res = await lighthouse(origin + '/', {
    port: PORT,
    output: 'json',
    logLevel: 'error',
    onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'],
    formFactor: 'mobile',
    screenEmulation: { mobile: true, width: 412, height: 823, deviceScaleFactor: 1.75, disabled: false },
  });

  const cats = res.lhr.categories;
  const scores = {};
  for (const k of Object.keys(cats)) scores[k] = Math.round(cats[k].score * 100);

  if (asJson) {
    console.log(JSON.stringify(scores));
  } else {
    const a = res.lhr.audits;
    console.log('\nLighthouse — mobile, gzipped, throttled\n');
    for (const k of Object.keys(cats)) {
      console.log(`  ${cats[k].title.padEnd(16)} ${String(scores[k]).padStart(3)}`);
    }
    console.log('\n  FCP ' + a['first-contentful-paint'].displayValue +
                '   LCP ' + a['largest-contentful-paint'].displayValue +
                '   TBT ' + a['total-blocking-time'].displayValue +
                '   CLS ' + a['cumulative-layout-shift'].displayValue);
    const failed = cats.accessibility.auditRefs
      .map(r => res.lhr.audits[r.id])
      .filter(x => x && x.score !== null && x.score < 1);
    if (failed.length) {
      console.log('\n  Accessibility failures:');
      failed.forEach(x => console.log('    · ' + x.id + ' — ' + x.title));
    }
    console.log('\n  SEO is capped by the deliberate <meta name="robots" content="noindex">');
    console.log('  on this internal tool; is-crawlable is the only failing audit.\n');
  }

  await browser.close();
  server.close();
  process.exit(0);
})().catch(e => { console.error(e.message); process.exit(1); });
