/**
 * Error-handling suite — verifies that every failure path reports to the
 * console instead of being swallowed, and that a clean run stays silent.
 *
 * Browser APIs jsdom cannot fail realistically (storage quota) are stubbed;
 * application code is never mocked.
 */
'use strict';

const { readSource, loadApp, Reporter } = require('./harness');

const R = new Reporter('Error-handling suite');
const ok = R.ok.bind(R);

const captured = [];
const { w, d } = loadApp({ capture: captured });
const find = s => captured.filter(c => c[1].indexOf(s) !== -1);
const errsOf = lvl => captured.filter(c => c[0] === lvl);

console.log('\n=== A. Clean boot produces no error noise ===');
w.setGST(18);
d.getElementById('mrp').value='1000';
w.setCM('excl');d.getElementById('cpd').value='40';
w.setSM('excl');d.getElementById('spd').value='25';
w.calc();
ok('no console.error on a clean run', errsOf('error').length===0,
   'got: '+JSON.stringify(errsOf('error').slice(0,3)));

console.log('\n=== B. Logging helpers exist and are tagged ===');
ok('logError defined', typeof w.logError==='function');
ok('logWarn defined', typeof w.logWarn==='function');
ok('guard defined', typeof w.guard==='function');
captured.length=0;
w.logError('unit test context',new Error('boom'));
ok('logError writes to console.error', errsOf('error').length===1);
ok('logError includes the app tag', find('[pricing-calc]').length===1,
   'got '+JSON.stringify(captured));
ok('logError includes the context', find('unit test context').length===1);
captured.length=0;
w.logWarn('warn context','x');
ok('logWarn writes to console.warn', errsOf('warn').length===1);

console.log('\n=== C. guard() logs and returns the fallback ===');
captured.length=0;
const gv=w.guard('risky op',()=>{throw new Error('inner')},'fallback-value');
ok('guard returns fallback on throw', gv==='fallback-value', 'got '+gv);
ok('guard logged the failure', find('risky op failed').length===1);
ok('guard passes through on success', w.guard('ok op',()=>42,'nope')===42);

console.log('\n=== D. Storage write failure is reported ===');
captured.length=0;
// jsdom's Storage.setItem is not writable, so swap the whole object to
// simulate a full quota / Safari private mode.
const realStorage=w.localStorage;
const throwingStorage={
  getItem:k=>realStorage.getItem(k),
  removeItem:k=>realStorage.removeItem(k),
  clear:()=>realStorage.clear(),
  setItem:()=>{throw new Error('QuotaExceededError')}
};
Object.defineProperty(w,'localStorage',{configurable:true,get:()=>throwingStorage});
ok('storage mock is active',(()=>{try{w.localStorage.setItem('a','b');return false}catch(e){return true}})());
w.saveHistoryToStorage();
ok('history save failure logged', find('could not save history').length>=1,
   'got '+JSON.stringify(captured));
captured.length=0;
w.saveQuote();
ok('quote save failure logged', find('could not save quote').length>=1);
captured.length=0;
w.saveLabels();
ok('labels save failure logged', find('could not save incentive').length>=1);
captured.length=0;
w.saveCalcState();
ok('calc state save failure logged', find('could not save calculator state').length>=1);
Object.defineProperty(w,'localStorage',{configurable:true,get:()=>realStorage});
ok('storage restored',(()=>{try{w.localStorage.setItem('a','b');return true}catch(e){return false}})());

console.log('\n=== E. Corrupt stored data is reported, not fatal ===');
captured.length=0;
w.localStorage.setItem('pc-history','{{{not json');
let threw=false;
try{w.loadHistoryFromStorage()}catch(e){threw=true}
ok('corrupt history does not throw', !threw);
ok('corrupt history logged', find('could not read saved history').length>=1,
   'got '+JSON.stringify(captured));
captured.length=0;
w.localStorage.setItem('pc-quote','!!!broken');
threw=false;
try{w.loadQuote()}catch(e){threw=true}
ok('corrupt quote does not throw', !threw);
ok('corrupt quote logged', find('could not read saved quote').length>=1);
captured.length=0;
w.localStorage.setItem('pc-labels','<<<nope');
try{w.loadLabels()}catch(e){threw=true}
ok('corrupt labels logged', find('could not read saved incentives').length>=1);
w.localStorage.clear();

console.log('\n=== F. Bad share payload is reported ===');
captured.length=0;
threw=false;
try{ w.applyShareState(null) }catch(e){ threw=true }
ok('applyShareState(null) does not throw', !threw);
ok('bad share state logged', find('could not apply shared/saved state').length>=1,
   'got '+JSON.stringify(captured));

console.log('\n=== G. Out-of-range custom GST is rejected and reported ===');
captured.length=0;
const gstBefore=w.G;
const gi=d.getElementById('gst-custom');
gi.value='250';
w.onCustomGST(gi);
ok('GST unchanged by out-of-range input', w.G===gstBefore, 'got '+w.G);
ok('out-of-range GST logged', find('out-of-range custom GST').length>=1,
   'got '+JSON.stringify(captured));
ok('user told via toast', d.getElementById('toast-msg').textContent.indexOf('between 0 and 100')!==-1,
   'got '+d.getElementById('toast-msg').textContent);
captured.length=0;
gi.value='28';w.onCustomGST(gi);
ok('valid GST still applies', Math.abs(w.G-0.28)<1e-9, 'got '+w.G);
ok('valid GST logs nothing', captured.length===0, 'got '+JSON.stringify(captured));

console.log('\n=== H. Empty-state guards report context ===');
captured.length=0;
w.HISTORY.length=0;
w.exportHistoryCSV();
ok('empty CSV export logged', find('empty history').length>=1);

console.log('\n=== I. Global handlers registered ===');
captured.length=0;
w.dispatchEvent(new w.ErrorEvent('error',{message:'synthetic failure',filename:'f.js',lineno:9,colno:2}));
ok('window error handler logs', find('Uncaught error at f.js:9:2').length>=1,
   'got '+JSON.stringify(captured));

console.log('\n=== J. No silent catch blocks remain in source ===');
const src=readSource();
ok('zero empty catch blocks', src.indexOf('catch(e){}')===-1);
ok('zero empty catch blocks (spaced)', src.indexOf('catch (e) {}')===-1);


R.finish();
