/**
 * Modes and secondary-feature suite.
 *
 * A coverage audit found the feature suite concentrated on incentives, history
 * and the newer additions, while several long-standing capabilities had no
 * assertions at all — including the three solve modes and the price input
 * modes, which are core calculation paths.
 *
 * This suite covers what was missing: solve modes, price input modes, profit
 * display modes, what-if scenarios, the comparison modal, Quick mode, wizard
 * mode, share-link round trips through a real URL, summary text, theming and
 * auto-save.
 */
'use strict';

const { loadApp, numOf, Reporter } = require('./harness');

const R = new Reporter('Modes suite');
const ok = R.ok.bind(R);

const { w, d } = loadApp();
const num = id => numOf(d, id);
const near = (a, b, tol) => Math.abs(a - b) < (tol === undefined ? 0.01 : tol);

/** Put the calculator in a known state: MRP 1000, CP 40% off, SP 25% off, 18% GST. */
function base() {
  w.localStorage.clear();
  w.HISTORY.length = 0;
  w.setGST(18);
  w.setT('profit');
  w.setPM('val');
  d.getElementById('landed').value = '';
  d.getElementById('qty').value = '1';
  w.setRounding('off');
  ['cd', 'eb', 'qt', 'an', 'sc'].forEach(k => {
    const a = d.getElementById('it-' + k), b = d.getElementById('sit-' + k);
    if (a) { a.checked = false; w.syncToggle(k); }
    if (b) { b.checked = false; w.syncSpToggle(k); }
  });
  w.setCM('excl'); d.getElementById('cpd').value = '40';
  w.setSM('excl'); d.getElementById('spd').value = '25';
  d.getElementById('mrp').value = '1000';
  w.calc();
}

/* ═══════════════════════════════════════════════════════════════════════ */
R.section('=== 1. Price maths primitives ===');
base();
// "Discount excl GST": the discount applies to MRP-incl and yields the
// excl-GST price. "Nett discount incl GST" discounts the incl-GST price.
const pExcl = w.priceFromDisc(40, 'excl');
ok('excl mode: 40% off 1000 gives excl 600', near(pExcl.e, 600), 'got ' + pExcl.e);
ok('excl mode: incl follows the GST rate', near(pExcl.i, 708), 'got ' + pExcl.i);
const pIncl = w.priceFromDisc(40, 'incl');
ok('incl mode: 40% off 1000 gives incl 600', near(pIncl.i, 600), 'got ' + pIncl.i);
ok('incl mode: excl is grossed down', near(pIncl.e, 600 / 1.18), 'got ' + pIncl.e);

const mIncl = w.priceFromManual(590, 'incl');
ok('manual incl: excl derived', near(mIncl.e, 590 / 1.18), 'got ' + mIncl.e);
const mExcl = w.priceFromManual(500, 'excl');
ok('manual excl: incl derived', near(mExcl.i, 590), 'got ' + mExcl.i);
ok('manual rejects zero and negatives',
   w.priceFromManual(0, 'incl') === null && w.priceFromManual(-5, 'incl') === null);

ok('discFromPrice inverts priceFromDisc',
   near(w.discFromPrice(600).de, 40), 'got ' + w.discFromPrice(600).de);

R.section('\n=== 2. Solve for Selling Price ===');
base();
w.setT('sp');
ok('mode recorded', w.T === 'sp');
w.setPM('val');
d.getElementById('pri').value = '200';
w.calc();
// eff CP 600 + 200 profit => SP excl 800
ok('₹ target gives SP excl 800', near(w.LAST_SP.e, 800, 0.05), 'got ' + w.LAST_SP.e);
ok('spFromProfit(val)', near(w.spFromProfit(600, 'val', 200), 800));
ok('spFromProfit(gp): 600/(1-0.25)=800', near(w.spFromProfit(600, 'gp', 25), 800));
ok('spFromProfit(margin): 600*1.25=750', near(w.spFromProfit(600, 'margin', 25), 750));
ok('spFromProfit rejects GP >= 100', w.spFromProfit(600, 'gp', 100) === null);

w.setPM('gp');
d.getElementById('pri').value = '25';
w.calc();
ok('GP target drives SP', near(w.LAST_SP.e, 800, 0.05), 'got ' + w.LAST_SP.e);
ok('resulting GP reads back as 25%', near(num('s-gp'), 25, 0.05), 'got ' + num('s-gp'));

w.setPM('margin');
d.getElementById('pri').value = '25';
w.calc();
ok('margin target drives SP', near(w.LAST_SP.e, 750, 0.05), 'got ' + w.LAST_SP.e);
ok('resulting margin reads back as 25%', near(num('s-mg'), 25, 0.05), 'got ' + num('s-mg'));

R.section('\n=== 3. Solve for Cost Price ===');
base();
w.setT('cp');
w.setPM('val');
d.getElementById('pri').value = '150';
w.calc();
// SP excl 750, profit 150 => eff CP 600, no incentives so CP excl 600
ok('₹ target gives CP excl 600', near(w.LAST_CP.e, 600, 0.05), 'got ' + w.LAST_CP.e);
ok('cpFromProfit(val)', near(w.cpFromProfit(750, 'val', 150).e, 600));
ok('cpFromProfit(gp): 750*(1-0.2)=600', near(w.cpFromProfit(750, 'gp', 20).e, 600));
ok('cpFromProfit(margin): 750/1.25=600', near(w.cpFromProfit(750, 'margin', 25).e, 600));
ok('cpFromProfit refuses impossible targets', w.cpFromProfit(750, 'val', 800) === null);

// With an incentive, the solver must invert it: a 10% incentive means list CP
// has to be higher for the same effective cost.
d.getElementById('it-eb').checked = true;
d.getElementById('iv-eb').value = '10';
w.syncToggle('eb');
w.calc();
ok('CP solver inverts the incentive', near(w.LAST_CP.e, 600 / 0.9, 0.5), 'got ' + w.LAST_CP.e);
ok('effective CP still lands on target', near(w.effectiveCP(w.LAST_CP), 600, 0.5),
   'got ' + w.effectiveCP(w.LAST_CP));

// And the landed cost, which is added after incentives
d.getElementById('landed').value = '30';
w.calc();
ok('CP solver accounts for landed cost',
   near(w.effectiveCP(w.LAST_CP), 600, 0.5), 'got ' + w.effectiveCP(w.LAST_CP));
d.getElementById('landed').value = '';

R.section('\n=== 4. Price input modes ===');
base();
w.setCM('manual');
w.setCPManual('incl');
d.getElementById('cpv').value = '708';
w.calc();
ok('manual CP incl GST resolves', near(w.LAST_CP.e, 600, 0.05), 'got ' + w.LAST_CP.e);
w.setCPManual('excl');
d.getElementById('cpv').value = '600';
w.calc();
ok('manual CP excl GST resolves', near(w.LAST_CP.e, 600, 0.05), 'got ' + w.LAST_CP.e);
ok('mode flags are recorded', w.CM === 'manual' && w.CPMS === 'excl');

w.setSM('incl');
d.getElementById('spd').value = '25';
w.calc();
ok('SP nett-discount mode discounts the incl price',
   near(w.LAST_SP.i, 750, 0.05), 'got ' + w.LAST_SP.i);
w.setSM('manual');
w.setSPManual('incl');
d.getElementById('spv').value = '885';
w.calc();
ok('manual SP incl GST resolves', near(w.LAST_SP.e, 750, 0.05), 'got ' + w.LAST_SP.e);

R.section('\n=== 5. What-if scenarios ===');
base();
w.WI_SCENES[0] = { spDisc: '25', spMode: 'excl', spVal: '', spManualSub: 'incl' };
w.WI_SCENES[1] = { spDisc: '20', spMode: 'excl', spVal: '', spManualSub: 'incl' };
w.WI_SCENES[2] = { spDisc: '', spMode: 'manual', spVal: '900', spManualSub: 'incl' };
const s0 = w.resolveWiSP(w.WI_SCENES[0]);
const s1 = w.resolveWiSP(w.WI_SCENES[1]);
const s2 = w.resolveWiSP(w.WI_SCENES[2]);
ok('scenario A resolves from a discount', near(s0.e, 750), 'got ' + s0.e);
ok('scenario B resolves from a discount', near(s1.e, 800), 'got ' + s1.e);
ok('scenario C resolves from a manual price', near(s2.e, 900 / 1.18), 'got ' + s2.e);
ok('an empty scenario resolves to null',
   w.resolveWiSP({ spDisc: '', spMode: 'excl', spVal: '', spManualSub: 'incl' }) === null);

let threw = false;
try { w.openModal('whatif'); } catch (e) { threw = true; console.log('   ' + e.message); }
ok('what-if modal renders without throwing', !threw);
ok('a card per scenario', d.querySelectorAll('#wi-grid .wi-card').length === 3,
   'got ' + d.querySelectorAll('#wi-grid .wi-card').length);
ok('the best GP is highlighted', d.querySelectorAll('#wi-grid .wi-best').length === 1,
   'got ' + d.querySelectorAll('#wi-grid .wi-best').length);
threw = false;
try { w.updateWiResults(); } catch (e) { threw = true; }
ok('result-only refresh does not throw', !threw);
w.closeModal('whatif');

// Regression: renderWhatIf empties #wi-grid and rebuilds cells with the same
// ids, so every node el() had cached becomes detached. Before elClearCache()
// was added, updateWiResults wrote into the old nodes and every re-open after
// the first showed '—'.
let wiDiag = '';
ok('what-if respects incentives and landed cost', (() => {
  d.getElementById('landed').value = '50';
  w.calc();
  w.openModal('whatif');
  const txt = d.getElementById('wi-grid').textContent;
  const effCP = w.effectiveCP(w.LAST_CP);
  wiDiag = 'effCP=' + effCP + ' scenA=' + JSON.stringify(w.WI_SCENES[0]) +
           ' profitSeen=' + (txt.match(/Profit[^G]{0,14}/) || ['?'])[0];
  d.getElementById('landed').value = '';
  w.closeModal('whatif');
  w.calc();
  // eff CP becomes 650, so scenario A (SP excl 750) must show ₹100.00 profit
  return effCP === 650 && txt.indexOf('\u20B9100.00') !== -1;
})(), wiDiag);

ok('what-if survives repeated re-renders', (() => {
  const profitOf = () =>
    (d.getElementById('wi-grid').textContent.match(/Profit\s*\u20B9\u20B9([\d,.]+)/) || [])[1];
  w.openModal('whatif');
  const first = profitOf();
  w.closeModal('whatif');
  d.getElementById('it-eb').checked = true;
  d.getElementById('iv-eb').value = '1';
  w.syncToggle('eb'); w.calc();
  w.openModal('whatif');
  const second = profitOf();
  d.getElementById('it-eb').checked = false; w.syncToggle('eb'); w.calc();
  w.closeModal('whatif');
  // A 1% incentive on CP 600 is ₹6, so profit must rise from 150 to 156
  return first === '150.00' && second === '156.00';
})(), 'results went stale across re-render');

R.section('\n=== 6. Comparison modal ===');
base();
w.saveToHistory();
d.getElementById('spd').value = '30';
w.calc();
threw = false;
try { w.openCompare(0); } catch (e) { threw = true; console.log('   ' + e.message); }
ok('compare opens without throwing', !threw);
ok('overlay is open', d.getElementById('overlay-compare').classList.contains('open'));
ok('rows were rendered', d.getElementById('cmp-grid').innerHTML.length > 100);
// Direction must be readable without relying on colour (WCAG 1.4.1)
const cmpHtml = d.getElementById('cmp-grid').innerHTML;
ok('rises and falls carry a direction class',
   /class="dv (up|dn)"/.test(cmpHtml), 'no up/dn classes found');
ok('a falling rupee delta is signed', (() => {
  // Current SP (30% off = 700) is below the saved one (750): a fall.
  const m = cmpHtml.match(/<span class="dv dn">([^<]*)<\/span>/);
  return m && /^[−-]/.test(m[1]);
})(), 'negative delta rendered without a sign');
w.closeModal('compare');
w.HISTORY.length = 0;

R.section('\n=== 7. Summary text and sharing ===');
base();
const txt = w.getSummaryText();
ok('summary text is produced', typeof txt === 'string' && txt.length > 50);
ok('it names the GST rate', txt.indexOf('18') !== -1);
ok('it includes the profit', txt.indexOf('150') !== -1);
ok('it includes GP', txt.indexOf('GP') !== -1);
ok('no summary without a calculation', (() => {
  const m = d.getElementById('mrp').value;
  d.getElementById('mrp').value = ''; w.calc();
  const r = w.getSummaryText();
  d.getElementById('mrp').value = m; w.calc();
  return r === null;
})());

R.section('\n=== 8. Share link round trip through a URL ===');
base();
d.getElementById('it-eb').checked = true;
d.getElementById('iv-eb').value = '3';
w.syncToggle('eb');
d.getElementById('landed').value = '25';
d.getElementById('qty').value = '4';
w.setRounding('5');
w.calc();
const expectProfit = num('pvv');
const state = w.getShareState();
const encoded = w.btoa(unescape(encodeURIComponent(JSON.stringify(state))));

// A second window, restored purely from the URL
const fresh = loadApp();
fresh.w.history.replaceState({}, '', '/?s=' + encodeURIComponent(encoded));
ok('restoreFromUrl reports success', fresh.w.restoreFromUrl() === true);
fresh.w.calc();
ok('GST restored', fresh.w.G === w.G, fresh.w.G + ' vs ' + w.G);
ok('incentive restored', fresh.d.getElementById('it-eb').checked === true);
ok('incentive value restored', fresh.d.getElementById('iv-eb').value === '3');
ok('landed cost restored', fresh.w.getLandedCost() === 25, 'got ' + fresh.w.getLandedCost());
ok('quantity restored', fresh.w.getQty() === 4, 'got ' + fresh.w.getQty());
ok('rounding restored', fresh.w.ROUND_MODE === '5', 'got ' + fresh.w.ROUND_MODE);
ok('profit matches the source window',
   near(numOf(fresh.d, 'pvv'), expectProfit, 0.05),
   numOf(fresh.d, 'pvv') + ' vs ' + expectProfit);
ok('a malformed payload is ignored, not fatal', (() => {
  const f2 = loadApp();
  f2.w.history.replaceState({}, '', '/?s=not-base64!!');
  let t = false;
  try { return f2.w.restoreFromUrl() === false; } catch (e) { t = true; }
  return !t;
})());
w.setRounding('off');

R.section('\n=== 9. Quick mode calculations ===');
base();
w.setMode('quick');
ok('mode switched', w.APP_MODE === 'quick');
w.fcSetGST(18);
d.getElementById('fc-mrp').value = '1000';
ok('quick MRP parses', w.fcResolveMRP() === 1000, 'got ' + w.fcResolveMRP());
w.fcSetCM('excl');
const fcCpEl = d.getElementById('fc-cpd');
if (fcCpEl) fcCpEl.value = '40';
const qcp = w.fcResolveCP(1000);
ok('quick CP resolves independently of the main calc', qcp && near(qcp.e, 600), qcp && qcp.e);
w.fcSetSM('excl');
const fcSpEl = d.getElementById('fc-spd');
if (fcSpEl) fcSpEl.value = '25';
const qsp = w.fcResolveSP(1000);
ok('quick SP resolves', qsp && near(qsp.e, 750), qsp && qsp.e);
threw = false;
try { w.fcCalc(); } catch (e) { threw = true; console.log('   ' + e.message); }
ok('quick calc runs without throwing', !threw);
ok('quick GST is independent of the main rate', (() => {
  w.fcSetGST(5);
  const independent = w.FC_G === 0.05 && w.G === 0.18;
  w.fcSetGST(18);
  return independent;
})());
threw = false;
try { w.fcNext(); w.fcBack(); w.fcReset(); } catch (e) { threw = true; console.log('   ' + e.message); }
ok('quick navigation and reset do not throw', !threw);
w.setMode('default');
ok('back to default mode', w.APP_MODE === 'default');

R.section('\n=== 10. Wizard mode ===');
base();
threw = false;
try {
  w.wzSetT('cp'); w.wzSetGST(18); w.wzSetCM('excl');
  d.getElementById('wz-mrp').value = '1000';
  d.getElementById('wz-disc').value = '40';
  w.wzCalc();
} catch (e) { threw = true; console.log('   ' + e.message); }
ok('wizard calc runs without throwing', !threw);
ok('wizard GST is independent', w.WZ_G === 0.18 && w.wzGetInc({ e: 600, i: 708 }) === 0);
ok('wizard incentives compute', (() => {
  const cb = d.getElementById('wz-it-eb'), iv = d.getElementById('wz-iv-eb');
  if (!cb || !iv) return true;           // wizard markup absent in this build
  cb.checked = true; iv.value = '10';
  const inc = w.wzGetInc({ e: 600, i: 708 });
  cb.checked = false;
  return near(inc, 60, 0.5);
})(), 'wizard incentive maths');
threw = false;
try { w.wzReset(); } catch (e) { threw = true; }
ok('wizard reset does not throw', !threw);

R.section('\n=== 11. Theme ===');
ok('toggleDarkMode sets the attribute', (() => {
  w.toggleDarkMode(true);
  return d.documentElement.getAttribute('data-theme') === 'dark';
})());
ok('and persists the choice', w.localStorage.getItem('pc-theme') === 'dark');
ok('turning it off reverts', (() => {
  w.toggleDarkMode(false);
  return d.documentElement.getAttribute('data-theme') === 'light';
})());
ok('initTheme reads the saved value', (() => {
  w.localStorage.setItem('pc-theme', 'dark');
  w.initTheme();
  const isDark = d.documentElement.getAttribute('data-theme') === 'dark';
  w.toggleDarkMode(false);
  return isDark;
})());

R.section('\n=== 12. Auto-save ===');
base();
w.HISTORY.length = 0;
w.setAutosave(true);
ok('auto-save flag is set', w.AUTOSAVE === true);
ok('both toggles mirror it',
   d.getElementById('autosave-toggle').checked === true &&
   d.getElementById('autosave-toggle-settings').checked === true);
w.setAutosave(false);
ok('turning it off mirrors too',
   d.getElementById('autosave-toggle').checked === false &&
   d.getElementById('autosave-toggle-settings').checked === false);
w.setAutosave(true);

ok('saveToHistory records the current calculation', (() => {
  w.HISTORY.length = 0;
  w.saveToHistory();
  const h = w.HISTORY[0];
  return h && near(h.cpE, 600, 0.05) && near(h.pr, 150, 0.05);
})());
ok('a duplicate save is still recorded manually', (() => {
  const before = w.HISTORY.length;
  w.saveToHistory();
  return w.HISTORY.length === before + 1;
})());
w.HISTORY.length = 0;

R.section('\n=== 13. Floor limits colour the output ===');
base();
d.getElementById('floor-gp').value = '50';   // current GP is 20%
w.calc();
ok('GP below floor is flagged', d.getElementById('s-gp').className.indexOf('warn') !== -1,
   d.getElementById('s-gp').className);
ok('belowFloor agrees', w.belowFloor(20, 50) === true);
ok('a null floor never trips', w.belowFloor(20, null) === false);
d.getElementById('floor-gp').value = '5';
w.calc();
ok('above floor is not flagged', d.getElementById('s-gp').className.indexOf('warn') === -1,
   d.getElementById('s-gp').className);

R.finish();
