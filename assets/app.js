/* Sterling Spares Pricing Calculator — application script.
 *
 * Loaded by index.html with `defer`, so the DOM is parsed before the
 * initialisation block at the foot of this file runs.
 *
 * Plain ES5-compatible browser JavaScript: no modules, no build step, no
 * runtime dependencies. Functions are intentionally global so inline handlers
 * in the markup can call them directly.
 */
/* ═══════════════════════════════════════════════════════════════════════════
   ERROR LOGGING

   Every failure path in this file reports through logError / logWarn rather
   than being swallowed. The distinction:

     logError — something went wrong that the user may notice (a save failed,
                a render threw). Always worth investigating.
     logWarn  — a recoverable/expected-in-some-browsers condition, e.g. reading
                localStorage in Safari private mode, or corrupt stored JSON that
                we can safely fall back to defaults for.

   Storage failures are the most common in practice and the easiest to miss:
   both Safari private mode and an exhausted quota throw from setItem, and
   without logging the symptom is simply "my settings don't stick".

   The logging calls are themselves wrapped, because a console shim that throws
   must never take down the calculation that called it.
   ═══════════════════════════════════════════════════════════════════════════ */
var APP_TAG='[pricing-calc]';

/**
 * Report a genuine fault.
 * @param {string} context where it happened
 * @param {*} [err] the thrown value; omitted for conditions with no exception
 */
function logError(context,err){
  try{
    if(arguments.length>1)console.error(APP_TAG+' '+context,err);
    else console.error(APP_TAG+' '+context);
  }catch(_){}
}
/** Report a recoverable or expected condition. Same signature as logError. */
function logWarn(context,err){
  try{
    if(arguments.length>1)console.warn(APP_TAG+' '+context,err);
    else console.warn(APP_TAG+' '+context);
  }catch(_){}
}
/**
 * Run fn, log and swallow anything it throws. Used at event-handler and
 * render boundaries so one bad value can't leave the UI half-updated with
 * no trace of why.
 * @param {string} context label used in the log message
 * @param {Function} fn work to attempt
 * @param {*} [fallback] value returned if fn throws
 * @returns {*} fn's return value, or fallback
 */
function guard(context,fn,fallback){
  try{return fn()}catch(e){logError(context+' failed',e);return fallback}
}

// Catch anything that escapes a handler entirely — inline onclick attributes,
// async callbacks, listeners — so nothing fails silently in production.
window.addEventListener('error',function(ev){
  logError('Uncaught error at '+(ev.filename||'inline')+':'+(ev.lineno||'?')+':'+(ev.colno||'?'),
           ev.error||ev.message);
});
window.addEventListener('unhandledrejection',function(ev){
  logError('Unhandled promise rejection',ev.reason);
});

/* ── Platform ── */
var IS_MAC=/Mac/.test(navigator.platform);
var MOD_KEY=IS_MAC?'⌘':'Ctrl';
/* ── State ── */
var G=0.18,CM='excl',CPMS='incl',SM='excl',SPMS='incl',PM='val',T='profit',CDM='before';
var ME=0,MI=0;
var INC_KEYS=['cd','eb','qt','an','sc'];
var INC_LABELS_DEFAULT={cd:'Cash Discount (CD)',eb:'Early Bird Discount',qt:'Quarterly Discount',an:'Annual Discount',sc:'Scheme'};
var INC_LABELS={cd:'Cash Discount (CD)',eb:'Early Bird Discount',qt:'Quarterly Discount',an:'Annual Discount',sc:'Scheme'};
var SCM='pct'; // scheme mode: 'pct' | 'abs'
var SP_INC_KEYS=['cd','eb','qt','an','sc'];
var SSCM='pct'; // SP scheme mode: 'pct' | 'abs'
var SCDM='before'; // SP CD mode: 'before' | 'after'
/* User-added incentives: per-key 'pct' | 'abs', same choice the Scheme row offers */
var ROUND_MODE='off'; // 'off' | '1' | '5' — rounds the incl-GST price
var QUOTE=[];         // multi-line quote rows
var HIST_QUERY='',HIST_FILTER='all';
var BUILTIN_INC=['cd','eb','qt','an','sc'];
var INC_MODE={},SP_INC_MODE={};
/**
 * True for incentives the user added (anything not one of the five built-ins).
 * @param {string} k incentive key
 * @returns {boolean}
 */
function isCustomInc(k){return BUILTIN_INC.indexOf(k)===-1}
/**
 * The %/₹ setting for a user-added incentive. Defaults to 'pct'.
 * @param {'cp'|'sp'} panel which incentive list
 * @param {string} k incentive key
 * @returns {'pct'|'abs'}
 */
function incModeOf(panel,k){var m=(panel==='cp'?INC_MODE:SP_INC_MODE)[k];return m==='abs'?'abs':'pct'}
var HISTORY=[];
var MAX_HIST=50;
var WI_SCENES=[
  {spDisc:'',spMode:'excl',spVal:'',spManualSub:'incl'},
  {spDisc:'',spMode:'excl',spVal:'',spManualSub:'incl'},
  {spDisc:'',spMode:'excl',spVal:'',spManualSub:'incl'}
];
var LAST_CP=null,LAST_SP=null;

/**
 * Format a number with Indian digit grouping (1,00,000.00).
 * Trailing '.00' is dropped so whole rupees read cleanly.
 * @param {number} n
 * @returns {string} grouped number, or '' when n is not finite
 */
function fmtINDIAN(n){
  // Format a number in Indian style: 1,00,000 with up to 2 decimals
  if(isNaN(n)||n===null)return '';
  var s=n.toFixed(2);
  var parts=s.split('.');
  var int=parts[0],dec=parts[1];
  // Indian grouping: last 3 digits, then groups of 2
  var lastThree=int.slice(-3);
  var rest=int.slice(0,-3);
  if(rest.length>0)lastThree=rest.replace(/\B(?=(\d{2})+(?!\d))/g,',')+','+lastThree;
  return dec==='00'?lastThree:lastThree+'.'+dec;
}
/**
 * Read the MRP field as a number, stripping the display commas.
 * @returns {number} MRP incl GST, 0 when blank or unparseable
 */
function parseMRP(){
  var raw=el('mrp').value.replace(/,/g,'');
  return parseFloat(raw)||0;
}
/**
 * Live-format the MRP field as the user types, preserving a decimal point
 * mid-entry (so typing "100." doesn't get rewritten to "100").
 * @param {HTMLInputElement} inp
 */
function onMrpInput(inp){
  var raw=inp.value.replace(/[^0-9.]/g,'');
  // Allow only one decimal point
  var parts=raw.split('.');
  if(parts.length>2)raw=parts[0]+'.'+parts.slice(1).join('');
  var num=parseFloat(raw);
  if(!isNaN(num)&&raw!==''&&raw!=='.'){
    var formatted=fmtINDIAN(num);
    // Preserve decimal input in progress (e.g. "100." or "100.5")
    if(raw.indexOf('.')!==-1){
      var dec=raw.split('.')[1];
      var intPart=fmtINDIAN(parseFloat(parts[0])||0).split('.')[0];
      formatted=intPart+'.'+(dec||'');
    }
    inp.value=formatted;
  } else if(raw===''||raw==='.'){
    inp.value=raw;
  }
  calc();
}
/* ── Shared ₹ amount input formatter ── */
function parseAmt(id){
  var e=el(id);if(!e)return NaN;
  return parseFloat(e.value.replace(/,/g,''));
}
/**
 * Live-format any ₹ amount field. Same rules as onMrpInput.
 * @param {HTMLInputElement} inp
 */
function onAmtInput(inp){
  var raw=inp.value.replace(/[^0-9.]/g,'');
  var parts=raw.split('.');
  if(parts.length>2)raw=parts[0]+'.'+parts.slice(1).join('');
  var num=parseFloat(raw);
  if(!isNaN(num)&&raw!==''&&raw!=='.'){
    var formatted=fmtINDIAN(num);
    if(raw.indexOf('.')!==-1){
      var dec=raw.split('.')[1];
      var intPart=fmtINDIAN(parseFloat(raw.split('.')[0])||0).split('.')[0];
      formatted=intPart+'.'+(dec||'');
    }
    inp.value=formatted;
  } else if(raw===''||raw==='.'){
    inp.value=raw;
  }
  calc();
}
var _elCache={};
/**
 * getElementById with a cache. Elements are looked up on nearly every
 * keystroke, so this avoids repeated DOM traversal.
 * Call elClearCache() after replacing any cached node's innerHTML.
 * @param {string} id
 * @returns {HTMLElement|null}
 */
function el(id){return _elCache[id]||(_elCache[id]=document.getElementById(id))}
/**
 * Drop every cached element reference. Must run after any innerHTML rewrite
 * that replaces nodes the cache may still be holding.
 */
function elClearCache(){_elCache={}}
/**
 * Set an element's textContent if it exists. No-op for absent ids, which keeps
 * callers free of null checks for optional UI.
 * @param {string} id
 * @param {string} v
 */
function R(id,v){var e=el(id);if(e)e.textContent=v}
/**
 * Format a number as rupees for display.
 * @param {number} n
 * @returns {string} e.g. '₹1,23,456.78', or '—' when not a finite number
 */
function INR(n){
  if(n===null||n===undefined||isNaN(n))return'—';
  return'₹'+parseFloat(n.toFixed(2)).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2});
}
/**
 * Format a number as a percentage to 2 decimals.
 * @param {number} n
 * @returns {string} e.g. '12.34%', or '—' when not a finite number
 */
function PCT(n){
  if(n===null||n===undefined||isNaN(n))return'—';
  return parseFloat(n.toFixed(4)).toFixed(2)+'%';
}
/**
 * Current time as a short display string (e.g. '31 Jul 4:05 pm').
 * @returns {string}
 */
function now(){
  var d=new Date();
  var h=d.getHours(),m=d.getMinutes(),ampm=h>=12?'pm':'am';
  h=h%12||12;
  return d.toLocaleDateString('en-IN',{day:'2-digit',month:'short'})+' '+h+':'+(m<10?'0'+m:m)+' '+ampm;
}

/**
 * Format a timestamp as an absolute 12-hour string including the year.
 * Used for the hover title on history entries.
 * @param {number} ts epoch milliseconds
 * @returns {string}
 */
function fmtTime(ts){
  // Format a timestamp (ms) as 12h readable string
  var d=new Date(ts);
  var h=d.getHours(),m=d.getMinutes(),ampm=h>=12?'pm':'am';
  h=h%12||12;
  return d.toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'})+' '+h+':'+(m<10?'0'+m:m)+' '+ampm;
}

/**
 * Human-friendly relative age ('just now', '5 mins ago', 'yesterday').
 * Day boundaries are compared by calendar date, not elapsed hours, so an
 * entry from 11pm reads 'yesterday' at 1am rather than '2 hrs ago'.
 * @param {number} ts epoch milliseconds
 * @returns {string}
 */
function relTime(ts){
  var diff=Date.now()-ts; // ms
  if(diff<60000)return 'just now';
  if(diff<3600000){var m=Math.floor(diff/60000);return m+' min'+(m>1?'s':'')+' ago'}
  var d1=new Date(ts),d2=new Date();
  d1.setHours(0,0,0,0);d2.setHours(0,0,0,0);
  var days=Math.round((d2-d1)/86400000);
  if(days===0){var h=Math.floor(diff/3600000);return h+' hr'+(h>1?'s':'')+' ago'}
  if(days===1)return 'yesterday';
  if(days<7)return days+' days ago';
  if(days<14)return 'last week';
  if(days<31)return Math.floor(days/7)+' weeks ago';
  return Math.floor(days/30)+' month'+(Math.floor(days/30)>1?'s':'')+' ago';
}

/* ── Modal ── */
/* Focusable descendants, in DOM order, for the dialog focus trap. */
var FOCUSABLE='a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),'
  +'textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

/** Element that had focus before the current dialog opened, restored on close. */
var _lastFocused=null;
/** The open dialog's overlay, or null. Used by the Tab handler. */
var _openOverlay=null;

/**
 * Visible focusable descendants of an element.
 * @param {HTMLElement} root
 * @returns {HTMLElement[]}
 */
function focusablesIn(root){
  if(!root)return [];
  return Array.prototype.filter.call(root.querySelectorAll(FOCUSABLE),function(e){
    if(e.disabled||e.getAttribute('aria-hidden')==='true')return false;
    // Walk up to the container looking for a hidden ancestor rather than using
    // offsetParent, which is null for position:fixed elements (every dialog
    // here) and unavailable wherever layout is not computed.
    for(var n=e;n&&n!==root.parentNode;n=n.parentNode){
      if(n.nodeType!==1)continue;
      if(n.hasAttribute('hidden'))return false;
      if(n.style&&(n.style.display==='none'||n.style.visibility==='hidden'))return false;
    }
    return true;
  });
}

/**
 * Keep Tab inside the open dialog.
 * aria-modal="true" asserts the rest of the page is inert, so the focus order
 * has to actually behave that way.
 */
document.addEventListener('keydown',function(e){
  if(e.key!=='Tab'||!_openOverlay)return;
  var f=focusablesIn(_openOverlay);
  if(!f.length){e.preventDefault();return}
  var first=f[0],last=f[f.length-1],active=document.activeElement;
  if(e.shiftKey&&(active===first||!_openOverlay.contains(active))){
    e.preventDefault();last.focus();
  } else if(!e.shiftKey&&active===last){
    e.preventDefault();first.focus();
  }
});

function openModal(id){
  var o=el('overlay-'+id);
  closeFab();
  if(o){
    _lastFocused=document.activeElement;
    o.classList.add('open');
    document.body.style.overflow='hidden';
    _openOverlay=o;
  }
  if(id==='whatif')renderWhatIf(LAST_CP);
  if(id==='quote')qtRender();
  // Move focus into the dialog so keyboard and screen-reader users start inside
  // it rather than behind it.
  if(o)setTimeout(function(){
    var f=focusablesIn(o);
    if(f.length)f[0].focus();
  },30);
}
/**
 * Hide a modal overlay and restore page scrolling.
 * @param {string} id overlay suffix, e.g. 'settings'
 */
function closeModal(id){
  var o=el('overlay-'+id);
  if(!o||!o.classList.contains('open'))return;
  o.classList.remove('open');
  document.body.style.overflow='';
  if(_openOverlay===o)_openOverlay=null;
  // Return focus to whatever opened the dialog, so keyboard users are not
  // dumped back at the top of the document.
  if(_lastFocused&&typeof _lastFocused.focus==='function'){
    try{_lastFocused.focus()}catch(e){logWarn('could not restore focus after closing '+id,e)}
  }
  _lastFocused=null;
}
/**
 * Close a modal when the click landed on the backdrop rather than the panel.
 * @param {MouseEvent} e
 * @param {string} id overlay suffix
 */
function overlayClick(e,id){if(e.target===el('overlay-'+id))closeModal(id)}
document.addEventListener('keydown',function(e){if(e.key==='Escape'){closeModal('settings');closeModal('whatif');closeModal('quote');closeConfirm();closeFab()}});

/**
 * Handler for the custom GST box. Rejects anything outside 0–100 and says so,
 * rather than silently ignoring the keystroke.
 * @param {HTMLInputElement} inp the "Other %" field
 */
function onCustomGST(inp){
  var p=parseFloat(inp.value);
  if(inp.value==='')return;                 // cleared — leave the preset alone
  if(isNaN(p)||p<0||p>100){
    logWarn('ignoring out-of-range custom GST rate: '+JSON.stringify(inp.value)+' (expected 0–100)');
    toast('GST must be between 0 and 100');
    inp.value=(G*100===18||G*100===5)?'':String(G*100);
    return;
  }
  setGST(p);
}

/* ── Floating action button (mobile) ── */
var FAB_OPEN=false;

/**
 * Show or hide the FAB itself (not its menu).
 * Visible only in Default mode — Quick mode has its own flow, and these actions
 * read LAST_CP/LAST_SP from the main calculator, which Quick mode doesn't set.
 * The CSS keeps it off desktop entirely.
 */
function updateFabVisibility(){
  var wrap=el('fab-wrap');
  if(!wrap)return;
  var wz=el('wizard-mode');
  var inWizard=wz&&wz.style.display==='block';
  var show=(APP_MODE==='default'&&!inWizard);
  if(!show)closeFab();
  wrap.className='fab-wrap'+(show?' show':'')+(show&&FAB_OPEN?' open':'');
}
/** Expand or collapse the action menu. */
function toggleFab(){
  FAB_OPEN=!FAB_OPEN;
  haptic('light');
  var wrap=el('fab-wrap'),scrim=el('fab-scrim'),btn=el('fab-btn');
  if(wrap)wrap.className='fab-wrap show'+(FAB_OPEN?' open':'');
  if(scrim)scrim.className='fab-scrim'+(FAB_OPEN?' show':'');
  if(btn)btn.setAttribute('aria-expanded',String(FAB_OPEN));
  if(FAB_OPEN){
    // Move focus to the first action so keyboard and screen-reader users land
    // inside the menu rather than behind it.
    var first=el('fab-menu')&&el('fab-menu').querySelector('.fab-item');
    if(first)setTimeout(function(){first.focus()},60);
  }
}
/** Collapse the action menu if open. Safe to call unconditionally. */
function closeFab(){
  if(!FAB_OPEN)return;
  FAB_OPEN=false;
  var wrap=el('fab-wrap'),scrim=el('fab-scrim'),btn=el('fab-btn');
  if(wrap)wrap.className=wrap.className.replace(' open','');
  if(scrim)scrim.className='fab-scrim';
  if(btn)btn.setAttribute('aria-expanded','false');
}
/**
 * Run a FAB action and collapse the menu.
 * @param {Function} fn action to invoke
 */
function fabRun(fn){
  closeFab();
  // Let the collapse animation start before a blocking dialog or share sheet.
  setTimeout(function(){guard('FAB action',fn)},80);
}

/**
 * Handler for the custom rounding box. Rejects anything that is not a positive
 * step and says why, rather than silently ignoring the entry.
 * @param {HTMLInputElement} inp the custom rounding field
 */
function onCustomRounding(inp){
  if(inp.value==='')return;                 // cleared — leave the preset alone
  var v=parseFloat(inp.value);
  if(isNaN(v)||v<=0||v>100000){
    logWarn('ignoring invalid rounding step: '+JSON.stringify(inp.value)+' (expected a positive number)');
    toast('Rounding step must be greater than 0');
    inp.value=isCustomRounding()?ROUND_MODE:'';
    return;
  }
  setRounding(String(v));
}

/* ── Quantity ── */
/**
 * Current order quantity. Never returns less than 1, so callers can multiply
 * unconditionally.
 * @returns {number} quantity, minimum 1
 */
function getQty(){
  var e=el('qty');if(!e)return 1;
  var q=parseInt(e.value,10);
  return (isNaN(q)||q<1)?1:q;
}
/**
 * Nudge the quantity by delta, clamped at 1.
 * @param {number} d +1 or -1
 */
function stepQty(d){
  var e=el('qty');if(!e)return;
  e.value=Math.max(1,getQty()+d);
  haptic('light');calc();debouncedSaveCalcState();
}

/* ── Rounding ──
   Rounds the incl-GST price to a whole amount and derives excl from it, so the
   sticker price is the clean number and profit stays consistent with what's shown. */
function roundStep(){
  if(ROUND_MODE==='off')return 0;
  var v=parseFloat(ROUND_MODE);
  return (isNaN(v)||v<=0)?0:v;
}
/**
 * Apply the current rounding setting to a price pair.
 * The incl-GST figure is the one rounded (it is the sticker price), and excl
 * is re-derived from it so the two stay consistent with each other.
 * @param {{e:number,i:number}|null} p price pair
 * @returns {{e:number,i:number}|null} rounded pair, or p unchanged when rounding is off
 */
function roundPrice(p){
  var s=roundStep();
  if(!s||!p)return p;
  var i=Math.round(p.i/s)*s;
  return {e:i/(1+G),i:i};
}
/**
 * Change the rounding step and recalculate.
 * @param {string} m 'off', or any positive step as a string — '1' and '5' have
 *   preset buttons, anything else comes from the custom box.
 */
/**
 * Whether the active rounding step came from the custom box rather than a
 * preset button.
 * @returns {boolean}
 */
function isCustomRounding(){
  return ROUND_MODE!=='off'&&ROUND_MODE!=='1'&&ROUND_MODE!=='5';
}

function setRounding(m){
  haptic('select');
  ROUND_MODE=String(m);
  var custom=isCustomRounding();
  ['off','1','5'].forEach(function(k){
    var b=el('rnd-'+k);if(b)b.className='pill'+(k===ROUND_MODE?' on':'');
  });
  // Highlight the custom chip when it is the live mode, so the row always has
  // exactly one control reading as selected.
  var wrap=el('rnd-custom-wrap');
  if(wrap)wrap.className='rnd-custom-wrap'+(custom?' on':'');
  // Mirror into the custom box, unless the user is mid-edit in it
  var rc=el('rnd-custom');
  if(rc&&document.activeElement!==rc){
    rc.value=custom?ROUND_MODE:'';
  }
  calc();saveCalcState();
  if(el('overlay-quote').classList.contains('open'))qtRender();
}

/* ── Toast ── */
var _toastTimer=null;
/**
 * Show a transient status message.
 * @param {string} msg
 * @param {boolean} [withUndo] show an inline Undo affordance and hold longer
 */
function toast(msg,withUndo){
  var t=el('toast'),m=el('toast-msg'),u=el('toast-undo');
  if(!t)return;
  m.textContent=msg;
  u.style.display=withUndo?'':'none';
  t.classList.add('show');
  clearTimeout(_toastTimer);
  _toastTimer=setTimeout(function(){t.classList.remove('show')},withUndo?5000:2400);
}
/**
 * Dismiss the toast immediately and cancel its auto-hide timer.
 */
function hideToast(){var t=el('toast');if(t)t.classList.remove('show');clearTimeout(_toastTimer)}

/* ── Confirm dialog ── */
var _confirmFn=null;
/**
 * Open the confirmation dialog. The action runs only via runConfirm().
 * @param {string} title dialog heading
 * @param {string} msg main question
 * @param {string} sub secondary explanation line
 * @param {string} btnLabel label for the destructive button
 * @param {Function} fn invoked when the user confirms
 */
function askConfirm(title,msg,sub,btnLabel,fn){
  _confirmFn=fn;
  R('confirm-title',title);R('confirm-msg',msg);R('confirm-sub',sub||'');
  var y=el('confirm-yes');if(y)y.textContent=btnLabel||'Delete';
  var o=el('overlay-confirm');
  if(o){
    _lastFocused=document.activeElement;
    o.classList.add('open');
    document.body.style.overflow='hidden';
    _openOverlay=o;
    // Focus Cancel, not the destructive button — a stray Enter should not delete.
    setTimeout(function(){
      var cancel=o.querySelector('.confirm-btn:not(.danger)');
      if(cancel)cancel.focus();
    },30);
  }
}
/**
 * Dismiss the confirmation dialog without running the pending action.
 */
function closeConfirm(){
  _confirmFn=null;
  var o=el('overlay-confirm');
  if(o&&o.classList.contains('open')){
    o.classList.remove('open');
    document.body.style.overflow='';
    if(_openOverlay===o)_openOverlay=null;
    if(_lastFocused&&typeof _lastFocused.focus==='function'){
      try{_lastFocused.focus()}catch(e){logWarn('could not restore focus after closing confirm',e)}
    }
    _lastFocused=null;
  }
}
/**
 * Run the pending confirmed action. Closes the dialog first so the callback
 * is free to open another modal.
 */
function runConfirm(){
  var fn=_confirmFn;
  closeConfirm();
  if(typeof fn==='function')fn();
}

/* ── Undo / Redo ──
   Snapshots the whole mutable app state. Cheap enough at this size, and it means
   any new action gets undo for free by calling pushUndo() before it mutates. */
var UNDO=[],REDO=[],MAX_UNDO=40,_undoBusy=false;
/**
 * Deep-copy every piece of mutable app state into a plain object.
 * This is what makes undo generic: a new feature becomes undoable simply by
 * storing its state here and calling pushUndo() before mutating.
 * @returns {Object} snapshot suitable for restoreState
 */
function captureState(){
  return {
    share:getShareState(),
    incKeys:INC_KEYS.slice(),
    spIncKeys:SP_INC_KEYS.slice(),
    labels:JSON.parse(JSON.stringify(INC_LABELS)),
    incMode:JSON.parse(JSON.stringify(INC_MODE)),
    spIncMode:JSON.parse(JSON.stringify(SP_INC_MODE)),
    history:JSON.parse(JSON.stringify(HISTORY)),
    quote:JSON.parse(JSON.stringify(QUOTE)),
    round:ROUND_MODE,
    qty:el('qty')?el('qty').value:'1'
  };
}
/**
 * Apply a snapshot from captureState, rebuilding the incentive rows (whose
 * keys may differ) before restoring per-field values.
 * Sets _undoBusy so the restore's own writes don't push new undo entries.
 * @param {Object} s snapshot
 */
function restoreState(s){
  if(!s)return;
  _undoBusy=true;
  try{
    INC_KEYS=s.incKeys.slice();
    SP_INC_KEYS=s.spIncKeys.slice();
    INC_LABELS=JSON.parse(JSON.stringify(s.labels));
    INC_MODE=JSON.parse(JSON.stringify(s.incMode));
    SP_INC_MODE=JSON.parse(JSON.stringify(s.spIncMode));
    HISTORY=JSON.parse(JSON.stringify(s.history));
    QUOTE=JSON.parse(JSON.stringify(s.quote));
    ROUND_MODE=s.round;
    renderCPIncRows();renderSPIncRows();
    setRounding(ROUND_MODE);
    if(el('qty'))el('qty').value=s.qty;
    applyShareState(s.share);
    saveLabels();saveHistoryToStorage();saveQuote();
    renderHistory();
    if(el('overlay-quote').classList.contains('open'))qtRender();
    calc();
  }catch(e){
    // Leaves the UI mid-restore, so this is always worth surfacing.
    logError('undo/redo could not fully restore the previous state',e);
  }
  _undoBusy=false;
}
/**
 * Record the current state so the next action can be undone. Clears the redo
 * stack, since branching history would be more confusing than useful here.
 * @param {string} label short description shown in the 'Undid: …' toast
 */
function pushUndo(label){
  if(_undoBusy)return;
  UNDO.push({label:label,state:captureState()});
  if(UNDO.length>MAX_UNDO)UNDO.shift();
  REDO=[];
  updateUndoBtns();
}
/**
 * Enable/disable and dim the undo and redo controls to match stack depth.
 */
function updateUndoBtns(){
  var u=el('undo-btn'),r=el('redo-btn');
  if(u){u.disabled=UNDO.length===0;u.style.opacity=UNDO.length?'':'0.4'}
  if(r){r.disabled=REDO.length===0;r.style.opacity=REDO.length?'':'0.4'}
  var hu=el('hmenu-undo');
  if(hu)hu.style.opacity=UNDO.length?'':'0.4';
}
/**
 * Step back one action, moving the current state onto the redo stack.
 */
function undo(){
  if(UNDO.length===0){toast('Nothing to undo');return}
  var entry=UNDO.pop();
  REDO.push({label:entry.label,state:captureState()});
  restoreState(entry.state);
  updateUndoBtns();
  hideToast();
  haptic('light');
  toast('Undid: '+entry.label);
}
/**
 * Re-apply the most recently undone action.
 */
function redo(){
  if(REDO.length===0){toast('Nothing to redo');return}
  var entry=REDO.pop();
  UNDO.push({label:entry.label,state:captureState()});
  restoreState(entry.state);
  updateUndoBtns();
  haptic('light');
  toast('Redid: '+entry.label);
}

/* ── Floor helpers ── */
function getFloor(){
  return{gp:parseFloat(el('floor-gp').value)||null, mg:parseFloat(el('floor-mg').value)||null};
}
/**
 * Whether a value breaches a floor limit. Null floors never trigger.
 * @param {number} val
 * @param {number|null} floor
 * @returns {boolean}
 */
function belowFloor(val,floor){return floor!==null&&val!==null&&!isNaN(val)&&val<floor}
/**
 * CSS class for a GP% figure: 'warn' below floor, else pos/neg/dim.
 * @param {number|null} gp
 * @param {{gp:number|null,mg:number|null}} floor
 * @returns {string}
 */
function gpCls(gp,floor){
  if(gp===null||isNaN(gp))return'dim';
  if(belowFloor(gp,floor.gp))return'warn';
  return gp>=0?'pos':'neg';
}
/**
 * CSS class for a Margin% figure. Mirrors gpCls against the margin floor.
 * @param {number|null} mg
 * @param {{gp:number|null,mg:number|null}} floor
 * @returns {string}
 */
function mgCls(mg,floor){
  if(mg===null||isNaN(mg))return'dim';
  if(belowFloor(mg,floor.mg))return'warn';
  return mg>=0?'pos':'neg';
}

/* ── Panel toggles ── */
var _histRefreshTimer=null;
/**
 * Expand or collapse a panel and sync its chevron and aria-expanded state.
 * The history panel additionally starts/stops its relative-time refresh timer
 * here, so it only ticks while visible.
 * @param {string} id panel suffix, e.g. 'inc'
 */
function togglePanel(id){
  var body=el('body-'+id),chev=el('chev-'+id);
  var hdr=el('phdr-'+id);
  var open=body.style.display==='block';
  body.style.display=open?'none':'block';
  chev.className='panel-chevron'+(open?'':' open');
  if(hdr)hdr.setAttribute('aria-expanded',String(!open));
  // `open` describes the state *before* this call, so a true value means we
  // just collapsed it. Collapsing an incentive panel hides the rows being
  // edited, so treat it as pressing Done.
  if(open){
    if(id==='inc'&&CP_EDIT_MODE)setIncEditMode('cp',false);
    else if(id==='sp-inc'&&SP_EDIT_MODE)setIncEditMode('sp',false);
  }
  if(id==='hist'){
    if(!open){
      clearInterval(_histRefreshTimer);
      _histRefreshTimer=setInterval(function(){if(HISTORY.length>0)renderHistory()},60000);
    }else{
      clearInterval(_histRefreshTimer);_histRefreshTimer=null;
    }
  }
}

/* ── Autosave — single source of truth ── */
var AUTOSAVE = true;
/**
 * Set auto-save on/off and mirror it to both toggle controls.
 * @param {boolean} on
 */
function setAutosave(val) {
  AUTOSAVE = val;
  el('autosave-toggle').checked = val;
  el('autosave-toggle-settings').checked = val;
}
/**
 * Adopt the state of whichever auto-save toggle the user just clicked.
 * @param {HTMLInputElement} src the toggle that changed
 */
function syncAutosave(src) {
  var val = (src === 'settings') ? el('autosave-toggle-settings').checked : el('autosave-toggle').checked;
  setAutosave(val);
  saveCalcState();
}

/* ── Dark mode ── */
function toggleDarkMode(on) {
  document.documentElement.setAttribute('data-theme', on ? 'dark' : 'light');
  try { localStorage.setItem('pc-theme', on ? 'dark' : 'light'); }
  catch(e){ logWarn('could not persist theme preference',e); }
}
/**
 * Apply the saved theme, falling back to the OS colour-scheme preference.
 */
function initTheme() {
  var saved;
  try { saved = localStorage.getItem('pc-theme'); }
  catch(e){ logWarn('could not read saved theme, falling back to system preference',e); }
  var prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  var dark = saved ? saved === 'dark' : prefersDark;
  if (dark) { document.documentElement.setAttribute('data-theme','dark'); }
  var tog = el('darkmode-toggle'); if (tog) tog.checked = dark;
}

/* ── State persistence ── */
function saveCalcState(){
  try{
    var s=getShareState();
    s._as=AUTOSAVE;
    localStorage.setItem('pc-state',JSON.stringify(s));
  }catch(e){ logError('could not save calculator state (pc-state)',e); }
}
/**
 * Restore the calculator from localStorage.
 * @returns {boolean} true if a saved state was applied
 */
function loadCalcState(){
  try{
    var raw=localStorage.getItem('pc-state');
    if(!raw)return false;
    var s=JSON.parse(raw);
    if(s._as!==undefined){
      AUTOSAVE=!!s._as;
      var tog=el('autosave-toggle-settings');
      if(tog)tog.checked=AUTOSAVE;
      var tog2=el('autosave-toggle');
      if(tog2)tog2.checked=AUTOSAVE;
    }
    applyShareState(s);
    return true;
  }catch(e){
    logError('could not restore saved calculator state (pc-state); starting fresh',e);
    return false;
  }
}
/**
 * Save calculator state 800ms after typing stops, to avoid writing on every keystroke.
 */
function debouncedSaveCalcState(){
  clearTimeout(_saveStateTimer);
  _saveStateTimer=setTimeout(saveCalcState,800);
}

/* ── Incentive edit mode ── */
var CP_EDIT_MODE=false,SP_EDIT_MODE=false;

/**
 * Build the markup for one incentive row.
 * All element ids match what the calculation code expects (it-/iv-/ir- for CP,
 * sit-/siv-/sir- for SP), so rows can be re-rendered freely.
 * @param {string} k incentive key
 * @param {'cp'|'sp'} panel which list
 * @param {boolean} editMode render delete badge + editable label
 * @returns {string} HTML for a single .inc-row
 */
function _incRowHTML(k,panel,editMode){
  var isCP=panel==='cp';
  var rowId=(isCP?'ir-':'sir-')+k;
  var cbId=(isCP?'it-':'sit-')+k;
  var inpId=(isCP?'iv-':'siv-')+k;
  var lblId='lbl-'+(isCP?'cp':'sp')+'-'+k;
  var lbl=(INC_LABELS[k]||k).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;');
  // Same text, for use inside aria-label attributes
  var lblPlain=lbl;
  var syncFn=isCP?'syncToggle':'syncSpToggle';
  var defVal=(k==='sc')?'':(k==='cd'||k==='qt')?'2':'1';
  var placeholder=(k==='sc')?'0':'';
  var custom=isCustomInc(k),cMode=custom?incModeOf(panel,k):null,cAbs=(cMode==='abs');
  var maxAttr=(k==='sc'||cAbs)?'':' max="100"';

  var delBtn=editMode?'<button class="inc-del-btn" onclick="deleteInc(\''+panel+'\',\''+k+'\')" title="Delete" aria-label="Delete">&#x2212;</button>':'';
  var labelHtml=editMode
    ?'<input class="inc-label-edit" id="'+lblId+'" aria-label="Rename '+lblPlain+'" value="'+lbl+'" onfocus="pushUndo(\'rename incentive\')" oninput="INC_LABELS[\''+k+'\']=this.value.trim()||INC_LABELS_DEFAULT[\''+k+'\'];saveLabels()" maxlength="30" autocomplete="off" spellcheck="false">'
    :'<span class="inc-name" id="'+lblId+'">'+lbl+'</span>';

  var unitId=(k==='sc')?' id="'+(isCP?'sc':'ssc')+'-unit"':(custom?' id="unit-'+panel+'-'+k+'"':'');
  var unitTxt=cAbs?'&#x20B9;':'%';
  var pctWrapId=(k==='sc'&&isCP)?' id="sc-pct-wrap"':'';

  var mainRow='<div class="inc-row-main">'+delBtn+'<label class="toggle"><input type="checkbox" id="'+cbId+'" aria-label="Enable '+lblPlain+'" onchange="'+syncFn+'(\''+k+'\');calc()"><span class="toggle-track"></span><span class="toggle-thumb"></span></label>'+labelHtml+'<div class="inc-pct-wrap"'+pctWrapId+'><input type="number" inputmode="decimal" id="'+inpId+'" aria-label="'+lblPlain+' value" value="'+defVal+'" placeholder="'+placeholder+'" min="0"'+maxAttr+' step="0.01" oninput="calc()" autocomplete="off"><span class="inc-pct-sym"'+unitId+'>'+unitTxt+'</span></div></div>';

  var subRow='';
  var gPct=Math.round(G*100);
  if(k==='cd'){
    var b1=isCP?'cdm-before':'scdm-before',b2=isCP?'cdm-after':'scdm-after';
    var fn1=isCP?"setCDMode('before')":'setSCDMode(\'before\')',fn2=isCP?"setCDMode('after')":'setSCDMode(\'after\')';
    var lb1='lbl-'+(isCP?'':'s')+'cdm-before',lb2='lbl-'+(isCP?'':'s')+'cdm-after';
    var p=isCP?'CP':'SP';
    subRow='<div class="inc-row-sub"><div style="font-size:11px;color:var(--text3);margin-bottom:6px">Calculate CD on:</div><div class="sub-tabs" style="width:100%"><button class="stab on" id="'+b1+'" onclick="'+fn1+'" style="padding:6px 8px;line-height:1.3"><span id="'+lb1+'">'+p+' excl '+gPct+'% GST</span><br><span style="font-weight:300;font-size:9.5px;opacity:.8">before GST</span></button><button class="stab" id="'+b2+'" onclick="'+fn2+'" style="padding:6px 8px;line-height:1.3"><span id="'+lb2+'">'+p+' incl '+gPct+'% GST</span><br><span style="font-weight:300;font-size:9.5px;opacity:.8">after GST</span></button></div></div>';
  } else if(k==='sc'){
    var sp1=isCP?'scm-pct':'sscm-pct',sp2=isCP?'scm-abs':'sscm-abs';
    var fn3=isCP?"setSchemeMode('pct')":'setSpSchemeMode(\'pct\')',fn4=isCP?"setSchemeMode('abs')":'setSpSchemeMode(\'abs\')';
    var lsp='lbl-'+(isCP?'':'s')+'scm-pct';
    var ssub=isCP?' id="sc-sub"':'';
    var pp=isCP?'CP':'SP';
    subRow='<div class="inc-row-sub"'+ssub+'><div style="font-size:11px;color:var(--text3);margin-bottom:6px">Scheme type:</div><div class="sub-tabs" style="width:100%"><button class="stab on" id="'+sp1+'" onclick="'+fn3+'" style="padding:6px 8px;line-height:1.3"><span id="'+lsp+'">% of '+pp+' excl '+gPct+'% GST</span><br><span style="font-weight:300;font-size:9.5px;opacity:.8">percentage</span></button><button class="stab" id="'+sp2+'" onclick="'+fn4+'" style="padding:6px 8px;line-height:1.3">&#x20B9; Absolute<br><span style="font-weight:300;font-size:9.5px;opacity:.8">fixed amount</span></button></div></div>';
  } else if(custom){
    var m1='im-'+panel+'-'+k+'-pct',m2='im-'+panel+'-'+k+'-abs';
    var lm='lbl-im-'+panel+'-'+k;
    var cp2=isCP?'CP':'SP';
    subRow='<div class="inc-row-sub"><div style="font-size:11px;color:var(--text3);margin-bottom:6px">Incentive type:</div><div class="sub-tabs" style="width:100%"><button class="stab'+(cAbs?'':' on')+'" id="'+m1+'" onclick="setIncMode(\''+panel+'\',\''+k+'\',\'pct\')" style="padding:6px 8px;line-height:1.3"><span id="'+lm+'">% of '+cp2+' excl '+gPct+'% GST</span><br><span style="font-weight:300;font-size:9.5px;opacity:.8">percentage</span></button><button class="stab'+(cAbs?' on':'')+'" id="'+m2+'" onclick="setIncMode(\''+panel+'\',\''+k+'\',\'abs\')" style="padding:6px 8px;line-height:1.3">&#x20B9; Absolute<br><span style="font-weight:300;font-size:9.5px;opacity:.8">fixed amount</span></button></div></div>';
  }
  return '<div class="inc-row" id="'+rowId+'">'+mainRow+subRow+'</div>';
}

/* Paint a user-added incentive's %/₹ state onto its row without side effects */
function applyIncModeVisuals(panel,k){
  var m=incModeOf(panel,k);
  var b1=document.getElementById('im-'+panel+'-'+k+'-pct'),b2=document.getElementById('im-'+panel+'-'+k+'-abs');
  if(b1)b1.className=(m==='pct')?'stab on':'stab';
  if(b2)b2.className=(m==='abs')?'stab on':'stab';
  var u=document.getElementById('unit-'+panel+'-'+k);
  if(u)u.textContent=(m==='abs')?'₹':'%';
  var iv=document.getElementById((panel==='cp'?'iv-':'siv-')+k);
  if(iv){iv.placeholder=(m==='abs')?'0.00':'0';if(m==='abs'){iv.removeAttribute('max')}else{iv.max='100'}}
}

/**
 * Switch a user-added incentive between percentage and fixed ₹, updating the
 * unit symbol and the input's max constraint, then recalculating.
 * @param {'cp'|'sp'} panel
 * @param {string} k incentive key
 * @param {'pct'|'abs'} m
 */
function setIncMode(panel,k,m){
  haptic('select');
  (panel==='cp'?INC_MODE:SP_INC_MODE)[k]=m;
  var b1=el('im-'+panel+'-'+k+'-pct'),b2=el('im-'+panel+'-'+k+'-abs');
  if(b1)b1.className=(m==='pct')?'stab on':'stab';
  if(b2)b2.className=(m==='abs')?'stab on':'stab';
  var u=el('unit-'+panel+'-'+k);
  if(u)u.textContent=(m==='abs')?'₹':'%';
  var iv=el((panel==='cp'?'iv-':'siv-')+k);
  if(iv){iv.placeholder=(m==='abs')?'0.00':'0';if(m==='abs'){iv.removeAttribute('max')}else{iv.max='100'}}
  saveLabels();
  calc();
}

/**
 * Capture checkbox and value state for a panel before a re-render.
 * @param {'cp'|'sp'} panel
 * @returns {Object} keyed by incentive key
 */
function _snapshotInc(panel){
  var keys=panel==='cp'?INC_KEYS:SP_INC_KEYS;
  var snap={};
  keys.forEach(function(k){
    var cb=document.getElementById(panel==='cp'?'it-'+k:'sit-'+k);
    var inp=document.getElementById(panel==='cp'?'iv-'+k:'siv-'+k);
    snap[k]={checked:cb?cb.checked:false,value:inp?inp.value:''};
  });
  return snap;
}

/**
 * Re-apply a _snapshotInc result after the rows have been rebuilt, including
 * the CD/Scheme sub-tab states and per-key %/₹ settings.
 * @param {'cp'|'sp'} panel
 * @param {Object} snap
 */
function _restoreInc(panel,snap){
  var keys=panel==='cp'?INC_KEYS:SP_INC_KEYS;
  var isCP=panel==='cp';
  keys.forEach(function(k){
    if(!snap[k])return;
    var cb=document.getElementById(isCP?'it-'+k:'sit-'+k);
    var inp=document.getElementById(isCP?'iv-'+k:'siv-'+k);
    var row=document.getElementById(isCP?'ir-'+k:'sir-'+k);
    if(cb)cb.checked=snap[k].checked;
    if(inp&&snap[k].value!=='')inp.value=snap[k].value;
    if(row)row.className='inc-row'+(snap[k].checked?(isCP?' active':' sp-active'):'');
  });
  // Re-apply per-key %/₹ state for user-added incentives
  keys.forEach(function(k){if(isCustomInc(k))applyIncModeVisuals(panel,k)});
  // Re-apply sub-row active states
  if(isCP){
    var cb=document.getElementById('cdm-before');if(cb)cb.className=(CDM==='before')?'stab on':'stab';
    var ca=document.getElementById('cdm-after');if(ca)ca.className=(CDM==='after')?'stab on':'stab';
    var sp=document.getElementById('scm-pct');if(sp)sp.className=(SCM==='pct')?'stab on':'stab';
    var sa=document.getElementById('scm-abs');if(sa)sa.className=(SCM==='abs')?'stab on':'stab';
    var su=document.getElementById('sc-unit');if(su)su.textContent=(SCM==='abs')?'₹':'%';
  } else {
    var scb=document.getElementById('scdm-before');if(scb)scb.className=(SCDM==='before')?'stab on':'stab';
    var sca=document.getElementById('scdm-after');if(sca)sca.className=(SCDM==='after')?'stab on':'stab';
    var ssp=document.getElementById('sscm-pct');if(ssp)ssp.className=(SSCM==='pct')?'stab on':'stab';
    var ssa=document.getElementById('sscm-abs');if(ssa)ssa.className=(SSCM==='abs')?'stab on':'stab';
    var ssu=document.getElementById('ssc-unit');if(ssu)ssu.textContent=(SSCM==='abs')?'₹':'%';
  }
}

/**
 * Rebuild the CP incentive grid from INC_KEYS.
 */
function renderCPIncRows(){
  var grid=document.getElementById('cp-inc-grid');
  if(!grid)return;
  var html='';
  INC_KEYS.forEach(function(k){html+=_incRowHTML(k,'cp',CP_EDIT_MODE);});
  grid.innerHTML=html;
  if(CP_EDIT_MODE)grid.classList.add('edit-mode');else grid.classList.remove('edit-mode');
  elClearCache();
}

/**
 * Rebuild the SP incentive grid from SP_INC_KEYS.
 */
function renderSPIncRows(){
  var grid=document.getElementById('sp-inc-grid');
  if(!grid)return;
  var html='';
  SP_INC_KEYS.forEach(function(k){html+=_incRowHTML(k,'sp',SP_EDIT_MODE);});
  grid.innerHTML=html;
  if(SP_EDIT_MODE)grid.classList.add('edit-mode');else grid.classList.remove('edit-mode');
  elClearCache();
}

/**
 * Enter or leave edit mode for one panel, preserving toggles and values across
 * the re-render.
 * @param {'cp'|'sp'} panel
 */
/** Panel id that holds each incentive list. */
function incPanelId(panel){return panel==='cp'?'inc':'sp-inc'}

/**
 * Whether an incentive panel's body is currently expanded.
 * @param {'cp'|'sp'} panel
 * @returns {boolean}
 */
function isIncPanelOpen(panel){
  var body=document.getElementById('body-'+incPanelId(panel));
  return !!body&&body.style.display==='block';
}

/**
 * Set edit mode for one panel. State and re-render only — it never opens or
 * closes the panel, so togglePanel can call it without recursing.
 * @param {'cp'|'sp'} panel
 * @param {boolean} on
 */
function setIncEditMode(panel,on){
  var isCP=panel==='cp';
  if((isCP?CP_EDIT_MODE:SP_EDIT_MODE)===on)return;
  var snap=_snapshotInc(panel);
  var btn=document.getElementById((isCP?'cp':'sp')+'-inc-edit-btn');
  var add=document.getElementById((isCP?'cp':'sp')+'-inc-add-btn');
  if(isCP)CP_EDIT_MODE=on;else SP_EDIT_MODE=on;
  if(btn)btn.textContent=on?'Done':'Edit';
  if(add)add.style.display=on?'block':'none';
  if(isCP)renderCPIncRows();else renderSPIncRows();
  _restoreInc(panel,snap);
  elClearCache();
  calc();
}

/**
 * Toggle edit mode from the Edit/Done button.
 *
 * Entering edit mode expands the panel — the rows being edited are inside it,
 * so editing a collapsed panel would show the user nothing. Leaving edit mode
 * deliberately does not collapse it, since you usually want to see the result.
 * The reverse link lives in togglePanel: collapsing the panel counts as Done.
 *
 * @param {'cp'|'sp'} panel
 */
function toggleIncEditMode(panel){
  var turningOn=!(panel==='cp'?CP_EDIT_MODE:SP_EDIT_MODE);
  setIncEditMode(panel,turningOn);
  if(turningOn&&!isIncPanelOpen(panel))togglePanel(incPanelId(panel));
}

/**
 * Append a new percentage incentive with a unique key and focus its label.
 * @param {'cp'|'sp'} panel
 */
function addInc(panel){
  pushUndo('add incentive');
  var keys=panel==='cp'?INC_KEYS:SP_INC_KEYS;
  var i=1;
  var allKeys=INC_KEYS.concat(SP_INC_KEYS);
  while(allKeys.indexOf('c'+i)!==-1)i++;
  var k='c'+i;
  INC_LABELS[k]='Incentive '+i;
  INC_LABELS_DEFAULT[k]='Incentive '+i;
  (panel==='cp'?INC_MODE:SP_INC_MODE)[k]='pct';
  keys.push(k);
  saveLabels();
  var snap=_snapshotInc(panel);
  if(panel==='cp')renderCPIncRows();else renderSPIncRows();
  _restoreInc(panel,snap);
  elClearCache();
  calc();
  haptic('light');
  // Only an input in edit mode — outside it the label renders as a span.
  var lblEl=document.getElementById('lbl-'+(panel==='cp'?'cp':'sp')+'-'+k);
  if(lblEl&&typeof lblEl.select==='function'){lblEl.focus();lblEl.select();}
}

/**
 * Ask before removing an incentive. doDeleteInc performs the removal.
 * @param {'cp'|'sp'} panel
 * @param {string} key
 */
function deleteInc(panel,key){
  var keys=panel==='cp'?INC_KEYS:SP_INC_KEYS;
  if(keys.indexOf(key)===-1)return;
  var name=INC_LABELS[key]||key;
  askConfirm('Delete incentive',
    'Delete "'+name+'" from '+(panel==='cp'?'CP':'SP')+' incentives?',
    'It stops counting toward the total straight away. You can undo this.',
    'Delete',
    function(){doDeleteInc(panel,key)});
}
/**
 * Remove an incentive and recalculate. Undoable.
 * Call deleteInc for the user-facing path; this skips the confirmation.
 * @param {'cp'|'sp'} panel
 * @param {string} key
 */
function doDeleteInc(panel,key){
  var keys=panel==='cp'?INC_KEYS:SP_INC_KEYS;
  var idx=keys.indexOf(key);
  if(idx===-1)return;
  var name=INC_LABELS[key]||key;
  pushUndo('delete "'+name+'"');
  var snap=_snapshotInc(panel);
  keys.splice(idx,1);
  delete snap[key];
  delete (panel==='cp'?INC_MODE:SP_INC_MODE)[key];
  saveLabels();
  if(panel==='cp')renderCPIncRows();else renderSPIncRows();
  _restoreInc(panel,snap);
  elClearCache();
  calc();
  haptic('light');
}

/**
 * Persist incentive names, the CP/SP key lists and their %/₹ modes.
 */
function saveLabels(){
  try{
    localStorage.setItem('pc-labels',JSON.stringify({
      labels:INC_LABELS,cpKeys:INC_KEYS,spKeys:SP_INC_KEYS,
      cpModes:INC_MODE,spModes:SP_INC_MODE
    }));
  }catch(e){ logError('could not save incentive names/list (pc-labels)',e); }
}
/**
 * Restore incentive names, key lists and modes. Accepts the older flat
 * {key:label} format written before lists were customisable.
 */
function loadLabels(){
  try{
    var raw=localStorage.getItem('pc-labels');
    if(!raw)return;
    var parsed=JSON.parse(raw);
    var labels=parsed.labels||parsed;
    Object.keys(labels).forEach(function(k){INC_LABELS[k]=labels[k];if(!INC_LABELS_DEFAULT[k])INC_LABELS_DEFAULT[k]=labels[k];});
    if(parsed.cpKeys&&Array.isArray(parsed.cpKeys))INC_KEYS=parsed.cpKeys;
    if(parsed.spKeys&&Array.isArray(parsed.spKeys))SP_INC_KEYS=parsed.spKeys;
    if(parsed.cpModes)INC_MODE=parsed.cpModes;
    if(parsed.spModes)SP_INC_MODE=parsed.spModes;
  }catch(e){ logWarn('could not read saved incentives (pc-labels); using defaults',e); }
}

/* ── Incentive helpers ── */
function syncToggle(k){haptic('select');var row=el('ir-'+k),cb=el('it-'+k);if(row&&cb)row.className='inc-row'+(cb.checked?' active':'')}
/**
 * Total CP incentive value in rupees for a given cost price.
 * CD may be charged on the incl-GST base; Scheme and user-added rows may be
 * flat ₹ instead of a percentage.
 * @param {{e:number,i:number}|null} cp
 * @returns {number} rupees, 0 when cp is null
 */
function getIncentiveInr(cp){
  if(!cp)return 0;
  var t=0;
  INC_KEYS.forEach(function(k){
    var cb=document.getElementById('it-'+k);
    if(!cb||!cb.checked)return;
    var inp=document.getElementById('iv-'+k);
    var v=parseFloat(inp?inp.value:'');
    if(isNaN(v)||v<=0)return;
    if(k==='sc'){
      t+=(SCM==='abs')?v:(cp.e*v/100);
    } else if(isCustomInc(k)){
      t+=(incModeOf('cp',k)==='abs')?v:(cp.e*v/100);
    } else {
      t+=(k==='cd'&&CDM==='after')?(cp.i*v/100):(cp.e*v/100);
    }
  });
  return t;
}
/**
 * Refresh the CP panel header tag with the active count, summed percentage and
 * any flat ₹ amounts.
 */
function updateIncSummaryTag(){
  var active=INC_KEYS.filter(function(k){var e=document.getElementById('it-'+k);return e&&e.checked}).length;
  var nom=0, hasAbsSc=false, absScVal=0;
  INC_KEYS.forEach(function(k){
    var cb=document.getElementById('it-'+k);
    if(!cb||!cb.checked)return;
    var inp=document.getElementById('iv-'+k);
    var v=parseFloat(inp?inp.value:'');
    if(isNaN(v)||v<=0)return;
    if((k==='sc'&&SCM==='abs')||(isCustomInc(k)&&incModeOf('cp',k)==='abs')){hasAbsSc=true;absScVal+=v;}
    else nom+=v;
  });
  var _itcd=document.getElementById('it-cd');var note=(_itcd&&_itcd.checked&&CDM==='after')?' (CD on +GST)':'';
  var scNote=hasAbsSc?' + ₹'+absScVal.toFixed(2)+' fixed':'';
  el('inc-summary-tag').textContent=(active===0?'All off':active+' active')+' — '+nom.toFixed(2)+'%'+scNote+note;
}
/**
 * Proportional factor (effective CP ÷ CP excl GST) from percentage incentives.
 * Flat ₹ incentives are excluded because they have no proportional form —
 * cpFromProfit uses K to estimate the base, then getIncentiveInr subtracts the
 * flat amounts exactly.
 * @returns {number}
 */
function computeK(){
  // K = effCPE / cp.e — the proportional factor after all %-based incentives.
  // Absolute scheme ₹ is NOT included here (can't express as a ratio without knowing cp.e).
  // cpFromProfit uses K to estimate cp.e, then getIncentiveInr handles the abs deduction precisely.
  var K=1;
  INC_KEYS.forEach(function(k){
    var cb=document.getElementById('it-'+k);
    if(!cb||!cb.checked)return;
    var inp=document.getElementById('iv-'+k);
    var v=parseFloat(inp?inp.value:'');
    if(isNaN(v)||v<=0)return;
    if(k==='sc'&&SCM==='abs')return; // abs scheme handled separately
    if(isCustomInc(k)&&incModeOf('cp',k)==='abs')return; // ditto for ₹ user-added incentives
    K-=(k==='cd'&&CDM==='after')?(v/100)*(1+G):(v/100);
  });
  return K;
}

/* ── SP Incentives ── */
function getSPIncentiveInr(sp){
  if(!sp)return 0;
  var t=0;
  SP_INC_KEYS.forEach(function(k){
    var cb=document.getElementById('sit-'+k);
    if(!cb||!cb.checked)return;
    var inp=document.getElementById('siv-'+k);
    var v=parseFloat(inp?inp.value:'');
    if(isNaN(v)||v<=0)return;
    if(k==='sc'){
      t+=(SSCM==='abs')?v:(sp.e*v/100);
    } else if(isCustomInc(k)){
      t+=(incModeOf('sp',k)==='abs')?v:(sp.e*v/100);
    } else {
      t+=(k==='cd'&&SCDM==='after')?(sp.i*v/100):(sp.e*v/100);
    }
  });
  return t;
}
/**
 * Refresh the SP panel header tag. Mirrors updateIncSummaryTag.
 */
function updateSpIncSummaryTag(){
  var active=SP_INC_KEYS.filter(function(k){var e=document.getElementById('sit-'+k);return e&&e.checked}).length;
  var nom=0,hasAbsSc=false,absScVal=0;
  SP_INC_KEYS.forEach(function(k){
    var cb=document.getElementById('sit-'+k);
    if(!cb||!cb.checked)return;
    var inp=document.getElementById('siv-'+k);
    var v=parseFloat(inp?inp.value:'');
    if(isNaN(v)||v<=0)return;
    if((k==='sc'&&SSCM==='abs')||(isCustomInc(k)&&incModeOf('sp',k)==='abs')){hasAbsSc=true;absScVal+=v;}
    else nom+=v;
  });
  var _sitcd=document.getElementById('sit-cd');var note=(_sitcd&&_sitcd.checked&&SCDM==='after')?' (CD on +GST)':'';
  var scNote=hasAbsSc?' + ₹'+absScVal.toFixed(2)+' fixed':'';
  el('sp-inc-summary-tag').textContent=(active===0?'All off':active+' active')+' — '+nom.toFixed(2)+'%'+scNote+note;
}
/**
 * Update an SP incentive row's active styling from its checkbox.
 * @param {string} k
 */
function syncSpToggle(k){
  haptic('select');
  var row=el('sir-'+k),cb=el('sit-'+k);
  if(row&&cb)row.className='inc-row'+(cb.checked?' sp-active':'');
}
/**
 * Choose whether SP cash discount applies before or after GST.
 * @param {'before'|'after'} m
 */
function setSCDMode(m){
  haptic('select');SCDM=m;
  var e1=el('scdm-before'),e2=el('scdm-after');
  if(e1)e1.className=(m==='before')?'stab on':'stab';
  if(e2)e2.className=(m==='after')?'stab on':'stab';
  calc();
}
/**
 * Switch the SP scheme between percentage and flat ₹.
 * @param {'pct'|'abs'} m
 */
function setSpSchemeMode(m){
  haptic('select');SSCM=m;
  var e1=el('sscm-pct'),e2=el('sscm-abs'),eu=el('ssc-unit'),iv=el('siv-sc');
  if(e1)e1.className=(m==='pct')?'stab on':'stab';
  if(e2)e2.className=(m==='abs')?'stab on':'stab';
  if(eu)eu.textContent=(m==='abs')?'₹':'%';
  if(iv){iv.placeholder=(m==='abs')?'0.00':'0';if(m==='abs'){iv.removeAttribute('max')}else{iv.max='100'}}
  calc();
}
/**
 * Write the SP incentive totals into the panel footer.
 * @param {{e:number,i:number}|null} sp
 */
function fillSpIncPanel(sp){
  updateSpIncSummaryTag();
  var inc=getSPIncentiveInr(sp),eff=sp?sp.e-inc:null;
  R('sp-inc-total-pct',(inc>0&&sp)?PCT((inc/sp.e)*100):'0.00%');
  R('sp-inc-total-inr',inc>0?INR(inc):'—');
  R('sp-inc-eff-sp',INR(eff));
}
/* ── Dynamic GST label updater ── */
function updateGSTLabels(){
  var g   = Math.round(G   * 100); // main mode
  var fcg = Math.round(FC_G * 100); // quick mode
  var wzg = Math.round(WZ_G * 100); // wizard mode
  var wzLbl = (WZ_T === 'cp') ? 'Cost Price' : 'Selling Price';
  function R(id,t){var e=el(id);if(e)e.textContent=t;}

  // Main mode — disc field suffixes
  var cpSuf=el('cpd-suf');
  if(cpSuf) cpSuf.textContent = (CM==='excl') ? '% + '+g+'% GST' : '%';
  var spSuf=el('spd-suf');
  if(spSuf) spSuf.textContent = (SM==='excl') ? '% + '+g+'% GST' : '%';

  // Manual entry sub-tabs
  R('cpm-incl','CP incl '+g+'% GST'); R('cpm-excl','CP excl '+g+'% GST');
  R('spm-incl','SP incl '+g+'% GST'); R('spm-excl','SP excl '+g+'% GST');

  // Accordion row labels
  R('lbl-cve','CP excl '+g+'% GST'); R('lbl-cvi','CP incl '+g+'% GST');
  R('lbl-sve','SP excl '+g+'% GST'); R('lbl-svi','SP incl '+g+'% GST');

  // CD mode buttons
  R('lbl-cdm-before','CP excl '+g+'% GST'); R('lbl-cdm-after','CP incl '+g+'% GST');
  R('lbl-scdm-before','SP excl '+g+'% GST'); R('lbl-scdm-after','SP incl '+g+'% GST');

  // Scheme buttons
  R('lbl-scm-pct','% of CP excl '+g+'% GST');
  R('lbl-sscm-pct','% of SP excl '+g+'% GST');

  // Incentive totals
  R('lbl-inc-eff-cp','Effective CP excl '+g+'% GST');
  R('lbl-sp-inc-eff-sp','Effective SP excl '+g+'% GST');

  // Summary bar
  R('s-lbl-cp','CP excl '+g+'% GST');
  R('s-lbl-ecp','Effective CP excl '+g+'% GST');
  R('s-lbl-sp','SP excl '+g+'% GST');
  R('s-lbl-esp','Effective SP excl '+g+'% GST');

  // Quick mode — disc field suffixes
  var fcCpSuf=el('fc-cpd-suf');
  if(fcCpSuf) fcCpSuf.textContent = (FC_CM==='excl') ? '% + '+fcg+'% GST' : '%';
  var fcSpSuf=el('fc-spd-suf');
  if(fcSpSuf) fcSpSuf.textContent = (FC_SM==='excl') ? '% + '+fcg+'% GST' : '%';

  // Quick mode manual sub-tabs
  R('fc-cpms-incl','CP incl '+fcg+'% GST'); R('fc-cpms-excl','CP excl '+fcg+'% GST');
  R('fc-spms-incl','SP incl '+fcg+'% GST'); R('fc-spms-excl','SP excl '+fcg+'% GST');

  // Wizard — disc field suffix
  var wzSuf=el('wz-disc-suf');
  if(wzSuf) wzSuf.textContent = (WZ_CM==='excl') ? '% + '+wzg+'% GST' : '%';

  // Wizard labels (replaces inline textContent calls in wzSetT)
  R('wz-ms-incl-lbl',  wzLbl+' incl '+wzg+'% GST');
  R('wz-ms-excl-lbl',  wzLbl+' excl '+wzg+'% GST');
  R('wz-cdm-before-lbl', wzLbl+' excl '+wzg+'% GST');
  R('wz-cdm-after-lbl',  wzLbl+' incl '+wzg+'% GST');
  R('wz-scm-pct-lbl','% of '+wzLbl+' excl '+wzg+'% GST');
  R('wz-rlbl-e',   wzLbl+' excl '+wzg+'% GST');
  R('wz-rlbl-i',   wzLbl+' incl '+wzg+'% GST');
  R('wz-rlbl-eff', 'Eff. '+wzLbl+' excl '+wzg+'% GST');
  R('wz-rlbl-effi','Eff. '+wzLbl+' incl '+wzg+'% GST');
}

/**
 * Set the GST rate. Accepts any rate, not just the two presets; the custom box
 * is cleared when a preset is chosen and filled otherwise.
 * @param {number} p rate as a percentage, e.g. 18
 */
function setGST(p){haptic('select');G=p/100;el('g18').className=(p===18)?'pill on':'pill';el('g5').className=(p===5)?'pill on':'pill';var gc=el('gst-custom');if(gc&&document.activeElement!==gc)gc.value=(p===18||p===5)?'':p;el('grate').textContent=p+'%';updateGSTLabels();calc()}
/**
 * Choose which figure the calculator solves for.
 * @param {'profit'|'sp'|'cp'} t
 */
function setT(t){haptic('select');T=t;el('tprofit').className=(t==='profit')?'pill on':'pill';el('tsp').className=(t==='sp')?'pill on':'pill';el('tcp').className=(t==='cp')?'pill on':'pill';updateLayout();calc()}
/**
 * Set the cost-price input mode and show the matching fields.
 * @param {'excl'|'incl'|'manual'} m
 */
function setCM(m){
  CM=m;
  el('cme').className=(m==='excl')?'mtab on':'mtab';el('cmi').className=(m==='incl')?'mtab on':'mtab';el('cmm').className=(m==='manual')?'mtab on':'mtab';
  el('cpf-disc').style.display=(m==='manual')?'none':'';
  el('cpf-manual').style.display=(m==='manual')?'flex':'none';
  el('cp-footnote').textContent=(m==='manual')?'Enter CP directly in ₹.':'Enter disc % in either mode — both shown above.';
  updateGSTLabels();
  calc();
}
/**
 * Choose whether a manually entered CP is incl or excl GST.
 * @param {'incl'|'excl'} s
 */
function setCPManual(s){haptic('select');CPMS=s;el('cpm-incl').className=(s==='incl')?'stab on':'stab';el('cpm-excl').className=(s==='excl')?'stab on':'stab';calc()}
/**
 * Set the selling-price input mode and show the matching fields.
 * @param {'excl'|'incl'|'manual'} m
 */
function setSM(m){
  haptic('select');
  SM=m;
  el('sme').className=(m==='excl')?'mtab on':'mtab';
  el('smi').className=(m==='incl')?'mtab on':'mtab';
  el('smm').className=(m==='manual')?'mtab on':'mtab';
  el('spf-disc').style.display=(m==='manual')?'none':'';
  el('spf-manual').style.display=(m==='manual')?'flex':'none';
  el('sp-footnote').textContent=(m==='manual')?'Enter SP directly in ₹.':'Enter disc % in either mode — both shown above.';
  updateGSTLabels();
  calc();
}
/**
 * Choose whether a manually entered SP is incl or excl GST.
 * @param {'incl'|'excl'} s
 */
function setSPManual(s){
  haptic('select');
  SPMS=s;
  el('spm-incl').className=(s==='incl')?'stab on':'stab';
  el('spm-excl').className=(s==='excl')?'stab on':'stab';
  calc();
}
/**
 * Set how target profit is expressed when solving for SP or CP.
 * @param {'val'|'gp'|'margin'} m
 */
function setPM(m){haptic('select');PM=m;el('pmv').className=(m==='val')?'mtab on':'mtab';el('pmg').className=(m==='gp')?'mtab on':'mtab';el('pmm').className=(m==='margin')?'mtab on':'mtab';el('pru').textContent=(m==='val')?'₹':'%';calc()}
/**
 * Choose whether CP cash discount applies before or after GST.
 * @param {'before'|'after'} m
 */
function setCDMode(m){haptic('select');CDM=m;var e1=el('cdm-before'),e2=el('cdm-after');if(e1)e1.className=(m==='before')?'stab on':'stab';if(e2)e2.className=(m==='after')?'stab on':'stab';calc()}
/**
 * Switch the CP scheme between percentage and flat ₹.
 * @param {'pct'|'abs'} m
 */
function setSchemeMode(m){
  haptic('select');SCM=m;
  var e1=el('scm-pct'),e2=el('scm-abs'),eu=el('sc-unit'),iv=el('iv-sc');
  if(e1)e1.className=(m==='pct')?'stab on':'stab';
  if(e2)e2.className=(m==='abs')?'stab on':'stab';
  if(eu)eu.textContent=(m==='abs')?'₹':'%';
  if(iv){iv.placeholder=(m==='abs')?'0.00':'0';if(m==='abs'){iv.removeAttribute('max')}else{iv.max='100'}}
  calc();
}

/* ── Layout ── */
function updateLayout(){
  var isCP=T==='cp',isSP=T==='sp',isPR=T==='profit';
  el('cpc').className='card'+(isCP?' computed':'');el('spc').className='card'+(isSP?' computed':'');el('prc').className='card'+(isPR?' computed':'');
  el('cpb').textContent=isCP?'Calculated':'Input';el('cpb').className=isCP?'badge b-calc':'badge b-input';
  el('spb').textContent=isSP?'Calculated':'Input';el('spb').className=isSP?'badge b-calc':'badge b-input';
  el('prb').textContent=isPR?'Calculated':'Input';el('prb').className=isPR?'badge b-calc':'badge b-input';
  el('cp-mode-tabs').style.display=(!isCP)?'':'none';
  el('cpf-disc').style.display=(!isCP&&CM!=='manual')?'':'none';
  el('cpf-manual').style.display=(!isCP&&CM==='manual')?'flex':'none';
  el('sp-mode-tabs').style.display=(!isSP)?'':'none';
  el('spf-disc').style.display=(!isSP&&SM!=='manual')?'':'none';
  el('spf-manual').style.display=(!isSP&&SM==='manual')?'flex':'none';
  el('pmt').style.display=isPR?'none':'';el('prf').style.display=isPR?'none':'';
}

/* ── Price calc ── */
function priceFromDisc(d,mode){
  if(d===null||d===undefined||isNaN(d))return null;
  if(mode==='excl'){var e=MI*(1-d/100);return{e:e,i:e*(1+G)}}
  var i=MI*(1-d/100);return{e:i/(1+G),i:i};
}
/**
 * Build a price pair from a typed amount.
 * @param {number} v the amount
 * @param {'incl'|'excl'} sub which side of GST v represents
 * @returns {{e:number,i:number}|null} null when v is not a positive number
 */
function priceFromManual(v,sub){
  if(!v||isNaN(v)||v<=0)return null;
  return sub==='incl'?{e:v/(1+G),i:v}:{e:v,i:v*(1+G)};
}
/**
 * Discounts off MRP implied by an excl-GST price.
 * @param {number} pe price excl GST
 * @returns {{de:number,di:number}} de = on the excl basis, di = on the incl basis
 */
function discFromPrice(pe){return{de:(1-pe/MI)*100,di:(1-(pe*(1+G))/MI)*100}}
/**
 * Selling price excl GST that yields a target profit.
 * @param {number} effCPE effective CP excl GST
 * @param {'val'|'gp'|'margin'} mode how val is expressed
 * @param {number} val target
 * @returns {number|null} null when unsolvable (e.g. GP >= 100%)
 */
function spFromProfit(effCPE,mode,val){
  if(mode==='val')return effCPE+val;
  if(mode==='gp')return(val>=100)?null:effCPE/(1-val/100);
  if(mode==='margin')return effCPE*(1+val/100);
  return null;
}
/**
 * Cost price that yields a target profit at a given selling price.
 * Inverts the percentage incentives via computeK.
 * @param {number} spe effective SP excl GST
 * @param {'val'|'gp'|'margin'} mode
 * @param {number} val target
 * @returns {{e:number,i:number}|null}
 */
function cpFromProfit(spe,mode,val){
  var K=computeK();if(K<=0)return null;
  var e;
  if(mode==='val')e=spe-val;
  else if(mode==='gp')e=spe*(1-val/100);
  else if(mode==='margin')e=spe/(1+val/100);
  else return null;
  if(!e||e<=0)return null;
  var n=e/K;return{e:n,i:n*(1+G)};
}
/**
 * Current cost price from whichever input mode is active, with rounding applied.
 * @returns {{e:number,i:number}|null}
 */
function resolveCP(){
  if(CM==='manual')return roundPrice(priceFromManual(parseAmt('cpv'),CPMS));
  var d=parseFloat(el('cpd').value);return isNaN(d)?null:roundPrice(priceFromDisc(d,CM));
}
/**
 * Current selling price from whichever input mode is active, with rounding applied.
 * @returns {{e:number,i:number}|null}
 */
function resolveSP(){
  if(SM==='manual')return roundPrice(priceFromManual(parseAmt('spv'),SPMS));
  var d=parseFloat(el('spd').value);return isNaN(d)?null:roundPrice(priceFromDisc(d,SM));
}

/* ── Fill helpers ── */
function fillCP(cp){
  if(!cp){
    ['cde','cdi','cve','cvi','cga'].forEach(function(id){R(id,'—')});
    el('cpc').className=el('cpc').className.replace(' over-mrp','');
    el('cp-alert').className='price-alert';
    el('cvi').className='row-val';
    return;
  }
  var d=discFromPrice(cp.e);
  var overMRP=MI>0&&cp.i>MI;
  R('cde',PCT(d.de));R('cdi',PCT(d.di));R('cve',INR(cp.e));R('cvi',INR(cp.i));R('cga',INR(cp.i-cp.e));
  el('cvi').className='row-val'+(overMRP?' neg':'');
  el('cdi').className='row-val'+(d.di<0?' neg':'');
  var card=el('cpc');
  card.className=card.className.replace(' over-mrp','')+(overMRP?' over-mrp':'');
  el('cp-alert').className='price-alert'+(overMRP?' show':'');
  // auto-open accordion when alert fires (mobile)
  if(overMRP&&window.innerWidth<=800){
    var b=el('acc-body-cp');if(b&&!b.classList.contains('open'))toggleAcc('cp');
  }
}
/**
 * Write selling-price figures into the SP card and flag an over-MRP price.
 * @param {{e:number,i:number}|null} sp
 */
function fillSP(sp){
  if(!sp){
    ['sde','sdi','sve','svi','sga'].forEach(function(id){R(id,'—')});
    el('spc').className=el('spc').className.replace(' over-mrp','');
    el('sp-alert').className='price-alert';
    el('svi').className='row-val';
    return;
  }
  var d=discFromPrice(sp.e);
  var overMRP=MI>0&&sp.i>MI;
  R('sde',PCT(d.de));R('sdi',PCT(d.di));R('sve',INR(sp.e));R('svi',INR(sp.i));R('sga',INR(sp.i-sp.e));
  el('svi').className='row-val'+(overMRP?' neg':'');
  el('sdi').className='row-val'+(d.di<0?' neg':'');
  var card=el('spc');
  card.className=card.className.replace(' over-mrp','')+(overMRP?' over-mrp':'');
  el('sp-alert').className='price-alert'+(overMRP?' show':'');
  if(overMRP&&window.innerWidth<=800){
    var b=el('acc-body-sp');if(b&&!b.classList.contains('open'))toggleAcc('sp');
  }
}
/**
 * Write profit, GP% and Margin% into the profit card with floor colouring.
 * @param {number|null} effCPE effective CP excl GST
 * @param {number|null} spe effective SP excl GST
 */
function fillProfit(effCPE,spe){
  var floor=getFloor(),pvEl=el('pvv');
  if(effCPE===null||spe===null||isNaN(effCPE)||isNaN(spe)){
    ['pvv','pgp','pmrg','pspd'].forEach(function(id){R(id,'—')});pvEl.className='row-val big';return;
  }
  var pr=spe-effCPE,gp=(spe>0)?(pr/spe)*100:null,mg=(effCPE>0)?(pr/effCPE)*100:null;
  R('pvv',INR(pr));R('pgp',PCT(gp));R('pmrg',PCT(mg));R('pspd',INR(pr));
  pvEl.className='row-val big '+(pr>=0?'pos':'neg');
  el('pgp').className='row-val '+gpCls(gp,floor);
  el('pmrg').className='row-val '+mgCls(mg,floor);
}
/**
 * Write the CP incentive totals into the panel footer.
 * @param {{e:number,i:number}|null} cp
 */
function fillIncPanel(cp){
  updateIncSummaryTag();
  var inc=getIncentiveInr(cp),eff=cp?cp.e-inc:null;
  R('inc-total-pct',(inc>0&&cp)?PCT((inc/cp.e)*100):'0.00%');
  R('inc-total-inr',inc>0?INR(inc):'—');R('inc-eff-cp',INR(eff));
}
/**
 * Set one summary cell's text and state class.
 * @param {string} id
 * @param {string} val
 * @param {string} cls
 */
function sumSet(id,val,cls){var e=el(id);if(!e)return;e.textContent=val;e.className='sum-val '+cls}
/**
 * Repaint the whole summary bar, including the order-level block which only
 * appears once quantity is above 1.
 * @param {{e:number,i:number}|null} cp
 * @param {{e:number,i:number}|null} sp
 */
function fillSummary(cp,sp){
  ['s-mrp','s-cp','s-ecp','s-sp','s-esp','s-inc','s-spinc','s-pr','s-gp','s-mg','s-dcp','s-dsp'].forEach(function(id){sumSet(id,'—','dim')});
  var mrpV=parseMRP();
  if(mrpV&&mrpV>0)sumSet('s-mrp',INR(mrpV),'');
  if(!cp||!sp){updateMiniResult(null,null,null);updateA11yStatus(null,null,null);return}
  var floor=getFloor();
  var cpInc=getIncentiveInr(cp),eff=cp.e-cpInc;
  var spInc=getSPIncentiveInr(sp),effSP=sp.e-spInc;
  var pr=effSP-eff,gp=(effSP>0)?(pr/effSP)*100:null,mg=(eff>0)?(pr/eff)*100:null;
  var dcp=discFromPrice(cp.e),dsp=discFromPrice(sp.e);
  sumSet('s-cp',INR(cp.e),'');sumSet('s-ecp',INR(eff),cpInc>0?'amber':'');
  sumSet('s-sp',INR(sp.e),'');sumSet('s-esp',INR(effSP),spInc>0?'pos':'');
  sumSet('s-inc',cpInc>0?INR(cpInc):'—',cpInc>0?'amber':'dim');
  sumSet('s-spinc',spInc>0?INR(spInc):'—',spInc>0?'pos':'dim');
  sumSet('s-pr',INR(pr),pr>=0?'pos':'neg');
  sumSet('s-gp',PCT(gp),gpCls(gp,floor));sumSet('s-mg',PCT(mg),mgCls(mg,floor));
  sumSet('s-dcp',PCT(dcp.de),'');sumSet('s-dsp',PCT(dsp.de),'');
  // Order-level totals — only shown once qty > 1, so single-unit use is unchanged
  var q=getQty(),multi=q>1;
  ['s-order-sep','s-item-qty','s-item-order','s-item-tpr'].forEach(function(id){
    var e=el(id);if(e)e.style.display=multi?'':'none';
  });
  if(multi){
    sumSet('s-qty',q+' units','');
    sumSet('s-order',INR(sp.i*q),'');
    sumSet('s-tpr',INR(pr*q),pr>=0?'pos':'neg');
  }
  updateMiniResult(pr,gp,mg);
  updateA11yStatus(pr,gp,mg);
  // Flash key values
  ['s-pr','s-gp','s-mg'].forEach(flashSumVal);
}
/* Announcing on every keystroke would make the live region unusable, so the
   message settles first and is only spoken if the figures actually changed. */
var _a11yTimer=null,_a11yLast='';
/**
 * Announce the current result to assistive technology.
 * @param {number|null} pr profit in rupees
 * @param {number|null} gp gross profit %
 * @param {number|null} mg margin %
 */
function updateA11yStatus(pr,gp,mg){
  var node=el('a11y-status');
  if(!node)return;
  clearTimeout(_a11yTimer);
  _a11yTimer=setTimeout(function(){
    var msg;
    if(pr===null||pr===undefined||isNaN(pr)){
      msg='';
    }else{
      var floor=getFloor();
      msg='Profit '+INR(pr)+', GP '+PCT(gp)+', Margin '+PCT(mg);
      var q=getQty();
      if(q>1)msg+='. Total for '+q+' units '+INR(pr*q);
      if(belowFloor(gp,floor.gp))msg+='. Warning: GP is below your floor';
      if(belowFloor(mg,floor.mg))msg+='. Warning: Margin is below your floor';
    }
    if(msg!==_a11yLast){_a11yLast=msg;node.textContent=msg}
  },700);
}

/**
 * Update the sticky mobile result bar. Hidden entirely when the calculation is
 * incomplete, or in Quick mode which shows its own result card.
 * @param {number|null} pr profit in rupees
 * @param {number|null} gp gross profit %
 * @param {number|null} mg margin %
 */
function updateMiniResult(pr,gp,mg){
  var bar=el('mini-result');
  if(!bar)return;
  var ready=(pr!==null&&pr!==undefined&&!isNaN(pr)&&APP_MODE==='default');
  bar.className='mini-result'+(ready?' show':'');
  if(!ready)return;
  var floor=getFloor();
  var prEl=el('mini-pr'),gpEl=el('mini-gp'),mgEl=el('mini-mg');
  if(prEl){prEl.textContent=INR(pr);prEl.className='mini-val'+(pr<0?' neg':'')}
  if(gpEl){gpEl.textContent=PCT(gp);gpEl.className='mini-val'+(belowFloor(gp,floor.gp)?' warn':(gp<0?' neg':''))}
  if(mgEl){mgEl.textContent=PCT(mg);mgEl.className='mini-val'+(belowFloor(mg,floor.mg)?' warn':(mg<0?' neg':''))}
}

/* ── What-if modal renderer ── */
/* ── What-if helpers ── */
var WI_CHEVRON_SVG='<svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M4 2l4 4-4 4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';

/**
 * Selling price for one what-if scenario.
 * @param {Object} sc scenario record from WI_SCENES
 * @returns {{e:number,i:number}|null}
 */
function resolveWiSP(sc){
  if(sc.spMode==='manual'){
    var v=parseFloat(String(sc.spVal).replace(/,/g,''));
    return priceFromManual(v,sc.spManualSub);
  }
  var d=parseFloat(sc.spDisc);
  return(!isNaN(d)&&sc.spDisc!=='')?priceFromDisc(d,sc.spMode):null;
}

// Update only the result rows — never touches inputs so keyboard stays open
function updateWiResults(){
  if(!LAST_CP)return;
  var inc=getIncentiveInr(LAST_CP),eff=LAST_CP.e-inc,floor=getFloor();

  // Recalculate best GP
  var bestGP=-Infinity,bestIdx=-1;
  WI_SCENES.forEach(function(sc,i){
    var sp=resolveWiSP(sc);if(!sp)return;
    var gp=(sp.e>0)?((sp.e-eff)/sp.e)*100:null;
    if(gp!==null&&gp>bestGP){bestGP=gp;bestIdx=i}
  });

  WI_SCENES.forEach(function(sc,i){
    // update card highlight
    var card=el('wi-card-'+i);
    if(card)card.className='wi-card'+(i===bestIdx?' wi-best':'');

    var sp=resolveWiSP(sc);
    var KEYS=['spe','spi','pr','gp','mg'];

    if(sp){
      var pr=sp.e-eff,gp=(sp.e>0)?(pr/sp.e)*100:null,mg=(eff>0)?(pr/eff)*100:null;
      var vals=[
        {v:INR(sp.e),c:''},
        {v:INR(sp.i),c:''},
        {v:INR(pr),c:pr>=0?'pos':'neg'},
        {v:PCT(gp),c:gpCls(gp,floor)},
        {v:PCT(mg),c:mgCls(mg,floor)}
      ];
      vals.forEach(function(row,k){
        var cell=el('wi-'+i+'-'+KEYS[k]);
        if(cell){cell.textContent=row.v;cell.className='wi-val '+row.c}
      });
    } else {
      KEYS.forEach(function(k){
        var cell=el('wi-'+i+'-'+k);
        if(cell){cell.textContent='—';cell.className='wi-val dim'}
      });
    }
  });
}

// Full render — rebuilds the entire grid (called on modal open, mode change, CP change)
function renderWhatIf(cp){
  var info=el('wi-cp-info'),grid=el('wi-grid');
  if(!cp){info.innerHTML='Enter CP and incentives on the main screen first.';grid.innerHTML='';return}
  var inc=getIncentiveInr(cp),eff=cp.e-inc,floor=getFloor();
  var incTxt=inc>0?' · Incentives: '+INR(inc)+' · Eff CP: '+INR(eff):'';
  info.innerHTML='<span>MRP: <strong>'+INR(MI)+'</strong></span><span>CP excl GST: <strong>'+INR(cp.e)+'</strong></span>'+incTxt;

  var bestGP=-Infinity,bestIdx=-1;
  WI_SCENES.forEach(function(sc,i){
    var sp=resolveWiSP(sc);if(!sp)return;
    var gp=(sp.e>0)?((sp.e-eff)/sp.e)*100:null;
    if(gp!==null&&gp>bestGP){bestGP=gp;bestIdx=i}
  });

  grid.innerHTML='';
  WI_SCENES.forEach(function(sc,i){
    var isManual=sc.spMode==='manual';
    var card=document.createElement('div');
    card.className='wi-card'+(i===bestIdx?' wi-best':'');
    card.id='wi-card-'+i;

    // header
    var hd=document.createElement('div');hd.className='wi-card-head';
    var ttl=document.createElement('span');ttl.className='wi-card-title';
    ttl.textContent='Scenario '+['A','B','C'][i];
    hd.appendChild(ttl);card.appendChild(hd);

    // 3-way mode tabs — mode change does full rebuild (no input is focused)
    var tabs=document.createElement('div');tabs.className='sub-tabs';
    [{key:'excl',label:'Discount + GST %'},{key:'incl',label:'Nett Discount %'},{key:'manual',label:'Enter ₹ directly'}]
    .forEach(function(m){
      var btn=document.createElement('button');
      btn.className='stab'+(sc.spMode===m.key?' on':'');
      btn.textContent=m.label;
      btn.onclick=(function(mode,idx){return function(){WI_SCENES[idx].spMode=mode;renderWhatIf(LAST_CP)}})(m.key,i);
      tabs.appendChild(btn);
    });
    card.appendChild(tabs);

    if(isManual){
      var subWrap=document.createElement('div');subWrap.style.cssText='display:flex;flex-direction:column;gap:6px';
      // sub-tabs for incl/excl GST — also full rebuild (no input focused)
      var subTabs=document.createElement('div');subTabs.className='sub-tabs';
      [{key:'incl',label:'SP incl GST'},{key:'excl',label:'SP excl GST'}].forEach(function(s){
        var b=document.createElement('button');b.className='stab'+(sc.spManualSub===s.key?' on':'');
        b.textContent=s.label;
        b.onclick=(function(sub,idx){return function(){WI_SCENES[idx].spManualSub=sub;renderWhatIf(LAST_CP)}})(s.key,i);
        subTabs.appendChild(b);
      });
      subWrap.appendChild(subTabs);

      // ₹ input — oninput stores value + calls updateWiResults() ONLY (never rebuilds)
      var fldM=document.createElement('div');fldM.className='field';
      var symM=document.createElement('span');symM.className='sym';symM.textContent='₹';
      var inpM=document.createElement('input');inpM.type='text';inpM.inputMode='decimal';
      inpM.placeholder=sc.spManualSub==='incl'?'SP incl GST':'SP excl GST';
      inpM.autocomplete='off';
      if(sc.spVal!==''){var nv=parseFloat(sc.spVal);inpM.value=isNaN(nv)?sc.spVal:fmtINDIAN(nv)}
      inpM.oninput=(function(idx){return function(){
        var raw=this.value.replace(/[^0-9.]/g,'');
        var pts=raw.split('.');if(pts.length>2)raw=pts[0]+'.'+pts.slice(1).join('');
        WI_SCENES[idx].spVal=raw;
        var num=parseFloat(raw);
        if(!isNaN(num)&&raw!==''&&raw!=='.'){
          var fmt=fmtINDIAN(num);
          if(raw.indexOf('.')!==-1){var dec=raw.split('.')[1];fmt=fmtINDIAN(parseFloat(raw.split('.')[0])||0).split('.')[0]+'.'+(dec||'')}
          this.value=fmt;
        } else if(raw===''||raw==='.'){this.value=raw}
        updateWiResults(); // ← results only, keyboard stays open
      }})(i);
      var btnM=document.createElement('button');btnM.className='field-next';btnM.tabIndex=-1;btnM.title='Done';
      btnM.innerHTML=WI_CHEVRON_SVG;btnM.onclick=function(){inpM.blur()};
      fldM.appendChild(symM);fldM.appendChild(inpM);fldM.appendChild(btnM);
      subWrap.appendChild(fldM);
      card.appendChild(subWrap);

    } else {
      // disc % input — oninput stores + updateWiResults() only
      var fld=document.createElement('div');fld.className='field';
      var sym=document.createElement('span');sym.className='sym';sym.textContent='Disc %';
      var inp=document.createElement('input');inp.type='number';inp.inputMode='decimal';inp.placeholder='e.g. 20';
      inp.min='0';inp.max='100';inp.step='0.01';inp.value=sc.spDisc;inp.autocomplete='off';
      inp.oninput=(function(idx){return function(){
        WI_SCENES[idx].spDisc=this.value;
        updateWiResults(); // ← results only, keyboard stays open
      }})(i);
      var btnD=document.createElement('button');btnD.className='field-next';btnD.tabIndex=-1;btnD.title='Done';
      btnD.innerHTML=WI_CHEVRON_SVG;btnD.onclick=function(){inp.blur()};
      fld.appendChild(sym);fld.appendChild(inp);fld.appendChild(btnD);card.appendChild(fld);
    }

    // result rows with stable IDs
    var rows=document.createElement('div');rows.className='wi-rows';
    var LBLS=['SP excl GST','SP incl GST','Profit ₹','GP %','Margin %'];
    var KEYS=['spe','spi','pr','gp','mg'];
    var sp=resolveWiSP(sc);
    LBLS.forEach(function(lbl,k){
      var r=document.createElement('div');r.className='wi-row';
      var l=document.createElement('span');l.className='wi-lbl';l.textContent=lbl;
      var v=document.createElement('span');
      v.id='wi-'+i+'-'+KEYS[k];
      v.className='wi-val dim';v.textContent='—';
      r.appendChild(l);r.appendChild(v);rows.appendChild(r);
    });
    card.appendChild(rows);grid.appendChild(card);
  });

  // Populate results after DOM is built
  updateWiResults();
}

/* ── Auto-save ── */
var _autoSaveTimer=null;
var _saveStateTimer=null;
var _saveQTimer=null;
/**
 * Persist Quick mode inputs so returning to it restores the last entry.
 */
function saveQState(){
  try{
    localStorage.setItem('pc-qstate',JSON.stringify({
      t:FC_T,g:Math.round(FC_G*100),
      cm:FC_CM,cpms:FC_CPMS,sm:FC_SM,spms:FC_SPMS,pm:FC_PM,
      mrp:el('fc-mrp')?el('fc-mrp').value:'',
      cpd:el('fc-cpd')?el('fc-cpd').value:'',
      cpv:el('fc-cpv')?el('fc-cpv').value:'',
      spd:el('fc-spd')?el('fc-spd').value:'',
      spv:el('fc-spv')?el('fc-spv').value:'',
      prv:el('fc-pr-val')?el('fc-pr-val').value:''
    }));
  }catch(e){ logError('could not save Quick mode state (pc-qstate)',e); }
}
/**
 * Save Quick mode state 500ms after typing stops.
 */
function debouncedSaveQState(){
  clearTimeout(_saveQTimer);
  _saveQTimer=setTimeout(saveQState,500);
}
/**
 * Save to history 900ms after input settles, when auto-save is on.
 * Skips the write when the result matches the newest entry, so nudging a value
 * back and forth doesn't fill the list with duplicates.
 */
function autoSave(){
  clearTimeout(_autoSaveTimer);
  _autoSaveTimer=setTimeout(function(){
    if(!LAST_CP||!LAST_SP)return;
    var inc=getIncentiveInr(LAST_CP),eff=LAST_CP.e-inc;
    var spInc=getSPIncentiveInr(LAST_SP),effSP=LAST_SP.e-spInc;
    var pr=effSP-eff;
    if(HISTORY.length>0){
      var last=HISTORY[0];
      if(Math.round(last.cpE*100)===Math.round(LAST_CP.e*100)&&
         Math.round(last.spE*100)===Math.round(LAST_SP.e*100)&&
         Math.round(last.effCPE*100)===Math.round(eff*100)&&
         Math.round((last.effSPE||last.spE)*100)===Math.round(effSP*100))return;
    }
    saveToHistory();
  },900);
}

/* ── History ── */
function saveToHistory(){
  if(!LAST_CP||!LAST_SP){
    logWarn('saveToHistory called with an incomplete calculation',{cp:LAST_CP,sp:LAST_SP});
    alert('Enter CP and SP first.');
    return;
  }
  var inc=getIncentiveInr(LAST_CP),eff=LAST_CP.e-inc;
  var spInc=getSPIncentiveInr(LAST_SP),effSP=LAST_SP.e-spInc;
  var pr=effSP-eff;
  var q=getQty();
  HISTORY.unshift({time:now(),ts:Date.now(),mrp:MI,cpE:LAST_CP.e,cpI:LAST_CP.i,spE:LAST_SP.e,spI:LAST_SP.i,effCPE:eff,effSPE:effSP,incInr:inc,spIncInr:spInc,pr:pr,gp:(effSP>0)?(pr/effSP)*100:null,mg:(eff>0)?(pr/eff)*100:null,gst:G*100,qty:q,totalPr:pr*q});
  if(HISTORY.length>MAX_HIST)HISTORY.pop();
  saveHistoryToStorage();
  renderHistory();
  if(el('body-hist').style.display!=='block')togglePanel('hist');
}
/**
 * Remove all history entries, after confirmation. Undoable.
 */
function clearHistory(){
  if(HISTORY.length===0){toast('History is already empty');return}
  askConfirm('Clear history',
    'Delete all '+HISTORY.length+' history entries?',
    'You can undo this straight after.',
    'Clear all',
    function(){
      pushUndo('clear history');
      HISTORY=[];
      try{localStorage.removeItem('pc-history');}
      catch(e){ logError('could not clear history from storage (pc-history)',e); }
      renderHistory();
      toast('History cleared',true);
    });
}
/**
 * Persist the history array.
 */
function saveHistoryToStorage(){
  try{localStorage.setItem('pc-history',JSON.stringify(HISTORY));}
  catch(e){ logError('could not save history (pc-history) — it may exceed the storage quota',e); }
}
/**
 * Restore history, trimming to MAX_HIST.
 */
function loadHistoryFromStorage(){
  try{
    var raw=localStorage.getItem('pc-history');
    if(!raw)return;
    var arr=JSON.parse(raw);
    if(!Array.isArray(arr))return;
    HISTORY=arr.slice(0,MAX_HIST);
    if(HISTORY.length>0)renderHistory();
  }catch(e){ logWarn('could not read saved history (pc-history); starting empty',e); }
}
/**
 * Rebuild the history list under the active search and filter.
 * Each rendered row carries its true HISTORY index, so deleting, comparing or
 * tagging from a filtered view acts on the right entry rather than the nth
 * visible one.
 */
function renderHistory(){
  var c=el('hist-content');
  c.setAttribute('role','list');
  var tools=el('hist-tools');
  if(tools)tools.style.display=HISTORY.length?'flex':'none';
  if(HISTORY.length===0){
    el('hist-tag').textContent='0 entries';
    c.innerHTML='<div class="hist-empty" role="status">No entries yet — save a calculation to start.</div>';
    return;
  }
  var floor=getFloor();
  // Keep the true HISTORY index alongside each row so delete/compare/tag stay correct
  var rows=[];
  HISTORY.forEach(function(h,idx){if(histMatches(h,floor))rows.push({h:h,idx:idx})});
  var filtering=(HIST_QUERY||HIST_FILTER!=='all');
  el('hist-tag').textContent=filtering
    ? rows.length+' of '+HISTORY.length
    : HISTORY.length+' entr'+(HISTORY.length===1?'y':'ies');
  if(rows.length===0){
    c.innerHTML='<div class="hist-none" role="status">No entries match this search or filter.</div>';
    return;
  }
  var html='';
  rows.forEach(function(row){
    var h=row.h,idx=row.idx;
    var tagHtml=h.tag
      ?'<button type="button" class="hist-tag" id="tag-'+idx+'" onclick="startTagEdit('+idx+')" title="Edit tag" aria-label="Edit tag: '+String(h.tag).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;')+'">'+String(h.tag).replace(/&/g,'&amp;').replace(/</g,'&lt;')+'</button>'
      :'<button type="button" class="hist-tag empty" id="tag-'+idx+'" onclick="startTagEdit('+idx+')" title="Add a tag" aria-label="Add a tag to this entry">+ Tag</button>';
    var timeDisp=h.ts?relTime(h.ts):h.time;
    var timeFull=h.ts?fmtTime(h.ts):h.time;
    var gpCls=belowFloor(h.gp,floor.gp)?'warn':(h.gp>=0?'pos':'neg');
    var mgCls=belowFloor(h.mg,floor.mg)?'warn':(h.mg>=0?'pos':'neg');
    var prCls=h.pr>=0?'pos':'neg';
    html+='<div class="hist-entry" data-idx="'+idx+'" role="listitem">'
      +'<div class="hist-inner">'
        +'<div class="hist-meta">'
          +'<span class="hist-time" title="'+timeFull+'">'+timeDisp+'</span>'
          +tagHtml
          +(h.qty>1?'<span class="hist-gst">×'+h.qty+'</span>':'')
          +'<span class="hist-gst">GST '+h.gst+'%</span>'
          +'<button class="cmp-hist-btn" onclick="openCompare('+idx+')" aria-label="Compare entry from '+timeDisp+'">Compare</button>'
          +'<button class="hist-del-btn" onclick="deleteHistEntry('+idx+')" aria-label="Delete entry from '+timeDisp+'" title="Delete">'
            +'<svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true"><path d="M2 2l6 6M8 2l-6 6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>'
          +'</button>'
        +'</div>'
        +'<div class="hist-vals">'
          +'<span class="hist-kv"><span class="hist-k">MRP</span><span class="hist-v">'+INR(h.mrp)+'</span></span>'
          +'<span class="hist-kv"><span class="hist-k">CP excl</span><span class="hist-v">'+INR(h.cpE)+'</span></span>'
          +'<span class="hist-kv"><span class="hist-k">SP excl</span><span class="hist-v">'+INR(h.spE)+'</span></span>'
          +'<span class="hist-kv"><span class="hist-k">Profit</span><span class="hist-v '+prCls+'">'+INR(h.pr)+'</span></span>'
          +'<span class="hist-kv"><span class="hist-k">GP %</span><span class="hist-v '+gpCls+'">'+PCT(h.gp)+'</span></span>'
          +'<span class="hist-kv"><span class="hist-k">Margin %</span><span class="hist-v '+mgCls+'">'+PCT(h.mg)+'</span></span>'
        +'</div>'
        +(h.incInr>0?'<div class="hist-inc"><span class="hist-inc-k">Inc ₹</span><span>'+INR(h.incInr)+'</span></div>':'')
      +'</div>'
    +'</div>';
  });
  c.innerHTML=html;
}

/* ── History export ── */
function exportHistoryCSV(){
  if(HISTORY.length===0){
    logWarn('exportHistoryCSV called with an empty history');
    alert('No history entries to export.');
    return;
  }
  var headers=['Time','Tag','MRP (incl GST)','CP excl GST','CP incl GST','SP excl GST','SP incl GST','Eff CP excl GST','CP Incentives INR','Eff SP excl GST','SP Incentives INR','Profit INR','GP %','Margin %','GST Rate %','Qty','Total Profit INR'];
  var rows=[headers.join(',')];
  HISTORY.forEach(function(h){
    rows.push([
      '"'+h.time+'"',
      '"'+String(h.tag||'').replace(/"/g,'""')+'"',
      h.mrp.toFixed(2),
      h.cpE.toFixed(2),
      h.cpI.toFixed(2),
      h.spE.toFixed(2),
      h.spI.toFixed(2),
      h.effCPE.toFixed(2),
      h.incInr>0?h.incInr.toFixed(2):'',
      (h.effSPE||h.spE).toFixed(2),
      (h.spIncInr||0)>0?(h.spIncInr||0).toFixed(2):'',
      h.pr.toFixed(2),
      h.gp!==null?h.gp.toFixed(2):'',
      h.mg!==null?h.mg.toFixed(2):'',
      h.gst,
      h.qty||1,
      (h.totalPr!=null?h.totalPr:h.pr*(h.qty||1)).toFixed(2)
    ].join(','));
  });
  var csv=rows.join('\r\n');
  var blob=new Blob([csv],{type:'text/csv;charset=utf-8;'});
  var url=URL.createObjectURL(blob);
  var a=document.createElement('a');
  a.href=url;
  a.download='pricing-history-'+new Date().toISOString().slice(0,10)+'.csv';
  document.body.appendChild(a);a.click();
  setTimeout(function(){document.body.removeChild(a);URL.revokeObjectURL(url)},200);
}

/* ── Comparison modal ── */
var COMPARE_IDX=null;

/**
 * Open the comparison modal for one history entry.
 * @param {number} idx index into HISTORY
 */
function openCompare(idx){
  COMPARE_IDX=idx;
  renderCompare();
  openModal('compare');
}

/**
 * Draw the current-vs-saved comparison table with per-row deltas.
 */
function renderCompare(){
  var floor=getFloor();
  var hist=HISTORY[COMPARE_IDX];
  if(!hist){el('cmp-grid').innerHTML='<div style="padding:20px;color:var(--text3)">No entry selected.</div>';return}

  // Build current snapshot
  var cur=null;
  if(LAST_CP&&LAST_SP){
    var inc=getIncentiveInr(LAST_CP),eff=LAST_CP.e-inc;
    var spInc=getSPIncentiveInr(LAST_SP),effSP=LAST_SP.e-spInc;
    var pr=effSP-eff;
    cur={
      mrp:MI,cpE:LAST_CP.e,cpI:LAST_CP.i,spE:LAST_SP.e,spI:LAST_SP.i,
      effCPE:eff,effSPE:effSP,incInr:inc,spIncInr:spInc,pr:pr,
      gp:(effSP>0)?(pr/effSP)*100:null,
      mg:(eff>0)?(pr/eff)*100:null,
      gst:G*100
    };
  }

  // meta
  var meta=el('cmp-meta');
  var histTimeDisp=hist.ts?relTime(hist.ts):hist.time;
  var histTimeFull=hist.ts?fmtTime(hist.ts):hist.time;
  meta.innerHTML='<span>Comparing <strong>current calculation</strong> vs history entry from <strong><span title="'+histTimeFull+'" style="cursor:help;border-bottom:1px dashed var(--text3)">'+histTimeDisp+'</span></strong></span>';
  if(!cur) meta.innerHTML+='<span style="color:var(--red);font-size:11px"> — Enter CP &amp; SP on main screen to populate Current column</span>';

  // delta helper
  function delta(curV,histV,isPercent,higherIsBetter){
    if(curV===null||histV===null||curV===undefined||histV===undefined)return'';
    var d=curV-histV;
    if(Math.abs(d)<0.005)return '<span class="dv nt">—</span>';
    var sign=d>0?'+':'';
    var cls=(higherIsBetter?(d>0):(d<0))?'up':'dn';
    var txt=isPercent?(sign+d.toFixed(2)+'pp'):(sign+d.toFixed(2));
    return '<span class="dv '+cls+'">'+txt+'</span>';
  }
  function deltaINR(curV,histV,higher){
    if(curV===null||histV===null)return'';
    var d=curV-histV;if(Math.abs(d)<0.005)return'<span class="dv nt">—</span>';
    var sign=d>0?'+':'';
    var cls=(higher?(d>0):(d<0))?'up':'dn';
    return '<span class="dv '+cls+'">'+sign+'₹'+Math.abs(d).toFixed(2)+'</span>';
  }

  // cell builders
  function hd(txt,cls){return '<div class="cmp-hd'+(cls?' '+cls:'')+'">'+(txt||'')+'</div>'}
  function lbl(txt){return '<div class="cmp-cell lbl">'+txt+'</div>'}

  function valCell(v,fmt,cls){
    var disp=v===null||v===undefined?'—':(fmt==='inr'?INR(v):PCT(v));
    return '<div class="cmp-cell'+(cls?' '+cls:'')+'">'+(disp||'—')+'</div>';
  }
  function inrCell(v,posNeg){
    if(v===null||v===undefined)return'<div class="cmp-cell dim">—</div>';
    var cls=posNeg?(v>=0?'cmp-pos':'cmp-neg'):'';
    return'<div class="cmp-cell '+(cls||'')+'">'+INR(v)+'</div>';
  }
  function pctCell(v,floor,isGP){
    if(v===null||v===undefined)return'<div class="cmp-cell dim">—</div>';
    var f=isGP?floor.gp:floor.mg;
    var cls=belowFloor(v,f)?'cmp-warn':(v>=0?'cmp-pos':'cmp-neg');
    return'<div class="cmp-cell '+cls+'">'+PCT(v)+'</div>';
  }
  function deltaCell(html){return'<div class="cmp-cell cmp-delta">'+(html||'<span class="dv nt">—</span>')+'</div>'}

  var rows=[
    {label:'MRP (incl GST)',   cur:cur?cur.mrp:null,   hist:hist.mrp,   fmt:'inr', higher:null},
    {label:'CP excl GST',      cur:cur?cur.cpE:null,   hist:hist.cpE,   fmt:'inr', higher:false},
    {label:'CP incl GST',      cur:cur?cur.cpI:null,   hist:hist.cpI,   fmt:'inr', higher:false},
    {label:'SP excl GST',      cur:cur?cur.spE:null,    hist:hist.spE,   fmt:'inr', higher:true},
    {label:'SP incl GST',      cur:cur?cur.spI:null,    hist:hist.spI,   fmt:'inr', higher:true},
    {label:'Eff. SP excl GST', cur:cur?cur.effSPE:null, hist:hist.effSPE||hist.spE, fmt:'inr', higher:true},
    {label:'SP Incentives ₹',  cur:cur?cur.spIncInr:null,hist:hist.spIncInr||0,fmt:'inr', higher:true},
    {label:'Eff. CP excl GST', cur:cur?cur.effCPE:null,hist:hist.effCPE,fmt:'inr', higher:false},
    {label:'Incentives ₹',     cur:cur?cur.incInr:null,hist:hist.incInr,fmt:'inr', higher:true},
    {label:'Profit ₹',         cur:cur?cur.pr:null,    hist:hist.pr,    fmt:'inr', higher:true, posNeg:true},
    {label:'GP %',             cur:cur?cur.gp:null,    hist:hist.gp,    fmt:'pct', higher:true, isGP:true},
    {label:'Margin %',         cur:cur?cur.mg:null,    hist:hist.mg,    fmt:'pct', higher:true, isMG:true},
    {label:'GST Rate',         cur:cur?cur.gst:null,   hist:hist.gst,   fmt:'gst', higher:null}
  ];

  var html=hd('')+hd('Current','cur')+hd('Selected','sel')+hd('Change');

  rows.forEach(function(r){
    html+=lbl(r.label);
    if(r.fmt==='pct'){
      html+=pctCell(r.cur,floor,r.isGP);
      html+=pctCell(r.hist,floor,r.isGP);
      html+=deltaCell(delta(r.cur,r.hist,true,r.higher));
    } else if(r.fmt==='gst'){
      html+='<div class="cmp-cell">'+(r.cur!==null?r.cur+'%':'—')+'</div>';
      html+='<div class="cmp-cell">'+r.hist+'%</div>';
      html+=deltaCell(delta(r.cur,r.hist,false,null));
    } else {
      var c=r.posNeg?inrCell(r.cur,true):(r.cur===null?'<div class="cmp-cell dim">—</div>':inrCell(r.cur,false));
      var s=r.posNeg?inrCell(r.hist,true):inrCell(r.hist,false);
      html+=c+s;
      html+=deltaCell(deltaINR(r.cur,r.hist,r.higher));
    }
  });

  el('cmp-grid').innerHTML=html;
}
/**
 * Build the plain-text summary used by copy, WhatsApp and email.
 * @returns {string|null} null when CP or SP is missing
 */
function getSummaryText(){
  if(!LAST_CP||!LAST_SP)return null;
  var inc=getIncentiveInr(LAST_CP),eff=LAST_CP.e-inc;
  var spInc=getSPIncentiveInr(LAST_SP),effSP=LAST_SP.e-spInc;
  var pr=effSP-eff;
  var gp=(effSP>0)?(pr/effSP)*100:null,mg=(eff>0)?(pr/eff)*100:null;
  var lines=['PRICING SUMMARY — '+now(),'─────────────────────────','MRP (incl GST):   '+INR(MI),'GST Rate:         '+(G*100)+'%','','CP excl GST:      '+INR(LAST_CP.e),'CP incl GST:      '+INR(LAST_CP.i)];
  if(inc>0){lines.push('CP Incentives ₹:  '+INR(inc));lines.push('Eff. CP excl GST: '+INR(eff))}
  lines.push('','SP excl GST:      '+INR(LAST_SP.e),'SP incl GST:      '+INR(LAST_SP.i));
  if(spInc>0){lines.push('SP Incentives ₹:  '+INR(spInc));lines.push('Eff. SP excl GST: '+INR(effSP))}
  lines.push('','Profit ₹:         '+INR(pr),'GP %:             '+PCT(gp),'Margin %:         '+PCT(mg),'─────────────────────────');
  return lines.join('\n');
}
/**
 * Copy the summary, falling back to a dialog when the clipboard is unavailable.
 */
function copyToClipboard(){
  var text=getSummaryText();
  if(!text){alert('Enter CP and SP first.');return}
  navigator.clipboard.writeText(text).then(function(){
    var btn=el('copy-btn');if(!btn)return;
    var orig=btn.innerHTML;btn.textContent='✓ Copied!';
    setTimeout(function(){btn.innerHTML=orig},1800);
  }).catch(function(e){
    logWarn('clipboard unavailable, falling back to a dialog',e);
    alert(text);
  });
}
/**
 * Open WhatsApp with the summary pre-filled.
 */
function sendWhatsApp(){
  var text=getSummaryText();
  if(!text){alert('Enter CP and SP first.');return}
  window.open('https://wa.me/?text='+encodeURIComponent(text),'_blank');
}
/**
 * Open the mail client with the summary pre-filled.
 */
function sendEmail(){
  var text=getSummaryText();
  if(!text){alert('Enter CP and SP first.');return}
  window.location.href='mailto:?subject='+encodeURIComponent('Pricing Summary — Sterling Spares')+'&body='+encodeURIComponent(text);
}
/**
 * Print the page using the print stylesheet.
 */
function exportPDF(){
  if(!LAST_CP||!LAST_SP){alert('Enter CP and SP first.');return}
  window.print();
}

/* ── Main calc ── */
function calc(){
  var mrpV=parseMRP();
  if(!mrpV||mrpV<=0){
    R('mx','—');R('mg','—');
    fillCP(null);fillSP(null);fillProfit(null,null);fillIncPanel(null);fillSpIncPanel(null);fillSummary(null,null);
    LAST_CP=null;LAST_SP=null;return;
  }
  MI=mrpV;ME=MI/(1+G);R('mx',INR(ME));R('mg',INR(MI-ME));
  var cp,sp,spe,prV,spD;

  if(T==='profit'){
    cp=resolveCP();sp=resolveSP();
    fillCP(cp);fillSP(sp);
    var inc=getIncentiveInr(cp);
    var spInc=getSPIncentiveInr(sp);
    var effCPE=cp?cp.e-inc:null;
    var effSPE=sp?sp.e-spInc:null;
    fillProfit(effCPE,effSPE);fillIncPanel(cp);fillSpIncPanel(sp);fillSummary(cp,sp);
  }else if(T==='sp'){
    cp=resolveCP();prV=parseAmt('pri');fillCP(cp);fillIncPanel(cp);
    if(cp&&!isNaN(prV)){
      var inc2=getIncentiveInr(cp);
      // SP incentives unknown yet (no SP) — solve ignoring SP inc, then apply
      var spe2=spFromProfit(cp.e-inc2,PM,prV);
      if(spe2&&spe2>0){
        sp={e:spe2,i:spe2*(1+G)};
        var spInc2=getSPIncentiveInr(sp);
        var effSPE2=spe2-spInc2;
        fillSP(sp);fillProfit(cp.e-inc2,effSPE2);fillSpIncPanel(sp);fillSummary(cp,sp);
      }else{fillSP(null);fillProfit(null,null);fillSpIncPanel(null);fillSummary(cp,null)}
    }else{fillSP(null);fillProfit(null,null);fillSpIncPanel(null);fillSummary(cp,null)}
  }else if(T==='cp'){
    spD=parseFloat(el('spd').value);prV=parseAmt('pri');sp=resolveSP();fillSP(sp);
    if(sp&&!isNaN(prV)){
      var spInc3=getSPIncentiveInr(sp);
      var effSPE3=sp.e-spInc3;
      cp=cpFromProfit(effSPE3,PM,prV);
      if(cp&&cp.e>0){var inc3=getIncentiveInr(cp);fillCP(cp);fillProfit(cp.e-inc3,effSPE3);fillIncPanel(cp);fillSpIncPanel(sp);fillSummary(cp,sp)}
      else{fillCP(null);fillProfit(null,null);fillIncPanel(null);fillSpIncPanel(sp);fillSummary(null,sp)}
    }else{fillCP(null);fillProfit(null,null);fillIncPanel(null);fillSpIncPanel(sp);fillSummary(null,sp)}
  }

  LAST_CP=cp||null;LAST_SP=sp||null;
  if(LAST_CP&&LAST_SP&&AUTOSAVE)autoSave();
  debouncedSaveCalcState();
  // refresh what-if if modal is open
  if(el('overlay-whatif').classList.contains('open'))updateWiResults();
  if(el('overlay-compare').classList.contains('open'))renderCompare();
}

/* ── Reset ── */
function resetAll(){
  pushUndo('reset');
  clearTimeout(_autoSaveTimer);
  // Numeric inputs
  el('mrp').value='100';
  el('cpd').value=''; el('cpv').value='';
  el('spd').value=''; el('spv').value=''; el('pri').value='';
  // Floor limits
  el('floor-gp').value='5'; el('floor-mg').value='';
  // Quantity
  if(el('qty'))el('qty').value='1';
  // GST back to 18%
  setGST(18);
  // CP mode
  setCM('excl'); setCPManual('incl');
  // SP mode
  setSM('excl'); setSPManual('incl');
  T='profit';
  el('tprofit').className='pill on';
  el('tsp').className='pill';
  el('tcp').className='pill';
  // Profit input mode back to ₹ Value
  PM='val';
  el('pmv').className='mtab on'; el('pmg').className='mtab'; el('pmm').className='mtab';
  el('pru').textContent='₹';
  // Incentives
  var def={cd:2,eb:1,qt:2,an:1,sc:''};
  INC_KEYS.forEach(function(k){
    var cb=el('it-'+k),iv=el('iv-'+k),row=el('ir-'+k);
    if(cb)cb.checked=false;
    if(iv)iv.value=(def[k]!==undefined)?def[k]:'1';
    if(row)row.className='inc-row';
  });
  if(INC_KEYS.indexOf('cd')!==-1)setCDMode('before');
  if(INC_KEYS.indexOf('sc')!==-1)setSchemeMode('pct');
  // Reset SP incentives
  var spDef={cd:2,eb:1,qt:2,an:1,sc:''};
  SP_INC_KEYS.forEach(function(k){
    var cb=el('sit-'+k),iv=el('siv-'+k),row=el('sir-'+k);
    if(cb)cb.checked=false;
    if(iv)iv.value=(spDef[k]!==undefined)?spDef[k]:'1';
    if(row)row.className='inc-row';
  });
  if(SP_INC_KEYS.indexOf('cd')!==-1)setSCDMode('before');
  if(SP_INC_KEYS.indexOf('sc')!==-1)setSpSchemeMode('pct');
  // What-if
  WI_SCENES=[
    {spDisc:'',spMode:'excl',spVal:'',spManualSub:'incl'},
    {spDisc:'',spMode:'excl',spVal:'',spManualSub:'incl'},
    {spDisc:'',spMode:'excl',spVal:'',spManualSub:'incl'}
  ];
  try{localStorage.removeItem('pc-state');}
  catch(e){ logError('could not clear saved state on reset (pc-state)',e); }
  updateLayout();
  calc();
}

/* ── Hamburger menu ── */
function toggleHMenu(){
  var d=el('hmenu-dropdown');
  if(d)d.classList.toggle('open');
}
/**
 * Close the mobile hamburger menu.
 */
function closeHMenu(){
  var d=el('hmenu-dropdown');
  if(d)d.classList.remove('open');
}
document.addEventListener('click',function(e){
  var btn=el('hmenu-btn'),drop=el('hmenu-dropdown');
  if(!btn||!drop)return;
  if(!btn.contains(e.target)&&!drop.contains(e.target))drop.classList.remove('open');
});

/* ── Accordion (mobile card details) ── */
function toggleAcc(id){
  var body=el('acc-body-'+id);
  var chev=el('acc-chev-'+id);
  var btn=el('acc-btn-'+id);
  if(!body)return;
  var open=body.classList.contains('open');
  body.classList.toggle('open',!open);
  if(chev)chev.classList.toggle('open',!open);
  if(btn)btn.setAttribute('aria-expanded',String(!open));
  var lbl=btn?btn.querySelector('.acc-lbl'):null;
  if(lbl)lbl.textContent=open?'Show details':'Hide details';
}

/* ── Next-section button logic ── */
function nextFrom(fromId){
  // Dismiss keyboard first
  var cur=el(fromId);if(cur)cur.blur();

  var map={
    'mrp': function(){
      // MRP → focus CP input
      var cpInput=(CM==='manual')?el('cpv'):el('cpd');
      if(cpInput){
        var offset=el('cpc').getBoundingClientRect().top+window.scrollY-80;
        window.scrollTo({top:offset,behavior:'smooth'});
        setTimeout(function(){cpInput.focus()},350);
      }
    },
    'cpd': function(){nextToSP()},
    'cpv': function(){nextToSP()},
    'spd': function(){nextToResult()},
    'spv': function(){nextToResult()}
  };
  if(map[fromId])map[fromId]();
}

/**
 * Move focus from the CP card to the SP card.
 */
function nextToSP(){
  // CP → SP
  var spInput=(SM==='manual')?el('spv'):el('spd');
  if(!spInput)return;
  if(T==='sp'){
    // SP is calculated; go to profit input instead
    nextToResult();return;
  }
  var offset=el('spc').getBoundingClientRect().top+window.scrollY-80;
  window.scrollTo({top:offset,behavior:'smooth'});
  setTimeout(function(){spInput.focus()},350);
}

/**
 * Move focus from the SP card to the result area.
 */
function nextToResult(){
  // SP → profit card or summary
  if(T==='profit'){
    // both CP and SP are inputs; scroll to summary
    bnavGo('summary');
  } else {
    // profit is an input
    var prInput=el('pri');
    if(prInput){
      var offset=el('prc').getBoundingClientRect().top+window.scrollY-80;
      window.scrollTo({top:offset,behavior:'smooth'});
      setTimeout(function(){prInput.focus()},350);
    }
  }
}

/* ── Haptic feedback ── */
function haptic(type){
  if(!navigator.vibrate)return;
  if(type==='light')navigator.vibrate(8);
  else if(type==='medium')navigator.vibrate(20);
  else if(type==='success')navigator.vibrate([12,30,12]);
  else if(type==='error')navigator.vibrate([20,40,20,40,20]);
  else if(type==='select')navigator.vibrate(6);
}

/* ── Ripple on fc-btn-next ── */
function addRipple(e){
  var btn=e.currentTarget;
  var r=document.createElement('span');r.className='fc-ripple';
  var rect=btn.getBoundingClientRect();
  r.style.left=(e.clientX-rect.left)+'px';
  r.style.top=(e.clientY-rect.top)+'px';
  btn.appendChild(r);
  r.addEventListener('animationend',function(){r.remove()});
}
document.addEventListener('click',function(e){
  var btn=e.target.closest('.fc-btn-next');
  if(btn)addRipple({currentTarget:btn,clientX:e.clientX,clientY:e.clientY});
});

/* ── Card bounce on landing ── */
function cardBounce(id){
  var c=el(id);if(!c)return;
  c.style.animation='none';
  requestAnimationFrame(function(){
    c.style.animation='cardBounce .45s ease';
    c.addEventListener('animationend',function h(){c.style.animation='';c.removeEventListener('animationend',h)});
  });
}

/* ── Animate summary values when they change ── */
function flashSumVal(id){
  var e=el(id);if(!e||e.textContent==='—')return;
  e.classList.remove('updated');
  requestAnimationFrame(function(){e.classList.add('updated')});
  e.addEventListener('animationend',function h(){e.classList.remove('updated');e.removeEventListener('animationend',h)},{once:true});
}

/* ── Keyboard nav for Quick mode (desktop) ── */
document.addEventListener('keydown',function(e){
  if(APP_MODE!=='quick')return;
  // Don't intercept if a modal is open
  if(document.querySelector('.modal-overlay.open'))return;
  if(e.key==='Enter'){
    e.preventDefault();
    fcNext();
  } else if(e.key==='ArrowRight'){
    e.preventDefault();
    fcNext();
  } else if(e.key==='ArrowLeft'){
    e.preventDefault();
    fcBack();
  }
});

/* ── Bottom nav ── */
var BNAV_ACTIVE='calc';
/**
 * Scroll to a section from the bottom navigation bar.
 * @param {string} id section suffix
 */
function bnavGo(id){
  // Close any open modal first
  ['settings','whatif','compare'].forEach(function(m){closeModal(m)});

  // If switching to wizard, show that mode; if switching away, stay in current default/quick
  if(id==='wizard'){
    // Show wizard mode, hide page + quick mode
    document.querySelector('.page').style.display='none';
    el('quick-mode').style.display='none';
    el('wizard-mode').style.display='block';
    document.querySelector('.footer').style.display='none';
    updateFabVisibility();
  } else {
    // Hide wizard
    el('wizard-mode').style.display='none';
    document.querySelector('.footer').style.display='';
    // Show correct mode
    if(APP_MODE==='quick'){
      el('quick-mode').style.display='block';
      document.querySelector('.page').style.display='none';
    } else {
      document.querySelector('.page').style.display='';
      el('quick-mode').style.display='none';
    }
  }

  BNAV_ACTIVE=id;
  ['calc','wizard','inc','summary','hist','settings'].forEach(function(n){
    var b=el('bnav-'+n);
    if(b)b.className='bnav-item'+(n===id?' active':'');
  });
  var target=el('sec-'+id);
  if(target){
    var offset=target.getBoundingClientRect().top+window.scrollY-70;
    window.scrollTo({top:offset,behavior:'smooth'});
    if(id==='inc'){setTimeout(function(){if(el('body-inc').style.display!=='block')togglePanel('inc')},350)}
    if(id==='hist'){setTimeout(function(){if(el('body-hist').style.display!=='block')togglePanel('hist')},350)}
  } else if(id!=='wizard'){
    window.scrollTo({top:0,behavior:'smooth'});
  }
}
// Update active nav item on scroll (rAF-throttled)
var _scrollTick=false;
window.addEventListener('scroll',function(){
  if(_scrollTick)return;
  _scrollTick=true;
  requestAnimationFrame(function(){
    _scrollTick=false;
    if(window.innerWidth>800)return;
    var ids=['calc','inc','summary','hist'];
    var best='calc',bestDist=Infinity;
    ids.forEach(function(id){
      var s=el('sec-'+id);
      if(!s)return;
      var dist=Math.abs(s.getBoundingClientRect().top-80);
      if(dist<bestDist){bestDist=dist;best=id}
    });
    if(best!==BNAV_ACTIVE){
      BNAV_ACTIVE=best;
      ids.forEach(function(n){
        var b=el('bnav-'+n);if(b)b.className='bnav-item'+(n===best?' active':'');
      });
    }
  });
},{passive:true});

/* ════════════════════════════════════════════
   QUICK / FLASHCARD MODE
════════════════════════════════════════════ */
var APP_MODE = 'default'; // 'default' | 'quick'
var FC_STEP  = 0;         // 0=MRP, 1=CP or SP, 2=SP or Profit, 3=Result
var FC_G     = 0.18;
var FC_T     = 'profit';  // 'profit' | 'sp' | 'cp'
var FC_PM    = 'val';     // profit input mode: 'val' | 'gp' | 'margin'
var FC_CM    = 'excl';    // CP mode
var FC_SM    = 'excl';    // SP mode
var FC_CPMS  = 'incl';
var FC_SPMS  = 'incl';

/**
 * Switch between Default and Quick layouts, restoring Quick's saved inputs.
 * @param {'default'|'quick'} m
 */
function setMode(m){
  haptic('select');
  APP_MODE = m;
  el('mode-default').className = 'mode-pill' + (m==='default' ? ' mode-pill-on' : '');
  el('mode-quick').className   = 'mode-pill' + (m==='quick'   ? ' mode-pill-on' : '');
  el('quick-mode').style.display = (m==='quick') ? 'block' : 'none';
  document.querySelector('.page').style.display = (m==='default') ? '' : 'none';
  document.querySelector('.footer').style.display = (m==='default') ? '' : 'none';
  if(el('wizard-mode'))el('wizard-mode').style.display='none';
  // The sticky result bar and FAB belong to Default mode only
  if(m!=='default'){var mb=el('mini-result');if(mb)mb.className='mini-result'}
  updateFabVisibility();
  if(m==='quick'){
    FC_STEP=0;
    // Phase 1: restore FC_* vars before building cards (FC_T drives card layout)
    var _qs=null;
    try{_qs=JSON.parse(localStorage.getItem('pc-qstate'));}
    catch(e){ logWarn('could not read Quick mode state (pc-qstate); using defaults',e); }
    if(_qs){
      if(_qs.t)  FC_T=_qs.t;
      if(_qs.g)  FC_G=_qs.g/100;
      if(_qs.cm) FC_CM=_qs.cm;
      if(_qs.cpms) FC_CPMS=_qs.cpms;
      if(_qs.sm) FC_SM=_qs.sm;
      if(_qs.spms) FC_SPMS=_qs.spms;
      if(_qs.pm) FC_PM=_qs.pm;
    }
    fcBuildCards();
    // Phase 2: restore input values + sync tab UI after cards are built
    if(_qs){
      ['profit','sp','cp'].forEach(function(k){var b=el('fc-t-'+k);if(b)b.className='fc-tab'+(k===FC_T?' on':'');});
      var gst=Math.round(FC_G*100);
      var g18=el('fcg18'),g5=el('fcg5');
      if(g18)g18.className='fc-tab'+(gst===18?' on':'');
      if(g5) g5.className='fc-tab'+(gst===5?' on':'');
      if(el('fc-mrp')   &&_qs.mrp)el('fc-mrp').value   =_qs.mrp;
      if(el('fc-cpd')   &&_qs.cpd)el('fc-cpd').value   =_qs.cpd;
      if(el('fc-cpv')   &&_qs.cpv)el('fc-cpv').value   =_qs.cpv;
      if(el('fc-spd')   &&_qs.spd)el('fc-spd').value   =_qs.spd;
      if(el('fc-spv')   &&_qs.spv)el('fc-spv').value   =_qs.spv;
      if(el('fc-pr-val')&&_qs.prv)el('fc-pr-val').value=_qs.prv;
      fcCalc();
    }
    fcGoto(0,false);
  }
}

/* ── Quick calc helpers (independent state from main) ── */
function fcINR(n){
  if(n===null||n===undefined||isNaN(n))return'—';
  return'₹'+fmtINDIAN(n);
}
/**
 * Percentage formatter for Quick mode cards.
 * @param {number|null} n
 * @returns {string}
 */
function fcPCT(n){
  if(n===null||isNaN(n))return'—';
  return parseFloat(n.toFixed(4)).toFixed(2)+'%';
}
/**
 * Set the GST rate in Quick mode (independent of the main calculator).
 * @param {number} p
 */
function fcSetGST(p){
  haptic('select');
  FC_G=p/100;
  el('fcg18').className='fc-tab'+(p===18?' on':'');
  el('fcg5').className='fc-tab'+(p===5?' on':'');
  updateGSTLabels();
  fcCalc();
  saveQState();
}
/**
 * Choose what Quick mode solves for.
 * @param {'profit'|'sp'|'cp'} t
 */
function fcSetT(t){
  FC_T=t;
  ['profit','sp','cp'].forEach(function(k){
    var b=el('fc-t-'+k);if(b)b.className='fc-tab'+(t===k?' on':'');
  });
  // Rebuild cards 1 & 2 for new mode, labels update
  fcBuildCards();
  // If already past step 0, reset to step 1
  if(FC_STEP>0)fcGoto(1,false);
  saveQState();
}
/**
 * Set how target profit is expressed in Quick mode.
 * @param {'val'|'gp'|'margin'} m
 */
function fcSetPM(m){
  FC_PM=m;
  ['val','gp','margin'].forEach(function(k){
    var b=el('fc-pm-'+k);if(b)b.className='fc-tab'+(m===k?' on':'');
  });
  var s=el('fc-pr-sym');if(s)s.textContent=m==='val'?'₹':'%';
  var i2=el('fc-pr-val');
  if(i2){
    i2.value='';
    i2.placeholder=m==='val'?'e.g. 10':'e.g. 15';
    if(m==='val'){
      i2.type='text';
      i2.oninput=function(){fcFmtInput(this);if(FC_STEP===3)fcRenderResult()};
    } else {
      i2.type='number';i2.min='0';i2.step='0.01';
      i2.oninput=function(){if(FC_STEP===3)fcRenderResult()};
    }
  }
  fcCalc();
}
/**
 * Set the Quick mode CP input mode.
 * @param {'excl'|'incl'|'manual'} m
 */
function fcSetCM(m){
  haptic('select');
  FC_CM=m;
  ['excl','incl','manual'].forEach(function(k){
    var b=el('fc-cm-'+k);if(b)b.className='fc-tab'+(m===k?' on':'');
  });
  el('fc-cp-disc-wrap') && (el('fc-cp-disc-wrap').style.display = m==='manual'?'none':'');
  el('fc-cp-manual-wrap') && (el('fc-cp-manual-wrap').style.display = m==='manual'?'':'none');
  updateGSTLabels();
  fcCalc();
}
/**
 * Choose incl/excl GST for a manually entered Quick mode CP.
 * @param {'incl'|'excl'} s
 */
function fcSetCPMS(s){
  haptic('select');
  FC_CPMS=s;
  ['incl','excl'].forEach(function(k){var b=el('fc-cpms-'+k);if(b)b.className='fc-tab'+(s===k?' on':'')});
  var inp=el('fc-cpv');if(inp)inp.placeholder=s==='incl'?'CP incl GST':'CP excl GST';
  fcCalc();
}
/**
 * Set the Quick mode SP input mode.
 * @param {'excl'|'incl'|'manual'} m
 */
function fcSetSM(m){
  haptic('select');
  FC_SM=m;
  ['excl','incl','manual'].forEach(function(k){
    var b=el('fc-sm-'+k);if(b)b.className='fc-tab'+(m===k?' on':'');
  });
  el('fc-sp-disc-wrap') && (el('fc-sp-disc-wrap').style.display = m==='manual'?'none':'');
  el('fc-sp-manual-wrap') && (el('fc-sp-manual-wrap').style.display = m==='manual'?'':'none');
  updateGSTLabels();
  fcCalc();
}
/**
 * Choose incl/excl GST for a manually entered Quick mode SP.
 * @param {'incl'|'excl'} s
 */
function fcSetSPMS(s){
  haptic('select');
  FC_SPMS=s;
  ['incl','excl'].forEach(function(k){var b=el('fc-spms-'+k);if(b)b.className='fc-tab'+(s===k?' on':'')});
  var inp=el('fc-spv');if(inp)inp.placeholder=s==='incl'?'SP incl GST':'SP excl GST';
  fcCalc();
}

/**
 * Read the Quick mode MRP field.
 * @returns {number} 0 when blank
 */
function fcResolveMRP(){
  var raw=el('fc-mrp')&&el('fc-mrp').value||'';
  return parseFloat(raw.replace(/,/g,''))||0;
}
/**
 * Quick mode cost price from its active input mode.
 * @param {number} mrpV
 * @returns {{e:number,i:number}|null}
 */
function fcResolveCP(fcMI){
  if(!el('fc-cpd'))return null;
  if(FC_CM==='manual'){
    var v=parseFloat((el('fc-cpv')&&el('fc-cpv').value||'').replace(/,/g,''));
    if(isNaN(v)||v<=0)return null;
    return FC_CPMS==='incl'?{e:v/(1+FC_G),i:v}:{e:v,i:v*(1+FC_G)};
  }
  var d=parseFloat(el('fc-cpd').value);if(isNaN(d))return null;
  if(FC_CM==='excl'){var e=fcMI*(1-d/100);return{e:e,i:e*(1+FC_G)}}
  var i=fcMI*(1-d/100);return{e:i/(1+FC_G),i:i};
}
/**
 * Quick mode selling price from its active input mode.
 * @param {number} mrpV
 * @returns {{e:number,i:number}|null}
 */
function fcResolveSP(fcMI){
  if(!el('fc-spd'))return null;
  if(FC_SM==='manual'){
    var v=parseFloat((el('fc-spv')&&el('fc-spv').value||'').replace(/,/g,''));
    if(isNaN(v)||v<=0)return null;
    return FC_SPMS==='incl'?{e:v/(1+FC_G),i:v}:{e:v,i:v*(1+FC_G)};
  }
  var d=parseFloat(el('fc-spd').value);if(isNaN(d))return null;
  if(FC_SM==='excl'){var e2=fcMI*(1-d/100);return{e:e2,i:e2*(1+FC_G)}}
  var i2=fcMI*(1-d/100);return{e:i2/(1+FC_G),i:i2};
}

/**
 * Quick mode target profit as entered.
 * @returns {number} NaN when blank
 */
function fcResolveProfit(cp, sp){
  // Returns {cp, sp} after solving the missing one
  var mrpV=fcResolveMRP();
  if(!mrpV||mrpV<=0)return{cp:cp,sp:sp};
  var prInput=el('fc-pr-val');
  var prV=prInput?parseFloat((prInput.value||'').replace(/,/g,'')):NaN;
  if(isNaN(prV))return{cp:cp,sp:sp};

  if(FC_T==='sp'&&cp){
    // Solve for SP
    var spe;
    if(FC_PM==='val')spe=cp.e+prV;
    else if(FC_PM==='gp')spe=prV>=100?null:cp.e/(1-prV/100);
    else spe=cp.e*(1+prV/100);
    if(spe&&spe>0){sp={e:spe,i:spe*(1+FC_G)}}
  } else if(FC_T==='cp'&&sp){
    // Solve for CP
    var cpe;
    if(FC_PM==='val')cpe=sp.e-prV;
    else if(FC_PM==='gp')cpe=sp.e*(1-prV/100);
    else cpe=sp.e/(1+prV/100);
    if(cpe&&cpe>0){cp={e:cpe,i:cpe*(1+FC_G)}}
  }
  return{cp:cp,sp:sp};
}

/**
 * Recompute and repaint the Quick mode result card.
 */
function fcCalc(){
  var mrpV=fcResolveMRP();
  if(mrpV>0){
    var me=mrpV/(1+FC_G);
    var mxw=el('fc-mx-wrap'),mgw=el('fc-mg-wrap');
    if(mxw)mxw.style.display='';if(mgw)mgw.style.display='';
    if(el('fc-mx'))el('fc-mx').textContent=fcINR(me);
    if(el('fc-mg'))el('fc-mg').textContent=fcINR(mrpV-me);
  }
  // Update CP preview if visible
  if(el('fc-cp-e')||el('fc-cp-i')){
    var cpPrev=mrpV>0?fcResolveCP(mrpV):null;
    if(el('fc-cp-e'))el('fc-cp-e').textContent=cpPrev?fcINR(cpPrev.e):'—';
    if(el('fc-cp-i'))el('fc-cp-i').textContent=cpPrev?fcINR(cpPrev.i):'—';
  }
  // Update SP preview if visible
  if(el('fc-sp-e')||el('fc-sp-i')){
    var spPrev=mrpV>0?fcResolveSP(mrpV):null;
    if(el('fc-sp-e'))el('fc-sp-e').textContent=spPrev?fcINR(spPrev.e):'—';
    if(el('fc-sp-i'))el('fc-sp-i').textContent=spPrev?fcINR(spPrev.i):'—';
  }
  if(FC_STEP===3)fcRenderResult();
  debouncedSaveQState();
}

/* ── Build CP/SP cards dynamically ── */
function fcBuildCards(){
  if(FC_T==='profit'){
    fcBuildCPCard();   // slot 1 = CP
    fcBuildSPCard();   // slot 2 = SP
  } else if(FC_T==='sp'){
    fcBuildCPCard();          // slot 1 = CP
    fcBuildProfitCard('sp');  // slot 2 = Profit input → solve SP
  } else if(FC_T==='cp'){
    fcBuildSPCard();          // slot 1 = SP  (reuse, just relabelled)
    fcBuildProfitCard('cp');  // slot 2 = Profit input → solve CP
  }
  // Update progress dots label count
  fcUpdateDots();
  // Sync all GST-rate labels for the newly built cards
  updateGSTLabels();
  elClearCache();
}

/**
 * Build one Quick mode input field.
 * @param {string} symTxt prefix symbol, e.g. '₹' or '%'
 * @param {string} inputId
 * @param {string} placeholder
 * @param {string} extraStyle inline style for the wrapper
 * @param {string} [sufId] id for an optional suffix span
 * @returns {HTMLElement}
 */
function fcMkField(symTxt,inputId,placeholder,extraStyle,sufId){
  var isRupee=(symTxt==='₹');
  var wrap=document.createElement('div');wrap.className='fc-input-wrap';if(extraStyle)wrap.style.cssText=extraStyle;
  var sym=document.createElement('span');sym.className='fc-input-sym';sym.textContent=symTxt;
  var inp=document.createElement('input');inp.className='fc-input';inp.inputMode='decimal';inp.autocomplete='off';
  inp.id=inputId;inp.placeholder=placeholder;
  if(isRupee){
    inp.type='text';
    inp.oninput=function(){
      fcFmtInput(this);fcCalc();
    };
  } else {
    inp.type='number';inp.min='0';inp.max='100';inp.step='0.01';
    inp.oninput=fcCalc;
  }
  wrap.appendChild(sym);wrap.appendChild(inp);
  if(sufId){var suf=document.createElement('span');suf.className='fc-input-suf';suf.id=sufId;wrap.appendChild(suf);}
  return wrap;
}

// Live comma formatting for quick-mode ₹ text inputs
function fcFmtInput(inp){
  var raw=inp.value.replace(/[^0-9.]/g,'');
  var parts=raw.split('.');if(parts.length>2)raw=parts[0]+'.'+parts.slice(1).join('');
  var num=parseFloat(raw);
  if(!isNaN(num)&&raw!==''&&raw!=='.'){
    var fmt=fmtINDIAN(num);
    if(raw.indexOf('.')!==-1){var dec=raw.split('.')[1];fmt=fmtINDIAN(parseFloat(raw.split('.')[0])||0).split('.')[0]+'.'+(dec||'')}
    inp.value=fmt;
  } else if(raw===''||raw==='.'){inp.value=raw}
}

/**
 * Build the Quick mode cost-price card.
 * @returns {HTMLElement}
 */
function fcBuildCPCard(){
  var card=el('fcc-1');if(!card)return;
  card.innerHTML='';card.className='fc-card behind-1';
  var top=document.createElement('div');top.style.cssText='display:flex;align-items:center;gap:12px';
  top.innerHTML='<div class="fc-card-icon cp"><svg width="22" height="22" viewBox="0 0 22 22" fill="none"><path d="M4 11h14M4 7h14M4 15h8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg></div>'
    +'<div><div class="fc-card-label">'+(FC_T==='cp'?'Step 2 of 3':'Step 2 of 3')+'</div><div class="fc-card-title">Cost Price</div></div>';
  card.appendChild(top);

  var sub=document.createElement('div');sub.className='fc-card-sub';sub.textContent='How much do you pay for this item? Choose how to enter it.';
  card.appendChild(sub);

  // mode tabs
  var modes=document.createElement('div');modes.className='fc-mode-tabs';
  [{k:'excl',l:'Discount + GST %'},{k:'incl',l:'Nett Discount %'},{k:'manual',l:'Enter ₹ directly'}].forEach(function(m){
    var b=document.createElement('button');b.className='fc-tab'+(FC_CM===m.k?' on':'');
    b.id='fc-cm-'+m.k;b.textContent=m.l;b.onclick=function(){fcSetCM(m.k)};modes.appendChild(b);
  });
  card.appendChild(modes);

  // disc input
  var discWrap=document.createElement('div');discWrap.id='fc-cp-disc-wrap';
  discWrap.style.display=FC_CM==='manual'?'none':'';
  discWrap.appendChild(fcMkField('Disc','fc-cpd','e.g. 34',null,'fc-cpd-suf'));
  card.appendChild(discWrap);

  // manual input
  var manWrap=document.createElement('div');manWrap.id='fc-cp-manual-wrap';manWrap.style.cssText='display:'+(FC_CM==='manual'?'flex':'none')+';flex-direction:column;gap:8px';
  var subTabs=document.createElement('div');subTabs.className='fc-mode-tabs';
  [{k:'incl',l:'CP incl GST'},{k:'excl',l:'CP excl GST'}].forEach(function(s){
    var b=document.createElement('button');b.className='fc-tab'+(FC_CPMS===s.k?' on':'');
    b.id='fc-cpms-'+s.k;b.textContent=s.l;b.onclick=function(){fcSetCPMS(s.k)};subTabs.appendChild(b);
  });
  manWrap.appendChild(subTabs);
  manWrap.appendChild(fcMkField('₹','fc-cpv',FC_CPMS==='incl'?'CP incl GST':'CP excl GST'));
  card.appendChild(manWrap);

  // output preview
  var preview=document.createElement('div');preview.id='fc-cp-preview';preview.style.cssText='display:flex;gap:10px;flex-wrap:wrap';
  ['CP excl GST|fc-cp-e','CP incl GST|fc-cp-i'].forEach(function(pair){
    var parts=pair.split('|');
    var item=document.createElement('div');item.style.cssText='flex:1;min-width:90px;background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:8px 10px';
    item.innerHTML='<div style="font-size:9.5px;letter-spacing:.07em;text-transform:uppercase;color:var(--text3);font-weight:600;margin-bottom:2px">'+parts[0]+'</div>'
      +'<div style="font-family:\'JetBrains Mono\',monospace;font-size:15px;font-weight:500;color:var(--text)" id="'+parts[1]+'">—</div>';
    preview.appendChild(item);
  });
  card.appendChild(preview);

  var acts=document.createElement('div');acts.className='fc-actions';
  acts.innerHTML='<button class="fc-btn fc-btn-back" onclick="fcBack()"><svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M9 3L5 7l4 4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg> Back</button>'
    +'<button class="fc-btn fc-btn-next" onclick="fcNext()">Next <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M5 3l4 4-4 4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></button>';
  card.appendChild(acts);
}

/**
 * Build the Quick mode selling-price card.
 * @returns {HTMLElement}
 */
function fcBuildSPCard(){
  var slotId = (FC_T==='cp') ? 'fcc-1' : 'fcc-2';
  var card=el(slotId);if(!card)return;
  card.innerHTML='';card.className='fc-card behind-'+(FC_T==='cp'?'1':'2');
  var stepLbl=(FC_T==='cp')?'Step 2 of 3':'Step 3 of 3';
  var top=document.createElement('div');top.style.cssText='display:flex;align-items:center;gap:12px';
  top.innerHTML='<div class="fc-card-icon sp"><svg width="22" height="22" viewBox="0 0 22 22" fill="none"><circle cx="11" cy="11" r="7" stroke="currentColor" stroke-width="1.6"/><path d="M8.5 11h5M11 8.5v5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg></div>'
    +'<div><div class="fc-card-label">'+stepLbl+'</div><div class="fc-card-title">Selling Price</div></div>';
  card.appendChild(top);

  var sub=document.createElement('div');sub.className='fc-card-sub';sub.textContent='What do you want to sell it for?';
  card.appendChild(sub);

  var modes=document.createElement('div');modes.className='fc-mode-tabs';
  [{k:'excl',l:'Discount + GST %'},{k:'incl',l:'Nett Discount %'},{k:'manual',l:'Enter ₹ directly'}].forEach(function(m){
    var b=document.createElement('button');b.className='fc-tab'+(FC_SM===m.k?' on':'');
    b.id='fc-sm-'+m.k;b.textContent=m.l;b.onclick=function(){fcSetSM(m.k)};modes.appendChild(b);
  });
  card.appendChild(modes);

  var discWrap=document.createElement('div');discWrap.id='fc-sp-disc-wrap';
  discWrap.style.display=FC_SM==='manual'?'none':'';
  discWrap.appendChild(fcMkField('Disc','fc-spd','e.g. 20',null,'fc-spd-suf'));
  card.appendChild(discWrap);

  var manWrap=document.createElement('div');manWrap.id='fc-sp-manual-wrap';manWrap.style.cssText='display:'+(FC_SM==='manual'?'flex':'none')+';flex-direction:column;gap:8px';
  var subTabs=document.createElement('div');subTabs.className='fc-mode-tabs';
  [{k:'incl',l:'SP incl GST'},{k:'excl',l:'SP excl GST'}].forEach(function(s){
    var b=document.createElement('button');b.className='fc-tab'+(FC_SPMS===s.k?' on':'');
    b.id='fc-spms-'+s.k;b.textContent=s.l;b.onclick=function(){fcSetSPMS(s.k)};subTabs.appendChild(b);
  });
  manWrap.appendChild(subTabs);
  manWrap.appendChild(fcMkField('₹','fc-spv',FC_SPMS==='incl'?'SP incl GST':'SP excl GST'));
  card.appendChild(manWrap);

  var preview=document.createElement('div');preview.style.cssText='display:flex;gap:10px;flex-wrap:wrap';
  ['SP excl GST|fc-sp-e','SP incl GST|fc-sp-i'].forEach(function(pair){
    var parts=pair.split('|');
    var item=document.createElement('div');item.style.cssText='flex:1;min-width:90px;background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:8px 10px';
    item.innerHTML='<div style="font-size:9.5px;letter-spacing:.07em;text-transform:uppercase;color:var(--text3);font-weight:600;margin-bottom:2px">'+parts[0]+'</div>'
      +'<div style="font-family:\'JetBrains Mono\',monospace;font-size:15px;font-weight:500;color:var(--text)" id="'+parts[1]+'">—</div>';
    preview.appendChild(item);
  });
  card.appendChild(preview);

  var acts=document.createElement('div');acts.className='fc-actions';
  acts.innerHTML='<button class="fc-btn fc-btn-back" onclick="fcBack()"><svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M9 3L5 7l4 4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg> Back</button>'
    +'<button class="fc-btn fc-btn-next" onclick="fcNext()">'+(FC_T==='cp'?'Next':'Calculate')+' <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M5 3l4 4-4 4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></button>';
  card.appendChild(acts);
}

/* ── Result card ── */
/* ── Profit input card (when solving for SP or CP) ── */
function fcBuildProfitCard(solveFor){
  var card=el('fcc-2');if(!card)return;
  card.innerHTML='';card.className='fc-card behind-2';

  var titleText=solveFor==='sp'?'Profit / GP% / Margin%':'Profit / GP% / Margin%';
  var subText=solveFor==='sp'
    ?'Enter your target profit to calculate the Selling Price.'
    :'Enter your target profit to calculate the Cost Price.';

  var top=document.createElement('div');top.style.cssText='display:flex;align-items:center;gap:12px';
  top.innerHTML='<div class="fc-card-icon result" style="background:var(--green-bg)">'
    +'<svg width="22" height="22" viewBox="0 0 22 22" fill="none"><path d="M4 17l4-5 4 3 6-8" stroke="var(--green)" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg></div>'
    +'<div><div class="fc-card-label">Step 3 of 3</div><div class="fc-card-title">Profit</div></div>';
  card.appendChild(top);

  var sub=document.createElement('div');sub.className='fc-card-sub';sub.textContent=subText;
  card.appendChild(sub);

  // mode tabs
  var modes=document.createElement('div');modes.className='fc-mode-tabs';
  [{k:'val',l:'₹ Value'},{k:'gp',l:'GP %'},{k:'margin',l:'Margin %'}].forEach(function(m){
    var b=document.createElement('button');b.className='fc-tab'+(FC_PM===m.k?' on':'');
    b.id='fc-pm-'+m.k;b.textContent=m.l;b.onclick=function(){fcSetPM(m.k)};modes.appendChild(b);
  });
  card.appendChild(modes);

  // input
  var fld=document.createElement('div');fld.className='fc-input-wrap';
  var sym=document.createElement('span');sym.className='fc-input-sym';
  sym.id='fc-pr-sym';sym.textContent=FC_PM==='val'?'₹':'%';
  var isVal=FC_PM==='val';
  var inp=document.createElement('input');inp.className='fc-input';inp.inputMode='decimal';
  inp.id='fc-pr-val';inp.placeholder=isVal?'e.g. 10':'e.g. 15';inp.autocomplete='off';
  if(isVal){
    inp.type='text';
    inp.oninput=function(){fcFmtInput(this);if(FC_STEP===3)fcRenderResult()};
  } else {
    inp.type='number';inp.min='0';inp.step='0.01';
    inp.oninput=function(){if(FC_STEP===3)fcRenderResult()};
  }
  fld.appendChild(sym);fld.appendChild(inp);
  card.appendChild(fld);

  var acts=document.createElement('div');acts.className='fc-actions';
  acts.innerHTML='<button class="fc-btn fc-btn-back" onclick="fcBack()"><svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M9 3L5 7l4 4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg> Back</button>'
    +'<button class="fc-btn fc-btn-next" onclick="fcNext()">Calculate <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M5 3l4 4-4 4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></button>';
  card.appendChild(acts);
}

/**
 * Highlight the progress dot for the current Quick mode card.
 */
function fcUpdateDots(){
  // All modes are 3 steps (cards 0,1,2,3 = MRP,A,B,Result)
  for(var d=0;d<4;d++){
    var dot=el('fcdot-'+d);
    if(dot)dot.className='fc-dot'+(d<FC_STEP?' done':d===FC_STEP?' cur':'');
  }
}

/**
 * Draw the Quick mode result card.
 */
function fcRenderResult(){
  var card=el('fcc-3');if(!card)return;
  var mrpV=fcResolveMRP();
  var me=mrpV>0?mrpV/(1+FC_G):0;

  var cp=mrpV>0?fcResolveCP(mrpV):null;
  var sp=(FC_T!=='cp'&&mrpV>0)?fcResolveSP(mrpV):null;

  // Apply solve-for
  var solved=fcResolveProfit(cp,sp);
  cp=solved.cp; sp=solved.sp;

  var pr=null,gp=null,mg=null;
  if(cp&&sp){pr=sp.e-cp.e;gp=sp.e>0?(pr/sp.e)*100:null;mg=cp.e>0?(pr/cp.e)*100:null}

  var cpOver=cp&&mrpV>0&&cp.i>mrpV;
  var spOver=sp&&mrpV>0&&sp.i>mrpV;
  var calcdBadge='<span style="font-size:9px;background:var(--blue-bg);color:var(--blue);border:1px solid var(--blue-border);border-radius:8px;padding:1px 6px;margin-left:4px;font-family:sans-serif;vertical-align:middle">calc</span>';

  var html='<div style="display:flex;align-items:center;gap:12px;margin-bottom:4px">'
    +'<div class="fc-card-icon result"><svg width="22" height="22" viewBox="0 0 22 22" fill="none"><path d="M4 17l4-5 4 3 6-8" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg></div>'
    +'<div><div class="fc-card-label">Result</div><div class="fc-card-title">Summary</div></div>'
    +'</div>';

  html+='<div class="fc-result-grid">';
  html+=fcRItem('MRP (incl GST)', fcINR(mrpV), '', '');
  html+=fcRItem('MRP excl GST',   fcINR(me),   '', '');
  html+=fcRItem('CP excl GST'+(FC_T==='cp'?calcdBadge:''), cp?fcINR(cp.e):'—', cpOver?'warn':'', '');
  html+=fcRItem('CP incl GST',  cp?fcINR(cp.i):'—', cpOver?'warn':'', '');
  html+=fcRItem('SP excl GST'+(FC_T==='sp'?calcdBadge:''), sp?fcINR(sp.e):'—', spOver?'warn':'', '');
  html+=fcRItem('SP incl GST',  sp?fcINR(sp.i):'—', spOver?'warn':'', '');
  html+=fcRItem('Profit ₹', pr!==null?fcINR(pr):'—', pr!==null?(pr>=0?'pos':'neg'):'', pr!==null&&pr<0?'profit-neg':pr!==null&&pr>=0?'profit-pos':'');
  html+=fcRItem('GP %',     gp!==null?fcPCT(gp):'—', gp!==null?(gp>=0?'pos':'neg'):'', '');
  html+=fcRItem('Margin %', mg!==null?fcPCT(mg):'—', mg!==null?(mg>=0?'pos':'neg'):'', '');
  html+='</div>';

  if(cpOver)html+='<div class="fc-over-alert" style="margin-top:6px">⚠ CP incl GST exceeds MRP</div>';
  if(spOver)html+='<div class="fc-over-alert" style="margin-top:4px">⚠ SP incl GST exceeds MRP</div>';

  html+='<div class="fc-actions">'
    +'<button class="fc-btn fc-btn-back" onclick="fcBack()"><svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M9 3L5 7l4 4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg> Back</button>'
    +'<div style="display:flex;gap:8px">'
    +'<button class="fc-btn fc-btn-full" onclick="fcToDefault()">Full view</button>'
    +'<button class="fc-btn fc-btn-next" onclick="fcReset()">New <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M7 2C4.24 2 2 4.24 2 7s2.24 5 5 5 5-2.24 5-5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><path d="M10 1.5l2 1.2-2 1.2" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg></button>'
    +'</div></div>';

  card.innerHTML=html;
}

/**
 * Build one labelled row for the Quick mode result card.
 * @param {string} lbl
 * @param {string} val
 * @param {string} [cls]
 * @returns {string} HTML
 */
function fcRItem(lbl,val,valCls,cardCls){
  return'<div class="fc-result-item '+(cardCls||'')+'">'
    +'<div class="fc-result-lbl">'+lbl+'</div>'
    +'<div class="fc-result-val '+(valCls||'')+'">'+val+'</div>'
    +'</div>';
}

/* ── Navigation ── */
function fcGoto(step,animate){
  // Dismiss keyboard when arriving at result card
  if(step===3&&document.activeElement&&document.activeElement.blur){
    document.activeElement.blur();
  }
  var prev=FC_STEP;FC_STEP=step;
  var cards=['fcc-0','fcc-1','fcc-2','fcc-3'];

  // Pre-render result card BEFORE animation starts so it's ready
  if(step===3)fcRenderResult();
  // Also pre-render result in background when reaching step 2 (so step 3 is instant)
  if(step===2)setTimeout(fcRenderResult,50);

  // Update progress dots
  for(var d=0;d<4;d++){
    var dot=el('fcdot-'+d);
    if(!dot)continue;
    dot.className='fc-dot'+(d<step?' done':d===step?' cur':'');
  }

  cards.forEach(function(id,i){
    var c=el(id);if(!c)return;
    var diff=i-step;
    if(diff===0){
      if(animate&&prev<step){
        c.style.transform='translateX(100%)';c.style.opacity='0';c.style.transition='none';
        c.className='fc-card entering';
        var cid=id;
        requestAnimationFrame(function(){
          requestAnimationFrame(function(){
            c.style.transform='';c.style.opacity='';c.style.transition='';
            c.className='fc-card active';
            setTimeout(function(){cardBounce(cid)},340);
          });
        });
      } else if(animate&&prev>step){
        c.style.transform='translateX(-100%)';c.style.opacity='0';c.style.transition='none';
        c.className='fc-card entering';
        var cid2=id;
        requestAnimationFrame(function(){
          requestAnimationFrame(function(){
            c.style.transform='';c.style.opacity='';c.style.transition='';
            c.className='fc-card active';
            setTimeout(function(){cardBounce(cid2)},340);
          });
        });
      } else {
        c.style.transform='';c.style.opacity='';c.style.transition='';c.className='fc-card active';
      }
    } else if(diff===1){c.style.transform='';c.style.opacity='';c.style.transition='';c.className='fc-card behind-1'}
    else if(diff>=2){c.style.transform='';c.style.opacity='';c.style.transition='';c.className='fc-card behind-2'}
    else{c.style.transform='';c.style.opacity='';c.style.transition='';c.className='fc-card behind-2';}
  });

  // Focus the relevant input
  setTimeout(function(){
    var targets=['fc-mrp','fc-cpd','fc-spd',null];
    var t=targets[step];
    if(t&&el(t)){el(t).focus();el(t).select()}
  },380);
}

/**
 * Advance to the next Quick mode card.
 */
function fcNext(){
  if(FC_STEP<3)haptic(FC_STEP===2?'success':'light');
  fcGoto(Math.min(FC_STEP+1,3),true);
}
/**
 * Return to the previous Quick mode card.
 */
function fcBack(){
  if(FC_STEP>0){haptic('select');fcGoto(FC_STEP-1,true);}
}

/**
 * Clear Quick mode back to defaults.
 */
function fcReset(){
  FC_CM='excl';FC_SM='excl';FC_CPMS='incl';FC_SPMS='incl';FC_T='profit';FC_PM='val';
  // Reset solve-for tabs
  ['profit','sp','cp'].forEach(function(k){var b=el('fc-t-'+k);if(b)b.className='fc-tab'+(k==='profit'?' on':'')});
  fcBuildCards();fcGoto(0,false);
  ['fc-mrp','fc-cpd','fc-cpv','fc-spd','fc-spv'].forEach(function(id){var e=el(id);if(e)e.value=''});
}

/**
 * Copy Quick mode values into the main calculator and switch to it.
 */
function fcToDefault(){
  // Copy quick-mode values into default calc and switch
  var mrpV=fcResolveMRP();
  if(mrpV>0)el('mrp').value=mrpV;
  setGST(Math.round(FC_G*100));
  var cp=fcResolveCP(mrpV);
  var sp=fcResolveSP(mrpV);
  if(cp){
    if(FC_CM==='manual'){setCM('manual');setCPManual(FC_CPMS);el('cpv').value=FC_CPMS==='incl'?cp.i:cp.e}
    else{setCM(FC_CM);el('cpd').value=el('fc-cpd')?el('fc-cpd').value:''}
  }
  if(sp){
    if(FC_SM==='manual'){setSM('manual');setSPManual(FC_SPMS);el('spv').value=FC_SPMS==='incl'?sp.i:sp.e}
    else{setSM(FC_SM);el('spd').value=el('fc-spd')?el('fc-spd').value:''}
  }
  setMode('default');calc();
}

/* ── Swipe support ── */
(function(){
  var startX=0,startY=0,dragging=false,locked=false,card=null;

  function onStart(e){
    if(APP_MODE!=='quick')return;
    var stack=el('fc-stack');
    if(!stack||!stack.contains(e.target))return;
    // Don't block input fields - they need their own touch handling
    if(e.target.tagName==='INPUT'||e.target.tagName==='SELECT'||e.target.tagName==='TEXTAREA')return;
    card=el('fcc-'+FC_STEP);if(!card)return;
    var t=e.touches[0];
    startX=t.clientX;startY=t.clientY;
    dragging=false;locked=false;
  }

  function onMove(e){
    if(APP_MODE!=='quick'||!card)return;
    var t=e.touches[0];
    var dx=t.clientX-startX;
    var dy=t.clientY-startY;

    if(!dragging&&!locked){
      if(Math.abs(dx)<8&&Math.abs(dy)<8)return;
      // Vertical dominant → scroll, not swipe
      if(Math.abs(dy)>Math.abs(dx)*1.2){locked=true;return;}
      dragging=true;
      card.classList.add('dragging');
    }
    if(!dragging)return;

    if(e.cancelable)e.preventDefault();
    var rotate=dx*0.04;
    card.style.transform='translateX('+dx+'px) rotate('+rotate+'deg)';
    card.style.opacity=String(Math.max(0,1-Math.abs(dx)/220));
  }

  function onEnd(e){
    if(APP_MODE!=='quick'||!card)return;
    var t=e.changedTouches[0];
    var dx=t.clientX-startX;
    if(card)card.classList.remove('dragging');
    if(dragging&&dx<-60){
      haptic('light');
      card.style.transform='';card.style.opacity='';
      fcNext();
    } else if(dragging&&dx>60&&FC_STEP>0){
      haptic('select');
      card.style.transform='';card.style.opacity='';
      fcBack();
    } else {
      if(card){card.style.transform='';card.style.opacity='';}
    }
    dragging=false;locked=false;card=null;
  }

  document.addEventListener('touchstart',onStart,{passive:true});
  document.addEventListener('touchmove',onMove,{passive:false});
  document.addEventListener('touchend',onEnd,{passive:true});
})();

/* ── Swipe-to-delete history (per-element listeners added in renderHistory) ── */
function deleteHistEntry(idx){
  if(idx<0||idx>=HISTORY.length)return;
  pushUndo('delete history entry');
  HISTORY.splice(idx,1);
  saveHistoryToStorage();
  renderHistory();
  toast('Entry deleted',true);
}

/* ── History search / filter / tags ── */
function setHistQuery(q){HIST_QUERY=(q||'').trim().toLowerCase();renderHistory()}
/**
 * Apply a history filter and repaint the pills.
 * @param {'all'|'pos'|'neg'|'below'|'tagged'} f
 */
function setHistFilter(f){
  HIST_FILTER=f;
  ['all','pos','neg','below','tagged'].forEach(function(k){
    var b=el('hf-'+k);if(b)b.className='hist-fpill'+(k===f?' on':'');
  });
  renderHistory();
}
/**
 * Whether a history entry passes the active filter and search.
 * The search runs over tag, GST, date and every displayed number.
 * @param {Object} h history entry
 * @param {{gp:number|null,mg:number|null}} floor
 * @returns {boolean}
 */
function histMatches(h,floor){
  if(HIST_FILTER==='pos'&&!(h.pr>0))return false;
  if(HIST_FILTER==='neg'&&!(h.pr<0))return false;
  if(HIST_FILTER==='tagged'&&!h.tag)return false;
  if(HIST_FILTER==='below'&&!(belowFloor(h.gp,floor.gp)||belowFloor(h.mg,floor.mg)))return false;
  if(!HIST_QUERY)return true;
  var hay=[h.tag||'',(h.gst!=null?h.gst+'%':''),
    h.mrp,h.cpE,h.spE,h.pr,
    (h.gp!=null?h.gp.toFixed(2):''),(h.mg!=null?h.mg.toFixed(2):''),
    h.ts?fmtTime(h.ts):(h.time||'')].join(' ').toLowerCase();
  return hay.indexOf(HIST_QUERY)!==-1;
}
/**
 * Swap an entry's tag chip for an input. Enter commits, Escape discards.
 * @param {number} idx index into HISTORY
 */
function startTagEdit(idx){
  var cell=document.getElementById('tag-'+idx);
  if(!cell)return;
  var cur=HISTORY[idx]&&HISTORY[idx].tag?HISTORY[idx].tag:'';
  cell.outerHTML='<input class="hist-tag-input" id="tagin-'+idx+'" aria-label="Tag for this entry" value="'+cur.replace(/"/g,'&quot;')+'" maxlength="24" placeholder="Tag…" autocomplete="off" '
    +'onblur="commitTag('+idx+',this.value)" '
    +'onkeydown="if(event.key===\'Enter\'){this.blur()}else if(event.key===\'Escape\'){this.value=\'\\u0000\';this.blur()}">';
  var inp=document.getElementById('tagin-'+idx);
  if(inp){inp.focus();inp.select()}
}
/**
 * Save an edited tag. An empty value removes it. Undoable.
 * @param {number} idx index into HISTORY
 * @param {string} val new tag, truncated to 24 chars
 */
function commitTag(idx,val){
  if(val==='\u0000'){renderHistory();return} // Escape — discard
  if(!HISTORY[idx]){renderHistory();return}
  var v=(val||'').trim().slice(0,24);
  if((HISTORY[idx].tag||'')===v){renderHistory();return}
  pushUndo('tag entry');
  if(v)HISTORY[idx].tag=v;else delete HISTORY[idx].tag;
  saveHistoryToStorage();
  renderHistory();
  haptic('light');
}

/* ── Pull to reset ── */
(function(){
  var startY=0,active=false;
  var TRIGGER=90,bar=null,txt=null;
  function getBar(){return bar||(bar=document.getElementById('pull-reset'));}
  function getTxt(){return txt||(txt=document.getElementById('pull-reset-txt'));}

  document.addEventListener('touchstart',function(e){
    if(APP_MODE!=='default')return;
    if((window.pageYOffset||document.documentElement.scrollTop)>2)return;
    startY=e.touches[0].clientY;active=true;
  },{passive:true});

  document.addEventListener('touchmove',function(e){
    if(!active)return;
    var dy=e.touches[0].clientY-startY;
    if(dy<=0){active=false;return;}
    var show=Math.min(dy,TRIGGER);
    getBar().style.transform='translateY(calc(-100% + '+show+'px))';
    if(dy>=TRIGGER){
      getBar().classList.add('pr-ready');
      getTxt().textContent='Release to reset';
    }else{
      getBar().classList.remove('pr-ready');
      getTxt().textContent='Pull down to reset';
    }
  },{passive:true});

  document.addEventListener('touchend',function(e){
    if(!active)return;
    active=false;
    var dy=e.changedTouches[0].clientY-startY;
    getBar().style.transform='';
    getBar().classList.remove('pr-ready');
    getTxt().textContent='Pull down to reset';
    if(dy>=TRIGGER){haptic('success');resetAll();}
  },{passive:true});
})();

/* ════════════════════════════════════════════
   WIZARD MODE — Landed Cost Calculator
════════════════════════════════════════════ */
var WZ_G=0.18;
var WZ_T='cp';     // 'cp' | 'sp'
var WZ_CM='excl';  // 'excl' | 'incl' | 'manual'
var WZ_MS='incl';  // manual sub: 'incl' | 'excl'
var WZ_CDM='before'; // CD mode
var WZ_SCM='pct';    // scheme mode

/**
 * Set the GST rate in wizard mode.
 * @param {number} p
 */
function wzSetGST(p){
  WZ_G=p/100;
  el('wzg18').className='stab'+(p===18?' on':'');
  el('wzg5').className='stab'+(p===5?' on':'');
  updateGSTLabels();
  wzCalc();
}
/**
 * Choose whether the wizard is pricing CP or SP.
 * @param {'cp'|'sp'} t
 */
function wzSetT(t){
  WZ_T=t;
  el('wz-t-cp').className='stab'+(t==='cp'?' on':'');
  el('wz-t-sp').className='stab'+(t==='sp'?' on':'');
  var lbl=t==='cp'?'Cost Price':'Selling Price';
  el('wz-price-title').textContent=lbl+' Input';
  el('wz-result-title').textContent=lbl+' Breakdown';
  updateGSTLabels(); // updates all wizard incl/excl labels with current WZ_G
  wzCalc();
}
/**
 * Set the wizard's price input mode.
 * @param {'excl'|'incl'|'manual'} m
 */
function wzSetCM(m){
  WZ_CM=m;
  ['excl','incl','manual'].forEach(function(k){el('wz-cm-'+k).className='stab'+(m===k?' on':'')});
  el('wz-disc-wrap').style.display=m==='manual'?'none':'';
  el('wz-manual-wrap').style.display=m==='manual'?'flex':'none';
  updateGSTLabels();
  wzCalc();
}
/**
 * Choose incl/excl GST for a manually entered wizard price.
 * @param {'incl'|'excl'} s
 */
function wzSetMS(s){
  WZ_MS=s;
  el('wz-ms-incl').className='stab'+(s==='incl'?' on':'');
  el('wz-ms-excl').className='stab'+(s==='excl'?' on':'');
  wzCalc();
}
/**
 * Choose whether wizard cash discount applies before or after GST.
 * @param {'before'|'after'} m
 */
function wzSetCDMode(m){
  WZ_CDM=m;
  el('wz-cdm-before').className='stab'+(m==='before'?' on':'');
  el('wz-cdm-after').className='stab'+(m==='after'?' on':'');
  wzCalc();
}
/**
 * Switch the wizard scheme between percentage and flat ₹.
 * @param {'pct'|'abs'} m
 */
function wzSetScMode(m){
  WZ_SCM=m;
  el('wz-scm-pct').className='stab'+(m==='pct'?' on':'');
  el('wz-scm-abs').className='stab'+(m==='abs'?' on':'');
  el('wz-sc-unit').textContent=m==='abs'?'₹':'%';
  if(m==='abs')el('wz-iv-sc').removeAttribute('max');
  else el('wz-iv-sc').max='100';
  wzCalc();
}
/**
 * Show or hide the wizard's cash-discount sub-options.
 */
function wzSyncCD(){
  el('wz-cdm-sub').style.display=el('wz-it-cd').checked?'block':'none';
  wzCalc();
}
/**
 * Show or hide the wizard's scheme sub-options.
 */
function wzSyncSc(){
  el('wz-scm-sub').style.display=el('wz-it-sc').checked?'block':'none';
  wzCalc();
}
/**
 * Format an amount for wizard display.
 * @param {number} n
 * @returns {string}
 */
function wzFmtAmt(inp){
  var raw=inp.value.replace(/[^0-9.]/g,'');
  var pts=raw.split('.');if(pts.length>2)raw=pts[0]+'.'+pts.slice(1).join('');
  var num=parseFloat(raw);
  if(!isNaN(num)&&raw!==''&&raw!=='.'){
    var fmt=fmtINDIAN(num);
    if(raw.indexOf('.')!==-1){var dec=raw.split('.')[1];fmt=fmtINDIAN(parseFloat(raw.split('.')[0])||0).split('.')[0]+'.'+(dec||'')}
    inp.value=fmt;
  } else if(raw===''||raw==='.'){inp.value=raw}
}
/**
 * Total wizard incentive value in rupees.
 * @param {{e:number,i:number}} p base price
 * @returns {number}
 */
function wzGetInc(price){
  if(!price)return 0;
  var t=0;
  ['cd','eb','qt','an','sc'].forEach(function(k){
    if(!el('wz-it-'+k).checked)return;
    var v=parseFloat(el('wz-iv-'+k).value);
    if(isNaN(v)||v<=0)return;
    if(k==='sc')t+=WZ_SCM==='abs'?v:(price.e*v/100);
    else t+=(k==='cd'&&WZ_CDM==='after')?(price.i*v/100):(price.e*v/100);
  });
  return t;
}
/**
 * Recompute and repaint the wizard's breakdown.
 */
function wzCalc(){
  var mrp=parseFloat((el('wz-mrp').value||'').replace(/,/g,''))||0;
  var ids=['wz-rde','wz-rdi','wz-rve','wz-rvi','wz-rga','wz-rinc','wz-reff','wz-reffi'];
  ids.forEach(function(id){var e=el(id);if(e){e.textContent='—';e.className='row-val'+(id.indexOf('amber')>-1?' amber':'')}});
  el('wz-alert').style.display='none';
  el('wz-rinc-row').style.display='none';
  el('wz-reff-row').style.display='none';
  el('wz-reffi-row').style.display='none';
  if(!mrp)return;

  // Resolve price
  var price=null;
  if(WZ_CM==='manual'){
    var v=parseFloat((el('wz-manual').value||'').replace(/,/g,''));
    if(!isNaN(v)&&v>0)price=WZ_MS==='incl'?{e:v/(1+WZ_G),i:v}:{e:v,i:v*(1+WZ_G)};
  } else {
    var d=parseFloat(el('wz-disc').value);
    if(!isNaN(d)){
      var e2=WZ_CM==='excl'?mrp*(1-d/100):mrp*(1-d/100)/(1+WZ_G);
      price={e:e2,i:e2*(1+WZ_G)};
    }
  }
  if(!price)return;

  var overMRP=price.i>mrp;
  var de=(1-price.e/mrp)*100;
  var di=(1-price.i/mrp)*100;

  var rv=function(id,val,cls){var e=el(id);if(e){e.textContent=val;e.className='row-val'+(cls?' '+cls:'')}};
  rv('wz-rde','₹'+fmtINDIAN(price.e)+' / '+de.toFixed(2)+'%',de<0?'neg':'');
  rv('wz-rdi',di.toFixed(2)+'%',di<0?'neg':'');
  rv('wz-rve','₹'+fmtINDIAN(price.e),overMRP?'neg':'');
  rv('wz-rvi','₹'+fmtINDIAN(price.i),overMRP?'neg':'');
  rv('wz-rga','₹'+fmtINDIAN(price.i-price.e));
  el('wz-alert').style.display=overMRP?'':'none';

  var inc=wzGetInc(price);
  if(inc>0){
    var eff={e:price.e-inc, i:(price.e-inc)*(1+WZ_G)};
    rv('wz-rinc','₹'+fmtINDIAN(inc),'amber');
    rv('wz-reff','₹'+fmtINDIAN(eff.e),'amber');
    rv('wz-reffi','₹'+fmtINDIAN(eff.i),'amber');
    el('wz-rinc-row').style.display='';
    el('wz-reff-row').style.display='';
    el('wz-reffi-row').style.display='';
  }
}

/**
 * Clear the wizard back to defaults.
 */
function wzReset(){
  el('wz-mrp').value='';el('wz-disc').value='';el('wz-manual').value='';
  ['cd','eb','qt','an','sc'].forEach(function(k){if(el('wz-it-'+k))el('wz-it-'+k).checked=false});
  el('wz-cdm-sub').style.display='none';el('wz-scm-sub').style.display='none';
  wzSetT('cp');wzSetCM('excl');wzSetMS('incl');wzSetCDMode('before');wzSetScMode('pct');wzSetGST(18);
}

/**
 * Copy wizard values into the main calculator and switch to it.
 */
function wzToDefault(){
  var mrpV=el('wz-mrp').value;if(mrpV)el('mrp').value=mrpV;
  setGST(Math.round(WZ_G*100));
  if(WZ_T==='cp'){
    if(WZ_CM==='manual'){setCM('manual');setCPManual(WZ_MS);el('cpv').value=el('wz-manual').value}
    else{setCM(WZ_CM);el('cpd').value=el('wz-disc').value}
    ['cd','eb','qt','an','sc'].forEach(function(k){
      if(el('wz-it-'+k)&&el('wz-it-'+k).checked){el('it-'+k).checked=true;el('iv-'+k).value=el('wz-iv-'+k).value;syncToggle(k)}
    });
    setCDMode(WZ_CDM);setSchemeMode(WZ_SCM);
  } else {
    if(WZ_CM==='manual'){setSM('manual');setSPManual(WZ_MS);el('spv').value=el('wz-manual').value}
    else{setSM(WZ_CM);el('spd').value=el('wz-disc').value}
    ['cd','eb','qt','an','sc'].forEach(function(k){
      if(el('wz-it-'+k)&&el('wz-it-'+k).checked){el('sit-'+k).checked=true;el('siv-'+k).value=el('wz-iv-'+k).value;syncSpToggle(k)}
    });
    setSCDMode(WZ_CDM);setSpSchemeMode(WZ_SCM);
  }
  setMode('default');calc();
}

/* ── Quote builder (multi-line) ──
   Each line is self-contained: MRP, qty and net CP/SP discounts on MRP.
   Incentives are deliberately excluded — enter the net landed discount per line. */
function qtBlank(){return{desc:'',mrp:'',qty:1,cpd:'',spd:''}}
/**
 * Persist the quote lines.
 */
function saveQuote(){
  try{ localStorage.setItem('pc-quote',JSON.stringify(QUOTE)) }
  catch(e){ logError('could not save quote lines (pc-quote)',e); }
}
/**
 * Restore saved quote lines.
 */
function loadQuote(){
  try{
    var raw=localStorage.getItem('pc-quote');
    if(!raw)return;
    var a=JSON.parse(raw);
    if(Array.isArray(a))QUOTE=a;
  }catch(e){ logWarn('could not read saved quote (pc-quote); starting empty',e); }
}
/**
 * Compute one quote line at the current GST and rounding settings.
 * @param {Object} L line record
 * @returns {Object|null} null when MRP or either discount is missing/invalid
 */
function qtCalcLine(L){
  var mrp=parseFloat(L.mrp),qty=parseInt(L.qty,10)||1;
  if(isNaN(mrp)||mrp<=0)return null;
  var cpd=parseFloat(L.cpd),spd=parseFloat(L.spd);
  if(isNaN(cpd)||isNaN(spd))return null;
  var cp=roundPrice({e:mrp*(1-cpd/100),i:mrp*(1-cpd/100)*(1+G)});
  var sp=roundPrice({e:mrp*(1-spd/100),i:mrp*(1-spd/100)*(1+G)});
  var unitPr=sp.e-cp.e;
  return{
    qty:qty,cpE:cp.e,spE:sp.e,spI:sp.i,
    unitPr:unitPr,
    lineVal:sp.i*qty,
    linePr:unitPr*qty,
    gp:(sp.e>0)?(unitPr/sp.e)*100:null
  };
}
/**
 * Aggregate every complete quote line.
 * Incomplete lines are skipped rather than treated as zero, so a half-typed row
 * doesn't drag the blended GP down.
 * @returns {Object} totals including blended gp and mg
 */
function qtTotals(){
  var t={val:0,pr:0,cost:0,rev:0,units:0,lines:0};
  QUOTE.forEach(function(L){
    var r=qtCalcLine(L);
    if(!r)return;
    t.lines++;t.units+=r.qty;
    t.val+=r.lineVal;t.pr+=r.linePr;
    t.cost+=r.cpE*r.qty;t.rev+=r.spE*r.qty;
  });
  t.gp=(t.rev>0)?(t.pr/t.rev)*100:null;
  t.mg=(t.cost>0)?(t.pr/t.cost)*100:null;
  return t;
}
/**
 * Rebuild the quote view, choosing the layout that fits the viewport.
 */
function qtRender(){
  if(qtIsMobile())qtRenderCards();else qtRenderTable();
}
/**
 * Whether the quote should use the stacked card layout.
 * The table needs 720px of width; anything narrower gets cards instead so the
 * user never has to scroll sideways while typing.
 * @returns {boolean}
 */
function qtIsMobile(){return window.innerWidth<=800}
/**
 * Markup for one editable quote field, shared by both layouts.
 * @param {number} i line index
 * @param {string} field property on the line record
 * @param {*} val current value
 * @param {Object} [opts] type, mode, ph, cls, style, min, max, step, label
 * @returns {string} HTML
 */
function qtField(i,field,val,opts){
  opts=opts||{};
  var esc=String(val==null?'':val).replace(/&/g,'&amp;').replace(/"/g,'&quot;');
  return '<input class="qt-in '+(opts.cls||'')+'"'
    +(opts.type?' type="'+opts.type+'"':'')
    +(opts.mode?' inputmode="'+opts.mode+'"':'')
    +' value="'+esc+'" placeholder="'+(opts.ph||'')+'"'
    +(opts.min!==undefined?' min="'+opts.min+'"':'')
    +(opts.max!==undefined?' max="'+opts.max+'"':'')
    +(opts.step?' step="'+opts.step+'"':'')
    +(opts.style?' style="'+opts.style+'"':'')
    +(opts.label?' aria-label="'+opts.label+'"':'')
    +' onfocus="pushUndo(\'edit quote line\')"'
    +' oninput="qtSet('+i+',\''+field+'\',this.value)" autocomplete="off">';
}
/**
 * Remove-line button, shared by both layouts.
 * @param {number} i line index
 * @returns {string} HTML
 */
function qtDelBtnHTML(i){
  return '<button class="qt-del" onclick="qtDelLine('+i+')" title="Remove line" aria-label="Remove line '+(i+1)+'">'
    +'<svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true"><path d="M2 2l6 6M8 2l-6 6" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg></button>';
}
/**
 * Empty-state markup, shared by both layouts.
 * @returns {string} HTML
 */
function qtEmptyHTML(){
  return '<div class="qt-empty">No lines yet — add one, or pull in the current calculation.</div>';
}
/**
 * Wide layout: one table row per line.
 * Derived cells carry stable qtd-* ids so qtRefreshDerived never has to depend
 * on column positions.
 */
function qtRenderTable(){
  var tbl=el('qt-table'),wrap=el('qt-cards');
  if(!tbl)return;
  if(wrap){wrap.innerHTML='';wrap.style.display='none'}
  tbl.style.display='';
  if(QUOTE.length===0){tbl.innerHTML='<tr><td>'+qtEmptyHTML()+'</td></tr>';return}
  var g=Math.round(G*100),floor=getFloor();
  var h='<thead><tr>'
    +'<th>#</th><th>Description</th><th class="num">MRP</th><th class="num">Qty</th>'
    +'<th class="num">CP disc %</th><th class="num">SP disc %</th>'
    +'<th class="num">SP incl '+g+'%</th><th class="num">Line value</th>'
    +'<th class="num">Profit</th><th class="num">GP %</th><th><span class="sr-only">Actions</span></th>'
    +'</tr></thead><tbody>';
  QUOTE.forEach(function(L,i){
    var r=qtCalcLine(L);
    var prCls=r?(r.linePr>=0?'qt-pos':'qt-neg'):'';
    var gpCls=r&&belowFloor(r.gp,floor.gp)?'qt-neg':prCls;
    h+='<tr>'
      +'<td>'+(i+1)+'</td>'
      +'<td>'+qtField(i,'desc',L.desc,{cls:'desc',ph:'Part / description',label:'Description for line '+(i+1)})+'</td>'
      +'<td class="num">'+qtField(i,'mrp',L.mrp,{type:'number',mode:'decimal',ph:'0',min:0,step:'0.01',label:'MRP for line '+(i+1)})+'</td>'
      +'<td class="num">'+qtField(i,'qty',L.qty,{type:'number',mode:'numeric',min:1,step:'1',style:'width:52px',label:'Quantity for line '+(i+1)})+'</td>'
      +'<td class="num">'+qtField(i,'cpd',L.cpd,{type:'number',mode:'decimal',ph:'0',min:0,max:100,step:'0.01',style:'width:62px',label:'CP discount for line '+(i+1)})+'</td>'
      +'<td class="num">'+qtField(i,'spd',L.spd,{type:'number',mode:'decimal',ph:'0',min:0,max:100,step:'0.01',style:'width:62px',label:'SP discount for line '+(i+1)})+'</td>'
      +'<td class="num" id="qtd-spi-'+i+'">'+(r?INR(r.spI):'—')+'</td>'
      +'<td class="num" id="qtd-val-'+i+'">'+(r?INR(r.lineVal):'—')+'</td>'
      +'<td class="num '+prCls+'" id="qtd-pr-'+i+'">'+(r?INR(r.linePr):'—')+'</td>'
      +'<td class="num '+gpCls+'" id="qtd-gp-'+i+'">'+(r?PCT(r.gp):'—')+'</td>'
      +'<td>'+qtDelBtnHTML(i)+'</td>'
      +'</tr>';
  });
  var t=qtTotals();
  h+='</tbody><tfoot><tr class="qt-foot">'
    +'<td colspan="3">Total — '+t.lines+' line'+(t.lines===1?'':'s')+'</td>'
    +'<td class="num" id="qt-total-units">'+t.units+'</td>'
    +'<td colspan="2"></td><td></td>'
    +'<td class="num" id="qt-total-val">'+INR(t.val)+'</td>'
    +'<td class="num '+(t.pr>=0?'qt-pos':'qt-neg')+'" id="qt-total-pr">'+INR(t.pr)+'</td>'
    +'<td class="num" id="qt-total-gp">'+PCT(t.gp)+'</td>'
    +'<td></td></tr></tfoot>';
  tbl.innerHTML=h;
}
/**
 * Narrow layout: one card per line, so nothing scrolls sideways.
 * Reuses the same qtd-* ids as the table, so both share one refresh path.
 */
function qtRenderCards(){
  var tbl=el('qt-table'),wrap=el('qt-cards');
  if(!wrap)return;
  if(tbl){tbl.innerHTML='';tbl.style.display='none'}
  wrap.style.display='';
  if(QUOTE.length===0){wrap.innerHTML=qtEmptyHTML();return}
  var g=Math.round(G*100),floor=getFloor();
  var h='';
  QUOTE.forEach(function(L,i){
    var r=qtCalcLine(L);
    var prCls=r?(r.linePr>=0?'qt-pos':'qt-neg'):'';
    var gpCls=r&&belowFloor(r.gp,floor.gp)?'qt-neg':prCls;
    h+='<div class="qtc">'
      +'<div class="qtc-head">'
        +'<span class="qtc-num">'+(i+1)+'</span>'
        +qtField(i,'desc',L.desc,{cls:'desc qtc-desc',ph:'Part / description',label:'Description for line '+(i+1)})
        +qtDelBtnHTML(i)
      +'</div>'
      +'<div class="qtc-inputs">'
        +'<label class="qtc-f"><span>MRP</span>'+qtField(i,'mrp',L.mrp,{type:'number',mode:'decimal',ph:'0',min:0,step:'0.01',label:'MRP for line '+(i+1)})+'</label>'
        +'<label class="qtc-f"><span>Qty</span>'+qtField(i,'qty',L.qty,{type:'number',mode:'numeric',min:1,step:'1',label:'Quantity for line '+(i+1)})+'</label>'
        +'<label class="qtc-f"><span>CP disc %</span>'+qtField(i,'cpd',L.cpd,{type:'number',mode:'decimal',ph:'0',min:0,max:100,step:'0.01',label:'CP discount for line '+(i+1)})+'</label>'
        +'<label class="qtc-f"><span>SP disc %</span>'+qtField(i,'spd',L.spd,{type:'number',mode:'decimal',ph:'0',min:0,max:100,step:'0.01',label:'SP discount for line '+(i+1)})+'</label>'
      +'</div>'
      +'<div class="qtc-out">'
        +'<span class="qtc-o"><span class="qtc-ol">SP incl '+g+'%</span><span id="qtd-spi-'+i+'">'+(r?INR(r.spI):'—')+'</span></span>'
        +'<span class="qtc-o"><span class="qtc-ol">Line value</span><span id="qtd-val-'+i+'">'+(r?INR(r.lineVal):'—')+'</span></span>'
        +'<span class="qtc-o"><span class="qtc-ol">Profit</span><span class="'+prCls+'" id="qtd-pr-'+i+'">'+(r?INR(r.linePr):'—')+'</span></span>'
        +'<span class="qtc-o"><span class="qtc-ol">GP %</span><span class="'+gpCls+'" id="qtd-gp-'+i+'">'+(r?PCT(r.gp):'—')+'</span></span>'
      +'</div>'
    +'</div>';
  });
  var t=qtTotals();
  h+='<div class="qtc qtc-total">'
    +'<div class="qtc-thead">Total — '+t.lines+' line'+(t.lines===1?'':'s')+' · <span id="qt-total-units">'+t.units+'</span> units</div>'
    +'<div class="qtc-out">'
      +'<span class="qtc-o"><span class="qtc-ol">Order value</span><span id="qt-total-val">'+INR(t.val)+'</span></span>'
      +'<span class="qtc-o"><span class="qtc-ol">Total profit</span><span class="'+(t.pr>=0?'qt-pos':'qt-neg')+'" id="qt-total-pr">'+INR(t.pr)+'</span></span>'
      +'<span class="qtc-o"><span class="qtc-ol">Blended GP</span><span id="qt-total-gp">'+PCT(t.gp)+'</span></span>'
    +'</div>'
  +'</div>';
  wrap.innerHTML=h;
}
/**
 * Update one field of one quote line.
 * Refreshes only the derived cells, leaving the inputs untouched so focus and
 * caret position survive typing.
 * @param {number} i line index
 * @param {string} field property name
 * @param {string} val
 */
function qtSet(i,field,val){
  if(!QUOTE[i])return;
  QUOTE[i][field]=val;
  saveQuote();
  qtRefreshDerived();
}
/**
 * Recompute the calculated cells and totals without rebuilding the inputs.
 * Targets elements by id rather than by cell position, so the table and card
 * layouts share a single implementation.
 */
function qtRefreshDerived(){
  var floor=getFloor(),inTable=!qtIsMobile();
  function put(id,txt,cls){
    var e=document.getElementById(id);
    if(!e)return;
    e.textContent=txt;
    if(cls!==undefined)e.className=cls;
  }
  QUOTE.forEach(function(L,i){
    var r=qtCalcLine(L);
    var prCls=r?(r.linePr>=0?'qt-pos':'qt-neg'):'';
    var gpCls=r&&belowFloor(r.gp,floor.gp)?'qt-neg':prCls;
    put('qtd-spi-'+i, r?INR(r.spI):'—');
    put('qtd-val-'+i, r?INR(r.lineVal):'—');
    put('qtd-pr-'+i,  r?INR(r.linePr):'—', inTable?('num '+prCls):prCls);
    put('qtd-gp-'+i,  r?PCT(r.gp):'—',     inTable?('num '+gpCls):gpCls);
  });
  var t=qtTotals();
  put('qt-total-units',String(t.units));
  put('qt-total-val',INR(t.val));
  put('qt-total-pr',INR(t.pr),(inTable?'num ':'')+(t.pr>=0?'qt-pos':'qt-neg'));
  put('qt-total-gp',PCT(t.gp));
}
/**
 * Append a blank quote line.
 */
function qtAddLine(){
  pushUndo('add quote line');
  QUOTE.push(qtBlank());
  saveQuote();qtRender();haptic('light');
}
/**
 * Add a quote line from the main calculator's current MRP, quantity and discounts.
 */
function qtAddFromCalc(){
  var mrpV=parseMRP();
  if(!mrpV||!LAST_CP||!LAST_SP){toast('Enter MRP, CP and SP first');return}
  pushUndo('add quote line');
  var dcp=discFromPrice(LAST_CP.e),dsp=discFromPrice(LAST_SP.e);
  QUOTE.push({
    desc:'',
    mrp:String(parseFloat(mrpV.toFixed(2))),
    qty:getQty(),
    cpd:String(parseFloat(dcp.de.toFixed(4))),
    spd:String(parseFloat(dsp.de.toFixed(4)))
  });
  saveQuote();qtRender();haptic('light');
  toast('Line added from calculator',true);
}
/**
 * Remove one quote line. Undoable.
 * @param {number} i line index
 */
function qtDelLine(i){
  if(!QUOTE[i])return;
  pushUndo('delete quote line');
  QUOTE.splice(i,1);
  saveQuote();qtRender();haptic('light');
  toast('Line removed',true);
}
/**
 * Remove all quote lines, after confirmation. Undoable.
 */
function qtClear(){
  if(QUOTE.length===0){toast('Quote is already empty');return}
  askConfirm('Clear quote',
    'Remove all '+QUOTE.length+' line'+(QUOTE.length===1?'':'s')+' from the quote?',
    'You can undo this straight after.',
    'Clear all',
    function(){
      pushUndo('clear quote');
      QUOTE=[];saveQuote();qtRender();
      toast('Quote cleared',true);
    });
}
/**
 * Download the quote as CSV, including a totals row.
 */
function qtExportCSV(){
  if(QUOTE.length===0){toast('Nothing to export');return}
  var g=Math.round(G*100);
  var rows=[['Line','Description','MRP','Qty','CP disc %','SP disc %','CP excl GST','SP excl GST','SP incl '+g+'% GST','Line value','Unit profit','Line profit','GP %'].join(',')];
  QUOTE.forEach(function(L,i){
    var r=qtCalcLine(L);
    rows.push([
      i+1,
      '"'+String(L.desc||'').replace(/"/g,'""')+'"',
      L.mrp||'',L.qty||1,L.cpd||'',L.spd||'',
      r?r.cpE.toFixed(2):'',r?r.spE.toFixed(2):'',r?r.spI.toFixed(2):'',
      r?r.lineVal.toFixed(2):'',r?r.unitPr.toFixed(2):'',r?r.linePr.toFixed(2):'',
      (r&&r.gp!==null)?r.gp.toFixed(2):''
    ].join(','));
  });
  var t=qtTotals();
  rows.push(['','TOTAL','',''+t.units,'','','','','',t.val.toFixed(2),'',t.pr.toFixed(2),(t.gp!==null?t.gp.toFixed(2):'')].join(','));
  var blob=new Blob([rows.join('\r\n')],{type:'text/csv;charset=utf-8;'});
  var url=URL.createObjectURL(blob);
  var a=document.createElement('a');
  a.href=url;a.download='quote-'+new Date().toISOString().slice(0,10)+'.csv';
  document.body.appendChild(a);a.click();
  setTimeout(function(){document.body.removeChild(a);URL.revokeObjectURL(url)},200);
}
/**
 * Build the plain-text quote for copying.
 * @returns {string|null} null when the quote is empty
 */
function getQuoteText(){
  if(QUOTE.length===0)return null;
  var g=Math.round(G*100),t=qtTotals();
  var lines=['QUOTE — '+now(),'─────────────────────────','GST Rate: '+g+'%',''];
  QUOTE.forEach(function(L,i){
    var r=qtCalcLine(L);
    if(!r)return;
    lines.push((i+1)+'. '+(L.desc||'(no description)'));
    lines.push('   MRP '+INR(parseFloat(L.mrp))+' × '+r.qty
      +'  |  SP '+INR(r.spI)+' incl GST');
    lines.push('   Line value '+INR(r.lineVal)+'  |  Profit '+INR(r.linePr)+'  |  GP '+PCT(r.gp));
  });
  lines.push('');
  lines.push('─────────────────────────');
  lines.push('Lines:        '+t.lines);
  lines.push('Units:        '+t.units);
  lines.push('Order value:  '+INR(t.val));
  lines.push('Total profit: '+INR(t.pr));
  lines.push('Blended GP:   '+PCT(t.gp));
  return lines.join('\n');
}
/**
 * Copy the quote text to the clipboard.
 */
function qtCopy(){
  var txt=getQuoteText();
  if(!txt){toast('Nothing to copy');return}
  function done(){toast('Quote copied')}
  if(navigator.clipboard&&navigator.clipboard.writeText){
    navigator.clipboard.writeText(txt).then(done,function(){fallbackCopyQuote(txt,done)});
  } else fallbackCopyQuote(txt,done);
}
/**
 * Clipboard fallback via a hidden textarea, for browsers without the async API.
 * @param {string} txt
 * @param {Function} done success callback
 */
function fallbackCopyQuote(txt,done){
  try{
    var ta=document.createElement('textarea');
    ta.value=txt;ta.style.position='fixed';ta.style.opacity='0';
    document.body.appendChild(ta);ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    done();
  }catch(e){
    logError('clipboard copy failed (execCommand fallback)',e);
    toast('Copy failed');
  }
}

/* Rotating a phone or resizing a window can cross the table/card threshold.
   Re-render the open quote so the layout matches, and refresh the sticky result
   bar since it only applies below 800px. */
var _qtResizeTimer=null,_qtWasMobile=null;
window.addEventListener('resize',function(){
  clearTimeout(_qtResizeTimer);
  _qtResizeTimer=setTimeout(function(){
    var nowMobile=qtIsMobile();
    if(nowMobile!==_qtWasMobile){
      _qtWasMobile=nowMobile;
      var ov=el('overlay-quote');
      if(ov&&ov.classList.contains('open'))qtRender();
    }
  },150);
});

/* ── Share as link ── */
function getShareState(){
  var inc={},spinc={};
  INC_KEYS.forEach(function(k){
    var cb=document.getElementById('it-'+k),iv=document.getElementById('iv-'+k);
    inc[k]={on:cb?cb.checked:false,v:iv?iv.value:''};
  });
  SP_INC_KEYS.forEach(function(k){
    var cb=document.getElementById('sit-'+k),iv=document.getElementById('siv-'+k);
    spinc[k]={on:cb?cb.checked:false,v:iv?iv.value:''};
  });
  return{
    m:el('mrp').value,
    g:G*100,
    t:T,
    cm:CM,cpms:CPMS,cpd:el('cpd').value,cpv:el('cpv').value,
    sm:SM,spms:SPMS,spd:el('spd').value,spv:el('spv').value,
    pm:PM,pri:el('pri').value,
    cdm:CDM,scm:SCM,scdm:SCDM,sscm:SSCM,incm:INC_MODE,spincm:SP_INC_MODE,
    qty:el('qty')?el('qty').value:'1',rnd:ROUND_MODE,
    fgp:el('floor-gp').value,fmg:el('floor-mg').value,
    inc:inc,spinc:spinc
  };
}

/**
 * Apply a state object from a share link or localStorage.
 * Each field is applied independently so one bad value can't block the rest.
 * @param {Object} s state object from getShareState
 */
function applyShareState(s){
  try{
    if(s.rnd)setRounding(s.rnd);
    if(s.qty!==undefined&&el('qty'))el('qty').value=s.qty;
    if(s.g)setGST(parseFloat(s.g));
    if(s.m)el('mrp').value=s.m;
    if(s.cm)setCM(s.cm);
    if(s.cpms)setCPManual(s.cpms);
    if(s.cpd!==undefined)el('cpd').value=s.cpd;
    if(s.cpv!==undefined)el('cpv').value=s.cpv;
    if(s.sm)setSM(s.sm);
    if(s.spms)setSPManual(s.spms);
    if(s.spd!==undefined)el('spd').value=s.spd;
    if(s.spv!==undefined)el('spv').value=s.spv;
    if(s.pm)setPM(s.pm);
    if(s.pri!==undefined)el('pri').value=s.pri;
    if(s.cdm)setCDMode(s.cdm);
    if(s.scm)setSchemeMode(s.scm);
    if(s.fgp!==undefined)el('floor-gp').value=s.fgp;
    if(s.fmg!==undefined)el('floor-mg').value=s.fmg;
    if(s.inc){
      INC_KEYS.forEach(function(k){
        if(!s.inc[k])return;
        var cb=document.getElementById('it-'+k),iv=document.getElementById('iv-'+k);
        if(cb)cb.checked=!!s.inc[k].on;
        if(iv)iv.value=s.inc[k].v||'';
        syncToggle(k);
      });
    }
    if(s.spinc){
      SP_INC_KEYS.forEach(function(k){
        if(!s.spinc[k])return;
        var cb=document.getElementById('sit-'+k),iv=document.getElementById('siv-'+k);
        if(cb)cb.checked=!!s.spinc[k].on;
        if(iv)iv.value=s.spinc[k].v||'';
        syncSpToggle(k);
      });
    }
    if(s.scdm)setSCDMode(s.scdm);
    if(s.sscm)setSpSchemeMode(s.sscm);
    if(s.incm){INC_MODE=s.incm;INC_KEYS.forEach(function(k){if(isCustomInc(k))applyIncModeVisuals('cp',k)});}
    if(s.spincm){SP_INC_MODE=s.spincm;SP_INC_KEYS.forEach(function(k){if(isCustomInc(k))applyIncModeVisuals('sp',k)});}
    if(s.t)setT(s.t);
    calc();
  }catch(e){ logError('could not apply shared/saved state — some fields may be unset',e) }
}

/**
 * Share the current calculation as a URL, via the native share sheet on mobile
 * or the clipboard elsewhere.
 */
function shareLink(){
  var state=getShareState();
  var encoded;
  try{encoded=btoa(unescape(encodeURIComponent(JSON.stringify(state))))}
  catch(e){
    // Unicode in a description can break btoa's Latin-1 assumption; retry raw.
    logWarn('unicode-safe share encoding failed, retrying plain',e);
    encoded=btoa(JSON.stringify(state));
  }
  var url=location.href.split('?')[0].split('#')[0]+'?s='+encoded;

  // Use Web Share API on mobile if available
  if(navigator.share&&window.innerWidth<=800){
    navigator.share({title:'Pricing Calculation — Sterling Spares',url:url})
      .catch(function(e){
        // Includes the user simply dismissing the sheet, hence warn not error.
        logWarn('Web Share dismissed or unavailable, copying instead',e);
        copyUrl(url);
      });
    return;
  }
  copyUrl(url);
}

/**
 * Copy a URL to the clipboard, prompting the user if that fails.
 * @param {string} url
 */
function copyUrl(url){
  navigator.clipboard.writeText(url).then(function(){
    var btn=el('share-btn');
    if(!btn)return;
    var orig=btn.innerHTML;
    btn.textContent='✓ Copied!';
    setTimeout(function(){btn.innerHTML=orig},2000);
  }).catch(function(e){
    logWarn('clipboard write failed, prompting user to copy manually',e);
    prompt('Copy this link:',url);
  });
}

/**
 * Apply state from the ?s= parameter if present and decodable.
 * @returns {boolean} true if state was applied
 */
function restoreFromUrl(){
  try{
    var params=new URLSearchParams(location.search);
    var s=params.get('s');
    if(!s)return false;
    var decoded=JSON.parse(decodeURIComponent(escape(atob(s))));
    applyShareState(decoded);
    // Show a subtle banner
    showRestoreBanner();
    return true;
  }catch(e){
    // A truncated or hand-edited ?s= param lands here; fall through to
    // localStorage rather than showing the user a broken calculator.
    logWarn('could not decode shared state from the URL (?s=); ignoring it',e);
    return false;
  }
}

/**
 * Briefly confirm that a shared calculation was loaded.
 */
function showRestoreBanner(){
  var b=document.createElement('div');
  b.style.cssText='position:fixed;top:64px;left:50%;transform:translateX(-50%);background:var(--blue);color:#fff;font-family:var(--font,sans-serif);font-size:12px;padding:7px 16px;border-radius:20px;z-index:400;box-shadow:0 2px 12px rgba(0,0,0,0.2);white-space:nowrap;pointer-events:none';
  b.textContent='Shared calculation loaded';
  document.body.appendChild(b);
  setTimeout(function(){
    b.style.transition='opacity .4s';b.style.opacity='0';
    setTimeout(function(){b.remove()},500);
  },2500);
}

/* ── Service Worker & PWA ── */
function registerSW(){
  if(!('serviceWorker' in navigator))return;
  navigator.serviceWorker.register('./sw.js').then(function(reg){
    reg.addEventListener('updatefound',function(){
      var nw=reg.installing;
      nw.addEventListener('statechange',function(){
        if(nw.state==='installed'&&navigator.serviceWorker.controller){
          showUpdateBanner();
        }
      });
    });
  }).catch(function(e){ logWarn('service worker registration skipped — offline mode unavailable',e) });
}

/**
 * Tell the user a new version is cached and offer a reload.
 */
function showUpdateBanner(){
  var b=document.createElement('div');
  b.style.cssText='position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:var(--accent);color:#fff;font-family:sans-serif;font-size:12px;padding:8px 18px;border-radius:20px;z-index:400;box-shadow:0 2px 12px rgba(0,0,0,0.3);cursor:pointer;white-space:nowrap';
  b.innerHTML='Update available — tap to reload';
  b.onclick=function(){location.reload()};
  document.body.appendChild(b);
}

/* ── Keyboard Shortcuts ── */
document.addEventListener('keydown',function(e){
  // Ignore if typing in an input/textarea
  var tag=document.activeElement&&document.activeElement.tagName;
  var inInput=(tag==='INPUT'||tag==='TEXTAREA'||document.activeElement.isContentEditable);

  // Escape closes onboarding
  if(e.key==='Escape'){
    if(el('ob-overlay')&&el('ob-overlay').classList.contains('show')){obSkip();return}
  }

  // "?" always opens shortcuts (even in input, but we use shift+/)
  if(e.key==='?'&&!inInput){openModal('shortcuts');return}

  // Undo/redo work even while typing — matches how every other app behaves
  if((e.metaKey||e.ctrlKey)&&(e.key==='z'||e.key==='Z')){
    e.preventDefault();
    if(e.shiftKey)redo();else undo();
    return;
  }

  if(inInput)return; // all others require no active input

  // Quick mode arrow keys already handled in keyboard nav block; apply defaults only
  if(APP_MODE==='quick'){
    // Quick mode keys handled separately
    return;
  }

  switch(e.key){
    case '?': openModal('shortcuts'); break;
    case 's': case 'S':
      if(e.metaKey||e.ctrlKey){e.preventDefault();saveToHistory();}
      else openModal('settings');
      break;
    case 'r': case 'R': if(!e.metaKey&&!e.ctrlKey)resetAll(); break;
    case 'c': case 'C':
      if(e.metaKey||e.ctrlKey){/* let browser copy */}
      break;
    case 'q': case 'Q': setMode(APP_MODE==='default'?'quick':'default'); break;
    case 'm': case 'M': openModal('quote'); break;
    case '1': setGST(18); break;
    case '2': setGST(5); break;
    case 'p': case 'P': setT('profit'); break;
    case 'l': case 'L': setT('sp'); break;
    case 'k': case 'K': setT('cp'); break;
  }
});

/* ── Onboarding ── */
var OB_STEPS=[
  {icon:'₹',iconBg:'#1a191614',title:'Welcome to Pricing Calc',body:'A fast calculator for MRP-based pricing with GST, incentives, and margin analysis — built for Sterling Spares.',tip:'This tour takes about 30 seconds.'},
  {icon:'📊',iconBg:'var(--blue-bg)',title:'Default Mode',body:'Enter MRP, Cost Price disc%, and Selling Price disc%. The calculator shows GP%, Margin%, CP incl/excl GST, and flags if prices exceed MRP.',tip:'Use the <b>Calculate</b> bar to solve for Profit, SP, or CP.'},
  {icon:'⚡',iconBg:'var(--green-bg)',title:'Quick / Flashcard Mode',body:'Tap <b>Quick</b> in the header for a swipeable card-by-card flow. Enter MRP → CP → SP and get an instant summary. Works like Tinder — swipe left to advance.',tip:'On desktop, use Enter or arrow keys to navigate.'},
  {icon:'🎯',iconBg:'var(--amber-bg)',title:'Incentives',body:'CD, Early Bird, Quarterly, Annual, and Scheme incentives all reduce effective CP. Toggle them on with the Incentives panel — they feed into profit and margin automatically.',tip:'CD can be calculated on CP excl or incl GST.'},
  {icon:'📈',iconBg:'var(--surface2)',title:'Summary &amp; What-If',body:'The Summary bar shows all key metrics at a glance. The <b>What-if</b> button lets you compare three SP scenarios side-by-side to find the best margin.',tip:'History auto-saves calculations. Use <b>Compare</b> to diff two entries.'},
  {icon:'⌨️',iconBg:'var(--surface2)',title:'Shortcuts &amp; Settings',body:'Press <b>?</b> anytime to see keyboard shortcuts. Settings lets you set floor limits for GP% and Margin%, toggle dark mode, and control auto-save.',tip:'Press Q to toggle between Default and Quick mode instantly.'},
];
var OB_STEP=0;

/**
 * Start the onboarding walkthrough.
 */
function obShow(){
  OB_STEP=0;
  el('ob-overlay').classList.add('show');
  obRender();
}
/**
 * Dismiss onboarding and remember that it was seen.
 */
function obSkip(){
  el('ob-overlay').classList.remove('show');
  localStorage.setItem('ob-done','1');
}
/**
 * Advance onboarding, finishing after the last step.
 */
function obNext(){
  OB_STEP++;
  if(OB_STEP>=OB_STEPS.length){obSkip();return}
  obRender();
}
/**
 * Draw the current onboarding step.
 */
function obRender(){
  var s=OB_STEPS[OB_STEP];
  // dots
  var dots='';
  for(var i=0;i<OB_STEPS.length;i++)dots+='<button type="button" class="ob-dot'+(i===OB_STEP?' cur':'')+'" onclick="OB_STEP='+i+';obRender()" aria-label="Go to step '+(i+1)+'"'+(i===OB_STEP?' aria-current="step"':'')+'></button>';
  el('ob-dots').innerHTML=dots;
  // icon
  var icon=el('ob-icon');
  icon.style.background=s.iconBg;
  icon.innerHTML=s.icon.length===1&&s.icon.charCodeAt(0)<256
    ?'<span style="font-family:\'Syne\',sans-serif;font-size:24px;font-weight:700;color:var(--text)">'+s.icon+'</span>'
    :'<span>'+s.icon+'</span>';
  el('ob-title').innerHTML=s.title;
  el('ob-body').innerHTML=s.body;
  var tip=el('ob-tip');
  if(s.tip){tip.innerHTML=s.tip;tip.style.display=''}else{tip.style.display='none'}
  el('ob-next').textContent=OB_STEP===OB_STEPS.length-1?'Get started →':'Next →';
  el('ob-skip').textContent=OB_STEP===0?'Skip tour':'Back';
  // animate card
  var card=el('ob-card');
  card.style.animation='none';
  requestAnimationFrame(function(){card.style.animation='popIn .25s ease'});
}

/* ── Init ── */
initTheme();
loadLabels();
renderCPIncRows();
renderSPIncRows();
loadHistoryFromStorage();
loadQuote();
document.querySelectorAll('.kbd-mod').forEach(function(el){el.textContent=MOD_KEY;});
updateLayout();
if(!restoreFromUrl()){
  if(!loadCalcState()) calc();
}
updateGSTLabels();
updateUndoBtns();
updateFabVisibility();
registerSW();
// Show onboarding on first visit
setTimeout(function(){
  if(!localStorage.getItem('ob-done'))obShow();
},600);
