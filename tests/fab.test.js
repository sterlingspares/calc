/**
 * Floating action button suite — visibility rules, open/close and dismissal
 * paths, ARIA state, deferred action dispatch, error containment, and the
 * z-index ordering against the bottom nav, its scrim and modals.
 */
'use strict';

const { readSource, loadApp, cssRule, Reporter } = require('./harness');

const R = new Reporter('FAB suite');
const ok = R.ok.bind(R);

const src = readSource();
const css = sel => cssRule(src, sel);
const mk = width => loadApp({ width }).dom;

const dom = mk(390);
const w = dom.window;
const d = dom.window.document;

console.log('\n=== 1. FAB exists and is mobile-only ===');
ok('wrap in DOM', !!d.getElementById('fab-wrap'));
ok('button in DOM', !!d.getElementById('fab-btn'));
ok('scrim in DOM', !!d.getElementById('fab-scrim'));
ok('base is display:none', (css('.fab-wrap')||'').indexOf('display:none')!==-1);
ok('only shown under 800px', src.indexOf('@media(max-width:800px){.fab-wrap.show{display:flex}}')!==-1);

console.log('\n=== 2. Visible in Default mode ===');
ok('has show class at boot', d.getElementById('fab-wrap').className.indexOf('show')!==-1,
   'got '+d.getElementById('fab-wrap').className);
ok('starts collapsed', d.getElementById('fab-wrap').className.indexOf('open')===-1);
ok('aria-expanded false', d.getElementById('fab-btn').getAttribute('aria-expanded')==='false');
ok('has aria-haspopup', d.getElementById('fab-btn').getAttribute('aria-haspopup')==='true');
ok('menu has role', d.getElementById('fab-menu').getAttribute('role')==='menu');

console.log('\n=== 3. Six primary actions, all wired to real functions ===');
const items=d.querySelectorAll('#fab-menu .fab-item');
ok('6 actions', items.length===6, 'got '+items.length);
const fns=['saveToHistory','copyToClipboard','sendWhatsApp','shareLink','sendEmail','exportPDF'];
fns.forEach(fn=>{
  ok(fn+' present and callable',
     src.indexOf('fabRun('+fn+')')!==-1 && typeof w[fn]==='function');
});
ok('all items are menuitems',
   Array.from(items).every(i=>i.getAttribute('role')==='menuitem'));

console.log('\n=== 4. Open / close behaviour ===');
w.toggleFab();
ok('opens', d.getElementById('fab-wrap').className.indexOf('open')!==-1);
ok('scrim shown', d.getElementById('fab-scrim').className.indexOf('show')!==-1);
ok('aria-expanded true', d.getElementById('fab-btn').getAttribute('aria-expanded')==='true');
w.toggleFab();
ok('closes on second tap', d.getElementById('fab-wrap').className.indexOf('open')===-1);
ok('scrim hidden', d.getElementById('fab-scrim').className.indexOf('show')===-1);
ok('aria-expanded back to false', d.getElementById('fab-btn').getAttribute('aria-expanded')==='false');

console.log('\n=== 5. Scrim and Escape dismiss it ===');
w.toggleFab();
ok('open again', w.FAB_OPEN===true);
d.getElementById('fab-scrim').dispatchEvent(new w.MouseEvent('click',{bubbles:true}));
ok('scrim tap closes', w.FAB_OPEN===false);
w.toggleFab();
d.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
ok('Escape closes', w.FAB_OPEN===false);
ok('closeFab is idempotent', (()=>{try{w.closeFab();w.closeFab();return true}catch(e){return false}})());

console.log('\n=== 6. Running an action collapses the menu ===');
w.toggleFab();
let ran=false;
w.fabRun(()=>{ran=true});
ok('menu collapsed immediately', w.FAB_OPEN===false);
ok('action deferred, not lost', ran===false);
setTimeout(()=>{
  ok('action ran after the animation', ran===true);

  console.log('\n=== 7. A throwing action is logged, not fatal ===');
  const errs=[];
  const oldErr=w.console.error; w.console.error=(...a)=>errs.push(a.join(' '));
  w.toggleFab();
  w.fabRun(()=>{throw new Error('boom')});
  setTimeout(()=>{
    ok('failure logged via guard', errs.some(e=>e.indexOf('FAB action failed')!==-1),
       'got '+JSON.stringify(errs));
    ok('menu still closed', w.FAB_OPEN===false);
    w.console.error=oldErr;

    console.log('\n=== 8. Hidden outside Default mode ===');
    w.setMode('quick');
    ok('hidden in Quick mode', d.getElementById('fab-wrap').className.indexOf('show')===-1,
       'got '+d.getElementById('fab-wrap').className);
    w.setMode('default');
    ok('shown again in Default', d.getElementById('fab-wrap').className.indexOf('show')!==-1);
    w.toggleFab();
    w.setMode('quick');
    ok('leaving Default also collapses it', w.FAB_OPEN===false);
    w.setMode('default');

    console.log('\n=== 9. Opening a modal collapses it ===');
    w.toggleFab();
    ok('open before modal', w.FAB_OPEN===true);
    w.openModal('quote');
    ok('collapsed by modal', w.FAB_OPEN===false);
    ok('modal layers above FAB',
       parseInt((css('.modal-overlay')||'').match(/z-index:(\d+)/)[1],10) >
       parseInt((css('.fab-wrap')||'').match(/z-index:(\d+)/)[1],10));
    w.closeModal('quote');

    console.log('\n=== 10. Does not collide with the result bar or toast ===');
    ok('FAB lifts when result bar shows',
       src.indexOf('.mini-result.show ~ .fab-wrap')!==-1);
    ok('toast lifts when result bar shows',
       src.indexOf('.mini-result.show ~ .toast')!==-1);
    ok('toast leaves room for the FAB on mobile',
       src.indexOf('.toast{left:12px;right:80px')!==-1);
    const fabZ=parseInt((css('.fab-wrap')||'').match(/z-index:(\d+)/)[1],10);
    const scrimZ=parseInt((css('.fab-scrim')||'').match(/z-index:(\d+)/)[1],10);
    const navZ=parseInt((css('.bottom-nav')||'').match(/z-index:(\d+)/)[1],10);
    const modZ=parseInt((css('.modal-overlay')||'').match(/z-index:(\d+)/)[1],10);
    ok('FAB above its own scrim', fabZ>scrimZ, fabZ+' vs '+scrimZ);
    // The scrim must cover the nav, else nav items stay tappable behind the menu
    ok('scrim covers the bottom nav', scrimZ>navZ, scrimZ+' vs '+navZ);
    ok('FAB above the bottom nav', fabZ>navZ, fabZ+' vs '+navZ);
    ok('modals still beat the FAB and its scrim', modZ>fabZ && modZ>scrimZ,
       modZ+' vs '+fabZ+'/'+scrimZ);

    console.log('\n=== 11. Touch target meets guidance ===');
    const btn=css('.fab-btn')||'';
    const size=parseInt((btn.match(/width:(\d+)px/)||[])[1],10);
    ok('FAB is >= 56px', size>=56, 'got '+size);
    ok('menu items are comfortably tappable',
       (css('.fab-item')||'').indexOf('padding:10px 16px')!==-1);

    console.log('\n=== 12. Desktop keeps the header, no FAB ===');
    const dd=mk(1200);
    ok('desktop header actions intact', !!dd.window.document.querySelector('.hactions-desktop'));
    ok('FAB CSS still display:none by default', (css('.fab-wrap')||'').indexOf('display:none')!==-1);

    R.finish();
  },140);
},140);
