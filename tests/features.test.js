/**
 * Feature suite — core calculation, incentives, custom GST, quantity,
 * rounding, undo/redo, quote builder and history search/filter/tags.
 *
 * Drives the real application functions against a jsdom-loaded index.html.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { ROOT, loadApp, numOf, readMarkup, readAsset, Reporter } = require('./harness');

const R = new Reporter('Feature suite');
const ok = R.ok.bind(R);

const { w, d } = loadApp();
const num = id => numOf(d, id);
const near = (a, b, tol) => Math.abs(a - b) < (tol === undefined ? 0.01 : tol);

// Surface anything that escapes a handler during the run
const errs = [];
w.addEventListener('error', e => errs.push(e.message));

console.log('\n=== 1. Baseline load ===');
ok('CP grid rendered', d.querySelectorAll('#cp-inc-grid .inc-row').length === 5,
   'got ' + d.querySelectorAll('#cp-inc-grid .inc-row').length);
ok('SP grid rendered', d.querySelectorAll('#sp-inc-grid .inc-row').length === 5,
   'got ' + d.querySelectorAll('#sp-inc-grid .inc-row').length);
ok('custom GST input exists', !!d.getElementById('gst-custom'));
ok('Edit btn beside chevron (CP)',
   d.getElementById('cp-inc-edit-btn').nextElementSibling === d.getElementById('chev-inc'));
ok('Edit btn beside chevron (SP)',
   d.getElementById('sp-inc-edit-btn').nextElementSibling === d.getElementById('chev-sp-inc'));
ok('no duplicate sc-pct-wrap', d.querySelectorAll('#sc-pct-wrap').length === 1,
   'got ' + d.querySelectorAll('#sc-pct-wrap').length);

console.log('\n=== 2. Basic calculation (MRP 1000, CP 40% off, SP 25% off, GST 18) ===');
w.setGST(18);
d.getElementById('mrp').value = '1000';
w.setCM('excl'); d.getElementById('cpd').value = '40';
w.setSM('excl'); d.getElementById('spd').value = '25';
w.calc();
// 'Discount excl GST' mode: discount applies to MRP-incl, yielding the excl-GST price.
// CP excl = 1000*0.60 = 600 ; SP excl = 1000*0.75 = 750 ; profit = 150
ok('CP excl = 600', Math.abs(w.LAST_CP.e - 600) < 0.01, 'got ' + w.LAST_CP.e);
ok('SP excl = 750', Math.abs(w.LAST_SP.e - 750) < 0.01, 'got ' + w.LAST_SP.e);
ok('profit = 150', Math.abs(num('pvv') - 150) < 0.05, 'got ' + num('pvv'));

console.log('\n=== 3. Toggle a CP incentive -> profit must drop ===');
const before = num('pvv');
d.getElementById('it-eb').checked = true;
w.syncToggle('eb'); w.calc();
const after = num('pvv');
// EB default 1% of CP excl 600 = 6 -> eff CP drops -> profit rises
ok('EB on raises profit by 6', Math.abs((after - before) - 6) < 0.05,
   'before ' + before + ' after ' + after);
ok('inc total shows 6', Math.abs(num('inc-total-inr') - 6) < 0.05, 'got ' + num('inc-total-inr'));

console.log('\n=== 4. Enter EDIT mode on CP -> calc must survive ===');
w.toggleIncEditMode('cp');
ok('edit mode class applied', d.getElementById('cp-inc-grid').classList.contains('edit-mode'));
ok('button says Done', d.getElementById('cp-inc-edit-btn').textContent === 'Done');
ok('delete badges visible', d.querySelectorAll('#cp-inc-grid .inc-del-btn').length === 5,
   'got ' + d.querySelectorAll('#cp-inc-grid .inc-del-btn').length);
ok('label is an input', d.getElementById('lbl-cp-eb').tagName === 'INPUT');
ok('EB checkbox still checked', d.getElementById('it-eb').checked === true);
ok('profit UNCHANGED in edit mode', Math.abs(num('pvv') - after) < 0.01,
   'got ' + num('pvv') + ' expected ' + after);

console.log('\n=== 5. Add a new incentive while in edit mode ===');
w.addInc('cp');
const newKey = w.INC_KEYS[w.INC_KEYS.length - 1];
ok('new key appended', newKey === 'c1', 'got ' + newKey);
ok('new row in DOM', !!d.getElementById('ir-' + newKey));
ok('new row default value 1', d.getElementById('iv-' + newKey).value === '1');
ok('old EB still checked', d.getElementById('it-eb').checked === true);
ok('profit still ' + after, Math.abs(num('pvv') - after) < 0.01, 'got ' + num('pvv'));

console.log('\n=== 6. NEW incentive must affect calculations ===');
const beforeNew = num('pvv');
d.getElementById('it-' + newKey).checked = true;
d.getElementById('iv-' + newKey).value = '10';
w.syncToggle(newKey); w.calc();
const afterNew = num('pvv');
// 10% of CP excl 600 = 60
ok('new incentive adds 60 profit', Math.abs((afterNew - beforeNew) - 60) < 0.05,
   'before ' + beforeNew + ' after ' + afterNew);
ok('inc total now 66 (6 + 60)', Math.abs(num('inc-total-inr') - 66) < 0.05, 'got ' + num('inc-total-inr'));

console.log('\n=== 7. Exit edit mode -> state + calc preserved ===');
w.toggleIncEditMode('cp');
ok('button says Edit', d.getElementById('cp-inc-edit-btn').textContent === 'Edit');
ok('label back to span', d.getElementById('lbl-cp-eb').tagName === 'SPAN');
ok('new incentive still checked', d.getElementById('it-' + newKey).checked === true);
ok('new incentive value kept', d.getElementById('iv-' + newKey).value === '10');
ok('profit preserved', Math.abs(num('pvv') - afterNew) < 0.01, 'got ' + num('pvv'));

console.log('\n=== 8. Delete the CD incentive -> no crash, calc updates ===');
d.getElementById('it-cd').checked = true; w.syncToggle('cd'); w.calc();
const withCD = num('pvv');
w.doDeleteInc('cp', 'cd');
ok('cd removed from INC_KEYS', w.INC_KEYS.indexOf('cd') === -1);
ok('cd row gone from DOM', !d.getElementById('ir-cd'));
ok('profit dropped back', Math.abs(num('pvv') - afterNew) < 0.05,
   'got ' + num('pvv') + ' expected ' + afterNew);
ok('CD deletion did not break summary tag', !!d.getElementById('inc-summary-tag').textContent);

console.log('\n=== 9. setCDMode / setSchemeMode after CD deleted (was a crash) ===');
let crashed = false;
try { w.setCDMode('after'); } catch (e) { crashed = true; }
ok('setCDMode does not throw when cd deleted', !crashed);
crashed = false;
try { w.resetAll(); } catch (e) { crashed = true; console.log('    ' + e.message); }
ok('resetAll does not throw when cd deleted', !crashed);

console.log('\n=== 10. Custom GST rate ===');
d.getElementById('mrp').value = '1000';
w.setCM('excl'); d.getElementById('cpd').value = '40';
w.setSM('excl'); d.getElementById('spd').value = '25';
w.setGST(12);
w.calc();
ok('G updated to 0.12', Math.abs(w.G - 0.12) < 1e-9, 'got ' + w.G);
ok('grate label shows 12%', d.getElementById('grate').textContent === '12%',
   'got ' + d.getElementById('grate').textContent);
ok('18% pill deselected', d.getElementById('g18').className === 'pill');
ok('5% pill deselected', d.getElementById('g5').className === 'pill');
ok('custom input shows 12', d.getElementById('gst-custom').value === '12',
   'got ' + d.getElementById('gst-custom').value);
// excl-disc mode is GST-independent for the excl prices, but incl prices must follow the new rate.
ok('profit still 150 at 12% GST', Math.abs(num('pvv') - 150) < 0.05, 'got ' + num('pvv'));
ok('CP incl uses 12% GST (672)', Math.abs(w.LAST_CP.i - 672) < 0.05, 'got ' + w.LAST_CP.i);
ok('SP incl uses 12% GST (840)', Math.abs(w.LAST_SP.i - 840) < 0.05, 'got ' + w.LAST_SP.i);
ok('GST labels updated to 12%',
   d.getElementById('s-lbl-cp').textContent.indexOf('12%') !== -1,
   'got ' + d.getElementById('s-lbl-cp').textContent);

console.log('\n=== 11. Switch back to preset clears custom box ===');
w.setGST(18);
ok('custom input cleared', d.getElementById('gst-custom').value === '',
   'got "' + d.getElementById('gst-custom').value + '"');
ok('18% pill active', d.getElementById('g18').className === 'pill on');

console.log('\n=== 12. Decimal GST rate ===');
w.setGST(1.5);
ok('G = 0.015', Math.abs(w.G - 0.015) < 1e-9, 'got ' + w.G);
ok('grate shows 1.5%', d.getElementById('grate').textContent === '1.5%',
   'got ' + d.getElementById('grate').textContent);

console.log('\n=== 13. SP panel edit mode ===');
w.setGST(18);
crashed = false;
try {
  w.toggleIncEditMode('sp');
  w.addInc('sp');
  w.doDeleteInc('sp', 'cd');
  w.toggleIncEditMode('sp');
} catch (e) { crashed = true; console.log('    ' + e.message); }
ok('SP add/delete/toggle does not throw', !crashed);
ok('SP cd removed', w.SP_INC_KEYS.indexOf('cd') === -1);

console.log('\n=== 14. Share-state round trip preserves SP incentives ===');
w.resetAll();
d.getElementById('mrp').value = '1000';
w.setCM('excl'); d.getElementById('cpd').value = '40';
w.setSM('excl'); d.getElementById('spd').value = '25';
const spKey = w.SP_INC_KEYS[0];
d.getElementById('sit-' + spKey).checked = true;
d.getElementById('siv-' + spKey).value = '7';
w.syncSpToggle(spKey); w.calc();
const st = w.getShareState();
ok('share state has spinc', !!st.spinc && !!st.spinc[spKey]);
ok('spinc records on=true', st.spinc[spKey].on === true);
ok('spinc records value 7', st.spinc[spKey].v === '7');
const profitWithSpInc = num('pvv');
// wipe it
d.getElementById('sit-' + spKey).checked = false;
w.syncSpToggle(spKey); w.calc();
ok('profit changed after clearing SP inc', Math.abs(num('pvv') - profitWithSpInc) > 0.5);
w.applyShareState(st);
w.calc();
ok('SP incentive restored', d.getElementById('sit-' + spKey).checked === true);
ok('profit restored', Math.abs(num('pvv') - profitWithSpInc) < 0.05,
   'got ' + num('pvv') + ' expected ' + profitWithSpInc);

console.log('\n=== 15. Label persistence ===');
w.INC_LABELS['eb'] = 'My Custom Rebate';
w.saveLabels();
const stored = JSON.parse(w.localStorage.getItem('pc-labels'));
ok('labels saved with keys', !!stored.labels && Array.isArray(stored.cpKeys) && Array.isArray(stored.spKeys));
ok('custom label persisted', stored.labels.eb === 'My Custom Rebate');
w.renderCPIncRows();
ok('custom label rendered', d.getElementById('lbl-cp-eb').textContent === 'My Custom Rebate',
   'got ' + d.getElementById('lbl-cp-eb').textContent);

console.log('\n=== 16. Settings modal no longer has Incentive Labels ===');
ok('acc-btn-labels removed', !d.getElementById('acc-btn-labels'));
ok('lbl-input-cd removed', !d.getElementById('lbl-input-cd'));

console.log('\n=== 17. User-added incentive: %/₹ option (CP) ===');
w.localStorage.clear();
w.INC_KEYS.length=0; ['cd','eb','qt','an','sc'].forEach(k=>w.INC_KEYS.push(k));
w.SP_INC_KEYS.length=0; ['cd','eb','qt','an','sc'].forEach(k=>w.SP_INC_KEYS.push(k));
w.INC_MODE={}; w.SP_INC_MODE={};
w.renderCPIncRows(); w.renderSPIncRows();
w.resetAll();
w.setGST(18);
d.getElementById('mrp').value='1000';
w.setCM('excl'); d.getElementById('cpd').value='40';
w.setSM('excl'); d.getElementById('spd').value='25';
w.calc();
const base = num('pvv');
ok('baseline profit 150', Math.abs(base-150)<0.05, 'got '+base);

w.addInc('cp');
const ck = w.INC_KEYS[w.INC_KEYS.length-1];
ok('CP: mode sub-row rendered', !!d.getElementById('im-cp-'+ck+'-pct') && !!d.getElementById('im-cp-'+ck+'-abs'));
ok('CP: defaults to percentage', w.incModeOf('cp',ck)==='pct');
ok('CP: pct tab active', d.getElementById('im-cp-'+ck+'-pct').className==='stab on');
ok('CP: unit shows %', d.getElementById('unit-cp-'+ck).textContent==='%');

d.getElementById('it-'+ck).checked=true;
d.getElementById('iv-'+ck).value='10';
w.syncToggle(ck); w.calc();
ok('CP: 10% of 600 = 60 profit gain', Math.abs((num('pvv')-base)-60)<0.05, 'got '+num('pvv'));

console.log('\n=== 18. Switch that incentive to ₹ Absolute ===');
w.setIncMode('cp',ck,'abs');
ok('CP: mode is abs', w.incModeOf('cp',ck)==='abs');
ok('CP: abs tab active', d.getElementById('im-cp-'+ck+'-abs').className==='stab on');
ok('CP: pct tab inactive', d.getElementById('im-cp-'+ck+'-pct').className==='stab');
ok('CP: unit shows ₹', d.getElementById('unit-cp-'+ck).textContent==='₹');
ok('CP: max attr removed', !d.getElementById('iv-'+ck).hasAttribute('max'));
// value 10 now means flat ₹10, not 10%
ok('CP: ₹10 flat = 10 profit gain', Math.abs((num('pvv')-base)-10)<0.05, 'got '+num('pvv'));
ok('CP: inc total = 10', Math.abs(num('inc-total-inr')-10)<0.05, 'got '+num('inc-total-inr'));
ok('CP: summary tag mentions fixed ₹',
   d.getElementById('inc-summary-tag').textContent.indexOf('fixed')!==-1,
   'got '+d.getElementById('inc-summary-tag').textContent);

console.log('\n=== 19. ₹ incentive survives edit-mode round trip ===');
w.toggleIncEditMode('cp');
ok('still abs in edit mode', w.incModeOf('cp',ck)==='abs');
ok('abs tab still active in edit mode', d.getElementById('im-cp-'+ck+'-abs').className==='stab on');
ok('unit still ₹ in edit mode', d.getElementById('unit-cp-'+ck).textContent==='₹');
w.toggleIncEditMode('cp');
ok('abs preserved after Done', w.incModeOf('cp',ck)==='abs');
ok('value preserved', d.getElementById('iv-'+ck).value==='10');
ok('profit preserved', Math.abs((num('pvv')-base)-10)<0.05, 'got '+num('pvv'));

console.log('\n=== 20. Same option on the SP panel ===');
const spBase = num('pvv');
w.addInc('sp');
const sk = w.SP_INC_KEYS[w.SP_INC_KEYS.length-1];
ok('SP: mode sub-row rendered', !!d.getElementById('im-sp-'+sk+'-pct') && !!d.getElementById('im-sp-'+sk+'-abs'));
ok('SP: defaults to percentage', w.incModeOf('sp',sk)==='pct');
d.getElementById('sit-'+sk).checked=true;
d.getElementById('siv-'+sk).value='10';
w.syncSpToggle(sk); w.calc();
// 10% of SP excl 750 = 75 -> eff SP drops -> profit drops 75
ok('SP: 10% of 750 drops profit by 75', Math.abs((spBase-num('pvv'))-75)<0.05, 'got '+num('pvv'));
w.setIncMode('sp',sk,'abs');
ok('SP: unit shows ₹', d.getElementById('unit-sp-'+sk).textContent==='₹');
ok('SP: ₹10 flat drops profit by 10', Math.abs((spBase-num('pvv'))-10)<0.05, 'got '+num('pvv'));
ok('SP: sp inc total = 10', Math.abs(num('sp-inc-total-inr')-10)<0.05, 'got '+num('sp-inc-total-inr'));
ok('CP and SP modes independent',
   w.incModeOf('cp',ck)==='abs' && w.incModeOf('sp',sk)==='abs' && w.INC_MODE!==w.SP_INC_MODE);

console.log('\n=== 21. ₹ incentives excluded from computeK (solve-for-CP) ===');
crashed=false;
try{ w.setT('cp'); d.getElementById('pri').value='100'; w.calc(); w.setT('profit'); }
catch(e){ crashed=true; console.log('    '+e.message); }
ok('solve-for-CP with ₹ incentives does not throw', !crashed);

console.log('\n=== 22. Modes persist to localStorage and share links ===');
w.saveLabels();
const st2=JSON.parse(w.localStorage.getItem('pc-labels'));
ok('cpModes saved', !!st2.cpModes && st2.cpModes[ck]==='abs');
ok('spModes saved', !!st2.spModes && st2.spModes[sk]==='abs');
const share=w.getShareState();
ok('share state carries incm', !!share.incm && share.incm[ck]==='abs');
ok('share state carries spincm', !!share.spincm && share.spincm[sk]==='abs');
w.INC_MODE={}; w.SP_INC_MODE={};
ok('modes cleared', w.incModeOf('cp',ck)==='pct');
w.applyShareState(share); w.calc();
ok('cp mode restored from share', w.incModeOf('cp',ck)==='abs');
ok('sp mode restored from share', w.incModeOf('sp',sk)==='abs');
ok('restored unit shows ₹', d.getElementById('unit-cp-'+ck).textContent==='₹');

console.log('\n=== 23. Built-in rows unchanged (no %/₹ toggle) ===');
ok('eb has no mode toggle', !d.getElementById('im-cp-eb-pct'));
ok('qt has no mode toggle', !d.getElementById('im-cp-qt-pct'));
ok('scheme keeps its own toggle', !!d.getElementById('scm-pct') && !!d.getElementById('scm-abs'));

// ── Helper: put the app in a clean, known state ──
function freshCalc(mrp, cpd, spd, gst) {
  w.localStorage.clear();
  w.INC_KEYS.length = 0; ['cd','eb','qt','an','sc'].forEach(k => w.INC_KEYS.push(k));
  w.SP_INC_KEYS.length = 0; ['cd','eb','qt','an','sc'].forEach(k => w.SP_INC_KEYS.push(k));
  w.INC_MODE = {}; w.SP_INC_MODE = {};
  // Labels are stored independently of the key list — reset them too
  ['cd','eb','qt','an','sc'].forEach(k => { w.INC_LABELS[k] = w.INC_LABELS_DEFAULT[k]; });
  w.renderCPIncRows(); w.renderSPIncRows();
  w.setRounding('off');
  w.HISTORY.length = 0; w.QUOTE.length = 0;
  w.UNDO.length = 0; w.REDO.length = 0;
  w.updateUndoBtns();           // stack was emptied directly, resync the buttons
  w.setHistQuery(''); w.setHistFilter('all');
  w.setGST(gst || 18);
  d.getElementById('mrp').value = String(mrp);
  d.getElementById('qty').value = '1';
  w.setCM('excl'); d.getElementById('cpd').value = String(cpd);
  w.setSM('excl'); d.getElementById('spd').value = String(spd);
  w.calc();
}

console.log('\n=== 24. Quantity: order totals ===');
freshCalc(1000, 40, 25);
ok('qty input exists', !!d.getElementById('qty'));
ok('qty defaults to 1', w.getQty() === 1, 'got ' + w.getQty());
ok('order rows hidden at qty 1', d.getElementById('s-item-qty').style.display === 'none');
ok('unit profit 150', Math.abs(num('pvv') - 150) < 0.05, 'got ' + num('pvv'));

d.getElementById('qty').value = '10'; w.calc();
ok('getQty reads 10', w.getQty() === 10);
ok('order rows now visible', d.getElementById('s-item-qty').style.display !== 'none');
ok('summary qty shows 10 units', d.getElementById('s-qty').textContent === '10 units',
   'got ' + d.getElementById('s-qty').textContent);
ok('total profit = 1500', Math.abs(num('s-tpr') - 1500) < 0.05, 'got ' + num('s-tpr'));
// order value = SP incl GST (750*1.18=885) * 10 = 8850
ok('order value = 8850', Math.abs(num('s-order') - 8850) < 0.5, 'got ' + num('s-order'));
ok('per-unit profit unchanged by qty', Math.abs(num('pvv') - 150) < 0.05, 'got ' + num('pvv'));

w.stepQty(1);
ok('stepQty(+1) -> 11', w.getQty() === 11, 'got ' + w.getQty());
w.stepQty(-5);
ok('stepQty(-5) -> 6', w.getQty() === 6, 'got ' + w.getQty());
d.getElementById('qty').value = '0'; 
ok('qty floors at 1', w.getQty() === 1, 'got ' + w.getQty());

console.log('\n=== 25. Quantity flows into history ===');
freshCalc(1000, 40, 25);
d.getElementById('qty').value = '4'; w.calc();
w.saveToHistory();
ok('history entry stores qty', w.HISTORY[0].qty === 4, 'got ' + w.HISTORY[0].qty);
ok('history entry stores totalPr 600', Math.abs(w.HISTORY[0].totalPr - 600) < 0.05,
   'got ' + w.HISTORY[0].totalPr);
ok('qty badge rendered', d.getElementById('hist-content').innerHTML.indexOf('×4') !== -1);

console.log('\n=== 26. Rounding to nearest rupee ===');
// MRP 1000, 33.333% off -> SP excl 666.67, incl 786.667 -> rounds to 787
freshCalc(1000, 50, 33.333);
w.setRounding('off');
const rawIncl = w.LAST_SP.i;
ok('unrounded SP incl ≈ 786.67', Math.abs(rawIncl - 786.6706) < 0.01, 'got ' + rawIncl);
w.setRounding('1');
ok('ROUND_MODE is 1', w.ROUND_MODE === '1');
ok('SP incl rounds to 787', Math.abs(w.LAST_SP.i - 787) < 1e-9, 'got ' + w.LAST_SP.i);
ok('SP excl derived from rounded incl', Math.abs(w.LAST_SP.e - 787/1.18) < 1e-9,
   'got ' + w.LAST_SP.e);
ok('CP incl also rounded to whole', Math.abs(w.LAST_CP.i - Math.round(w.LAST_CP.i)) < 1e-9,
   'got ' + w.LAST_CP.i);
ok('rnd-1 pill active', d.getElementById('rnd-1').className === 'pill on');
ok('rnd-off pill inactive', d.getElementById('rnd-off').className === 'pill');

console.log('\n=== 27. Rounding to nearest ₹5 ===');
w.setRounding('5');
ok('SP incl rounds to 785', Math.abs(w.LAST_SP.i - 785) < 1e-9, 'got ' + w.LAST_SP.i);
ok('multiple of 5', w.LAST_SP.i % 5 === 0);
w.setRounding('off');
ok('off restores exact value', Math.abs(w.LAST_SP.i - rawIncl) < 0.01, 'got ' + w.LAST_SP.i);
ok('rounding persists in share state', w.getShareState().rnd === 'off');

console.log('\n=== 28. Confirm before incentive deletion ===');
freshCalc(1000, 40, 25);
const nKeysBefore = w.INC_KEYS.length;
w.deleteInc('cp', 'eb');
ok('confirm modal opened', d.getElementById('overlay-confirm').classList.contains('open'));
ok('incentive NOT yet deleted', w.INC_KEYS.length === nKeysBefore, 'got ' + w.INC_KEYS.length);
ok('confirm message names the incentive',
   d.getElementById('confirm-msg').textContent.indexOf('Early Bird') !== -1,
   'got ' + d.getElementById('confirm-msg').textContent);
w.closeConfirm();
ok('cancel closes modal', !d.getElementById('overlay-confirm').classList.contains('open'));
ok('cancel kept the incentive', w.INC_KEYS.indexOf('eb') !== -1);

w.deleteInc('cp', 'eb');
w.runConfirm();
ok('confirming deletes it', w.INC_KEYS.indexOf('eb') === -1);
ok('modal closed after confirm', !d.getElementById('overlay-confirm').classList.contains('open'));

console.log('\n=== 29. Undo / redo ===');
freshCalc(1000, 40, 25);
ok('undo stack starts empty', w.UNDO.length === 0);
ok('undo button disabled', d.getElementById('undo-btn').disabled === true);

const keysBefore = w.INC_KEYS.slice();
w.doDeleteInc('cp', 'eb');
ok('eb deleted', w.INC_KEYS.indexOf('eb') === -1);
ok('undo stack has 1', w.UNDO.length === 1, 'got ' + w.UNDO.length);
ok('undo button enabled', d.getElementById('undo-btn').disabled === false);
w.undo();
ok('undo restores eb', w.INC_KEYS.indexOf('eb') !== -1);
ok('undo restores full key list', w.INC_KEYS.join(',') === keysBefore.join(','),
   'got ' + w.INC_KEYS.join(','));
ok('eb row back in DOM', !!d.getElementById('ir-eb'));
ok('redo stack has 1', w.REDO.length === 1);
w.redo();
ok('redo re-deletes eb', w.INC_KEYS.indexOf('eb') === -1);
w.undo();
ok('undo again restores eb', w.INC_KEYS.indexOf('eb') !== -1);

console.log('\n=== 30. Undo covers add, reset, history and quote ===');
freshCalc(1000, 40, 25);
w.addInc('cp');
const addedKey = w.INC_KEYS[w.INC_KEYS.length - 1];
ok('incentive added', !!d.getElementById('ir-' + addedKey));
w.undo();
ok('undo removes added incentive', w.INC_KEYS.indexOf(addedKey) === -1);
ok('undone row gone from DOM', !d.getElementById('ir-' + addedKey));

w.saveToHistory();
ok('history has 1', w.HISTORY.length === 1);
w.deleteHistEntry(0);
ok('history entry deleted', w.HISTORY.length === 0);
w.undo();
ok('undo restores history entry', w.HISTORY.length === 1, 'got ' + w.HISTORY.length);

d.getElementById('qty').value = '7'; w.calc();
w.resetAll();
ok('reset set qty back to 1', w.getQty() === 1);
w.undo();
ok('undo restores qty 7', w.getQty() === 7, 'got ' + w.getQty());

console.log('\n=== 31. Undo stack is bounded ===');
freshCalc(1000, 40, 25);
for (let i = 0; i < 60; i++) w.pushUndo('noise ' + i);
ok('stack capped at MAX_UNDO', w.UNDO.length === w.MAX_UNDO, 'got ' + w.UNDO.length);
ok('oldest entries dropped', w.UNDO[0].label !== 'noise 0', 'got ' + w.UNDO[0].label);

console.log('\n=== 32. Quote builder: line maths ===');
freshCalc(1000, 40, 25);
w.QUOTE.length = 0;
w.qtAddLine();
ok('one blank line', w.QUOTE.length === 1);
w.qtSet(0, 'mrp', '1000');
w.qtSet(0, 'cpd', '40');
w.qtSet(0, 'spd', '25');
w.qtSet(0, 'qty', '3');
w.qtSet(0, 'desc', 'Brake pad');
const L = w.qtCalcLine(w.QUOTE[0]);
ok('line CP excl = 600', Math.abs(L.cpE - 600) < 0.01, 'got ' + L.cpE);
ok('line SP excl = 750', Math.abs(L.spE - 750) < 0.01, 'got ' + L.spE);
ok('line SP incl = 885', Math.abs(L.spI - 885) < 0.01, 'got ' + L.spI);
ok('unit profit = 150', Math.abs(L.unitPr - 150) < 0.01, 'got ' + L.unitPr);
ok('line profit = 450', Math.abs(L.linePr - 450) < 0.01, 'got ' + L.linePr);
ok('line value = 2655', Math.abs(L.lineVal - 2655) < 0.01, 'got ' + L.lineVal);
ok('line GP = 20%', Math.abs(L.gp - 20) < 0.01, 'got ' + L.gp);

console.log('\n=== 33. Quote totals across lines ===');
w.qtAddLine();
w.qtSet(1, 'mrp', '500'); w.qtSet(1, 'cpd', '50'); w.qtSet(1, 'spd', '20'); w.qtSet(1, 'qty', '2');
// line2: cp 250, sp 400, unit profit 150, line profit 300, value 400*1.18*2=944
const T = w.qtTotals();
ok('2 lines counted', T.lines === 2, 'got ' + T.lines);
ok('5 units total', T.units === 5, 'got ' + T.units);
ok('total profit 750', Math.abs(T.pr - 750) < 0.01, 'got ' + T.pr);
ok('order value 3599', Math.abs(T.val - 3599) < 0.01, 'got ' + T.val);
// blended GP = 750 / (750*3 + 400*2) = 750/3050
ok('blended GP ≈ 24.59%', Math.abs(T.gp - (750/3050*100)) < 0.01, 'got ' + T.gp);

console.log('\n=== 34. Quote: incomplete lines ignored, no crash ===');
w.qtAddLine(); // blank
ok('blank line returns null', w.qtCalcLine(w.QUOTE[2]) === null);
const T2 = w.qtTotals();
ok('blank line not counted', T2.lines === 2, 'got ' + T2.lines);
ok('totals unchanged by blank', Math.abs(T2.pr - 750) < 0.01, 'got ' + T2.pr);
crashed = false;
try { w.qtRender(); } catch (e) { crashed = true; console.log('    ' + e.message); }
ok('render with blank line does not throw', !crashed);
ok('table rendered rows', d.querySelectorAll('#qt-table tbody tr').length === 3,
   'got ' + d.querySelectorAll('#qt-table tbody tr').length);

console.log('\n=== 35. Quote: add from calculator, delete, persist ===');
freshCalc(1000, 40, 25);
w.QUOTE.length = 0;
d.getElementById('qty').value = '6'; w.calc();
w.qtAddFromCalc();
ok('line added from calc', w.QUOTE.length === 1);
ok('picked up MRP', parseFloat(w.QUOTE[0].mrp) === 1000, 'got ' + w.QUOTE[0].mrp);
ok('picked up qty 6', w.QUOTE[0].qty === 6, 'got ' + w.QUOTE[0].qty);
ok('picked up CP disc 40', Math.abs(parseFloat(w.QUOTE[0].cpd) - 40) < 0.01, 'got ' + w.QUOTE[0].cpd);
ok('picked up SP disc 25', Math.abs(parseFloat(w.QUOTE[0].spd) - 25) < 0.01, 'got ' + w.QUOTE[0].spd);
const fromCalc = w.qtCalcLine(w.QUOTE[0]);
ok('line profit matches calc × qty', Math.abs(fromCalc.linePr - 900) < 0.05, 'got ' + fromCalc.linePr);

w.saveQuote();
ok('quote persisted', !!w.localStorage.getItem('pc-quote'));
w.qtDelLine(0);
ok('line deleted', w.QUOTE.length === 0);
w.undo();
ok('undo restores quote line', w.QUOTE.length === 1, 'got ' + w.QUOTE.length);

console.log('\n=== 36. Quote respects GST and rounding ===');
freshCalc(1000, 40, 25, 12);
w.QUOTE.length = 0;
w.qtAddLine();
w.qtSet(0, 'mrp', '1000'); w.qtSet(0, 'cpd', '40'); w.qtSet(0, 'spd', '25'); w.qtSet(0, 'qty', '1');
let QL = w.qtCalcLine(w.QUOTE[0]);
ok('uses 12% GST -> SP incl 840', Math.abs(QL.spI - 840) < 0.01, 'got ' + QL.spI);
w.setRounding('5');
QL = w.qtCalcLine(w.QUOTE[0]);
ok('quote line honours ₹5 rounding', QL.spI % 5 === 0, 'got ' + QL.spI);
w.setRounding('off');

console.log('\n=== 37. Quote text output ===');
freshCalc(1000, 40, 25);
w.QUOTE.length = 0;
w.qtAddLine();
w.qtSet(0, 'mrp', '1000'); w.qtSet(0, 'cpd', '40'); w.qtSet(0, 'spd', '25'); w.qtSet(0, 'qty', '2');
w.qtSet(0, 'desc', 'Clutch plate');
const qtext = w.getQuoteText();
ok('quote text includes description', qtext.indexOf('Clutch plate') !== -1);
ok('quote text includes total profit', qtext.indexOf('Total profit') !== -1);
ok('quote text includes blended GP', qtext.indexOf('Blended GP') !== -1);
w.QUOTE.length = 0;
ok('empty quote returns null text', w.getQuoteText() === null);

console.log('\n=== 38. History tagging ===');
freshCalc(1000, 40, 25);
w.saveToHistory();
w.saveToHistory();
ok('2 entries', w.HISTORY.length === 2);
w.commitTag(0, 'Dealer A');
ok('tag stored', w.HISTORY[0].tag === 'Dealer A', 'got ' + w.HISTORY[0].tag);
ok('tag rendered', d.getElementById('hist-content').innerHTML.indexOf('Dealer A') !== -1);
ok('tagging is undoable', w.UNDO.length > 0);
w.undo();
ok('undo removes tag', !w.HISTORY[0].tag);
w.commitTag(0, 'Dealer A');
w.commitTag(0, '');
ok('empty tag clears it', !w.HISTORY[0].tag);
w.commitTag(0, 'Dealer A');
ok('tag survives long input truncation',
   (w.commitTag(1, 'x'.repeat(50)), w.HISTORY[1].tag.length === 24), 'got ' + w.HISTORY[1].tag.length);

console.log('\n=== 39. History search ===');
freshCalc(1000, 40, 25);
w.saveToHistory();
w.saveToHistory();
w.commitTag(0, 'Dealer A');
w.commitTag(1, 'Dealer B');
w.setHistQuery('dealer a');
ok('search is case-insensitive', d.getElementById('hist-tag').textContent === '1 of 2',
   'got ' + d.getElementById('hist-tag').textContent);
ok('only matching entry rendered',
   d.getElementById('hist-content').innerHTML.indexOf('Dealer B') === -1);
w.setHistQuery('dealer');
ok('partial match finds both', d.getElementById('hist-tag').textContent === '2 of 2',
   'got ' + d.getElementById('hist-tag').textContent);
w.setHistQuery('zzzz');
ok('no matches shows message',
   d.getElementById('hist-content').innerHTML.indexOf('No entries match') !== -1);
w.setHistQuery('');
ok('clearing search restores count', d.getElementById('hist-tag').textContent === '2 entries',
   'got ' + d.getElementById('hist-tag').textContent);

console.log('\n=== 40. History filters ===');
freshCalc(1000, 40, 25);
w.saveToHistory();                       // profitable
// Flip CP/SP to make a loss WITHOUT resetting history
d.getElementById('cpd').value = '25';
d.getElementById('spd').value = '40';
w.calc();
w.saveToHistory();
ok('2 entries', w.HISTORY.length === 2);
ok('one is a loss', w.HISTORY.filter(h => h.pr < 0).length === 1);

w.setHistFilter('pos');
ok('profit filter shows 1', d.getElementById('hist-tag').textContent === '1 of 2',
   'got ' + d.getElementById('hist-tag').textContent);
ok('pos pill active', d.getElementById('hf-pos').className === 'hist-fpill on');
w.setHistFilter('neg');
ok('loss filter shows 1', d.getElementById('hist-tag').textContent === '1 of 2',
   'got ' + d.getElementById('hist-tag').textContent);
w.setHistFilter('tagged');
ok('tagged filter shows 0 when none tagged',
   d.getElementById('hist-content').innerHTML.indexOf('No entries match') !== -1);
w.commitTag(0, 'X');
w.setHistFilter('tagged');
ok('tagged filter finds tagged entry', d.getElementById('hist-tag').textContent === '1 of 2',
   'got ' + d.getElementById('hist-tag').textContent);
w.setHistFilter('all');
ok('all filter restores', d.getElementById('hist-tag').textContent === '2 entries',
   'got ' + d.getElementById('hist-tag').textContent);

console.log('\n=== 41. Filtered delete removes the RIGHT entry ===');
freshCalc(1000, 40, 25);
w.HISTORY.length = 0;
w.saveToHistory(); w.saveToHistory(); w.saveToHistory();
w.commitTag(0, 'keep-0');
w.commitTag(1, 'target');
w.commitTag(2, 'keep-2');
w.setHistQuery('target');
ok('filter shows only target', d.getElementById('hist-tag').textContent === '1 of 3',
   'got ' + d.getElementById('hist-tag').textContent);
// The rendered delete button must carry the TRUE index (1), not the filtered index (0)
// Handlers are delegated; the true index travels in data-p.
const delBtn = d.querySelector('#hist-content .hist-del-btn');
ok('delete button carries the true index',
   delBtn && delBtn.getAttribute('data-click') === 'histDelete' &&
   delBtn.getAttribute('data-p') === '1',
   delBtn ? delBtn.getAttribute('data-click') + '/' + delBtn.getAttribute('data-p') : 'missing');
w.deleteHistEntry(1);
ok('correct entry deleted', w.HISTORY.length === 2);
ok('target is gone', !w.HISTORY.some(h => h.tag === 'target'));
ok('keep-0 survived', w.HISTORY.some(h => h.tag === 'keep-0'));
ok('keep-2 survived', w.HISTORY.some(h => h.tag === 'keep-2'));
w.setHistQuery('');

console.log('\n=== 42. Clear history asks for confirmation ===');
freshCalc(1000, 40, 25);
w.saveToHistory();
w.clearHistory();
ok('confirm modal opened', d.getElementById('overlay-confirm').classList.contains('open'));
ok('history NOT yet cleared', w.HISTORY.length === 1);
w.closeConfirm();
ok('cancel kept history', w.HISTORY.length === 1);
w.clearHistory(); w.runConfirm();
ok('confirming clears history', w.HISTORY.length === 0);
w.undo();
ok('undo restores cleared history', w.HISTORY.length === 1, 'got ' + w.HISTORY.length);

console.log('\n=== 43. CSV export includes tag and qty ===');
freshCalc(1000, 40, 25);
d.getElementById('qty').value = '3'; w.calc();
w.saveToHistory();
w.commitTag(0, 'Dealer Z');
let csvText = null;
const origCreate = w.URL.createObjectURL;
w.Blob = function (parts) { csvText = parts.join(''); return {}; };
w.URL.createObjectURL = () => 'blob:x';
w.URL.revokeObjectURL = () => {};
w.exportHistoryCSV();
w.URL.createObjectURL = origCreate;
ok('CSV has Tag column', csvText && csvText.indexOf('Tag') !== -1);
ok('CSV has Qty column', csvText && csvText.indexOf('Qty') !== -1);
ok('CSV has Total Profit column', csvText && csvText.indexOf('Total Profit') !== -1);
ok('CSV contains the tag value', csvText && csvText.indexOf('Dealer Z') !== -1);
ok('CSV contains qty 3', csvText && /,3,/.test(csvText));

console.log('\n=== 44. Toast + confirm wiring ===');
w.toast('hello');
ok('toast shows', d.getElementById('toast').classList.contains('show'));
ok('toast message set', d.getElementById('toast-msg').textContent === 'hello');
ok('undo affordance hidden by default', d.getElementById('toast-undo').style.display === 'none');
w.toast('bye', true);
ok('undo affordance shown when asked', d.getElementById('toast-undo').style.display !== 'none');
w.hideToast();
ok('toast hides', !d.getElementById('toast').classList.contains('show'));

console.log('\n=== 45. Full-state round trip after all features ===');
freshCalc(1000, 40, 25);
d.getElementById('qty').value = '5';
w.setRounding('1');
w.addInc('cp');
const rtKey = w.INC_KEYS[w.INC_KEYS.length - 1];
w.setIncMode('cp', rtKey, 'abs');
d.getElementById('it-' + rtKey).checked = true;
d.getElementById('iv-' + rtKey).value = '25';
w.syncToggle(rtKey); w.calc();
const rtProfit = num('pvv'), rtTotal = num('s-tpr');
const rtState = w.getShareState();
ok('state carries qty', rtState.qty === '5', 'got ' + rtState.qty);
ok('state carries rounding', rtState.rnd === '1', 'got ' + rtState.rnd);
w.resetAll();
ok('reset changed things', w.getQty() === 1);
w.applyShareState(rtState); w.calc();
ok('qty restored', w.getQty() === 5, 'got ' + w.getQty());
ok('rounding restored', w.ROUND_MODE === '1', 'got ' + w.ROUND_MODE);
ok('custom incentive mode restored', w.incModeOf('cp', rtKey) === 'abs');
ok('profit restored', Math.abs(num('pvv') - rtProfit) < 0.05,
   'got ' + num('pvv') + ' expected ' + rtProfit);
ok('total profit restored', Math.abs(num('s-tpr') - rtTotal) < 0.05,
   'got ' + num('s-tpr') + ' expected ' + rtTotal);


R.section('\n=== 46. Custom rounding step ===');
freshCalc(1000, 40, 25);
ok('custom rounding input exists', !!d.getElementById('rnd-custom'));
ok('defaults to off', w.ROUND_MODE === 'off');
ok('roundStep is 0 when off', w.roundStep() === 0);

w.setRounding('10');
ok('accepts an arbitrary step', w.ROUND_MODE === '10', 'got ' + w.ROUND_MODE);
ok('roundStep reads it', w.roundStep() === 10, 'got ' + w.roundStep());
// SP excl 750 -> incl 885 -> nearest 10 = 890
ok('SP incl rounds to nearest 10', Math.abs(w.LAST_SP.i - 890) < 1e-9, 'got ' + w.LAST_SP.i);
ok('excl derived from the rounded incl', Math.abs(w.LAST_SP.e - 890 / 1.18) < 1e-9);
ok('preset pills all inactive', d.getElementById('rnd-off').className === 'pill' &&
   d.getElementById('rnd-1').className === 'pill' && d.getElementById('rnd-5').className === 'pill');
ok('custom box mirrors the value', d.getElementById('rnd-custom').value === '10',
   'got ' + d.getElementById('rnd-custom').value);

w.setRounding('0.5');
ok('accepts a fractional step', w.roundStep() === 0.5);
ok('rounds to the nearest 0.5', Math.abs(w.LAST_SP.i * 2 - Math.round(w.LAST_SP.i * 2)) < 1e-9,
   'got ' + w.LAST_SP.i);

w.setRounding('5');
ok('preset re-selects its pill', d.getElementById('rnd-5').className === 'pill on');
ok('preset clears the custom box', d.getElementById('rnd-custom').value === '',
   'got ' + d.getElementById('rnd-custom').value);

R.section('\n=== 47. Custom rounding rejects bad input ===');
const rc = d.getElementById('rnd-custom');
w.setRounding('off');
[['0','zero'], ['-5','negative'], ['abc','non-numeric']].forEach(([val, why]) => {
  rc.value = val;
  w.onCustomRounding(rc);
  ok('rejects ' + why, w.ROUND_MODE === 'off', 'ROUND_MODE became ' + w.ROUND_MODE);
});
ok('user is told why', d.getElementById('toast-msg').textContent.indexOf('greater than 0') !== -1,
   'got ' + d.getElementById('toast-msg').textContent);
rc.value = '';
w.onCustomRounding(rc);
ok('clearing the box leaves the mode alone', w.ROUND_MODE === 'off');
rc.value = '25';
w.onCustomRounding(rc);
ok('accepts a valid step', w.ROUND_MODE === '25', 'got ' + w.ROUND_MODE);

R.section('\n=== 48. Custom rounding persists and reaches quote lines ===');
freshCalc(1000, 40, 25);
w.setRounding('20');
const st48 = w.getShareState();
ok('carried in share state', st48.rnd === '20', 'got ' + st48.rnd);
w.QUOTE.length = 0;
w.qtAddLine();
w.qtSet(0, 'mrp', '1000'); w.qtSet(0, 'cpd', '40'); w.qtSet(0, 'spd', '25'); w.qtSet(0, 'qty', '1');
const ql48 = w.qtCalcLine(w.QUOTE[0]);
ok('quote line honours the custom step', ql48.spI % 20 === 0, 'got ' + ql48.spI);
w.setRounding('off');
w.applyShareState(st48);
ok('restored from share state', w.ROUND_MODE === '20', 'got ' + w.ROUND_MODE);
w.setRounding('off');

R.section('\n=== 49. Asset split is wired correctly ===');
const markup = readMarkup();
ok('index.html has no inline <style>', markup.indexOf('<style>') === -1);
ok('index.html has no inline <script> block',
   !/<script>[\s\S]/.test(markup), 'found an inline script block');
ok('links the external stylesheet',
   markup.indexOf('<link rel="stylesheet" href="assets/styles.css">') !== -1);
ok('loads the external script',
   markup.indexOf('<script src="assets/app.js" defer></script>') !== -1);
ok('script is deferred so the DOM is parsed first',
   /<script src="assets\/app\.js"[^>]*\bdefer\b/.test(markup));

ok('assets/styles.css exists', fs.existsSync(path.join(ROOT, 'assets/styles.css')));
ok('assets/app.js exists', fs.existsSync(path.join(ROOT, 'assets/app.js')));

const appJs = readAsset('assets/app.js');
const cssTxt = readAsset('assets/styles.css');
ok('app.js carries no stray HTML tags', appJs.indexOf('</script>') === -1);
ok('styles.css carries no stray HTML tags', cssTxt.indexOf('</style>') === -1);
ok('app.js is substantial', appJs.length > 100000, appJs.length + ' bytes');
ok('styles.css is substantial', cssTxt.length > 40000, cssTxt.length + ' bytes');

// The service worker must precache the new files or offline mode breaks
const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
ok('service worker precaches the stylesheet', sw.indexOf('/assets/styles.css') !== -1);
ok('service worker precaches the script', sw.indexOf('/assets/app.js') !== -1);
ok('service worker cache name was bumped', /const CACHE = 'pc-v(?!1')/.test(sw),
   (sw.match(/const CACHE = '[^']+'/) || [])[0]);

R.section('\n=== 50. Split app still boots and calculates ===');
const fresh = loadApp();
ok('functions are defined on window', typeof fresh.w.calc === 'function');
ok('stylesheet was applied', !!fresh.d.querySelector('style, link[rel="stylesheet"]'));
fresh.d.getElementById('mrp').value = '1000';
fresh.w.setCM('excl'); fresh.d.getElementById('cpd').value = '40';
fresh.w.setSM('excl'); fresh.d.getElementById('spd').value = '25';
fresh.w.calc();
ok('calculates after the split', Math.abs(numOf(fresh.d, 'pvv') - 150) < 0.05,
   'got ' + numOf(fresh.d, 'pvv'));

R.section('\n=== 51. Edit opens the accordion; collapsing means Done ===');
freshCalc(1000, 40, 25);
const cpBody = d.getElementById('body-inc');
const spBody = d.getElementById('body-sp-inc');

// Start from a known-collapsed state
if (cpBody.style.display === 'block') w.togglePanel('inc');
ok('CP panel starts collapsed', !w.isIncPanelOpen('cp'));
ok('CP not in edit mode', w.CP_EDIT_MODE === false);

w.toggleIncEditMode('cp');
ok('Edit turns edit mode on', w.CP_EDIT_MODE === true);
ok('Edit expands the collapsed panel', w.isIncPanelOpen('cp'), cpBody.style.display);
ok('aria-expanded reflects it',
   d.getElementById('phdr-inc').getAttribute('aria-expanded') === 'true');
ok('delete badges are visible', d.querySelectorAll('#cp-inc-grid .inc-del-btn').length === 5);

w.toggleIncEditMode('cp');
ok('Done turns edit mode off', w.CP_EDIT_MODE === false);
ok('Done leaves the panel open', w.isIncPanelOpen('cp'),
   'panel should stay open so the result is visible');

// Collapsing while editing counts as Done
w.toggleIncEditMode('cp');
ok('back in edit mode', w.CP_EDIT_MODE === true);
w.togglePanel('inc');
ok('collapsing exits edit mode', w.CP_EDIT_MODE === false);
ok('panel is collapsed', !w.isIncPanelOpen('cp'));
ok('button label reset to Edit',
   d.getElementById('cp-inc-edit-btn').textContent === 'Edit',
   d.getElementById('cp-inc-edit-btn').textContent);
ok('add button hidden again',
   d.getElementById('cp-inc-add-btn').style.display === 'none');

R.section('\n=== 52. Same linkage on SP, and the panels are independent ===');
if (spBody.style.display === 'block') w.togglePanel('sp-inc');
w.toggleIncEditMode('sp');
ok('SP Edit expands its panel', w.isIncPanelOpen('sp'));
ok('SP in edit mode', w.SP_EDIT_MODE === true);
ok('CP unaffected', w.CP_EDIT_MODE === false && !w.isIncPanelOpen('cp'));
w.togglePanel('sp-inc');
ok('collapsing SP exits SP edit mode', w.SP_EDIT_MODE === false);

// Reopening a panel must not silently re-enter edit mode
w.togglePanel('sp-inc');
ok('reopening does not resume edit mode', w.SP_EDIT_MODE === false);
ok('labels render as spans, not inputs',
   d.getElementById('lbl-sp-eb').tagName === 'SPAN',
   d.getElementById('lbl-sp-eb').tagName);
w.togglePanel('sp-inc');

R.section('\n=== 53. Edit-mode state survives values and toggles ===');
freshCalc(1000, 40, 25);
d.getElementById('it-eb').checked = true;
w.syncToggle('eb'); w.calc();
const beforeEdit = num('pvv');
w.toggleIncEditMode('cp');
ok('values survive entering edit mode via Edit', Math.abs(num('pvv') - beforeEdit) < 0.01,
   'got ' + num('pvv'));
ok('checkbox state survives', d.getElementById('it-eb').checked === true);
w.togglePanel('inc');
ok('values survive the collapse-as-Done path', Math.abs(num('pvv') - beforeEdit) < 0.01,
   'got ' + num('pvv'));
ok('checkbox still set', d.getElementById('it-eb').checked === true);

R.section('\n=== 54. Custom rounding chip shows it is active ===');
freshCalc(1000, 40, 25);
const rndWrap = d.getElementById('rnd-custom-wrap');
ok('chip wrapper exists', !!rndWrap);

w.setRounding('off');
ok('off: chip not highlighted', rndWrap.className === 'rnd-custom-wrap', rndWrap.className);
ok('off: isCustomRounding is false', w.isCustomRounding() === false);
ok('off: Off pill is the selected one', d.getElementById('rnd-off').className === 'pill on');

w.setRounding('5');
ok('preset: chip not highlighted', rndWrap.className === 'rnd-custom-wrap', rndWrap.className);
ok('preset: isCustomRounding is false', w.isCustomRounding() === false);
ok('preset: chip is emptied', d.getElementById('rnd-custom').value === '');

w.setRounding('20');
ok('custom: chip is highlighted', rndWrap.className.indexOf('on') !== -1, rndWrap.className);
ok('custom: isCustomRounding is true', w.isCustomRounding() === true);
ok('custom: chip shows the value', d.getElementById('rnd-custom').value === '20');
ok('custom: no preset pill is selected',
   ['off','1','5'].every(k => d.getElementById('rnd-' + k).className === 'pill'));

// Exactly one control in the row should read as selected at any time
const selectedCount = () =>
  ['off','1','5'].filter(k => d.getElementById('rnd-' + k).className.indexOf('on') !== -1).length +
  (rndWrap.className.indexOf('on') !== -1 ? 1 : 0);
ok('custom: exactly one control selected', selectedCount() === 1, 'got ' + selectedCount());
w.setRounding('1');
ok('preset: exactly one control selected', selectedCount() === 1, 'got ' + selectedCount());
w.setRounding('off');
ok('off: exactly one control selected', selectedCount() === 1, 'got ' + selectedCount());

// Fractional custom values count as custom too
w.setRounding('0.5');
ok('fractional step highlights the chip', rndWrap.className.indexOf('on') !== -1);
w.setRounding('off');
ok('returning to off clears the highlight', rndWrap.className === 'rnd-custom-wrap');

// Highlight must survive a reload from saved state
w.setRounding('25');
const rndState = w.getShareState();
w.setRounding('off');
ok('highlight cleared before restore', rndWrap.className === 'rnd-custom-wrap');
w.applyShareState(rndState);
ok('restored state re-applies the highlight', rndWrap.className.indexOf('on') !== -1,
   rndWrap.className);
ok('restored chip shows the value', d.getElementById('rnd-custom').value === '25');
w.setRounding('off');

// Rejecting a bad entry must not leave a stale highlight
const rndInput = d.getElementById('rnd-custom');
rndInput.value = '-3';
w.onCustomRounding(rndInput);
ok('rejected input leaves rounding off', w.ROUND_MODE === 'off');
ok('rejected input leaves the chip unhighlighted', rndWrap.className === 'rnd-custom-wrap',
   rndWrap.className);

R.section('\n=== 55. HTML escaping is centralised and complete ===');
ok('escHtml is exposed', typeof w.escHtml === 'function');
ok('escapes angle brackets', w.escHtml('<b>') === '&lt;b&gt;');
ok('escapes quotes', w.escHtml('a"b\'c') === 'a&quot;b&#39;c');
ok('escapes ampersand first', w.escHtml('&lt;') === '&amp;lt;');
ok('null becomes empty', w.escHtml(null) === '' && w.escHtml(undefined) === '');
ok('numbers pass through', w.escHtml(18) === '18');
ok('no ad-hoc escape chains remain in the source',
   readAsset('assets/app.js').indexOf("replace(/&/g,'&amp;')") === -1);

R.section('\n=== 56. Untrusted stored data cannot inject markup ===');
const EVIL = '"><img src=x onerror=window.__XSS__=1>';

// Incentive label
freshCalc(1000, 40, 25);
w.INC_LABELS['eb'] = EVIL;
w.renderCPIncRows();
ok('label is escaped in the row', d.getElementById('cp-inc-grid').querySelector('img') === null);
ok('label renders as text', d.getElementById('lbl-cp-eb').textContent === EVIL);
w.INC_LABELS['eb'] = w.INC_LABELS_DEFAULT['eb'];
w.renderCPIncRows();

// History time / GST — these were interpolated unescaped
w.HISTORY.length = 0;
w.HISTORY.push({time: EVIL, ts: 0, mrp: 1, cpE: 1, cpI: 1, spE: 2, spI: 2, effCPE: 1,
                effSPE: 2, incInr: 0, spIncInr: 0, pr: 1, gp: 5, mg: 5, gst: EVIL, tag: EVIL});
w.renderHistory();
// The meaningful test is that no element was created and the payload survives
// as literal text. Scanning innerHTML for '<img' is NOT valid: a '<' inside an
// attribute value serialises literally and is inert.
ok('history injects no elements', d.getElementById('hist-content').querySelector('img') === null);
// svg is excluded: the delete button legitimately contains its own icon.
ok('history injects no scriptable node',
   d.getElementById('hist-content').querySelectorAll('img,script,iframe,object,embed').length === 0);
ok('the payload survives as literal text',
   d.getElementById('htime-0').textContent === EVIL,
   d.getElementById('htime-0').textContent);
ok('tag renders as literal text too',
   d.getElementById('tag-0').textContent === EVIL, d.getElementById('tag-0').textContent);
w.HISTORY.length = 0;
w.renderHistory();

R.section('\n=== 57. Malformed incentive keys are rejected on load ===');
ok('isValidIncKey accepts generated keys',
   w.isValidIncKey('c1') && w.isValidIncKey('cd') && w.isValidIncKey('eb'));
ok('rejects markup', !w.isValidIncKey('"><img src=x>'));
ok('rejects quotes', !w.isValidIncKey('a"onclick="x'));
ok('rejects empty and non-strings',
   !w.isValidIncKey('') && !w.isValidIncKey(null) && !w.isValidIncKey(7));
ok('rejects over-long keys', !w.isValidIncKey('a'.repeat(25)));

w.localStorage.setItem('pc-labels', JSON.stringify({
  labels: { cd: 'Cash', '"><img src=x>': 'evil' },
  cpKeys: ['cd', '"><img src=x>'], spKeys: ['cd'], cpModes: {}, spModes: {}
}));
w.INC_KEYS.length = 0; ['cd'].forEach(k => w.INC_KEYS.push(k));
w.loadLabels();
ok('malformed key dropped from the list', w.INC_KEYS.indexOf('"><img src=x>') === -1,
   w.INC_KEYS.join(','));
ok('valid key retained', w.INC_KEYS.indexOf('cd') !== -1);
ok('malformed label key ignored', !w.INC_LABELS['"><img src=x>']);
w.localStorage.clear();

R.section('\n=== 58. History timestamps refresh without a full rebuild ===');
freshCalc(1000, 40, 25);
w.HISTORY.length = 0;
w.saveToHistory();
w.commitTag(0, 'keepme');
const timeNode = d.getElementById('htime-0');
ok('timestamp has a stable id', !!timeNode);
ok('refreshHistTimes exists', typeof w.refreshHistTimes === 'function');
// Age the entry and refresh in place
w.HISTORY[0].ts = Date.now() - 3 * 60 * 1000;
w.refreshHistTimes();
ok('timestamp text updated in place',
   d.getElementById('htime-0').textContent.indexOf('min') !== -1,
   d.getElementById('htime-0').textContent);
ok('the same node was reused, not rebuilt', d.getElementById('htime-0') === timeNode);
ok('tag survived the refresh', w.HISTORY[0].tag === 'keepme');

R.section('\n=== 59. No inline handlers remain (enables strict CSP) ===');
const mk = readMarkup(), js = readAsset('assets/app.js');
ok('index.html has zero on* attributes',
   !/\son(click|change|input|focus|blur|keydown|load|submit)\s*=/.test(mk));
ok('generated markup has zero on* attributes',
   !/\son(click|change|input|focus|blur|keydown)\s*=\s*["\\]/.test(js));
ok('CSP omits unsafe-inline for scripts',
   /script-src\s+'self'\s*;/.test(mk), 'script-src is not exactly self');
ok('CSP still present', mk.indexOf('Content-Security-Policy') !== -1);
ok('action registry exists', typeof w.ACT === 'object' && Object.keys(w.ACT).length > 100,
   'got ' + Object.keys(w.ACT || {}).length);
ok('delegate() is defined', typeof w.delegate === 'function');

R.section('\n=== 60. Delegated handlers actually fire ===');
freshCalc(1000, 40, 25);
const gstPill = d.getElementById('g5');
gstPill.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
ok('clicking a pill runs its action', Math.abs(w.G - 0.05) < 1e-9, 'G=' + w.G);
d.getElementById('g18').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
ok('and back again', Math.abs(w.G - 0.18) < 1e-9);

d.getElementById('phdr-inc').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
ok('panel toggle is delegated', w.isIncPanelOpen('cp'));
d.getElementById('cp-inc-edit-btn').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
ok('nested Edit fires without toggling the panel',
   w.CP_EDIT_MODE === true && w.isIncPanelOpen('cp'));
d.getElementById('cp-inc-edit-btn').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
d.getElementById('phdr-inc').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));

// Generated rows carry parameterised actions
const ebRow = d.getElementById('it-eb');
ok('generated checkbox has a delegated action',
   ebRow.getAttribute('data-change') === 'incToggle' && ebRow.getAttribute('data-q') === 'eb');
ebRow.checked = true;
ebRow.dispatchEvent(new w.Event('change', { bubbles: true }));
ok('generated handler recalculates', Math.abs(num('pvv') - 156) < 0.05, 'got ' + num('pvv'));
ebRow.checked = false;
ebRow.dispatchEvent(new w.Event('change', { bubbles: true }));

ok('unknown action logs rather than throwing', (() => {
  const btn = d.createElement('button');
  btn.setAttribute('data-click', 'doesNotExist');
  d.body.appendChild(btn);
  let threw = false;
  try { btn.dispatchEvent(new w.MouseEvent('click', { bubbles: true })); } catch (e) { threw = true; }
  d.body.removeChild(btn);
  return !threw;
})());

R.section('\n=== 61. Share payloads are validated, not trusted ===');
ok('validateShareState is defined', typeof w.validateShareState === 'function');
ok('rejects non-objects',
   w.validateShareState(null) === null && w.validateShareState('x') === null &&
   w.validateShareState([1, 2]) === null);
ok('rejects an empty object', w.validateShareState({}) === null);
ok('drops unknown keys',
   !('evil' in (w.validateShareState({ m: '100', evil: 'x' }) || {})));
ok('clamps out-of-range GST',
   w.validateShareState({ g: 500 }) === null || !('g' in w.validateShareState({ g: 500, m: '1' })));
ok('accepts a valid GST', w.validateShareState({ g: 12 }).g === 12);
ok('rejects non-numeric prices', !('cpd' in (w.validateShareState({ m: '1', cpd: 'abc' }) || {})));
ok('rejects bad enums', !('t' in (w.validateShareState({ m: '1', t: 'evil' }) || {})));
ok('accepts good enums', w.validateShareState({ t: 'cp' }).t === 'cp');
ok('drops malformed incentive keys', (() => {
  const r = w.validateShareState({ inc: { 'cd': { on: true, v: '2' }, '"><img>': { on: true, v: '2' } } });
  return r && r.inc && r.inc.cd && !r.inc['"><img>'];
})());
ok('coerces incentive on-flags to booleans', (() => {
  const r = w.validateShareState({ inc: { cd: { on: 'yes', v: '2' } } });
  return r.inc.cd.on === true;
})());
ok('rejects a non-positive rounding step',
   !('rnd' in (w.validateShareState({ m: '1', rnd: '-5' }) || {})));
ok('accepts a valid rounding step', w.validateShareState({ rnd: '20' }).rnd === '20');
ok('outgoing state carries a version', w.getShareState().v === w.SHARE_VERSION);

R.section('\n=== 62. Fonts are self-hosted ===');
ok('no Google Fonts origin in markup',
   mk.indexOf('fonts.googleapis.com') === -1 && mk.indexOf('fonts.gstatic.com') === -1);
ok('local fonts.css is linked', mk.indexOf('assets/fonts.css') !== -1);
ok('CSP font-src is self-only', /font-src\s+'self'\s*;/.test(mk));
const fontCss = readAsset('assets/fonts.css');
ok('three families declared', (fontCss.match(/@font-face/g) || []).length === 3,
   'got ' + (fontCss.match(/@font-face/g) || []).length);
ok('uses weight ranges (one variable file per family)',
   /font-weight:\s*\d+\s+\d+/.test(fontCss));
['DMSans', 'JetBrainsMono', 'Syne'].forEach(f => {
  ok(f + '.woff2 exists', fs.existsSync(path.join(ROOT, 'assets/fonts/' + f + '.woff2')));
});
const sw2 = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
ok('fonts are precached for offline', sw2.indexOf('/assets/fonts/DMSans.woff2') !== -1);
ok('security headers file exists', fs.existsSync(path.join(ROOT, '_headers')));
const hdrs = fs.readFileSync(path.join(ROOT, '_headers'), 'utf8');
ok('_headers denies framing',
   hdrs.indexOf('X-Frame-Options: DENY') !== -1 && hdrs.indexOf("frame-ancestors 'none'") !== -1);

R.section('\n=== 63. History pagination ===');
freshCalc(1000, 40, 25);
w.HISTORY.length = 0;
for (let i = 0; i < 45; i++) w.saveToHistory();
w.HIST_SHOWN = w.HIST_PAGE;
w.renderHistory();
ok('only the first page renders',
   d.querySelectorAll('#hist-content .hist-entry').length === w.HIST_PAGE,
   'got ' + d.querySelectorAll('#hist-content .hist-entry').length);
ok('a show-more control is offered', !!d.querySelector('.hist-more'));
ok('it reports the remaining count',
   d.querySelector('.hist-more').textContent.indexOf('of 45') !== -1,
   d.querySelector('.hist-more').textContent);
w.histShowMore();
ok('show more reveals another page',
   d.querySelectorAll('#hist-content .hist-entry').length === w.HIST_PAGE * 2);
w.HIST_SHOWN = 100; w.renderHistory();
ok('no control once everything is shown', !d.querySelector('.hist-more'));
w.setHistQuery('zzz'); w.setHistQuery('');
ok('searching resets to the first page', w.HIST_SHOWN === w.HIST_PAGE, 'got ' + w.HIST_SHOWN);
w.HISTORY.length = 0; w.renderHistory();

R.section('\n=== 64. Deferred bundle is split correctly ===');
const coreJs = readAsset('assets/app.js');
const extraJs = readAsset('assets/app-extra.js');
ok('app-extra.js exists', extraJs.length > 10000, extraJs.length + ' bytes');
ok('deferring moved a meaningful share out of the core',
   extraJs.length > 40 * 1024 && extraJs.length / (coreJs.length + extraJs.length) > 0.2,
   (100 * extraJs.length / (coreJs.length + extraJs.length)).toFixed(0) + '% deferred');
ok('quick mode moved out', /^function fcBuildCards\(/m.test(extraJs) && !/^function fcBuildCards\(/m.test(coreJs));
ok('wizard moved out', /^function wzCalc\(/m.test(extraJs) && !/^function wzCalc\(/m.test(coreJs));
ok('quote rendering moved out', /^function qtRender\(/m.test(extraJs) && !/^function qtRender\(/m.test(coreJs));
// These are read by init, undo and the GST label updater before the bundle lands
ok('saveQuote stayed in core', /^function saveQuote\(/m.test(coreJs));
ok('loadQuote stayed in core', /^function loadQuote\(/m.test(coreJs));
ok('history search stayed in core', /^function histMatches\(/m.test(coreJs));
ok('history delete stayed in core', /^function deleteHistEntry\(/m.test(coreJs));
ok('loader is defined in core', /^function loadExtras\(/m.test(coreJs));
ok('markup prefetches the bundle', mk.indexOf('assets/app-extra.js') !== -1);
ok('service worker precaches it',
   fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8').indexOf('/assets/app-extra.js') !== -1);

R.section('\n=== 65. Currency formatter is cached ===');
// Building an Intl.NumberFormat per call was the hottest function during load
// (77ms of self time). The memo is now keyed by currency, since each one needs
// its own formatter and its own grouping.
ok('formatter is memoised', coreJs.indexOf('_fmtCache') !== -1);
ok('one formatter per currency, not per call',
   /_fmtCache\[c\]\s*=\s*new Intl\.NumberFormat/.test(coreJs) &&
   /if\(_fmtCache\[c\]\)return _fmtCache\[c\]/.test(coreJs));
ok('no per-call toLocaleString with options',
   coreJs.indexOf("toLocaleString('en-IN',{minimumFractionDigits") === -1);
ok('formats Indian grouping', w.INR(1234567.891) === '₹12,34,567.89', w.INR(1234567.891));
ok('handles zero and negatives', w.INR(0) === '₹0.00' && w.INR(-500.5) === '₹-500.50');
ok('still returns the dash for NaN', w.INR(NaN) === '—');

R.section('\n=== 66. Motion scale and spring easing ===');
const cssTxt2 = readAsset('assets/styles.css');
ok('easing tokens defined',
   cssTxt2.indexOf('--ease-spring:') !== -1 && cssTxt2.indexOf('--ease-out:') !== -1);
ok('duration tokens defined', /--dur:\s*\.?\d/.test(cssTxt2));
ok('modal uses the spring', /animation:modalIn var\(--dur-slow\) var\(--ease-spring\)/.test(cssTxt2));
ok('FAB uses the spring', /\.fab-btn\{[^}]*var\(--ease-spring\)/.test(cssTxt2));
ok('toast uses the spring', /\.toast\{[^}]*var\(--ease-spring\)/.test(cssTxt2));
ok('reduced motion still neutralises everything',
   /prefers-reduced-motion[\s\S]{0,400}animation-duration:\s*\.001ms/.test(cssTxt2));

R.section('\n=== 67. Count-up on headline figures ===');
ok('animateValue is defined', typeof w.animateValue === 'function');
ok('prefersReducedMotion is defined', typeof w.prefersReducedMotion === 'function');
freshCalc(1000, 40, 25);
ok('first paint sets the value directly (no animation from NaN)',
   d.getElementById('s-pr').textContent.indexOf('150') !== -1,
   d.getElementById('s-pr').textContent);
// A tiny change must not animate
d.getElementById('spd').value = '25.01';
w.calc();
ok('sub-threshold change applies immediately',
   d.getElementById('s-pr').textContent !== '' &&
   d.getElementById('s-pr').textContent.indexOf('—') === -1);
ok('floor colouring is applied without waiting for the animation',
   d.getElementById('s-gp').className.indexOf('sum-val') === 0);
// Clearing inputs must not leave a stale animated value
d.getElementById('mrp').value = '';
w.calc();
ok('empty state shows the dash', d.getElementById('s-pr').textContent === '—',
   d.getElementById('s-pr').textContent);

R.section('\n=== 68. View Transitions wrap the mode switch ===');
ok('withViewTransition is defined', typeof w.withViewTransition === 'function');
ok('setModeAnimated is defined', typeof w.setModeAnimated === 'function');
ok('setMode itself stays synchronous', (() => {
  freshCalc(1000, 40, 25);
  w.setMode('quick');
  const immediate = w.APP_MODE === 'quick';   // must be true before any frame
  w.setMode('default');
  return immediate;
})(), 'setMode must remain synchronous for fcToDefault/wzToDefault');
ok('falls back cleanly where the API is absent', (() => {
  const had = d.startViewTransition;
  delete d.startViewTransition;
  let ran = false;
  w.withViewTransition(() => { ran = true; });
  if (had) d.startViewTransition = had;
  return ran;   // must run synchronously, not silently drop
})());
ok('mode pills use the animated entry point',
   readAsset('assets/app.js').indexOf('setModeAnimated(') !== -1);
ok('view transition CSS is behind a no-preference query',
   /prefers-reduced-motion:no-preference[\s\S]{0,300}view-transition/.test(cssTxt2));

R.section('\n=== 69. Landed cost adds to effective CP ===');
freshCalc(1000, 40, 25);
d.getElementById('landed').value = '';
w.calc();
ok('no landed cost by default', w.getLandedCost() === 0);
ok('effectiveCP is CP less incentives', w.effectiveCP(w.LAST_CP) === 600, 'got ' + w.effectiveCP(w.LAST_CP));
ok('baseline profit 150', Math.abs(num('pvv') - 150) < 0.05);

d.getElementById('landed').value = '50';
w.calc();
ok('landed cost is read', w.getLandedCost() === 50);
ok('it is ADDED to effective CP', w.effectiveCP(w.LAST_CP) === 650, 'got ' + w.effectiveCP(w.LAST_CP));
ok('profit falls by exactly the landed cost', Math.abs(num('pvv') - 100) < 0.05, 'got ' + num('pvv'));
ok('margin uses the landed-inclusive cost',
   Math.abs(num('s-mg') - (100 / 650 * 100)) < 0.05, 'got ' + num('s-mg'));

// It must also flow through the incentive interaction
d.getElementById('it-eb').checked = true; w.syncToggle('eb'); w.calc();
ok('incentives and landed cost combine',
   Math.abs(w.effectiveCP(w.LAST_CP) - (600 - 6 + 50)) < 0.01,
   'got ' + w.effectiveCP(w.LAST_CP));
d.getElementById('it-eb').checked = false; w.syncToggle('eb');

ok('negative landed cost is ignored',
   (() => { d.getElementById('landed').value = '-99'; return w.getLandedCost() === 0; })());
d.getElementById('landed').value = '50';
ok('landed cost round-trips through share state', (() => {
  const st = w.getShareState();
  d.getElementById('landed').value = '';
  w.applyShareState(st);
  return w.getLandedCost() === 50;
})(), 'got ' + w.getLandedCost());
d.getElementById('landed').value = '';
w.calc();

R.section('\n=== 70. Break-even thresholds ===');
freshCalc(1000, 40, 25);
d.getElementById('floor-gp').value = '5';
w.calc();
const be = w.breakEven(w.LAST_CP, w.LAST_SP);
ok('break-even is computed', !!be);
ok('zero-profit SP excl equals effective CP', Math.abs(be.zeroE - 600) < 0.01, 'got ' + be.zeroE);
ok('quoted incl GST', Math.abs(be.zeroI - 708) < 0.01, 'got ' + be.zeroI);
// GP 5% => effSP = 600/0.95 = 631.58
ok('floor SP excl solves the GP equation',
   Math.abs(be.floorE - 600 / 0.95) < 0.01, 'got ' + be.floorE);
ok('shown in the summary', d.getElementById('s-item-be').style.display !== 'none');
ok('summary value matches', Math.abs(num('s-be') - 708) < 0.5, 'got ' + num('s-be'));

// SP incentives reduce what is received, so the quotable threshold rises
d.getElementById('sit-eb').checked = true;
d.getElementById('siv-eb').value = '10';
w.syncSpToggle('eb'); w.calc();
const be2 = w.breakEven(w.LAST_CP, w.LAST_SP);
ok('SP incentives raise the break-even price', be2.zeroE > be.zeroE,
   be.zeroE + ' -> ' + be2.zeroE);
ok('grossed up by the incentive ratio',
   Math.abs(be2.zeroE - 600 / 0.9) < 0.01, 'got ' + be2.zeroE);
d.getElementById('sit-eb').checked = false; w.syncSpToggle('eb');

ok('hidden when there is nothing to compute', (() => {
  d.getElementById('mrp').value = ''; w.calc();
  return d.getElementById('s-item-be').style.display === 'none';
})());

R.section('\n=== 71. Target-margin solver ===');
freshCalc(1000, 40, 25);
ok('solveForGp is defined', typeof w.solveForGp === 'function');
const sv = w.solveForGp(30);
ok('reports the current GP', Math.abs(sv.gpNow - 20) < 0.01, 'got ' + sv.gpNow);
// 30% GP on SP excl 750 => eff CP 525 => 75 of incentive on a 600 CP = 12.5%
ok('required effective CP', Math.abs(sv.needEffCP - 525) < 0.01, 'got ' + sv.needEffCP);
ok('required incentive in rupees', Math.abs(sv.needIncInr - 75) < 0.01, 'got ' + sv.needIncInr);
ok('required incentive as a percentage', Math.abs(sv.needIncPct - 12.5) < 0.01, 'got ' + sv.needIncPct);
ok('marked reachable', sv.reachable === true);
ok('an unreachable target is flagged', (() => {
  // Landed cost cannot be discounted away, so a high target becomes impossible
  d.getElementById('landed').value = '700'; w.calc();
  const r = w.solveForGp(90);
  d.getElementById('landed').value = ''; w.calc();
  return r && r.reachable === false;
})(), 'expected reachable=false');
ok('rejects 100% and above', w.solveForGp(100) === null);
ok('accounts for landed cost', (() => {
  d.getElementById('landed').value = '50'; w.calc();
  const r = w.solveForGp(30);
  d.getElementById('landed').value = ''; w.calc();
  // eff CP must still be 525, but 50 of that is landed, so incentive must find 125
  return Math.abs(r.needIncInr - 125) < 0.01;
})(), 'landed cost not reflected');
ok('readout renders', (() => {
  d.getElementById('solver-gp').value = '30';
  w.renderSolver();
  return d.getElementById('solver-out').textContent.indexOf('12.50%') !== -1;
})(), d.getElementById('solver-out').textContent);
ok('needs a calculation first', (() => {
  d.getElementById('mrp').value = ''; w.calc();
  w.renderSolver();
  return d.getElementById('solver-out').textContent.indexOf('Enter MRP') !== -1;
})());

// A target BELOW the current GP has no answer in incentive terms — reaching it
// would take a negative incentive, i.e. paying more for the stock. The solver
// used to report exactly that: at 25% GP with a 12% target it said "Needs
// -17.33% total CP incentive … ₹10.40 less per unit", which is not an action
// anyone can take. Report the cushion instead.
freshCalc(100, 40, 20);                 // MRP 100, CP excl 60, SP excl 80, GP 25%
const svAbove = w.solveForGp(12);
ok('a beaten target is flagged as met', svAbove.alreadyMet === true);
// eff CP could rise from 60 to 80 x (1 - 0.12) = 70.40 before GP falls to 12%
ok('cushion is the room on effective CP',
   Math.abs(svAbove.cushionInr - 10.4) < 0.01, 'got ' + svAbove.cushionInr);
ok('the beaten target is still reachable', svAbove.reachable === true);

const solverText = () => {
  w.renderSolver();
  return d.getElementById('solver-out').textContent;
};
const solverClass = () => d.getElementById('solver-out').className;

d.getElementById('solver-gp').value = '12';
const tAbove = solverText();
ok('reads as already met, not as a requirement',
   tAbove.indexOf('Already there') === 0, tAbove);
ok('never quotes a negative incentive', tAbove.indexOf('-') === -1 &&
   tAbove.indexOf('−') === -1, tAbove);
ok('never tells you to take away incentive you do not have',
   tAbove.indexOf('less per unit') === -1, tAbove);
ok('states the room and the ceiling',
   tAbove.indexOf('₹10.40') !== -1 && tAbove.indexOf('₹70.40') !== -1, tAbove);
ok('a met target reads as ok', solverClass().indexOf('ok') !== -1, solverClass());

d.getElementById('solver-gp').value = '25';       // exactly the current GP
const tOn = solverText();
ok('sitting on the target says so', tOn.indexOf('Right on target') === 0, tOn);
ok('and asks for no adjustment', tOn.indexOf('per unit') === -1, tOn);
ok('on-target reads as ok', solverClass().indexOf('ok') !== -1, solverClass());

d.getElementById('solver-gp').value = '30';       // above the current GP
const tBelow = solverText();
ok('a target above current GP still asks for incentive',
   tBelow.indexOf('Needs') === 0, tBelow);
ok('and it is a positive requirement', tBelow.indexOf('more per unit') !== -1, tBelow);
// 80 x 0.70 = 56 eff CP, so 4 of a 60 CP = 6.67%
ok('with the right figures',
   tBelow.indexOf('6.67%') !== -1 && tBelow.indexOf('₹4.00') !== -1, tBelow);
ok('a shortfall is not marked ok', solverClass().indexOf('ok') === -1, solverClass());

// The cushion must follow incentives: 5% CP incentive lifts GP, so the room grows.
d.getElementById('it-eb').checked = true;
d.getElementById('iv-eb').value = '5';
w.syncToggle('eb'); w.calc();
const svInc = w.solveForGp(12);
ok('cushion widens as incentives raise GP', svInc.cushionInr > svAbove.cushionInr,
   'was ' + svAbove.cushionInr + ' now ' + svInc.cushionInr);
d.getElementById('it-eb').checked = false;
w.syncToggle('eb'); w.calc();

R.section('\n=== 72. Incentive presets ===');
freshCalc(1000, 40, 25);
w.PRESETS = {};
// Rendering rebuilds rows from defaults, so set the label first, then values.
w.INC_LABELS['eb'] = 'Dealer rebate';
w.renderCPIncRows();
d.getElementById('it-eb').checked = true;
d.getElementById('iv-eb').value = '3';
w.syncToggle('eb');
w.calc();
const snap = w.capturePreset();
ok('snapshot captures the key lists', snap.cpKeys.length === 5 && snap.spKeys.length === 5);
ok('snapshot captures values', snap.cp.eb.v === '3' && snap.cp.eb.on === true);
ok('snapshot captures labels', snap.labels.eb === 'Dealer rebate');
ok('snapshot captures sub-modes', snap.cdm === 'before' && snap.scm === 'pct');

w.PRESETS['Dealer A'] = snap;
w.savePresets();
ok('persisted to storage', !!w.localStorage.getItem('pc-presets'));

// Change everything, then restore
w.INC_LABELS['eb'] = 'Something else';
w.renderCPIncRows();
d.getElementById('it-eb').checked = false;
d.getElementById('iv-eb').value = '1';
w.syncToggle('eb'); w.calc();
w.applyPreset(w.PRESETS['Dealer A']);
ok('restores the toggle', d.getElementById('it-eb').checked === true);
ok('restores the value', d.getElementById('iv-eb').value === '3');
ok('restores the label', d.getElementById('lbl-cp-eb').textContent === 'Dealer rebate');
ok('recalculates on load', Math.abs(num('pvv') - 168) < 0.05, 'got ' + num('pvv'));

w.PRESETS = {};
w.loadPresets();
ok('reloads from storage', !!w.PRESETS['Dealer A']);
ok('dropdown lists it',
   d.getElementById('preset-select').innerHTML.indexOf('Dealer A') !== -1);
ok('a preset with a malformed key is sanitised', (() => {
  w.applyPreset({ cpKeys: ['cd', '"><img src=x>'], spKeys: ['cd'], labels: {}, cp: {}, sp: {} });
  return w.INC_KEYS.indexOf('"><img src=x>') === -1;
})(), w.INC_KEYS.join(','));
ok('an empty preset falls back to defaults', (() => {
  w.applyPreset({ cpKeys: [], spKeys: [], labels: {}, cp: {}, sp: {} });
  return w.INC_KEYS.length === 5;
})());
w.localStorage.clear();
w.INC_LABELS['eb'] = w.INC_LABELS_DEFAULT['eb'];

R.section('\n=== 73. Outbound (SP) landed cost ===');
freshCalc(1000, 40, 25);
d.getElementById('landed').value = '';
d.getElementById('sp-landed').value = '';
w.calc();
ok('none by default', w.getSPLandedCost() === 0);
ok('effectiveSP is SP less incentives', w.effectiveSP(w.LAST_SP) === 750,
   'got ' + w.effectiveSP(w.LAST_SP));

d.getElementById('sp-landed').value = '30';
w.calc();
ok('outbound cost is read', w.getSPLandedCost() === 30);
ok('it is SUBTRACTED from effective SP', w.effectiveSP(w.LAST_SP) === 720,
   'got ' + w.effectiveSP(w.LAST_SP));
ok('profit falls by exactly that amount', near(num('pvv'), 120), 'got ' + num('pvv'));
ok('effective CP is untouched', w.effectiveCP(w.LAST_CP) === 600);
ok('summary effective SP reflects it', near(num('s-esp'), 720, 0.5), 'got ' + num('s-esp'));
ok('GP uses the net selling price',
   near(num('s-gp'), (120 / 720) * 100, 0.05), 'got ' + num('s-gp'));

ok('negative outbound cost is ignored',
   (() => { d.getElementById('sp-landed').value = '-5'; return w.getSPLandedCost() === 0; })());
d.getElementById('sp-landed').value = '30';

R.section('\n=== 74. Both landed costs together ===');
d.getElementById('landed').value = '50';
w.calc();
ok('inbound raises cost', w.effectiveCP(w.LAST_CP) === 650);
ok('outbound lowers revenue', w.effectiveSP(w.LAST_SP) === 720);
ok('they pull opposite ways', near(num('pvv'), 70), 'got ' + num('pvv'));
ok('the two are independent', (() => {
  d.getElementById('landed').value = '';
  w.calc();
  const onlyOut = w.effectiveCP(w.LAST_CP) === 600 && w.effectiveSP(w.LAST_SP) === 720;
  d.getElementById('landed').value = '50';
  w.calc();
  return onlyOut;
})());

R.section('\n=== 75. Outbound cost flows through every derived figure ===');
// Break-even must cover the outbound cost before the incentive proportion
d.getElementById('landed').value = '';
d.getElementById('sp-landed').value = '30';
d.getElementById('floor-gp').value = '5';
w.calc();
const beOut = w.breakEven(w.LAST_CP, w.LAST_SP);
ok('break-even grosses up for the outbound cost',
   near(beOut.zeroE, 630), 'got ' + beOut.zeroE);
ok('quoted incl GST', near(beOut.zeroI, 630 * 1.18, 0.01), 'got ' + beOut.zeroI);
ok('the GP-floor threshold does too',
   near(beOut.floorE, (600 / 0.95) + 30), 'got ' + beOut.floorE);

// With an SP incentive as well, the flat cost comes off before the ratio
d.getElementById('sit-eb').checked = true;
d.getElementById('siv-eb').value = '10';
w.syncSpToggle('eb'); w.calc();
const beBoth = w.breakEven(w.LAST_CP, w.LAST_SP);
ok('flat cost is grossed up by the incentive ratio',
   near(beBoth.zeroE, (600 + 30) / 0.9), 'got ' + beBoth.zeroE);
d.getElementById('sit-eb').checked = false; w.syncSpToggle('eb'); w.calc();

// The target-margin solver works off net revenue
const svOut = w.solveForGp(20);
ok('solver uses the net selling price',
   near(svOut.needEffCP, 720 * 0.8), 'got ' + svOut.needEffCP);

// Solving FOR selling price must raise the price to cover it
w.setT('sp'); w.setPM('val');
d.getElementById('pri').value = '150';
w.calc();
ok('solve-for-SP covers the outbound cost',
   near(w.effectiveSP(w.LAST_SP), 750, 0.5), 'got ' + w.effectiveSP(w.LAST_SP));
ok('so the target profit is actually met', near(num('pvv'), 150, 0.5), 'got ' + num('pvv'));
w.setT('profit');

R.section('\n=== 76. Outbound cost persists ===');
freshCalc(1000, 40, 25);
d.getElementById('sp-landed').value = '30';
d.getElementById('landed').value = '50';
w.calc();
const stLanded = w.getShareState();
ok('carried in share state', stLanded.slc === '30', 'got ' + stLanded.slc);
ok('inbound still carried too', stLanded.lc === '50', 'got ' + stLanded.lc);
d.getElementById('sp-landed').value = '';
d.getElementById('landed').value = '';
w.applyShareState(stLanded);
ok('outbound restored', w.getSPLandedCost() === 30, 'got ' + w.getSPLandedCost());
ok('inbound restored', w.getLandedCost() === 50, 'got ' + w.getLandedCost());
ok('a malformed value is dropped',
   !('slc' in (w.validateShareState({ m: '1', slc: 'abc' }) || {})));
ok('a negative value is dropped',
   !('slc' in (w.validateShareState({ m: '1', slc: '-9' }) || {})));
w.resetAll();
ok('reset clears both', w.getSPLandedCost() === 0 && w.getLandedCost() === 0);

console.log('\n=== 25. Subtree rebuilds do not strand element references ===');
// Every render* function empties a container and rebuilds it with the SAME
// element ids. That used to strand the el() memo cache: the rebuilt nodes were
// fresh objects, the cache still held the detached originals, and writes landed
// on nodes no longer in the document. renderWhatIf shipped that bug — its cards
// showed '—' on every re-open after the first — and the fix at the time was to
// remember an elClearCache() call after each rebuild.
//
// el() no longer caches, so the class is structurally gone rather than guarded.
// These assertions pin the invariant that makes it impossible, for every
// rebuild site rather than only the one that failed, so a render function added
// later is covered by default.

/**
 * Assert that after `rebuild()`, ids inside `container` still resolve through
 * el() to the live, attached nodes.
 * @param {string} label suite-visible name
 * @param {string} containerId element the render function empties
 * @param {Function} rebuild triggers the rebuild
 */
function pinsRebuild(label, containerId, rebuild) {
  rebuild();
  const c = d.getElementById(containerId);
  if (!c) return ok(label + ': container present', false, 'no #' + containerId);
  const idsBefore = [...c.querySelectorAll('[id]')].map(n => n.id);
  rebuild();                        // second pass — this is where staleness bit
  const c2 = d.getElementById(containerId);
  const stale = [];
  const detached = [];
  for (const id of idsBefore) {
    const live = d.getElementById(id);
    if (!live) continue;            // legitimately gone after a re-render
    if (w.el(id) !== live) stale.push(id);
    if (!c2.contains(live)) detached.push(id);
  }
  ok(label + ' — el() resolves to live nodes after a rebuild (' +
     idsBefore.length + ' ids)', stale.length === 0, 'stale: ' + stale.slice(0, 5));
  ok(label + ' — rebuilt nodes are inside the container',
     detached.length === 0, 'outside: ' + detached.slice(0, 5));
}

d.getElementById('mrp').value = '1000';
w.setCM('excl'); d.getElementById('cpd').value = '40';
w.setSM('excl'); d.getElementById('spd').value = '25';
w.calc();

pinsRebuild('CP incentive grid', 'cp-inc-grid', () => w.renderCPIncRows());
pinsRebuild('SP incentive grid', 'sp-inc-grid', () => w.renderSPIncRows());
pinsRebuild('history list', 'hist-content', () => { w.saveToHistory(); w.renderHistory(); });
// renderWhatIf takes the CP it is rendering for; called bare it blanks the grid.
pinsRebuild('what-if grid', 'wi-grid', () => w.renderWhatIf(w.LAST_CP));
pinsRebuild('quote table', 'qt-table', () => { w.qtAddLine(); w.qtRender(); });

// The original failure was silent: the DOM looked right, the values did not
// arrive. Assert the values, not just the node identity.
w.calc();
w.WI_SCENES[0].spDisc = '25';       // a blank scenario legitimately renders '—'
w.renderWhatIf(w.LAST_CP);
w.updateWiResults();
const wiFirst = d.getElementById('wi-grid').textContent;
ok('what-if shows figures on first render', /₹[\d,]/.test(wiFirst),
   'got ' + wiFirst.slice(0, 90));
w.renderWhatIf(w.LAST_CP);          // re-render, as re-opening the dialog does
w.updateWiResults();
const wiSecond = d.getElementById('wi-grid').textContent;
// This is the assertion the original bug would have failed: identical markup,
// values gone, because updateWiResults wrote into the pre-rebuild nodes.
ok('what-if still shows figures after a re-render', /₹[\d,]/.test(wiSecond),
   'got ' + wiSecond.slice(0, 90));
ok('what-if renders identically across rebuilds', wiSecond === wiFirst,
   'first=' + wiFirst.slice(0, 60) + '\n  second=' + wiSecond.slice(0, 60));
w.WI_SCENES[0].spDisc = '';

// el() must never hand back a node the document has replaced.
const beforeSwap = w.el('cp-inc-grid');
w.renderCPIncRows();
ok('el() tracks a container through its own rebuild',
   w.el('cp-inc-grid') === d.getElementById('cp-inc-grid'));
ok('a rebuilt grid is still the attached one', w.el('cp-inc-grid').isConnected);
ok('el() and getElementById never disagree',
   ['mrp', 'cpd', 'spd', 'cp-inc-grid', 'hist-list', 'wi-grid']
     .every(id => w.el(id) === d.getElementById(id)));
void beforeSwap;

w.clearHistory();
w.resetAll();

R.section('\n=== 26. Edge cases and degenerate input ===');

// ── Solver target range ────────────────────────────────────────────────────
// solveForGp returned null both for an impossible target and for "nothing
// calculated yet", and renderSolver reported every null as "Enter MRP, CP and
// SP first" — telling you to fill in fields that were already full. It also had
// no lower bound, so -20 was accepted as a GP target.
freshCalc(1000, 40, 25);
ok('a target of 100% is rejected', w.solveForGp(100) === null);
ok('a target above 100% is rejected', w.solveForGp(100000) === null);
ok('a negative target is rejected', w.solveForGp(-20) === null);
ok('0% is a legitimate target', w.solveForGp(0) !== null);
ok('99.9% is a legitimate target', w.solveForGp(99.9) !== null);

const solverFor = v => {
  d.getElementById('solver-gp').value = v;
  w.renderSolver();
  return d.getElementById('solver-out');
};
let o = solverFor('100');
ok('100% explains the range, not missing input',
   o.textContent.indexOf('between 0 and 99.9') !== -1, o.textContent);
ok('and does not blame the inputs',
   o.textContent.indexOf('Enter MRP') === -1, o.textContent);
ok('an impossible target reads as bad', o.className.indexOf('bad') !== -1, o.className);
o = solverFor('-20');
ok('a negative target is refused too',
   o.textContent.indexOf('between 0 and 99.9') !== -1, o.textContent);
o = solverFor('1e5');
ok('so is an absurd one', o.textContent.indexOf('between 0 and 99.9') !== -1, o.textContent);
o = solverFor('');
ok('an empty target still prompts', o.textContent.indexOf('Enter a target') !== -1, o.textContent);
ok('99.9 is still solvable',
   solverFor('99.9').textContent.indexOf('Needs') === 0, solverFor('99.9').textContent);
// The genuine "no calculation" case must keep its own message.
d.getElementById('mrp').value = ''; w.calc();
ok('missing inputs keep their own message',
   solverFor('30').textContent.indexOf('Enter MRP') !== -1, solverFor('30').textContent);

// ── Break-even must go blank, never stale ──────────────────────────────────
// breakEven() returns null when effective CP is zero or negative. The row keeps
// its last text, so what matters is that it is hidden — a visible figure from a
// previous calculation would be read as belonging to this one.
const beShown = () => {
  const row = d.getElementById('s-item-be');
  return row && row.style.display !== 'none';
};
freshCalc(1000, 40, 25);
ok('break-even shows for a normal calculation', beShown() === true);
ok('and has a value', w.breakEven(w.LAST_CP, w.LAST_SP) !== null);
d.getElementById('mrp').value = ''; w.calc();
ok('break-even is null with no MRP', w.breakEven(w.LAST_CP, w.LAST_SP) === null);
ok('and the row is hidden rather than left stale', beShown() === false);
ok('the floor row is hidden too',
   d.getElementById('s-item-bef').style.display === 'none');
ok('as is the separator', d.getElementById('s-be-sep').style.display === 'none');

// Incentives exceeding CP drive effective CP negative — same requirement.
freshCalc(1000, 40, 25);
['cd', 'eb', 'qt', 'an', 'sc'].forEach(k => {
  d.getElementById('it-' + k).checked = true;
  d.getElementById('iv-' + k).value = '40';
  w.syncToggle(k);
});
w.calc();
ok('incentives above 100% give a negative effective CP', w.effectiveCP(w.LAST_CP) < 0,
   'got ' + w.effectiveCP(w.LAST_CP));
ok('break-even refuses to answer', w.breakEven(w.LAST_CP, w.LAST_SP) === null);
ok('and hides rather than showing a stale price', beShown() === false);

// ── Division-by-zero display ───────────────────────────────────────────────
// Zero effective SP or CP must render an em dash, never Infinity or NaN.
const dashOrNumber = id => {
  const t = d.getElementById(id).textContent.trim();
  return t === '—' || /^-?₹?[\d,]/.test(t);
};
freshCalc(1000, 100, 25);           // CP 100% off -> effective CP zero
ok('a zero cost price gives no Margin %',
   d.getElementById('s-mg').textContent.trim() === '—',
   d.getElementById('s-mg').textContent);
ok('but GP % is still real', d.getElementById('s-gp').textContent.indexOf('100.00') !== -1,
   d.getElementById('s-gp').textContent);
freshCalc(1000, 40, 100);           // SP 100% off -> effective SP zero
ok('a zero selling price gives no GP %',
   d.getElementById('s-gp').textContent.trim() === '—',
   d.getElementById('s-gp').textContent);
freshCalc(1000, 100, 100);
ok('both zero leaves both blank',
   d.getElementById('s-gp').textContent.trim() === '—' &&
   d.getElementById('s-mg').textContent.trim() === '—');
ok('and never prints Infinity or NaN',
   ['s-gp', 's-mg', 's-pr', 's-ecp', 's-esp'].every(dashOrNumber),
   ['s-gp', 's-mg', 's-pr', 's-ecp', 's-esp']
     .map(i => i + '=' + d.getElementById(i).textContent.trim()).join(' '));

// ── Quantity: what is shown must be what is used ───────────────────────────
freshCalc(1000, 40, 25);
const qty = d.getElementById('qty');
qty.value = '2.5'; w.calc();
ok('a fractional quantity computes on the whole part', w.getQty() === 2, 'got ' + w.getQty());
w.normalizeQty();
ok('and the field is corrected to match', qty.value === '2', 'got ' + qty.value);
qty.value = '0'; w.calc(); w.normalizeQty();
ok('zero normalises to one', qty.value === '1' && w.getQty() === 1, 'got ' + qty.value);
qty.value = '-5'; w.calc(); w.normalizeQty();
ok('a negative normalises to one', qty.value === '1', 'got ' + qty.value);
qty.value = '7'; w.calc(); w.normalizeQty();
ok('a valid quantity is left alone', qty.value === '7', 'got ' + qty.value);
qty.value = ''; w.normalizeQty();
ok('an empty field is left empty to type into', qty.value === '', 'got ' + qty.value);
qty.value = '1'; w.calc();
w.stepQty(-1);
ok('stepping down from 1 stays at 1', qty.value === '1', 'got ' + qty.value);

// ── Quote lines: a negative quantity is not a negative order ───────────────
// parseInt(L.qty,10)||1 let -4 through, since -4 is truthy. The quote then
// reported negative units, a negative order value and a negative profit.
w.QUOTE.length = 0;
w.qtAddLine();
w.qtSet(0, 'mrp', '1000'); w.qtSet(0, 'cpd', '40'); w.qtSet(0, 'spd', '25');
w.qtSet(0, 'qty', '3');
let qt = w.qtTotals();
ok('a normal quote line totals correctly', qt.units === 3 && Math.abs(qt.pr - 450) < 0.01,
   JSON.stringify(qt));
w.qtSet(0, 'qty', '-4');
qt = w.qtTotals();
ok('a negative quantity cannot make negative units', qt.units >= 1, JSON.stringify(qt));
ok('nor a negative order value', qt.val > 0, JSON.stringify(qt));
ok('nor a negative profit on a profitable line', qt.pr > 0, JSON.stringify(qt));
w.qtSet(0, 'qty', '0');
ok('zero clamps the same way as the calculator', w.qtTotals().units === 1,
   JSON.stringify(w.qtTotals()));
w.qtSet(0, 'qty', 'abc');
ok('so does a non-number', w.qtTotals().units === 1, JSON.stringify(w.qtTotals()));
w.qtSet(0, 'qty', '2.5');
ok('a fractional quantity floors', w.qtTotals().units === 2, JSON.stringify(w.qtTotals()));
w.QUOTE.length = 0;
qt = w.qtTotals();
ok('an empty quote totals zero, not NaN',
   qt.units === 0 && qt.val === 0 && qt.lines === 0, JSON.stringify(qt));
ok('and blended GP is null rather than a division by zero',
   qt.gp === null && qt.mg === null, JSON.stringify(qt));

// ── Custom GST and rounding reject out-of-range input ──────────────────────
freshCalc(1000, 40, 25);
const gstIn = d.getElementById('gst-custom');
gstIn.value = '0'; w.onCustomGST(gstIn);
ok('0% GST is allowed', w.G === 0, 'got ' + w.G);
gstIn.value = '100'; w.onCustomGST(gstIn);
ok('100% GST is allowed', Math.abs(w.G - 1) < 1e-9, 'got ' + w.G);
gstIn.value = '-5'; w.onCustomGST(gstIn);
ok('a negative rate is refused', Math.abs(w.G - 1) < 1e-9, 'got ' + w.G);
ok('and the field is put back', gstIn.value === '100', 'got ' + gstIn.value);
gstIn.value = '200'; w.onCustomGST(gstIn);
ok('a rate above 100 is refused', Math.abs(w.G - 1) < 1e-9, 'got ' + w.G);
gstIn.value = ''; w.setGST(18);

const rndIn = d.getElementById('rnd-custom');
rndIn.value = '0.5'; w.onCustomRounding(rndIn);
ok('a fractional rounding step is allowed', w.roundStep() === 0.5, 'got ' + w.roundStep());
rndIn.value = '0'; w.onCustomRounding(rndIn);
ok('a zero step is refused', w.roundStep() === 0.5, 'got ' + w.roundStep());
ok('and the field is put back', rndIn.value === '0.5', 'got ' + rndIn.value);
rndIn.value = '-3'; w.onCustomRounding(rndIn);
ok('a negative step is refused', w.roundStep() === 0.5, 'got ' + w.roundStep());
rndIn.value = '100001'; w.onCustomRounding(rndIn);
ok('an absurd step is refused', w.roundStep() === 0.5, 'got ' + w.roundStep());
w.setRounding('off'); rndIn.value = '';
ok('rounding off means no step', w.roundStep() === 0, 'got ' + w.roundStep());

w.QUOTE.length = 0;
w.resetAll();

R.section('\n=== 27. Presets: in-app dialogs, rename and update ===');

// Naming a preset used window.prompt(). It cannot be themed, sits outside the
// app's focus trap and Escape handling, blocks the main thread, and on a phone
// appears as an OS alert unrelated to the page. It also has no validation, so a
// name matching an existing preset silently replaced it, and there was no way
// to rename a preset at all — only save and delete.
const src = readAsset('assets/app.js') + readAsset('assets/app-extra.js');
const stripped = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
ok('no window.prompt in the shipped code',
   !/(^|[^.\w])prompt\s*\(/.test(stripped.replace(/askPrompt|closePrompt|runPrompt|validatePrompt|_promptField/g, '')),
   'still present');
ok('no window.alert either',
   !/(^|[^.\w])alert\s*\(/.test(stripped), 'still present');
ok('no window.confirm either',
   !/(^|[^.\w])confirm\s*\(/.test(stripped.replace(/askConfirm|runConfirm|closeConfirm/g, '')),
   'still present');

const overlayOpen = id => {
  const o = d.getElementById('overlay-' + id);
  return !!o && o.classList.contains('open');
};

freshCalc(1000, 40, 25);
w.PRESETS = {};
d.getElementById('it-eb').checked = true;
d.getElementById('iv-eb').value = '5';
w.syncToggle('eb'); w.calc();

// ── Saving ────────────────────────────────────────────────────────────────
w.savePresetAs();
ok('save opens the app dialog, not a native one', overlayOpen('prompt'));
ok('with a heading', d.getElementById('prompt-title').textContent === 'Save preset',
   d.getElementById('prompt-title').textContent);
ok('and a labelled field',
   d.getElementById('prompt-label').getAttribute('for') === 'prompt-input');
d.getElementById('prompt-input').value = '';
w.validatePrompt();
ok('an empty name is refused', d.getElementById('prompt-ok').disabled === true);
ok('and says why', d.getElementById('prompt-hint').textContent.indexOf('Give the preset a name') !== -1,
   d.getElementById('prompt-hint').textContent);
d.getElementById('prompt-input').value = 'Bosch Q3';
w.validatePrompt();
ok('a valid name is accepted', d.getElementById('prompt-ok').disabled === false);
ok('with no complaint', d.getElementById('prompt-hint').textContent === '',
   d.getElementById('prompt-hint').textContent);
w.runPrompt();
ok('the preset is saved', Object.keys(w.PRESETS).length === 1 && 'Bosch Q3' in w.PRESETS,
   JSON.stringify(Object.keys(w.PRESETS)));
ok('and the dialog closes', overlayOpen('prompt') === false);
ok('the dropdown selects it', d.getElementById('preset-select').value === 'Bosch Q3',
   d.getElementById('preset-select').value);

// ── A clash warns rather than silently overwriting ────────────────────────
w.savePresetAs();
d.getElementById('prompt-input').value = 'Bosch Q3';
w.validatePrompt();
ok('an existing name warns', d.getElementById('prompt-hint').textContent.indexOf('already exists') !== -1,
   d.getElementById('prompt-hint').textContent);
ok('but is still allowed — replacing is a real intent',
   d.getElementById('prompt-ok').disabled === false);
ok('and the warning is marked as a note, not an error',
   d.getElementById('prompt-hint').className.indexOf('prompt-note') !== -1,
   d.getElementById('prompt-hint').className);
w.closePrompt();
ok('cancelling leaves the presets alone', Object.keys(w.PRESETS).length === 1);

// ── Renaming, which did not exist before ──────────────────────────────────
w.renamePreset('Bosch Q3');
ok('rename opens the dialog', overlayOpen('prompt'));
ok('prefilled with the current name', d.getElementById('prompt-input').value === 'Bosch Q3',
   d.getElementById('prompt-input').value);
ok('and the button says Rename', d.getElementById('prompt-ok').textContent === 'Rename',
   d.getElementById('prompt-ok').textContent);
ok('keeping the same name is not flagged as a clash',
   d.getElementById('prompt-ok').disabled === false);
d.getElementById('prompt-input').value = 'Bosch Q4';
w.validatePrompt();
w.runPrompt();
ok('the preset is renamed', 'Bosch Q4' in w.PRESETS && !('Bosch Q3' in w.PRESETS),
   JSON.stringify(Object.keys(w.PRESETS)));
ok('its contents survive the rename',
   w.PRESETS['Bosch Q4'] && w.PRESETS['Bosch Q4'].cp && w.PRESETS['Bosch Q4'].cp.eb.on === true,
   JSON.stringify(w.PRESETS['Bosch Q4'] && w.PRESETS['Bosch Q4'].cp));
ok('and the dropdown follows it', d.getElementById('preset-select').value === 'Bosch Q4',
   d.getElementById('preset-select').value);

// Renaming onto another preset's name warns before replacing it.
w.PRESETS['Other'] = w.capturePreset();
w.renderPresetList();
w.renamePreset('Bosch Q4');
d.getElementById('prompt-input').value = 'Other';
w.validatePrompt();
ok('renaming onto an existing name warns',
   d.getElementById('prompt-hint').textContent.indexOf('already exists') !== -1,
   d.getElementById('prompt-hint').textContent);
w.closePrompt();
delete w.PRESETS['Other'];
w.renderPresetList();

// ── Updating in place ─────────────────────────────────────────────────────
d.getElementById('iv-eb').value = '9';
w.syncToggle('eb'); w.calc();
w.updatePreset('Bosch Q4');
ok('update asks first', overlayOpen('confirm'));
w.runConfirm();
ok('and rewrites the saved copy', w.PRESETS['Bosch Q4'].cp.eb.v === '9',
   JSON.stringify(w.PRESETS['Bosch Q4'].cp.eb));

// ── Deleting, and undo ────────────────────────────────────────────────────
w.deletePreset('Bosch Q4');
ok('delete asks first', overlayOpen('confirm'));
ok('and names the preset',
   d.getElementById('confirm-msg').textContent.indexOf('Bosch Q4') !== -1,
   d.getElementById('confirm-msg').textContent);
w.runConfirm();
ok('the preset is gone', !('Bosch Q4' in w.PRESETS));
// captureState() did not include PRESETS, so pushUndo('delete preset') captured
// everything except the thing being deleted and undo quietly did nothing.
w.undo();
ok('undo brings a deleted preset back', 'Bosch Q4' in w.PRESETS,
   JSON.stringify(Object.keys(w.PRESETS)));
w.redo();
ok('redo removes it again', !('Bosch Q4' in w.PRESETS),
   JSON.stringify(Object.keys(w.PRESETS)));
w.undo();

// ── The manager ───────────────────────────────────────────────────────────
w.openPresetManager();
ok('the manager opens', overlayOpen('presets'));
ok('one row per preset', d.querySelectorAll('#pm-list .pm-row').length === Object.keys(w.PRESETS).length,
   d.querySelectorAll('#pm-list .pm-row').length + ' rows for ' + Object.keys(w.PRESETS).length);
const acts = [...d.querySelectorAll('#pm-list .pm-row')[0].querySelectorAll('.pm-btn')]
  .map(b => b.textContent);
ok('each row offers load, rename, update and delete',
   acts.join(',') === 'Load,Rename,Update,Delete', acts.join(','));
ok('every action button has an accessible name naming the preset',
   [...d.querySelectorAll('#pm-list .pm-btn')]
     .every(b => (b.getAttribute('aria-label') || '').indexOf('Bosch Q4') !== -1),
   [...d.querySelectorAll('#pm-list .pm-btn')].map(b => b.getAttribute('aria-label')).join(' | '));
w.closeModal('presets');

w.PRESETS = {};
w.renderPresetManager();
ok('an empty manager explains what to do',
   d.querySelector('#pm-list .pm-empty') !== null &&
   d.querySelector('#pm-list .pm-empty').textContent.indexOf('No presets yet') !== -1,
   d.getElementById('pm-list').innerHTML.slice(0, 80));

// ── Preset names are untrusted text ───────────────────────────────────────
// They come back from localStorage and are written into the manager's markup,
// including into data-p attributes that the delegated handlers read back.
const nasty = '<img src=x onerror=alert(1)>';
w.PRESETS[nasty] = w.capturePreset();
w.renderPresetManager();
ok('a name containing markup does not become an element',
   d.querySelector('#pm-list img') === null,
   d.getElementById('pm-list').innerHTML.slice(0, 120));
ok('it renders as text instead',
   d.querySelector('#pm-list .pm-name').textContent === nasty,
   d.querySelector('#pm-list .pm-name').textContent);
ok('and round-trips through the data attribute intact',
   d.querySelector('#pm-list .pm-btn').getAttribute('data-p') === nasty,
   d.querySelector('#pm-list .pm-btn').getAttribute('data-p'));
w.PRESETS = {};
w.renderPresetList(); w.renderPresetManager();

// ── The dialog behaves like a dialog ──────────────────────────────────────
let promptResult = null;
w.askPrompt({ title: 'T', label: 'L', value: 'seed', okLabel: 'Go',
              onOk: function (v) { promptResult = v; } });
ok('Enter submits', (() => {
  d.getElementById('prompt-input').value = '  spaced  ';
  w.validatePrompt();
  w.runPrompt();
  return promptResult === 'spaced';                      // trimmed
})(), 'got ' + JSON.stringify(promptResult));

promptResult = null;
w.askPrompt({ title: 'T', label: 'L', value: 'seed', onOk: function (v) { promptResult = v; } });
w.closePrompt();
ok('cancelling never calls back', promptResult === null, 'got ' + JSON.stringify(promptResult));
ok('and closes the overlay', overlayOpen('prompt') === false);

w.askPrompt({ title: 'Copy link', label: 'Link', value: 'https://example.test/?s=abc',
              readOnly: true, okLabel: 'Done', onOk: function () {} });
ok('a copy-only dialog makes the field read-only',
   d.getElementById('prompt-input').readOnly === true);
ok('and hides Cancel, since there is nothing to cancel',
   d.getElementById('overlay-prompt').querySelector('.confirm-btn:not(.primary)').style.display === 'none');
w.closePrompt();

w.askPrompt({ title: 'Copy summary', label: 'Summary', value: 'line one\nline two',
              multiline: true, okLabel: 'Done', onOk: function () {} });
ok('a multi-line value uses the textarea',
   d.getElementById('prompt-textarea').style.display !== 'none' &&
   d.getElementById('prompt-input').style.display === 'none');
ok('and carries the whole value',
   d.getElementById('prompt-textarea').value.indexOf('line two') !== -1,
   d.getElementById('prompt-textarea').value);
w.closePrompt();
ok('the single-line field comes back afterwards', (() => {
  w.askPrompt({ title: 'T', label: 'L', value: 'x', onOk: function () {} });
  const back = d.getElementById('prompt-input').style.display !== 'none' &&
               d.getElementById('prompt-textarea').style.display === 'none';
  w.closePrompt();
  return back;
})());

R.section('\n=== 28. Reaching the preset manager, and never overwriting silently ===');

const pressKey = k => d.dispatchEvent(new w.KeyboardEvent('keydown', { key: k, bubbles: true }));

freshCalc(1000, 40, 25);
w.PRESETS = { 'Bosch Q3': w.capturePreset() };
w.renderPresetList();

// ── Keyboard ──────────────────────────────────────────────────────────────
// P is Solve-for-Profit and S is Settings, so neither initial was free; E is.
pressKey('e');
ok('E opens the preset manager', overlayOpen('presets'));
w.closeModal('presets');
pressKey('E');
ok('shift does not matter', overlayOpen('presets'));
w.closeModal('presets');
ok('and the manager is populated when opened by keyboard',
   d.querySelectorAll('#pm-list .pm-row').length === 1,
   d.querySelectorAll('#pm-list .pm-row').length + ' rows');

// A shortcut that fires mid-typing would be worse than no shortcut.
d.getElementById('mrp').focus();
pressKey('e');
ok('E is ignored while a field has focus', overlayOpen('presets') === false);
d.getElementById('mrp').blur();

// The other single-letter shortcuts must still do what they did.
pressKey('s');
ok('S still opens settings', overlayOpen('settings'));
w.closeModal('settings');
pressKey('p');
ok('P still selects Solve for Profit', w.SOLVE_FOR === 'profit' || w.T === 'profit',
   'solve target is ' + (w.SOLVE_FOR || w.T));
pressKey('m');
ok('M still opens the quote builder', overlayOpen('quote'));
w.closeModal('quote');

ok('the shortcut is listed in the shortcuts dialog', (() => {
  const rows = [...d.querySelectorAll('#overlay-shortcuts .kb-row')];
  const row = rows.find(r => /preset/i.test(r.textContent));
  return !!row && /\bE\b/.test(row.querySelector('.kb-keys').textContent);
})(), [...d.querySelectorAll('#overlay-shortcuts .kb-row')].map(r => r.textContent).join(' | ').slice(0, 120));

// ── Settings ──────────────────────────────────────────────────────────────
w.openModal('settings');
const manageBtn = [...d.querySelectorAll('#overlay-settings button')]
  .find(b => b.textContent.trim() === 'Manage');
ok('Settings offers a Manage button', !!manageBtn);
ok('under a Presets heading',
   [...d.querySelectorAll('#overlay-settings .modal-section-title')]
     .some(t => t.textContent.trim() === 'Presets'),
   [...d.querySelectorAll('#overlay-settings .modal-section-title')].map(t => t.textContent).join(', '));
w.ACT.settingsPresets();
ok('it closes Settings first', overlayOpen('settings') === false);
ok('and opens the manager', overlayOpen('presets'));
// Two open dialogs would leave the focus trap cycling inside the wrong one.
ok('only one dialog is open at a time',
   ['settings', 'presets', 'quote', 'whatif', 'shortcuts', 'prompt', 'confirm']
     .filter(overlayOpen).length === 1);
w.closeModal('presets');

// ── Nothing is replaced without asking ────────────────────────────────────
const snapshot = () => JSON.stringify(w.PRESETS['Bosch Q3']);
const preUpdate = snapshot();
d.getElementById('it-eb').checked = true;
d.getElementById('iv-eb').value = '7';
w.syncToggle('eb'); w.calc();

w.savePresetAs();
d.getElementById('prompt-input').value = 'Bosch Q3';
w.validatePrompt();
ok('saving onto an existing name warns first',
   d.getElementById('prompt-hint').textContent.indexOf('already exists') !== -1,
   d.getElementById('prompt-hint').textContent);
ok('and has not written anything yet', snapshot() === preUpdate);
w.closePrompt();
ok('cancelling the dialog leaves the preset as it was', snapshot() === preUpdate);

w.updatePreset('Bosch Q3');
ok('Update asks before replacing', overlayOpen('confirm'));
ok('and has not written anything yet', snapshot() === preUpdate);
w.closeConfirm();
ok('cancelling that leaves it as it was too', snapshot() === preUpdate);

w.updatePreset('Bosch Q3');
w.runConfirm();
ok('confirming does replace it', snapshot() !== preUpdate,
   'preset unchanged after confirming');

w.deletePreset('Bosch Q3');
ok('deleting asks as well', overlayOpen('confirm'));
ok('and has not deleted yet', 'Bosch Q3' in w.PRESETS);
w.closeConfirm();
ok('cancelling keeps the preset', 'Bosch Q3' in w.PRESETS);

// No code path may write a preset without a dialog having been through.
ok('there is no silent-overwrite entry point',
   !/PRESETS\[[^\]]+\]\s*=\s*capturePreset\(\)/.test(
     readAsset('assets/app.js')
       .replace(/onOk:function\([^)]*\)\{[\s\S]*?\n    \}/g, '')      // save dialog callback
       .replace(/askConfirm\([\s\S]*?\n    \}\);/g, '')),             // update confirmation
   'a write outside the dialog callbacks');

w.PRESETS = {};
w.renderPresetList(); w.renderPresetManager();
w.resetAll();

R.section('\n=== 29. Currency conversion and grouping ===');

freshCalc(1000, 40, 25);
w.DISPLAY_CCY = 'INR';
w.FX.rates = { INR: 1 }; w.FX.manual = {}; w.FX.fetched = 0; w.FX.src = null;

// ── Rupees are unchanged ──────────────────────────────────────────────────
// INR is the base: everything is entered, stored and calculated in rupees, and
// only the display converts. Rupee output must be byte-identical to before.
ok('rupees still group Indian-style', w.INR(1234567.891) === '₹12,34,567.89', w.INR(1234567.891));
ok('and at crore scale', w.INR(987654321.55) === '₹98,76,54,321.55', w.INR(987654321.55));
ok('zero and negatives unchanged', w.INR(0) === '₹0.00' && w.INR(-500.5) === '₹-500.50');
ok('NaN still dashes', w.INR(NaN) === '—');

// ── Foreign currencies group in millions ──────────────────────────────────
w.FX.rates = { INR: 1, USD: 1, EUR: 1, JPY: 1, AED: 1 };
w.FX.fetched = w.nowMs(); w.FX.src = 'live';
w.setDisplayCcy('USD');
ok('a foreign currency groups in thousands, not lakhs',
   w.INR(987654321.55) === '$987,654,321.55', w.INR(987654321.55));
ok('and at a million exactly', w.INR(1000000) === '$1,000,000.00', w.INR(1000000));
w.setDisplayCcy('EUR');
ok('same for the euro', w.INR(1234567.891) === '€1,234,567.89', w.INR(1234567.891));
w.setDisplayCcy('AED');
ok('and for a code-prefixed symbol', w.INR(1234567.891) === 'AED 1,234,567.89', w.INR(1234567.891));
// The manual fallback, used only when Intl is missing, must group the same way.
ok('the non-Intl fallback groups in thousands too',
   w.fmtWESTERN(1234567.891) === '1,234,567.89', w.fmtWESTERN(1234567.891));
ok('and the Indian one still does not',
   w.fmtINDIAN(1234567.891) === '12,34,567.89', w.fmtINDIAN(1234567.891));

// ── Conversion maths ──────────────────────────────────────────────────────
w.FX.rates = { INR: 1, USD: 0.01045 };
w.setDisplayCcy('USD');
ok('rate is units per rupee', Math.abs(w.fxRate('USD') - 0.01045) < 1e-9);
ok('and is quoted back as rupees per unit',
   Math.abs(w.inrPerUnit('USD') - 95.6938) < 0.001, 'got ' + w.inrPerUnit('USD'));
ok('amounts convert', Math.abs(w.toDisplay(1000) - 10.45) < 1e-9, 'got ' + w.toDisplay(1000));
ok('the summary converts too',
   d.getElementById('s-cp').textContent.trim() === '$6.27',
   d.getElementById('s-cp').textContent);
// 600 INR x 0.01045 = 6.27; the underlying calculation is untouched
ok('while the calculation stays in rupees', Math.abs(w.LAST_CP.e - 600) < 0.01,
   'got ' + w.LAST_CP.e);
ok('and effective CP is still rupees', Math.abs(w.effectiveCP(w.LAST_CP) - 600) < 0.01);

// ── A missing rate must never print an unconverted number ─────────────────
w.setDisplayCcy('BRL');
ok('an unknown rate reads as null', w.fxRate('BRL') === null);
ok('conversion refuses rather than guessing', w.toDisplay(1000) === null);
ok('and the display dashes instead of showing rupees wearing a foreign symbol',
   w.INR(1000) === '—', w.INR(1000));
ok('the note says so', d.getElementById('fx-note').textContent.indexOf('no rate') !== -1,
   d.getElementById('fx-note').textContent);

// ── Manual override ───────────────────────────────────────────────────────
const fxIn = d.getElementById('fx-manual');
fxIn.value = '5.4'; w.onFxManual(fxIn);
ok('a manual rate is stored as units per rupee',
   Math.abs(w.fxRate('BRL') - 1 / 5.4) < 1e-9, 'got ' + w.fxRate('BRL'));
ok('and quoted back as entered', Math.abs(w.inrPerUnit('BRL') - 5.4) < 1e-9);
ok('amounts use it', w.INR(1000) === 'R$185.19', w.INR(1000));
ok('the note credits you, not the feed',
   d.getElementById('fx-note').textContent.indexOf('set by you') !== -1,
   d.getElementById('fx-note').textContent);
// A manual rate is usually contractual, so it must win over a fetched one.
w.FX.rates.BRL = 0.02;
ok('a manual rate beats a fetched one', Math.abs(w.fxRate('BRL') - 1 / 5.4) < 1e-9);
fxIn.value = '0'; w.onFxManual(fxIn);
ok('zero is refused', Math.abs(w.fxRate('BRL') - 1 / 5.4) < 1e-9, 'got ' + w.fxRate('BRL'));
fxIn.value = '-3'; w.onFxManual(fxIn);
ok('so is a negative', Math.abs(w.fxRate('BRL') - 1 / 5.4) < 1e-9);
fxIn.value = ''; w.onFxManual(fxIn);
ok('clearing it falls back to the fetched rate', Math.abs(w.fxRate('BRL') - 0.02) < 1e-9,
   'got ' + w.fxRate('BRL'));

// ── An unknown code cannot be forced in ───────────────────────────────────
w.setDisplayCcy('XXX');
ok('an unknown currency falls back to rupees', w.DISPLAY_CCY === 'INR', w.DISPLAY_CCY);

// ── Persistence, and what a share link carries ────────────────────────────
w.FX.rates = { INR: 1, USD: 0.01045 };
w.FX.fetched = w.nowMs(); w.FX.src = 'live'; w.FX.manual = { USD: 0.011 };
w.saveFx();
w.FX = { rates: { INR: 1 }, fetched: 0, src: null, manual: {} };
w.loadFx();
ok('rates survive a reload', Math.abs(w.FX.rates.USD - 0.01045) < 1e-9);
ok('so does a manual override', Math.abs(w.FX.manual.USD - 0.011) < 1e-9);
// The cache is untrusted: it is localStorage, editable by anything on the origin.
w.localStorage.setItem('pc-fx', JSON.stringify({
  rates: { USD: 'abc', EUR: -4, GBP: 0, JPY: 0.0059, ZZZ: 5 }, manual: { USD: -1 }, fetched: 'soon'
}));
w.FX = { rates: { INR: 1 }, fetched: 0, src: null, manual: {} };
w.loadFx();
ok('a non-numeric rate is dropped', w.FX.rates.USD === undefined);
ok('a negative rate is dropped', w.FX.rates.EUR === undefined);
ok('a zero rate is dropped', w.FX.rates.GBP === undefined);
ok('an unknown code is dropped', w.FX.rates.ZZZ === undefined);
ok('a good rate in the same payload survives', Math.abs(w.FX.rates.JPY - 0.0059) < 1e-9);
ok('a bad manual rate is dropped', w.FX.manual.USD === undefined);
ok('a bad timestamp becomes zero', w.FX.fetched === 0, 'got ' + w.FX.fetched);
ok('INR is always present', w.FX.rates.INR === 1);
w.localStorage.removeItem('pc-fx');

w.FX.rates = { INR: 1, USD: 0.01045 }; w.FX.manual = {};
w.setDisplayCcy('USD');
const fxShare = w.getShareState();
ok('a share link carries the display currency', fxShare.ccy === 'USD', fxShare.ccy);
w.setDisplayCcy('INR');
w.applyShareState(fxShare);
ok('and restores it', w.DISPLAY_CCY === 'USD', w.DISPLAY_CCY);
ok('a share link with a bogus currency is rejected',
   !('ccy' in (w.validateShareState({ m: '1', ccy: 'ZZZ' }) || {})));
ok('but a real one is accepted',
   (w.validateShareState({ m: '1', ccy: 'GBP' }) || {}).ccy === 'GBP');
// The rate itself is deliberately not shared: the recipient should fetch a
// current one rather than inherit whatever was cached when the link was made.
ok('the rate is not carried in the link',
   !('fx' in fxShare) && !('rate' in fxShare), JSON.stringify(Object.keys(fxShare)));

// ── Age reporting ─────────────────────────────────────────────────────────
ok('a fresh fetch reads as recent', w.fxAgeText(30 * 1000) === 'just now', w.fxAgeText(30 * 1000));
ok('minutes', w.fxAgeText(45 * 60 * 1000) === '45m ago', w.fxAgeText(45 * 60 * 1000));
ok('hours', w.fxAgeText(5 * 3600 * 1000) === '5h ago', w.fxAgeText(5 * 3600 * 1000));
ok('days', w.fxAgeText(50 * 3600 * 1000) === '2d ago', w.fxAgeText(50 * 3600 * 1000));
ok('never fetched', w.fxAgeText(null) === 'never');

// ── The network layer ─────────────────────────────────────────────────────
// Stubbed rather than live: a suite that depends on a third-party API is a
// suite that goes red when someone else has an outage.
const withFetch = (impl, fn) => {
  const real = w.fetch;
  w.fetch = impl;
  return Promise.resolve(fn()).then(r => { w.fetch = real; return r; },
                                    e => { w.fetch = real; throw e; });
};
const okPayload = {
  result: 'success', base_code: 'INR',
  rates: { USD: 0.0104, EUR: 0.0091, GBP: 0.0078, JPY: 1.69 }
};
const results = [];
const runFetchCases = () => withFetch(() => Promise.resolve({ ok: true, json: () => Promise.resolve(okPayload) }),
  () => { w.FX.rates = { INR: 1 }; w.FX.fetched = 0; w.FX.manual = {};
          return w.fetchRates(true).then(r => results.push(['success', r, w.FX.rates.USD, w.FX.src])); })

  .then(() => withFetch(() => Promise.resolve({ ok: false, status: 503 }),
    () => { w.FX.rates = { INR: 1, USD: 0.0104 }; w.FX.fetched = w.nowMs();
            return w.fetchRates(true).then(r => results.push(['http-error', r, w.FX.rates.USD])); }))

  .then(() => withFetch(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ result: 'error' }) }),
    () => { w.FX.rates = { INR: 1, USD: 0.0104 };
            return w.fetchRates(true).then(r => results.push(['bad-payload', r, w.FX.rates.USD])); }))

  .then(() => withFetch(() => Promise.resolve({ ok: true, json: () => Promise.resolve(
      { result: 'success', base_code: 'USD', rates: { EUR: 0.9 } }) }),
    () => { w.FX.rates = { INR: 1, USD: 0.0104 };
            return w.fetchRates(true).then(r => results.push(['wrong-base', r, w.FX.rates.USD])); }))

  .then(() => withFetch(() => Promise.reject(new Error('offline')),
    () => { w.FX.rates = { INR: 1, USD: 0.0104 };
            return w.fetchRates(true).then(r => results.push(['offline', r, w.FX.rates.USD])); }));

runFetchCases().then(() => {
  const byName = Object.fromEntries(results.map(r => [r[0], r]));
  ok('a good payload updates the rates',
     byName.success && byName.success[1] === true && Math.abs(byName.success[2] - 0.0104) < 1e-9,
     JSON.stringify(byName.success));
  ok('and marks them as live', byName.success && byName.success[3] === 'live');
  // Every failure mode must leave the cached rates alone rather than wiping them.
  ['http-error', 'bad-payload', 'wrong-base', 'offline'].forEach(k => {
    ok(k + ' keeps the cached rate',
       byName[k] && byName[k][1] === false && Math.abs(byName[k][2] - 0.0104) < 1e-9,
       JSON.stringify(byName[k]));
  });

  // ── The one external origin is declared, and only that one ──────────────
  ok('connect-src names the rates host',
     /connect-src\s+'self'\s+https:\/\/open\.er-api\.com\s*;/.test(mk),
     (mk.match(/connect-src[^;]*/) || [''])[0]);
  // connect-src governs fetch/XHR, not navigation, so the WhatsApp share link
  // (window.open to wa.me) is deliberately not in it. What matters is that the
  // app makes exactly one network request, to the host that is declared.
  const bundles = readAsset('assets/app.js') + readAsset('assets/app-extra.js');
  // `typeof fetch` has no paren after it, so it never matches this.
  const fetchCalls = (bundles.match(/(^|[^.\w])fetch\s*\(/g) || []).length;
  ok('the app makes exactly one network request', fetchCalls === 1, 'found ' + fetchCalls);
  ok('and it goes to the declared host',
     /var FX_URL='https:\/\/open\.er-api\.com\//.test(bundles) &&
     /fetch\(FX_URL/.test(bundles));
  ok('every other external URL is a navigation, not a request',
     bundles.match(/https:\/\/[a-z0-9.-]+/gi)
       .filter(u => !/open\.er-api\.com/.test(u))
       .every(u => new RegExp("(window\\.open|href|action)[^\\n]*" +
         u.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).test(bundles) ||
         /exchangerate-api|calc\.sterlingspares|github\.com|sterlingspares\.com/.test(u)),
     bundles.match(/https:\/\/[a-z0-9.-]+/gi).join(' '));
  ok('rates are never fetched during init',
     !/^\s*fetchRates\(/m.test(readAsset('assets/app.js').split('loadPresets();')[1] || ''),
     'init calls fetchRates');
  ok('the network call is in the deferred bundle',
     /function _fetchRatesImpl\(/.test(readAsset('assets/app-extra.js')) &&
     !/function _fetchRatesImpl\(/.test(readAsset('assets/app.js')));

  w.setDisplayCcy('INR');
  w.resetAll();
  if (errs.length) console.log('Uncaught page errors:\n  ' + errs.join('\n  '));
  R.finish();
});
