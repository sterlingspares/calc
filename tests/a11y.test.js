/**
 * Accessibility suite.
 *
 * Two halves:
 *
 *   1. axe-core, run over the default view, every dialog and the expanded FAB
 *      menu. axe only evaluates *visible* elements, so each overlay is opened
 *      before it is audited — auditing the closed page would report nothing.
 *
 *   2. Direct assertions for the things axe cannot judge under jsdom, which is
 *      where the original failures actually were. jsdom performs no layout, so
 *      axe reports colour-contrast and heading rules as "incomplete" rather
 *      than passing or failing them. Contrast is therefore computed here from
 *      the palette, and structure is asserted against the markup.
 */
'use strict';

const fs = require('fs');
const { readSource, loadApp, cssRule, Reporter } = require('./harness');

const R = new Reporter('Accessibility suite');
const ok = R.ok.bind(R);
const src = readSource();

/* ── WCAG relative luminance and contrast ratio (WCAG 2.1, 1.4.3) ── */
function luminance(hex) {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  const [r, g, b] = [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16) / 255);
  const f = c => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
function contrast(a, b) {
  const [la, lb] = [luminance(a), luminance(b)];
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}
/** Read a custom property out of a `:root`-style block. */
function cssVar(block, name) {
  const m = (block || '').match(new RegExp('--' + name + ':\\s*(#[0-9a-fA-F]{3,6})'));
  return m ? m[1] : null;
}

(async () => {
  /* ─────────────────────────────────────────────────────────────────
     1. Colour contrast — WCAG 1.4.3 (AA): 4.5:1 for normal text
     ───────────────────────────────────────────────────────────────── */
  R.section('=== 1. Colour contrast (WCAG 1.4.3 AA) ===');

  const lightBlock = src.slice(src.indexOf(':root{'), src.indexOf('}', src.indexOf(':root{')));
  const darkStart = src.indexOf('[data-theme="dark"]{');
  const darkBlock = src.slice(darkStart, src.indexOf('}', darkStart));

  const themes = [
    { name: 'light', block: lightBlock, bgs: ['surface', 'surface2', 'bg'] },
    { name: 'dark', block: darkBlock, bgs: ['surface', 'surface2', 'bg'] },
  ];

  for (const t of themes) {
    for (const fgName of ['text', 'text2', 'text3']) {
      const fg = cssVar(t.block, fgName);
      ok(`${t.name}: --${fgName} is defined`, !!fg, 'not found');
      if (!fg) continue;
      for (const bgName of t.bgs) {
        const bg = cssVar(t.block, bgName);
        if (!bg) continue;
        const ratio = contrast(fg, bg);
        ok(`${t.name}: --${fgName} on --${bgName} meets 4.5:1`,
           ratio >= 4.5, `${ratio.toFixed(2)}:1`);
      }
    }
  }

  /* ─────────────────────────────────────────────────────────────────
     2. Document structure
     ───────────────────────────────────────────────────────────────── */
  R.section('\n=== 2. Document structure ===');
  const { w, d } = loadApp();

  ok('html has a lang attribute', !!d.documentElement.getAttribute('lang'));
  ok('exactly one h1', d.querySelectorAll('h1').length === 1,
     'got ' + d.querySelectorAll('h1').length);
  ok('has section headings', d.querySelectorAll('h2').length >= 6,
     'got ' + d.querySelectorAll('h2').length);
  ok('has a main landmark', d.querySelectorAll('main').length === 1);
  ok('has a nav landmark', d.querySelectorAll('nav').length >= 1);
  ok('no heading is empty',
     Array.from(d.querySelectorAll('h1,h2,h3,h4,h5,h6')).every(h => h.textContent.trim()));

  R.section('\n=== 3. Skip link ===');
  const skip = d.querySelector('.skip-link');
  ok('skip link exists', !!skip);
  ok('skip link is the first focusable element',
     skip && d.querySelector('a[href],button,input') === skip);
  ok('skip link points at the main content',
     skip && !!d.querySelector(skip.getAttribute('href')),
     skip ? skip.getAttribute('href') : 'none');
  ok('skip link is offscreen until focused',
     (cssRule(src, '.skip-link') || '').indexOf('top:-') !== -1);
  ok('skip link becomes visible on focus', !!cssRule(src, '.skip-link:focus'));

  /* ─────────────────────────────────────────────────────────────────
     4. Accessible names
     ───────────────────────────────────────────────────────────────── */
  R.section('\n=== 4. Accessible names ===');
  const named = el =>
    el.hasAttribute('aria-label') ||
    el.hasAttribute('aria-labelledby') ||
    (el.id && d.querySelector(`label[for="${el.id}"]`)) ||
    el.closest('label');

  const inputs = Array.from(d.querySelectorAll('input:not([type="hidden"])'));
  const unnamedInputs = inputs.filter(i => !named(i));
  ok('every input has an accessible name', unnamedInputs.length === 0,
     unnamedInputs.map(i => i.id || i.className).join(', '));

  const buttons = Array.from(d.querySelectorAll('button'));
  const unnamedButtons = buttons.filter(b => !b.textContent.trim() && !named(b));
  ok('every button has an accessible name', unnamedButtons.length === 0,
     unnamedButtons.map(b => b.id || b.className).join(', '));

  /* ─────────────────────────────────────────────────────────────────
     5. Keyboard operability
     ───────────────────────────────────────────────────────────────── */
  R.section('\n=== 5. Keyboard operability ===');
  // A click handler on a non-interactive element is only acceptable when it is
  // a backdrop (dismissible another way) and hidden from AT.
  const clickable = Array.from(d.querySelectorAll('div[onclick],span[onclick]'));
  const notReachable = clickable.filter(e =>
    !e.hasAttribute('role') && !e.hasAttribute('tabindex') &&
    e.getAttribute('aria-hidden') !== 'true' &&
    !/scrim|overlay/.test(e.className));
  ok('no keyboard-unreachable click handlers', notReachable.length === 0,
     notReachable.map(e => e.id || e.className).join(', '));

  ['inc', 'sp-inc', 'hist'].forEach(id => {
    const btn = d.getElementById('phdr-' + id);
    ok(`panel "${id}" toggle is a real button`, btn && btn.tagName === 'BUTTON',
       btn ? btn.tagName : 'missing');
    ok(`panel "${id}" exposes aria-expanded`, btn && btn.hasAttribute('aria-expanded'));
    ok(`panel "${id}" has no nested interactive`,
       btn && btn.querySelectorAll('button,input,a,select,textarea').length === 0);
  });

  w.togglePanel('inc');
  ok('aria-expanded follows the panel state',
     d.getElementById('phdr-inc').getAttribute('aria-expanded') === 'true');
  w.togglePanel('inc');
  ok('aria-expanded resets on collapse',
     d.getElementById('phdr-inc').getAttribute('aria-expanded') === 'false');

  R.section('\n=== 6. Focus visibility ===');
  ok('a :focus-visible ring is defined', src.indexOf(':focus-visible{outline:') !== -1);
  ok('wrapped inputs ring the wrapper', src.indexOf(':has(:focus-visible)') !== -1);
  ok('fallback for browsers without :has()',
     src.indexOf('@supports not selector(:has(*))') !== -1);

  // The ring uses one dedicated colour rather than --accent, so it can be a
  // mid grey instead of near-black without disturbing the rest of the palette.
  const ring = cssVar(lightBlock, 'focus-ring');
  ok('ring has its own custom property', !!ring, 'not found');
  ok('ring is not the near-black accent', ring !== cssVar(lightBlock, 'accent'), ring);
  ok('every focus rule uses it',
     src.indexOf('focus-visible{outline:2px solid var(--accent)') === -1);

  // WCAG 1.4.11: a focus indicator needs 3:1 against adjacent colours. The ring
  // can land on any surface in either theme, and on the dark summary bar.
  if (ring) {
    const surfaces = [
      ['light --surface',  cssVar(lightBlock, 'surface')],
      ['light --surface2', cssVar(lightBlock, 'surface2')],
      ['light --bg',       cssVar(lightBlock, 'bg')],
      ['summary bar',      cssVar(lightBlock, 'accent')],
      ['dark --surface',   cssVar(darkBlock, 'surface')],
      ['dark --surface2',  cssVar(darkBlock, 'surface2')],
      ['dark --bg',        cssVar(darkBlock, 'bg')],
    ];
    surfaces.forEach(([label, bg]) => {
      if (!bg) return;
      const r = contrast(ring, bg);
      ok(`ring meets 3:1 on ${label}`, r >= 3, `${r.toFixed(2)}:1`);
    });
  }

  /* ─────────────────────────────────────────────────────────────────
     7. Dialogs: focus trap and restore
     ───────────────────────────────────────────────────────────────── */
  R.section('\n=== 7. Dialog focus management ===');
  const opener = d.getElementById('mode-quick');
  opener.focus();
  ok('focus starts on the opener', d.activeElement === opener);

  w.openModal('settings');
  await new Promise(r => setTimeout(r, 60));
  const overlay = d.getElementById('overlay-settings');
  ok('focus moves into the dialog', overlay.contains(d.activeElement),
     d.activeElement && d.activeElement.id);

  // Tab from the last focusable must wrap to the first, not escape the dialog
  const focusables = w.focusablesIn(overlay);
  ok('dialog reports focusable children', focusables.length > 1, 'got ' + focusables.length);
  focusables[focusables.length - 1].focus();
  d.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
  ok('Tab wraps to the first control', d.activeElement === focusables[0],
     d.activeElement && (d.activeElement.id || d.activeElement.className));

  focusables[0].focus();
  d.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true }));
  ok('Shift+Tab wraps to the last control',
     d.activeElement === focusables[focusables.length - 1]);

  w.closeModal('settings');
  ok('focus returns to the opener', d.activeElement === opener,
     d.activeElement && d.activeElement.id);

  ok('every dialog declares aria-modal',
     Array.from(d.querySelectorAll('[role="dialog"]')).every(x => x.getAttribute('aria-modal') === 'true'));

  // The destructive button must not be the default target
  w.askConfirm('T', 'msg', 'sub', 'Delete', () => {});
  await new Promise(r => setTimeout(r, 60));
  ok('confirm focuses Cancel, not the destructive action',
     d.activeElement && !d.activeElement.classList.contains('danger'),
     d.activeElement && d.activeElement.className);
  w.closeConfirm();

  /* ─────────────────────────────────────────────────────────────────
     8. Live regions
     ───────────────────────────────────────────────────────────────── */
  R.section('\n=== 8. Live regions ===');
  const status = d.getElementById('a11y-status');
  ok('status region exists', !!status);
  ok('is polite, not assertive', status.getAttribute('aria-live') === 'polite');
  ok('is atomic so the whole sentence is read', status.getAttribute('aria-atomic') === 'true');
  ok('is visually hidden', status.className.indexOf('sr-only') !== -1);

  d.getElementById('mrp').value = '1000';
  w.setCM('excl'); d.getElementById('cpd').value = '40';
  w.setSM('excl'); d.getElementById('spd').value = '25';
  w.calc();
  ok('announcement is debounced, not immediate', status.textContent === '');
  await new Promise(r => setTimeout(r, 800));
  ok('announces the profit', status.textContent.indexOf('Profit') !== -1, status.textContent);
  ok('announces GP and markup',
     status.textContent.indexOf('GP') !== -1 && status.textContent.indexOf('Markup') !== -1);

  d.getElementById('floor-gp').value = '90';
  w.calc();
  await new Promise(r => setTimeout(r, 800));
  ok('warns when below the floor', status.textContent.indexOf('below your floor') !== -1,
     status.textContent);
  d.getElementById('floor-gp').value = '5';

  R.section('\n=== 9. Reduced motion ===');
  ok('honours prefers-reduced-motion', src.indexOf('@media(prefers-reduced-motion:reduce)') !== -1);
  ok('animations are neutralised',
     /prefers-reduced-motion[\s\S]{0,400}animation-duration:\s*\.001ms/.test(src));
  ok('transitions are neutralised',
     /prefers-reduced-motion[\s\S]{0,400}transition-duration:\s*\.001ms/.test(src));

  R.section('\n=== 10. Zoom is not blocked (WCAG 1.4.4) ===');
  const vp = src.match(/name="viewport" content="([^"]+)"/)[1];
  ok('user-scalable is not disabled', vp.indexOf('user-scalable=no') === -1, vp);
  ok('maximum-scale allows at least 2x', /maximum-scale=([2-9]|\d{2,})/.test(vp), vp);

  /* ─────────────────────────────────────────────────────────────────
     11. axe-core over every visible state
     ───────────────────────────────────────────────────────────────── */
  R.section('\n=== 11. axe-core (WCAG 2.0/2.1 A + AA, best practice) ===');
  const axeSrc = fs.readFileSync(require.resolve('axe-core'), 'utf8');
  const { w: aw, d: ad } = loadApp();
  aw.eval(axeSrc);

  aw.setGST(18);
  ad.getElementById('mrp').value = '1000';
  aw.setCM('excl'); ad.getElementById('cpd').value = '40';
  aw.setSM('excl'); ad.getElementById('spd').value = '25';
  aw.calc();
  aw.saveToHistory();
  aw.qtAddLine();
  aw.qtSet(0, 'mrp', '1000'); aw.qtSet(0, 'cpd', '40'); aw.qtSet(0, 'spd', '25');

  const TAGS = { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'] } };
  const describe = v => v.map(x => `${x.id}(${x.nodes.length})`).join(', ');

  const base = await aw.axe.run(ad, Object.assign({ resultTypes: ['violations'] }, TAGS));
  ok('default view has no violations', base.violations.length === 0, describe(base.violations));

  // The two converters open through their own functions, not openModal.
  const OPENERS = { convert: [aw.openConvert, aw.closeConvert],
                    ccyconv: [aw.openCcyConv, aw.closeCcyConv] };
  for (const id of ['settings', 'quote', 'whatif', 'shortcuts', 'presets', 'convert', 'ccyconv']) {
    if (id === 'presets') aw.renderPresetManager();
    if (OPENERS[id]) OPENERS[id][0](); else aw.openModal(id);
    const r = await aw.axe.run(ad.getElementById('overlay-' + id),
      Object.assign({ resultTypes: ['violations'] }, TAGS));
    ok(`${id} dialog has no violations`, r.violations.length === 0, describe(r.violations));
    if (OPENERS[id]) OPENERS[id][1](); else aw.closeModal(id);
  }

  // The Tools menu is a disclosure, not a dialog: axe only sees it open.
  aw.openTools();
  const tm = await aw.axe.run(ad.getElementById('hbtn-tools-wrap'),
    Object.assign({ resultTypes: ['violations'] }, TAGS));
  ok('the open Tools menu has no violations', tm.violations.length === 0, describe(tm.violations));
  ok('and its items are reachable by keyboard while it is open',
     aw.focusablesIn(ad.getElementById('tools-menu')).length === 3,
     String(aw.focusablesIn(ad.getElementById('tools-menu')).length));
  aw.closeTools();
  ok('and out of the tab order once it closes',
     !ad.getElementById('tools-menu').classList.contains('open') &&
     aw.getComputedStyle(ad.getElementById('tools-menu')).display === 'none',
     aw.getComputedStyle(ad.getElementById('tools-menu')).display);

  // The text-entry dialog replaced window.prompt(), so unlike a native dialog
  // it is part of the page and has to satisfy the same rules as the rest.
  aw.askPrompt({ title: 'Save preset', message: 'Name it.', label: 'Preset name',
                 value: 'x', okLabel: 'Save', onOk: function () {} });
  const pr = await aw.axe.run(ad.getElementById('overlay-prompt'),
    Object.assign({ resultTypes: ['violations'] }, TAGS));
  ok('text-entry dialog has no violations', pr.violations.length === 0, describe(pr.violations));
  aw.closePrompt();

  aw.openCompare(0);
  const cmp = await aw.axe.run(ad.getElementById('overlay-compare'),
    Object.assign({ resultTypes: ['violations'] }, TAGS));
  ok('compare dialog has no violations', cmp.violations.length === 0, describe(cmp.violations));
  aw.closeModal('compare');

  aw.toggleFab();
  const fab = await aw.axe.run(ad.getElementById('fab-wrap'),
    Object.assign({ resultTypes: ['violations'] }, TAGS));
  ok('FAB menu has no violations', fab.violations.length === 0, describe(fab.violations));
  aw.closeFab();

  R.section('\n=== 12. Foreground colours survive both themes ===');
  // --accent is a FILL: white text sits on it. Used as a foreground it becomes
  // near-black on near-black in the dark theme — which is how the FAB menu
  // icons ended up at 1.09:1, effectively invisible.
  const ink = { light: cssVar(lightBlock, 'accent-ink'), dark: cssVar(darkBlock, 'accent-ink') };
  ok('--accent-ink is defined for light', !!ink.light, 'missing');
  ok('--accent-ink is defined for dark', !!ink.dark, 'missing');
  ok('the dark value differs from --accent',
     ink.dark && ink.dark !== cssVar(darkBlock, 'accent'), ink.dark);

  [['light', lightBlock, ink.light], ['dark', darkBlock, ink.dark]].forEach(([name, blk, fg]) => {
    if (!fg) return;
    ['surface', 'surface2', 'bg'].forEach(bgName => {
      const bg = cssVar(blk, bgName);
      if (!bg) return;
      const r = contrast(fg, bg);
      // Icons are non-text UI components: WCAG 1.4.11 asks for 3:1.
      ok(`${name}: --accent-ink on --${bgName} meets 3:1`, r >= 3, `${r.toFixed(2)}:1`);
    });
  });

  ok('the FAB icons use it', /\.fab-item svg\{[^}]*var\(--accent-ink\)/.test(src));
  ok('no rule paints a foreground with --accent',
     !/(?<!border-)color:var\(--accent\)[;}]/.test(src),
     'a foreground still uses the fill colour');

  R.finish();
})().catch(e => {
  console.error(e);
  process.exit(1);
});
