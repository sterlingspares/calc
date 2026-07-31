/**
 * Feature suite — core calculation, incentives, custom GST, quantity,
 * rounding, undo/redo, quote builder and history search/filter/tags.
 *
 * Drives the real application functions against a jsdom-loaded index.html.
 */
'use strict';

const { loadApp, numOf, Reporter } = require('./harness');

const R = new Reporter('Feature suite');
const ok = R.ok.bind(R);

const { w, d } = loadApp();
const num = id => numOf(d, id);

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
const delHtml = d.getElementById('hist-content').innerHTML;
ok('delete button uses true index', delHtml.indexOf('deleteHistEntry(1)') !== -1,
   'markup did not contain deleteHistEntry(1)');
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


if (errs.length) console.log('Uncaught page errors:\n  ' + errs.join('\n  '));
R.finish();
