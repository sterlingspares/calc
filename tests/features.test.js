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
ok('formatter is memoised', coreJs.indexOf('_inrFmt') !== -1);
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

if (errs.length) console.log('Uncaught page errors:\n  ' + errs.join('\n  '));
R.finish();
