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

/* ── HTML escaping ──
   Several renderers build markup as strings. Escaping was previously open-coded
   at each site with slightly different character sets, and two of those sites
   missed it entirely (incentive keys, and the history time/GST fields), which
   was exploitable by anyone able to write to localStorage. One helper now covers
   every case; use it for anything interpolated into markup, in text or attribute
   position. */
var _ESC_MAP={'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'};
/**
 * Escape a value for safe interpolation into an HTML string.
 * @param {*} v any value; null/undefined become ''
 * @returns {string}
 */
function escHtml(v){
  return String(v==null?'':v).replace(/[&<>"']/g,function(c){return _ESC_MAP[c]});
}
/**
 * Whether an incentive key is safe to interpolate into element ids and inline
 * handlers. Generated keys are 'c1', 'c2', …; anything else came from storage
 * and is not trusted.
 * @param {*} k
 * @returns {boolean}
 */
function isValidIncKey(k){
  return typeof k==='string'&&/^[A-Za-z0-9_-]{1,24}$/.test(k);
}


/* ── Delegated actions ──────────────────────────────────────────────────────
   The markup used ~158 inline on* attributes. Those force
   `script-src 'unsafe-inline'`, which defeats most of what a CSP can do: an
   injected <script> or handler would run. Each one is now a `data-click`
   (or data-input / data-change) naming an entry in this registry, dispatched
   by the delegated listeners below.

   Handlers receive (self, event): `self` is the element the attribute was on,
   matching what `this` referred to before.

   These bodies are mechanically converted from the original attributes, so
   behaviour is unchanged.
   ─────────────────────────────────────────────────────────────────────────── */
var ACT = {};

ACT.a0 = function(self, event){ setModeAnimated('default') };
ACT.a1 = function(self, event){ setModeAnimated('quick') };
ACT.a2 = function(self, event){ shareLink() };
ACT.a3 = function(self, event){ saveToHistory() };
ACT.a4 = function(self, event){ copyToClipboard() };
ACT.a5 = function(self, event){ exportPDF() };
ACT.a6 = function(self, event){ openModal('quote') };
ACT.a7 = function(self, event){ undo() };
ACT.a8 = function(self, event){ redo() };
ACT.a9 = function(self, event){ openModal('shortcuts') };
ACT.a10 = function(self, event){ openModal('settings') };
ACT.a11 = function(self, event){ toggleHMenu() };
ACT.a12 = function(self, event){ shareLink();closeHMenu() };
ACT.a13 = function(self, event){ saveToHistory();closeHMenu() };
ACT.a14 = function(self, event){ copyToClipboard();closeHMenu() };
ACT.a15 = function(self, event){ exportPDF();closeHMenu() };
ACT.a16 = function(self, event){ openModal('quote');closeHMenu() };
ACT.a17 = function(self, event){ undo();closeHMenu() };
ACT.a18 = function(self, event){ sendWhatsApp();closeHMenu() };
ACT.a19 = function(self, event){ sendEmail();closeHMenu() };
ACT.a20 = function(self, event){ openModal('settings');closeHMenu() };
ACT.a21 = function(self, event){ localStorage.removeItem('ob-done');closeHMenu();setTimeout(obShow,200) };
ACT.a22 = function(self, event){ setGST(18) };
ACT.a23 = function(self, event){ setGST(5) };
ACT.a24 = function(self, event){ onCustomGST(self) };
ACT.a25 = function(self, event){ setT('profit') };
ACT.a26 = function(self, event){ setT('sp') };
ACT.a27 = function(self, event){ setT('cp') };
ACT.a28 = function(self, event){ resetAll() };
ACT.a29 = function(self, event){ onMrpInput(self) };
ACT.a30 = function(self, event){ nextFrom('mrp') };
ACT.a31 = function(self, event){ stepQty(-1) };
ACT.a32 = function(self, event){ calc();debouncedSaveCalcState() };
ACT.qtyBlur = function(){ normalizeQty(); };
ACT.a33 = function(self, event){ stepQty(1) };
ACT.a34 = function(self, event){ setCM('excl') };
ACT.a35 = function(self, event){ setCM('incl') };
ACT.a36 = function(self, event){ setCM('manual') };
ACT.a37 = function(self, event){ calc() };
ACT.a38 = function(self, event){ nextFrom('cpd') };
ACT.a39 = function(self, event){ setCPManual('incl') };
ACT.a40 = function(self, event){ setCPManual('excl') };
ACT.a41 = function(self, event){ onAmtInput(self) };
ACT.a42 = function(self, event){ nextFrom('cpv') };
ACT.a43 = function(self, event){ toggleAcc('cp') };
ACT.a44 = function(self, event){ setSM('excl') };
ACT.a45 = function(self, event){ setSM('incl') };
ACT.a46 = function(self, event){ setSM('manual') };
ACT.a47 = function(self, event){ nextFrom('spd') };
ACT.a48 = function(self, event){ setSPManual('incl') };
ACT.a49 = function(self, event){ setSPManual('excl') };
ACT.a50 = function(self, event){ nextFrom('spv') };
ACT.a51 = function(self, event){ toggleAcc('sp') };
ACT.a52 = function(self, event){ setPM('val') };
ACT.a53 = function(self, event){ setPM('gp') };
ACT.a54 = function(self, event){ setPM('margin') };
ACT.a55 = function(self, event){ togglePanel('inc') };
ACT.a56 = function(self, event){ toggleIncEditMode('cp') };
ACT.a57 = function(self, event){ addInc('cp') };
ACT.a58 = function(self, event){ togglePanel('sp-inc') };
ACT.a59 = function(self, event){ toggleIncEditMode('sp') };
ACT.a60 = function(self, event){ addInc('sp') };
ACT.a61 = function(self, event){ openModal('whatif') };
ACT.a62 = function(self, event){ togglePanel('hist') };
ACT.a63 = function(self, event){ setHistQuery(self.value) };
ACT.a64 = function(self, event){ setHistFilter('all') };
ACT.a65 = function(self, event){ setHistFilter('pos') };
ACT.a66 = function(self, event){ setHistFilter('neg') };
ACT.a67 = function(self, event){ setHistFilter('below') };
ACT.a68 = function(self, event){ setHistFilter('tagged') };
ACT.a69 = function(self, event){ syncAutosave(self) };
ACT.a70 = function(self, event){ exportHistoryCSV() };
ACT.a71 = function(self, event){ clearHistory() };
ACT.a72 = function(self, event){ onMrpInput(self);wzCalc() };
ACT.a73 = function(self, event){ wzSetGST(18) };
ACT.a74 = function(self, event){ wzSetGST(5) };
ACT.a75 = function(self, event){ wzSetT('cp') };
ACT.a76 = function(self, event){ wzSetT('sp') };
ACT.a77 = function(self, event){ wzSetCM('excl') };
ACT.a78 = function(self, event){ wzSetCM('incl') };
ACT.a79 = function(self, event){ wzSetCM('manual') };
ACT.a80 = function(self, event){ wzCalc() };
ACT.a81 = function(self, event){ wzSetMS('incl') };
ACT.a82 = function(self, event){ wzSetMS('excl') };
ACT.a83 = function(self, event){ wzFmtAmt(self);wzCalc() };
ACT.a84 = function(self, event){ wzSyncCD() };
ACT.a85 = function(self, event){ wzSetCDMode('before') };
ACT.a86 = function(self, event){ wzSetCDMode('after') };
ACT.a87 = function(self, event){ wzSyncSc() };
ACT.a88 = function(self, event){ wzSetScMode('pct') };
ACT.a89 = function(self, event){ wzSetScMode('abs') };
ACT.a90 = function(self, event){ wzReset() };
ACT.a91 = function(self, event){ wzToDefault() };
ACT.a92 = function(self, event){ fcSetT('profit') };
ACT.a93 = function(self, event){ fcSetT('sp') };
ACT.a94 = function(self, event){ fcSetT('cp') };
ACT.a95 = function(self, event){ onMrpInput(self);fcCalc() };
ACT.a96 = function(self, event){ fcSetGST(18) };
ACT.a97 = function(self, event){ fcSetGST(5) };
ACT.a98 = function(self, event){ fcNext() };
ACT.a99 = function(self, event){ bnavGo('calc') };
ACT.a100 = function(self, event){ bnavGo('inc') };
ACT.a101 = function(self, event){ bnavGo('summary') };
ACT.a102 = function(self, event){ bnavGo('hist') };
ACT.a103 = function(self, event){ overlayClick(event,'settings') };
ACT.a104 = function(self, event){ closeModal('settings') };
ACT.a105 = function(self, event){ toggleDarkMode(self.checked) };
ACT.a106 = function(self, event){ calc();saveCalcState() };
ACT.a107 = function(self, event){ setRounding('off') };
ACT.a108 = function(self, event){ setRounding('1') };
ACT.a109 = function(self, event){ setRounding('5') };
ACT.a110 = function(self, event){ onCustomRounding(self) };
ACT.a111 = function(self, event){ syncAutosave('settings') };
ACT.a112 = function(self, event){ localStorage.removeItem('ob-done');closeModal('settings');setTimeout(obShow,200) };
ACT.a113 = function(self, event){ closeModal('settings');setTimeout(function(){openModal('shortcuts')},200) };
ACT.a114 = function(self, event){ overlayClick(event,'whatif') };
ACT.a115 = function(self, event){ closeModal('whatif') };
ACT.a116 = function(self, event){ overlayClick(event,'compare') };
ACT.a117 = function(self, event){ closeModal('compare') };
ACT.a118 = function(self, event){ overlayClick(event,'shortcuts') };
ACT.a119 = function(self, event){ closeModal('shortcuts') };
ACT.a120 = function(self, event){ overlayClick(event,'quote') };
ACT.a121 = function(self, event){ closeModal('quote') };
ACT.a122 = function(self, event){ qtAddLine() };
ACT.a123 = function(self, event){ qtAddFromCalc() };
ACT.a124 = function(self, event){ qtExportCSV() };
ACT.a125 = function(self, event){ qtCopy() };
ACT.a126 = function(self, event){ qtClear() };
ACT.a127 = function(self, event){ overlayClick(event,'confirm') };
ACT.a128 = function(self, event){ closeConfirm() };
ACT.a129 = function(self, event){ runConfirm() };
ACT.a130 = function(self, event){ closeFab() };
ACT.a131 = function(self, event){ fabRun(saveToHistory) };
ACT.a132 = function(self, event){ fabRun(copyToClipboard) };
ACT.a133 = function(self, event){ fabRun(sendWhatsApp) };
ACT.a134 = function(self, event){ fabRun(shareLink) };
ACT.a135 = function(self, event){ fabRun(sendEmail) };
ACT.a136 = function(self, event){ fabRun(exportPDF) };
ACT.a137 = function(self, event){ toggleFab() };
ACT.a138 = function(self, event){ // Onboarding backdrop: dismiss only when the click landed on the overlay itself.
  if(event.target===self)obSkip(); };
ACT.a139 = function(self, event){ OB_STEP===0?obSkip():(OB_STEP--,obRender()) };
ACT.a140 = function(self, event){ obNext() };

/**
 * Register a delegated listener for one event type.
 * `closest` means only the nearest matching ancestor fires, so nested targets
 * behave like the old direct-attribute binding without needing
 * stopPropagation.
 * @param {string} evt DOM event name
 * @param {boolean} [capture] use capture — required for focus/blur, which do not bubble
 */
function delegate(evt, capture){
  document.addEventListener(evt, function(e){
    var node = e.target && e.target.closest ? e.target.closest('[data-' + evt + ']') : null;
    if(!node) return;
    var fn = ACT[node.getAttribute('data-' + evt)];
    if(!fn){ logWarn('no handler registered for data-' + evt + '="' + node.getAttribute('data-' + evt) + '"'); return; }
    guard('handler ' + node.getAttribute('data-' + evt), function(){ fn(node, e); });
  }, !!capture);
}
['click','change','input','keydown'].forEach(function(evt){ delegate(evt); });
// focus/blur do not bubble, so they are delegated in the capture phase.
delegate('focus', true);
delegate('blur', true);


/* ── Parameterised delegated actions ────────────────────────────────────────
   Rows, cards and dialogs are built as HTML strings, so their handlers were
   inline attributes too. They take arguments (a row key, a line index), which
   travel in data-p / data-q / data-r rather than being baked into code.
   ─────────────────────────────────────────────────────────────────────────── */
/** Read the positional params off an element carrying a delegated action. */
function actParams(el){
  return [el.getAttribute('data-p'), el.getAttribute('data-q'), el.getAttribute('data-r')];
}
ACT.incToggle   = function(self){ var p=actParams(self); (p[0]==='cp'?syncToggle:syncSpToggle)(p[1]); calc(); };
ACT.incDelete   = function(self){ var p=actParams(self); deleteInc(p[0], p[1]); };
ACT.incMode     = function(self){ var p=actParams(self); setIncMode(p[0], p[1], p[2]); };
ACT.incRename   = function(self){ var k=self.getAttribute('data-p');
                                  INC_LABELS[k]=self.value.trim()||INC_LABELS_DEFAULT[k]; saveLabels(); };
ACT.calc        = function(){ calc(); };
ACT.saveState   = function(){ saveCalcState(); };
ACT.cdMode      = function(self){ var p=actParams(self); (p[0]==='cp'?setCDMode:setSCDMode)(p[1]); };
ACT.schemeMode  = function(self){ var p=actParams(self); (p[0]==='cp'?setSchemeMode:setSpSchemeMode)(p[1]); };
ACT.histDelete  = function(self){ deleteHistEntry(+self.getAttribute('data-p')); };
ACT.histCompare = function(self){ openCompare(+self.getAttribute('data-p')); };
ACT.histTagEdit = function(self){ startTagEdit(+self.getAttribute('data-p')); };
ACT.histTagSave = function(self){ commitTag(+self.getAttribute('data-p'), self.value); };
ACT.qtDelLine   = function(self){ qtDelLine(+self.getAttribute('data-p')); };
ACT.qtSet       = function(self){ qtSet(+self.getAttribute('data-p'), self.getAttribute('data-q'), self.value); };
ACT.undoQuote   = function(){ pushUndo('edit quote line'); };
ACT.undoRename  = function(){ pushUndo('rename incentive'); };
ACT.histMore    = function(){ histShowMore(); };
ACT.obGoto      = function(self){ OB_STEP=+self.getAttribute('data-p'); obRender(); };
ACT.fcNext      = function(){ fcNext(); };
ACT.fcBack      = function(){ fcBack(); };
ACT.fcReset     = function(){ fcReset(); };
ACT.fcToDefault = function(){ fcToDefault(); };

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
/* Rendering all 50 entries cost ~90ms on a throttled phone and runs on every
   save. Only the first page is built; the rest is one click away. */
var HIST_PAGE=20,HIST_SHOWN=HIST_PAGE;
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
 * Format a number with thousands grouping (1,000,000.00) — the convention
 * everywhere outside the subcontinent, and what non-rupee amounts use.
 * Only reached when Intl is unavailable; Intl handles it otherwise.
 * @param {number} n
 * @returns {string} grouped number, or '' when n is not finite
 */
function fmtWESTERN(n){
  if(isNaN(n)||n===null)return '';
  var parts=n.toFixed(2).split('.');
  return parts[0].replace(/\B(?=(\d{3})+(?!\d))/g,',')+'.'+parts[1];
}
/**
 * Read the MRP field as a number, stripping the display commas.
 * @returns {number} MRP incl GST, 0 when blank or unparseable
 */
function parseMRP(){
  var raw=el('mrp').value.replace(/,/g,'');
  var v=parseFloat(raw)||0;
  var r=fromDisplay(v,'base');
  return (r===null)?0:r;
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
function parseAmt(id,side){
  var e=el(id);if(!e)return NaN;
  var v=parseFloat(e.value.replace(/,/g,''));
  if(isNaN(v))return NaN;
  // These fields carry a currency symbol, so their contents are in that
  // currency. cpv is cost-side, spv and pri are sale-side.
  var r=fromDisplay(v,side||AMT_SIDE[id]||'base');
  return (r===null)?NaN:r;
}
/** Which side of the deal each amount field belongs to. */
var AMT_SIDE={cpv:'cost',spv:'sale',pri:'sale',mrp:'base'};
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
/**
 * getElementById, kept short because it is called ~104 times per calc().
 *
 * This used to memoise into an _elCache object, which made every innerHTML
 * rewrite a correctness hazard: the rebuilt nodes reuse their ids, so cached
 * references silently went stale and writes landed on detached nodes that were
 * no longer in the document. renderWhatIf shipped exactly that bug — its grid
 * was rebuilt with identical ids, so every re-open of the dialog showed '—'.
 * The fix was an elClearCache() call after each rebuild, i.e. a rule every
 * future caller had to know; 41 innerHTML sites had no such call.
 *
 * Measured before removing it (Chromium, 2.3M lookups, medians, arm order
 * alternated), nanoseconds per lookup:
 *
 *     memoised                 16.1
 *     memoised + isConnected   40.7     validating costs what the lookup costs
 *     plain getElementById     40.1
 *
 * So the cache was worth 24ns a lookup, about 2.5 microseconds per calc() —
 * unmeasurable against a 16ms frame — and self-validating it gave all of that
 * back. Removing it outright is the same speed as validating and deletes the
 * bug class rather than guarding it.
 *
 * @param {string} id
 * @returns {HTMLElement|null}
 */
function el(id){return document.getElementById(id)}
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
/* ── Currency ───────────────────────────────────────────────────────────────
   Everything is entered, stored and calculated in rupees. MRP is an Indian
   legal construct and the incentive structure is quoted against it, so making
   the base anything else would mean converting on the way in and back out again
   for no gain. The display currency converts only what is shown — which is why
   this lives inside INR() and nowhere else. All 77 call sites follow from it.

   Grouping follows the currency, not the app: rupees group Indian-style
   (12,34,567.89) and everything else groups in thousands (1,234,567.89), which
   is what en-US gives for any currency code.
   ─────────────────────────────────────────────────────────────────────────── */
var CURRENCIES=[
  {c:'INR',s:'₹',  n:'Indian Rupee'},
  {c:'USD',s:'$',  n:'US Dollar'},
  {c:'EUR',s:'€',  n:'Euro'},
  {c:'GBP',s:'£',  n:'Pound Sterling'},
  {c:'AED',s:'AED ',n:'UAE Dirham'},
  {c:'SAR',s:'SAR ',n:'Saudi Riyal'},
  {c:'SGD',s:'S$', n:'Singapore Dollar'},
  {c:'MYR',s:'RM', n:'Malaysian Ringgit'},
  {c:'AUD',s:'A$', n:'Australian Dollar'},
  {c:'CAD',s:'C$', n:'Canadian Dollar'},
  {c:'JPY',s:'¥',  n:'Japanese Yen'},
  {c:'CNY',s:'CN¥',n:'Chinese Yuan'},
  {c:'ZAR',s:'R',  n:'South African Rand'},
  {c:'KES',s:'KSh',n:'Kenyan Shilling'},
  {c:'NGN',s:'₦',  n:'Nigerian Naira'},
  {c:'LKR',s:'LKR ',n:'Sri Lankan Rupee'},
  {c:'BDT',s:'৳',  n:'Bangladeshi Taka'},
  {c:'NPR',s:'NPR ',n:'Nepalese Rupee'},
  {c:'BRL',s:'R$', n:'Brazilian Real'},
  {c:'RUB',s:'₽',  n:'Russian Ruble'}
];
var CCY_CODES=CURRENCIES.map(function(x){return x.c});
var DISPLAY_CCY='INR';
/* rates are "units of that currency per 1 INR", matching the API's shape.
   src: 'live' when fetched, 'manual' when the user set one, null when unknown. */
var FX={rates:{INR:1},fetched:0,src:null,manual:{}};
var FX_URL='https://open.er-api.com/v6/latest/INR';
var FX_MAX_AGE=6*60*60*1000;      // treat rates older than this as worth refreshing
var _fxBusy=false;

/** @returns {Object} the CURRENCIES entry for a code, or the INR entry. */
function ccyInfo(c){
  for(var i=0;i<CURRENCIES.length;i++)if(CURRENCIES[i].c===c)return CURRENCIES[i];
  return CURRENCIES[0];
}
/**
 * Units of the display currency per rupee.
 * A manual override wins over a fetched rate — it is usually a contracted rate.
 * @param {string} [c] currency code, defaults to the display currency
 * @returns {number|null} null when no rate is known
 */
function fxRate(c){
  c=c||DISPLAY_CCY;
  if(c==='INR')return 1;
  if(FX.manual&&FX.manual[c]>0)return FX.manual[c];
  var r=FX.rates?FX.rates[c]:null;
  return (typeof r==='number'&&isFinite(r)&&r>0)?r:null;
}
/**
 * Convert a rupee amount into the display currency.
 * @param {number} inr
 * @returns {number|null} null when the rate is unknown, so callers show a dash
 *          rather than an unconverted rupee figure wearing a dollar sign
 */
function toDisplay(inr){
  if(inr===null||inr===undefined||isNaN(inr))return null;
  var r=fxRate();
  return r===null?null:inr*r;
}
/** Rupees per one unit of the display currency — the way a rate is quoted. */
function inrPerUnit(c){
  var r=fxRate(c);
  return (r===null||r===0)?null:1/r;
}

var _fmtCache={};
/**
 * One cached Intl.NumberFormat per currency. Building one per call was the
 * hottest function during load (77ms of self time) before it was cached.
 * @param {string} c currency code
 */
function _getFmt(c){
  if(_fmtCache[c])return _fmtCache[c];
  var loc=(c==='INR')?'en-IN':'en-US';
  try{
    _fmtCache[c]=new Intl.NumberFormat(loc,{minimumFractionDigits:2,maximumFractionDigits:2});
  }catch(e){
    logWarn('Intl.NumberFormat unavailable, falling back to manual grouping',e);
    _fmtCache[c]={format:function(v){return c==='INR'?fmtINDIAN(v):fmtWESTERN(v)}};
  }
  return _fmtCache[c];
}
/* ── Exchange rates ─────────────────────────────────────────────────────────
   open.er-api.com is free, needs no key (which matters: a key in a static app
   is public), sends access-control-allow-origin:*, and publishes once a day.
   It is the only external origin the app talks to, and the only entry in
   connect-src besides 'self'.

   Rates are never fetched on load. That would put a third-party request on the
   critical path of an offline-first app for a feature most sessions never use.
   They are fetched when you first switch to a foreign currency, or on demand,
   and cached in localStorage so a later offline session still has something to
   work from — clearly labelled with its age rather than passed off as current.
   ─────────────────────────────────────────────────────────────────────────── */
/** Persist the rate cache. */
function saveFx(){
  try{ localStorage.setItem('pc-fx',JSON.stringify({rates:FX.rates,fetched:FX.fetched,src:FX.src,manual:FX.manual})); }
  catch(e){ logError('could not save exchange rates (pc-fx)',e); }
}
/** Restore the rate cache, dropping anything that is not a positive number. */
function loadFx(){
  try{
    var raw=localStorage.getItem('pc-fx');
    if(!raw)return;
    var p=JSON.parse(raw);
    if(!p||typeof p!=='object')return;
    var clean={INR:1},manual={};
    if(p.rates&&typeof p.rates==='object'){
      CCY_CODES.forEach(function(c){
        var v=p.rates[c];
        if(typeof v==='number'&&isFinite(v)&&v>0)clean[c]=v;
      });
    }
    if(p.manual&&typeof p.manual==='object'){
      CCY_CODES.forEach(function(c){
        var v=p.manual[c];
        if(typeof v==='number'&&isFinite(v)&&v>0)manual[c]=v;
      });
    }
    FX.rates=clean;
    FX.manual=manual;
    FX.fetched=(typeof p.fetched==='number'&&p.fetched>0)?p.fetched:0;
    FX.src=(p.src==='live'||p.src==='manual')?p.src:null;
  }catch(e){ logWarn('could not read cached exchange rates (pc-fx); starting empty',e); }
}
/** How old the cached rates are, in ms, or null when there are none. */
function fxAge(){ return FX.fetched?(nowMs()-FX.fetched):null; }
/** Wall-clock now, isolated so tests can hold it still. */
function nowMs(){ return new Date().getTime(); }
/**
 * Human-readable age, e.g. '4h ago'.
 * @param {number} ms
 */
function fxAgeText(ms){
  if(ms===null)return 'never';
  var mins=Math.floor(ms/60000);
  if(mins<1)return 'just now';
  if(mins<60)return mins+'m ago';
  var hrs=Math.floor(mins/60);
  if(hrs<24)return hrs+'h ago';
  return Math.floor(hrs/24)+'d ago';
}
/** Fetch rates. The implementation is in the deferred bundle. */
function fetchRates(quiet){
  if(typeof _fetchRatesImpl==='function')return _fetchRatesImpl(quiet);
  withExtras(function(){ _fetchRatesImpl(quiet) });
  return Promise.resolve(false);
}
/** Apply a manual rate. Implementation is in the deferred bundle. */
function onFxManual(inp){
  if(typeof _onFxManualImpl==='function')return _onFxManualImpl(inp);
  withExtras(function(){ _onFxManualImpl(inp) });
}
/* Which side every symbol on screen belongs to. Kept as data rather than a
   run of if-statements so that adding a field is one line, and so the tests can
   walk it and assert that nothing shows the wrong symbol. */
var SYM_SIDES={
  'sym-mrp':'base','sym-cmm':'cost','sym-cpv':'cost','sym-landed':'cost',
  'sym-inc-tot':'cost','sym-s-inc':'cost',
  'sym-smm':'sale','sym-spv':'sale','sym-sp-landed':'sale','sym-pmv':'sale',
  'sym-sp-inc-tot':'sale','sym-s-spinc':'sale','sym-s-pr':'sale','sym-s-tpr':'sale'
};
/** Fields whose typed value is an amount, and the side it is quoted in. */
var MONEY_FIELDS=[
  {id:'cpv',side:'cost'},{id:'spv',side:'sale'},
  {id:'pri',side:'sale'},{id:'landed',side:'cost'},{id:'sp-landed',side:'sale'}
];
/**
 * Put the right symbol on every label, prefix and unit.
 * The landed-cost fields keep their +/− prefix: direction is not carried by
 * colour alone, and that still has to hold in another currency.
 */
function refreshCurrencySymbols(){
  Object.keys(SYM_SIDES).forEach(function(id){
    var e=el(id);if(!e)return;
    var sym=symFor(SYM_SIDES[id]);
    if(id==='sym-landed')e.textContent='+'+sym;
    else if(id==='sym-sp-landed')e.textContent='−'+sym;
    else e.textContent=sym;
  });
  // Rounding rounds the sticker price, so its chips follow the sale side.
  var rs=document.querySelectorAll('.sym-rnd');
  for(var i=0;i<rs.length;i++)rs[i].textContent=symFor('sale');
  // Profit-mode unit, and the incentive rows' own % / amount units.
  var pru=el('pru');if(pru&&PM==='val')pru.textContent=symFor('sale');
  INC_KEYS.forEach(function(k){ applyIncModeVisuals('cp',k) });
  SP_INC_KEYS.forEach(function(k){ applyIncModeVisuals('sp',k) });
  if(INC_KEYS.indexOf('sc')!==-1)   { var su=el('sc-unit');  if(su&&SCM==='abs') su.textContent=symFor('cost'); }
  if(SP_INC_KEYS.indexOf('sc')!==-1){ var ssu=el('ssc-unit');if(ssu&&SSCM==='abs')ssu.textContent=symFor('sale'); }
}
/**
 * Rewrite what is in the amount fields so it reads in the new currency.
 *
 * The stored value is rupees; the field shows a currency. When that currency
 * changes the number has to move with it, or a field that said 1000 rupees
 * would silently start claiming 1000 dollars.
 *
 * @param {Object} prev map of field id -> rupee value captured before the switch
 */
function repriceInputs(prev){
  MONEY_FIELDS.forEach(function(f){
    var e=el(f.id);
    if(!e||prev[f.id]===null||prev[f.id]===undefined)return;
    var v=forDisplay(prev[f.id],f.side);
    if(v===null){e.value='';return}
    // Rupee amounts are whole more often than not; foreign ones need decimals.
    e.value=isForeign(f.side)?String(+v.toFixed(4)):String(+v.toFixed(2));
  });
  var rc=el('rnd-custom');
  if(rc&&prev._rnd!==null&&prev._rnd!==undefined){
    var rv=forDisplay(prev._rnd,'sale');
    if(rv!==null){
      rc.value=String(+rv.toFixed(4));
      if(isCustomRounding())ROUND_MODE=rc.value;
    }
  }
  ['cp','sp'].forEach(function(panel){
    (panel==='cp'?INC_KEYS:SP_INC_KEYS).forEach(function(k){
      if(!incIsAbsolute(panel,k))return;
      var id=(panel==='cp'?'iv-':'siv-')+k;
      var e=el(id);
      if(!e||prev[id]===null||prev[id]===undefined)return;
      var av=forDisplay(prev[id],panel==='cp'?'cost':'sale');
      e.value=av===null?'':String(+av.toFixed(4));
    });
  });
}
/** Snapshot every amount field in rupees, before the currency moves under it. */
function captureInputRupees(){
  var out={};
  MONEY_FIELDS.forEach(function(f){
    var e=el(f.id);
    if(!e||String(e.value).trim()===''){out[f.id]=null;return}
    var v=parseFloat(String(e.value).replace(/,/g,''));
    out[f.id]=isNaN(v)?null:fromDisplay(v,f.side);
  });
  var rc=el('rnd-custom');
  out._rnd=null;
  if(rc&&String(rc.value).trim()!==''){
    var rv=parseFloat(rc.value);
    if(!isNaN(rv))out._rnd=fromDisplay(rv,'sale');
  }
  ['cp','sp'].forEach(function(panel){
    (panel==='cp'?INC_KEYS:SP_INC_KEYS).forEach(function(k){
      if(!incIsAbsolute(panel,k))return;
      var id=(panel==='cp'?'iv-':'siv-')+k;
      var e=el(id);
      if(!e||String(e.value).trim()===''){out[id]=null;return}
      var v=parseFloat(e.value);
      out[id]=isNaN(v)?null:fromDisplay(v,panel==='cp'?'cost':'sale');
    });
  });
  return out;
}

/** Fill the currency dropdown once. */
function renderCcyList(){
  var sel=el('ccy-select');
  if(!sel||sel.options.length)return;
  sel.innerHTML=CURRENCIES.map(function(x){
    return '<option value="'+x.c+'">'+escHtml(x.c)+'</option>';
  }).join('');
  sel.value=DISPLAY_CCY;
}
/** Update the rate line beside the picker and the two lines in Settings. */
function renderFxNote(){
  var note=el('fx-note');
  if(note){
    if(DISPLAY_CCY==='INR'){ note.textContent=''; }
    else if(_fxBusy){ note.textContent='updating…'; }
    else{
      var per=inrPerUnit();
      if(per===null){ note.textContent='no rate — set one in Settings'; }
      else{
        var manual=FX.manual&&FX.manual[DISPLAY_CCY]>0;
        note.textContent='1 '+DISPLAY_CCY+' = ₹'+per.toFixed(2)+
          (manual?' · set by you':' · '+fxAgeText(fxAge()));
      }
    }
    note.className='fx-note'+(DISPLAY_CCY!=='INR'&&inrPerUnit()===null?' bad':'');
  }
  var st=el('fx-status');
  if(st){
    var where=FX_SCOPE==='cost'?'the cost side':(FX_SCOPE==='sale'?'the sale side':'both sides');
    var tail=DISPLAY_CCY==='INR'
      ? 'Everything is in rupees.'
      : 'Showing '+where+' in '+DISPLAY_CCY+'. Fields on that side are entered in '+DISPLAY_CCY+' too; MRP always stays in rupees.';
    st.textContent = (FX.fetched
      ? 'Rates last updated '+fxAgeText(fxAge())+', from open.er-api.com. '
      : 'Rates not fetched yet. ')+tail;
  }
  var row=el('fx-manual-row'),pre=el('fx-manual-pre'),inp=el('fx-manual');
  if(row)row.style.display=DISPLAY_CCY==='INR'?'none':'';
  if(pre)pre.textContent='1 '+DISPLAY_CCY+' =';
  if(inp&&document.activeElement!==inp){
    var m=FX.manual?FX.manual[DISPLAY_CCY]:0;
    inp.value=m>0?String(+(1/m).toFixed(4)):'';
  }
  var hint=el('fx-manual-hint');
  if(hint){
    hint.textContent=(FX.manual&&FX.manual[DISPLAY_CCY]>0)
      ? 'Your rate is being used instead of the fetched one. Clear the box to go back.'
      : 'Set the rate yourself — for a contracted rate, or when offline.';
  }
}
/**
 * Switch the display currency. Fetches rates the first time one is needed.
 * @param {string} c currency code
 */
function setDisplayCcy(c,scope){
  if(CCY_CODES.indexOf(c)===-1){
    logWarn('ignoring unknown currency '+JSON.stringify(c));
    c='INR';
  }
  // Capture BEFORE anything moves. The fields hold values in whatever currency
  // each side is currently showing, so reading them after the scope changes
  // reinterprets them under the new one — a ₹50 landed cost read as $50.
  var prev=captureInputRupees();
  if(scope!==undefined){
    if(FX_SCOPES.indexOf(scope)===-1){
      logWarn('ignoring unknown currency scope '+JSON.stringify(scope));
    } else FX_SCOPE=scope;
  }
  DISPLAY_CCY=c;
  var sel=el('ccy-select');
  if(sel&&sel.value!==c)sel.value=c;
  var ssel=el('fx-scope');
  if(ssel&&ssel.value!==FX_SCOPE)ssel.value=FX_SCOPE;
  repriceInputs(prev);
  refreshCurrencySymbols();
  renderFxNote();
  calc();
  debouncedSaveCalcState();
  // Only reach for the network when a rate is actually missing or stale.
  if(c!=='INR'&&!(FX.manual&&FX.manual[c]>0)){
    var age=fxAge();
    if(fxRate(c)===null||age===null||age>FX_MAX_AGE)fetchRates(true);
  }
}

ACT.ccyPick   = function(self){ setDisplayCcy(self.value) };
ACT.fxScopePick = function(self){ setDisplayCcy(DISPLAY_CCY, self.value) };
ACT.fxRefresh = function(){ fetchRates(false) };
ACT.fxManual  = function(self){ onFxManual(self) };

/** Kept for callers that want rupees regardless of the display currency. */
function _getInrFmt(){return _getFmt('INR')}
/* Which side of the deal a currency applies to.
   'cost' — you buy abroad: CP, CP incentives and inbound landed cost convert.
   'sale' — you sell abroad: SP, SP incentives, outbound landed cost, profit,
            break-even and order value convert.
   'both' — both sides of the deal.
   MRP is never converted under any scope: it is a rupee price fixed by law, and
   converting it would let a rate update restate the one figure that cannot
   move. Profit follows the sale side, because that is the currency the money
   actually arrives in. */
var FX_SCOPE='both';
var FX_SCOPES=['cost','sale','both'];

/**
 * The currency a given side of the deal is displayed in.
 * @param {string} side 'cost', 'sale' or 'base'
 * @returns {string} currency code
 */
function ccyFor(side){
  if(DISPLAY_CCY==='INR')return'INR';
  // MRP is a rupee price printed on the pack by law — there is no dollar MRP —
  // so it and the figures derived straight from it stay in rupees under every
  // scope. Converting it would also mean a rate update silently restating the
  // one number in the deal that cannot move.
  if(side==='base')return'INR';
  if(side==='cost')return(FX_SCOPE==='cost'||FX_SCOPE==='both')?DISPLAY_CCY:'INR';
  return(FX_SCOPE==='sale'||FX_SCOPE==='both')?DISPLAY_CCY:'INR';
}
/** The symbol to put in front of an amount, or in a field's prefix. */
function symFor(side){ return ccyInfo(ccyFor(side)).s }
/**
 * Whether an incentive row holds a rupee amount rather than a percentage.
 *
 * Only Scheme and user-added rows can be absolute; the other built-ins are
 * always a percentage of the base price, whatever INC_MODE happens to hold for
 * them. The conversion code and the maths must agree on this exactly, or a
 * percentage gets rescaled as if it were money.
 * @param {'cp'|'sp'} panel
 * @param {string} k incentive key
 */
function incIsAbsolute(panel,k){
  if(k==='sc')return(panel==='cp'?SCM:SSCM)==='abs';
  return isCustomInc(k)&&incModeOf(panel,k)==='abs';
}
/** 'cp' panel is the cost side, 'sp' panel the sale side. */
function sideOfPanel(p){ return p==='cp'?'cost':'sale' }
/** Whether a side is showing something other than rupees. */
function isForeign(side){ return ccyFor(side)!=='INR' }

/**
 * Format a rupee amount for one side of the deal.
 * @param {number} n amount in INR — always INR, whatever is on screen
 * @param {string} side 'cost', 'sale' or 'base'
 * @returns {string} e.g. '₹1,23,456.78' or '$1,234.56', '—' when not finite
 */
function money(n,side){
  if(n===null||n===undefined||isNaN(n))return'—';
  var c=ccyFor(side);
  if(c==='INR')return'₹'+_getFmt('INR').format(parseFloat(n.toFixed(2)));
  var r=fxRate(c);
  if(r===null)return'—';
  return ccyInfo(c).s+_getFmt(c).format(parseFloat((n*r).toFixed(2)));
}
/** Cost-side amount: CP, CP incentives, inbound landed cost. */
function CINR(n){ return money(n,'cost') }
/** Sale-side amount: SP, SP incentives, profit, break-even, order value. */
function SINR(n){ return money(n,'sale') }
/** The shared anchor: MRP and figures derived straight from it. */
function INR(n){ return money(n,'base') }

/**
 * Convert a number the user typed in a side's currency into rupees.
 * Inputs carry a currency symbol, so the number in them must be in that
 * currency — showing '$' over a rupee value would misstate a quote.
 * @param {number} v as typed
 * @param {string} side
 * @returns {number|null} rupees, or null when the rate is unknown
 */
function fromDisplay(v,side){
  if(v===null||v===undefined||isNaN(v))return v;
  var c=ccyFor(side);
  if(c==='INR')return v;
  var r=fxRate(c);
  return r===null?null:v/r;
}
/**
 * Convert a rupee amount into what a side's input field should show.
 * @param {number} v rupees
 * @param {string} side
 * @returns {number|null}
 */
function forDisplay(v,side){
  if(v===null||v===undefined||isNaN(v))return v;
  var c=ccyFor(side);
  if(c==='INR')return v;
  var r=fxRate(c);
  return r===null?null:v*r;
}
/** Format a rupee amount as rupees, whatever the display currency is set to. */
function INR_RS(n){
  if(n===null||n===undefined||isNaN(n))return'—';
  return'₹'+_getFmt('INR').format(parseFloat(n.toFixed(2)));
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
  if(id==='quote')withExtras(function(){qtRender()});
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
document.addEventListener('keydown',function(e){if(e.key==='Escape'){closeModal('settings');closeModal('whatif');closeModal('quote');closeModal('presets');closeConfirm();closePrompt();closeFab()}});

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
    inp.value=isCustomGST()?String(G*100):'';
    return;
  }
  // Typing a rate that already has a pill hands over to it rather than keeping
  // a second control filled in. setGST leaves the box alone while it has focus,
  // so that typing is not interrupted — but this is the change event, so entry
  // is finished and the box can be cleared for real.
  var preset=(p===18||p===5);
  setGST(p);
  if(preset)inp.value='';
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
  // Same hand-off as the GST box: a step that already has a chip selects it.
  var preset=(v===1||v===5);
  setRounding(String(v));
  if(preset)inp.value='';
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
/**
 * Write the quantity actually being used back into the field.
 *
 * getQty() floors and clamps to 1, but nothing put that value on screen, so
 * typing 2.5 left the field reading 2.5 while every total was for 2 units, and
 * 0 or -5 sat there looking accepted while 1 was used. Normalising on blur
 * rather than on input means it does not fight someone midway through typing.
 */
function normalizeQty(){
  var e=el('qty');if(!e)return;
  if(e.value==='')return;                   // empty is the placeholder state
  var q=String(getQty());
  if(e.value!==q){e.value=q;calc();debouncedSaveCalcState()}
}

/* ── Rounding ──
   Rounds the incl-GST price to a whole amount and derives excl from it, so the
   sticker price is the clean number and profit stays consistent with what's shown. */
function roundStep(){
  if(ROUND_MODE==='off')return 0;
  var v=parseFloat(ROUND_MODE);
  if(isNaN(v)||v<=0)return 0;
  // The step is entered against the sticker price, so it is in whatever
  // currency the sale side is showing: a $1 step rounds to whole dollars, and
  // the rupee figure behind it is then not round. That is the point.
  var r=fromDisplay(v,'sale');
  return (r===null)?0:r;
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
function isCustomGST(){
  var p=G*100;
  if(isNaN(p))return false;
  // Compared with a tolerance: G is stored as p/100, and 28/100*100 comes back
  // as 28.000000000000004. It happens not to bite for 18 or 5, but relying on
  // that is relying on a float coincidence.
  return Math.abs(p-18)>1e-9&&Math.abs(p-5)>1e-9;
}
/**
 * Whether the rounding step is something other than off, ₹1 or ₹5.
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
  if(typeof qtRender==='function'&&el('overlay-quote').classList.contains('open'))qtRender();
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
/* ── Text-entry dialog ──────────────────────────────────────────────────────
   window.prompt() was used to name presets. It cannot be themed, sits outside
   the app's focus trap and Escape handling, blocks the main thread while open,
   and on a phone surfaces as an OS-level alert with no visual relationship to
   the page. It also offers exactly one field and no validation, so a name that
   collided with an existing preset silently overwrote it.
   ─────────────────────────────────────────────────────────────────────────── */
var _promptFn=null,_promptValidate=null,_promptMulti=false;
/** The field currently in use — single line or textarea. */
function _promptField(){return _promptMulti?el('prompt-textarea'):el('prompt-input')}
/**
 * Ask for a single line of text.
 *
 * @param {Object} o
 * @param {string} o.title dialog heading
 * @param {string} [o.message] explanatory line above the field
 * @param {string} [o.label] visible label for the input
 * @param {string} [o.value] initial value, selected on open
 * @param {string} [o.placeholder]
 * @param {string} [o.okLabel] confirm button text
 * @param {Function} [o.validate] receives the current value; return null to
 *        accept, {error:'…'} to block, or {note:'…'} to warn but allow
 * @param {boolean} [o.multiline] show a textarea instead of a single line
 * @param {boolean} [o.readOnly] present a value to copy rather than to edit
 * @param {Function} o.onOk receives the trimmed value
 */
function askPrompt(o){
  o=o||{};
  _promptFn=o.onOk||null;
  _promptValidate=o.validate||null;
  R('prompt-title',o.title||'Name');
  R('prompt-msg',o.message||'');
  var msgEl=el('prompt-msg');if(msgEl)msgEl.style.display=o.message?'':'none';
  var lbl=el('prompt-label');if(lbl)lbl.textContent=o.label||'Name';
  _promptMulti=!!o.multiline;
  var single=el('prompt-input'),area=el('prompt-textarea');
  if(single)single.style.display=_promptMulti?'none':'';
  if(area)area.style.display=_promptMulti?'':'none';
  var inp=_promptField();
  if(inp){
    inp.value=o.value||'';
    if(!_promptMulti){
      inp.placeholder=o.placeholder||'';
      inp.setAttribute('maxlength',String(o.maxLength||40));
      inp.readOnly=!!o.readOnly;
    }
  }
  var cancel=el('overlay-prompt')?el('overlay-prompt').querySelector('.confirm-btn:not(.primary)'):null;
  if(cancel)cancel.style.display=o.readOnly||o.multiline?'none':'';
  var ok=el('prompt-ok');if(ok)ok.textContent=o.okLabel||'Save';
  var ov=el('overlay-prompt');
  if(ov){
    _lastFocused=document.activeElement;
    ov.classList.add('open');
    document.body.style.overflow='hidden';
    _openOverlay=ov;
    // Select the text so typing replaces it, which is what prompt() did.
    setTimeout(function(){if(inp){inp.focus();if(inp.select)inp.select()}},30);
  }
  validatePrompt();
}
/**
 * Re-run the validator and reflect it in the hint line and the OK button.
 * @returns {boolean} whether the current value may be submitted
 */
function validatePrompt(){
  var inp=_promptField(),ok=el('prompt-ok'),hint=el('prompt-hint');
  if(!inp||!ok)return true;
  var v=_promptValidate?_promptValidate(inp.value):null;
  var err=v&&v.error,note=v&&v.note;
  if(hint){
    hint.textContent=err||note||'';
    hint.className='confirm-sub'+(err?' prompt-err':(note?' prompt-note':''));
  }
  ok.disabled=!!err;
  return !err;
}
/** Submit the dialog, if the value passes validation. */
function runPrompt(){
  if(!validatePrompt())return;
  var inp=_promptField();
  var val=inp?String(inp.value).trim():'';
  var fn=_promptFn;
  closePrompt();
  if(fn)guard('prompt callback',function(){fn(val)});
}
/** Dismiss without submitting. */
function closePrompt(){
  _promptFn=null;_promptValidate=null;
  var ov=el('overlay-prompt');
  if(ov&&ov.classList.contains('open')){
    ov.classList.remove('open');
    document.body.style.overflow='';
    if(_openOverlay===ov)_openOverlay=null;
    if(_lastFocused&&_lastFocused.focus)_lastFocused.focus();
  }
}
ACT.promptOverlay = function(self,event){ if(event.target===el('overlay-prompt'))closePrompt() };
ACT.promptCancel  = function(){ closePrompt() };
ACT.promptOk      = function(){ runPrompt() };
ACT.promptType    = function(){ validatePrompt() };
ACT.promptKey     = function(self,event){
  if(event.key==='Enter'){ event.preventDefault(); runPrompt(); }
};

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
    /* Presets were missing here, so every pushUndo('delete preset') captured
       everything except the thing being deleted and undo silently did nothing
       for it. */
    presets:JSON.parse(JSON.stringify(PRESETS)),
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
    if(s.presets)PRESETS=JSON.parse(JSON.stringify(s.presets));
    ROUND_MODE=s.round;
    renderCPIncRows();renderSPIncRows();
    setRounding(ROUND_MODE);
    if(el('qty'))el('qty').value=s.qty;
    applyShareState(s.share);
    saveLabels();saveHistoryToStorage();saveQuote();
    if(s.presets){savePresets();renderPresetList();renderPresetManager()}
    renderHistory();
    if(typeof qtRender==='function'&&el('overlay-quote').classList.contains('open'))qtRender();
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
      // Only the relative timestamps age; rebuilding every card for that cost
      // ~224ms at 50 entries on a throttled phone. Update the text in place.
      _histRefreshTimer=setInterval(refreshHistTimes,60000);
    }else{
      clearInterval(_histRefreshTimer);_histRefreshTimer=null;
    }
  }
}

/**
 * Refresh the relative timestamps on visible history rows without rebuilding
 * them. Rows are addressed by their true HISTORY index, so this stays correct
 * under an active search or filter.
 */
function refreshHistTimes(){
  if(HISTORY.length===0)return;
  for(var i=0;i<HISTORY.length;i++){
    var h=HISTORY[i];
    if(!h||!h.ts)continue;
    var node=document.getElementById('htime-'+i);
    if(node)node.textContent=relTime(h.ts);
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
  var lbl=escHtml(INC_LABELS[k]||k);
  // Same text, for use inside aria-label attributes
  var lblPlain=lbl;
  var syncFn=isCP?'syncToggle':'syncSpToggle';
  var defVal=(k==='sc')?'':(k==='cd'||k==='qt')?'2':'1';
  var placeholder=(k==='sc')?'0':'';
  var custom=isCustomInc(k),cMode=custom?incModeOf(panel,k):null,cAbs=(cMode==='abs');
  var maxAttr=(k==='sc'||cAbs)?'':' max="100"';

  var delBtn=editMode?'<button class="inc-del-btn" data-click="incDelete" data-p="'+panel+'" data-q="'+k+'" title="Delete" aria-label="Delete">&#x2212;</button>':'';
  var labelHtml=editMode
    ?'<input class="inc-label-edit" id="'+lblId+'" aria-label="Rename '+lblPlain+'" value="'+lbl+'" data-focus="undoRename" data-input="incRename" data-p="'+k+'" maxlength="30" autocomplete="off" spellcheck="false">'
    :'<span class="inc-name" id="'+lblId+'">'+lbl+'</span>';

  var unitId=(k==='sc')?' id="'+(isCP?'sc':'ssc')+'-unit"':(custom?' id="unit-'+panel+'-'+k+'"':'');
  var unitTxt=cAbs?'&#x20B9;':'%';
  var pctWrapId=(k==='sc'&&isCP)?' id="sc-pct-wrap"':'';

  var mainRow='<div class="inc-row-main">'+delBtn+'<label class="toggle"><input type="checkbox" id="'+cbId+'" aria-label="Enable '+lblPlain+'" data-change="incToggle" data-p="'+panel+'" data-q="'+k+'"><span class="toggle-track"></span><span class="toggle-thumb"></span></label>'+labelHtml+'<div class="inc-pct-wrap"'+pctWrapId+'><input type="number" inputmode="decimal" id="'+inpId+'" aria-label="'+lblPlain+' value" value="'+defVal+'" placeholder="'+placeholder+'" min="0"'+maxAttr+' step="0.01" data-input="calc" autocomplete="off"><span class="inc-pct-sym"'+unitId+'>'+unitTxt+'</span></div></div>';

  var subRow='';
  var gPct=Math.round(G*100);
  if(k==='cd'){
    var b1=isCP?'cdm-before':'scdm-before',b2=isCP?'cdm-after':'scdm-after';
    // Delegated: panel in data-p, mode in data-q
    var fn1='data-click="cdMode" data-p="'+panel+'" data-q="before"';
    var fn2='data-click="cdMode" data-p="'+panel+'" data-q="after"';
    var lb1='lbl-'+(isCP?'':'s')+'cdm-before',lb2='lbl-'+(isCP?'':'s')+'cdm-after';
    var p=isCP?'CP':'SP';
    subRow='<div class="inc-row-sub"><div style="font-size:11px;color:var(--text3);margin-bottom:6px">Calculate CD on:</div><div class="sub-tabs" style="width:100%"><button class="stab on" id="'+b1+'" '+fn1+' style="padding:6px 8px;line-height:1.3"><span id="'+lb1+'">'+p+' excl '+gPct+'% GST</span><br><span style="font-weight:300;font-size:9.5px;opacity:.8">before GST</span></button><button class="stab" id="'+b2+'" '+fn2+' style="padding:6px 8px;line-height:1.3"><span id="'+lb2+'">'+p+' incl '+gPct+'% GST</span><br><span style="font-weight:300;font-size:9.5px;opacity:.8">after GST</span></button></div></div>';
  } else if(k==='sc'){
    var sp1=isCP?'scm-pct':'sscm-pct',sp2=isCP?'scm-abs':'sscm-abs';
    var fn3='data-click="schemeMode" data-p="'+panel+'" data-q="pct"';
    var fn4='data-click="schemeMode" data-p="'+panel+'" data-q="abs"';
    var lsp='lbl-'+(isCP?'':'s')+'scm-pct';
    var ssub=isCP?' id="sc-sub"':'';
    var pp=isCP?'CP':'SP';
    subRow='<div class="inc-row-sub"'+ssub+'><div style="font-size:11px;color:var(--text3);margin-bottom:6px">Scheme type:</div><div class="sub-tabs" style="width:100%"><button class="stab on" id="'+sp1+'" '+fn3+' style="padding:6px 8px;line-height:1.3"><span id="'+lsp+'">% of '+pp+' excl '+gPct+'% GST</span><br><span style="font-weight:300;font-size:9.5px;opacity:.8">percentage</span></button><button class="stab" id="'+sp2+'" '+fn4+' style="padding:6px 8px;line-height:1.3">&#x20B9; Absolute<br><span style="font-weight:300;font-size:9.5px;opacity:.8">fixed amount</span></button></div></div>';
  } else if(custom){
    var m1='im-'+panel+'-'+k+'-pct',m2='im-'+panel+'-'+k+'-abs';
    var lm='lbl-im-'+panel+'-'+k;
    var cp2=isCP?'CP':'SP';
    subRow='<div class="inc-row-sub"><div style="font-size:11px;color:var(--text3);margin-bottom:6px">Incentive type:</div><div class="sub-tabs" style="width:100%"><button class="stab'+(cAbs?'':' on')+'" id="'+m1+'" data-click="incMode" data-p="'+panel+'" data-q="'+k+'" data-r="pct" style="padding:6px 8px;line-height:1.3"><span id="'+lm+'">% of '+cp2+' excl '+gPct+'% GST</span><br><span style="font-weight:300;font-size:9.5px;opacity:.8">percentage</span></button><button class="stab'+(cAbs?' on':'')+'" id="'+m2+'" data-click="incMode" data-p="'+panel+'" data-q="'+k+'" data-r="abs" style="padding:6px 8px;line-height:1.3">'+escHtml(symFor(sideOfPanel(panel)))+' Absolute<br><span style="font-weight:300;font-size:9.5px;opacity:.8">fixed amount</span></button></div></div>';
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
  if(u)u.textContent=(m==='abs')?symFor(sideOfPanel(panel)):'%';
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
  if(u)u.textContent=(m==='abs')?symFor(sideOfPanel(panel)):'%';
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
    var su=document.getElementById('sc-unit');if(su)su.textContent=(SCM==='abs')?symFor('cost'):'%';
  } else {
    var scb=document.getElementById('scdm-before');if(scb)scb.className=(SCDM==='before')?'stab on':'stab';
    var sca=document.getElementById('scdm-after');if(sca)sca.className=(SCDM==='after')?'stab on':'stab';
    var ssp=document.getElementById('sscm-pct');if(ssp)ssp.className=(SSCM==='pct')?'stab on':'stab';
    var ssa=document.getElementById('sscm-abs');if(ssa)ssa.className=(SSCM==='abs')?'stab on':'stab';
    var ssu=document.getElementById('ssc-unit');if(ssu)ssu.textContent=(SSCM==='abs')?symFor('sale'):'%';
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
    Object.keys(labels).forEach(function(k){
      if(!isValidIncKey(k))return;
      INC_LABELS[k]=String(labels[k]);
      if(!INC_LABELS_DEFAULT[k])INC_LABELS_DEFAULT[k]=String(labels[k]);
    });
    // Keys are interpolated into element ids and inline handlers, so anything
    // that did not come from addInc() is dropped rather than rendered.
    function safeKeys(arr,fallback){
      if(!Array.isArray(arr))return fallback;
      var clean=arr.filter(isValidIncKey);
      if(clean.length!==arr.length)
        logWarn('discarded '+(arr.length-clean.length)+' malformed incentive key(s) from storage');
      return clean.length?clean:fallback;
    }
    INC_KEYS=safeKeys(parsed.cpKeys,INC_KEYS);
    SP_INC_KEYS=safeKeys(parsed.spKeys,SP_INC_KEYS);
    if(parsed.cpModes)INC_MODE=parsed.cpModes;
    if(parsed.spModes)SP_INC_MODE=parsed.spModes;
  }catch(e){ logWarn('could not read saved incentives (pc-labels); using defaults',e); }
}


/* ── Landed cost ────────────────────────────────────────────────────────────
   Freight, insurance and handling are real costs that incentives do not offset,
   so they are added to effective CP rather than netted against it. Entered per
   unit in rupees, on the excl-GST basis to match every other figure.
   ─────────────────────────────────────────────────────────────────────────── */
/**
 * Landed cost per unit, excl GST.
 * @returns {number} rupees, 0 when blank or invalid
 */
function getLandedCost(){
  var e=el('landed');
  if(!e)return 0;
  var v=parseFloat(String(e.value).replace(/,/g,''));
  if(isNaN(v)||v<0)return 0;
  var r=fromDisplay(v,'cost');
  return (r===null)?0:r;
}

/**
 * Outbound landed cost per unit, excl GST — delivery, packing, freight to the
 * customer. Symmetric with the inbound figure but pulls the other way: it is
 * money spent on the sale, so it reduces what the sale nets.
 * @returns {number} rupees, 0 when blank or invalid
 */
function getSPLandedCost(){
  var e=el('sp-landed');
  if(!e)return 0;
  var v=parseFloat(String(e.value).replace(/,/g,''));
  if(isNaN(v)||v<0)return 0;
  var r=fromDisplay(v,'sale');
  return (r===null)?0:r;
}

/**
 * Effective cost price excl GST: list CP, less incentives, plus inbound landed
 * cost. Every profit calculation goes through here so the three inputs cannot
 * drift apart between call sites.
 * @param {{e:number,i:number}|null} cp
 * @returns {number|null}
 */
function effectiveCP(cp){
  if(!cp)return null;
  return cp.e - getIncentiveInr(cp) + getLandedCost();
}

/**
 * Effective selling price excl GST: list SP, less incentives, less outbound
 * landed cost. The counterpart to effectiveCP — profit is always the
 * difference between the two.
 * @param {{e:number,i:number}|null} sp
 * @returns {number|null}
 */
function effectiveSP(sp){
  if(!sp)return null;
  return sp.e - getSPIncentiveInr(sp) - getSPLandedCost();
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
    if(incIsAbsolute('cp',k)){
      var r=fromDisplay(v,'cost');
      t+=(r===null)?0:r;
    } else if(k==='cd'&&CDM==='after'){
      t+=cp.i*v/100;
    } else {
      t+=cp.e*v/100;
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
    if(incIsAbsolute('sp',k)){
      var r=fromDisplay(v,'sale');
      t+=(r===null)?0:r;
    } else if(k==='cd'&&SCDM==='after'){
      t+=sp.i*v/100;
    } else {
      t+=sp.e*v/100;
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
  var inc=getSPIncentiveInr(sp),eff=effectiveSP(sp);
  R('sp-inc-total-pct',(inc>0&&sp)?PCT((inc/sp.e)*100):'0.00%');
  R('sp-inc-total-inr',inc>0?SINR(inc):'—');
  R('sp-inc-eff-sp',SINR(eff));
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
function setGST(p){
  haptic('select');
  G=p/100;
  el('g18').className=(p===18)?'pill on':'pill';
  el('g5').className=(p===5)?'pill on':'pill';
  var gc=el('gst-custom');
  if(gc&&document.activeElement!==gc)gc.value=(p===18||p===5)?'':p;
  // The custom box is a third option in the same group, so it has to show
  // selected the way the two pills beside it do — otherwise a custom rate is
  // live with nothing on screen saying which option is active.
  var wrap=el('gst-custom-wrap');
  if(wrap)wrap.className='gst-custom-wrap'+(isCustomGST()?' on':'');
  el('grate').textContent=p+'%';
  updateGSTLabels();
  calc();
}
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


/* ── Incentive presets ──────────────────────────────────────────────────────
   Incentive structures repeat per dealer or brand, so the whole set — which
   incentives exist, their names, %/₹ modes, values and on/off state, plus the
   CD and scheme sub-modes — is saved under a name and recalled in one step.
   ─────────────────────────────────────────────────────────────────────────── */
var PRESETS = {};

/** Persist the preset collection. */
function savePresets(){
  try{ localStorage.setItem('pc-presets', JSON.stringify(PRESETS)); }
  catch(e){ logError('could not save presets (pc-presets)',e); }
}
/** Restore the preset collection, dropping anything malformed. */
function loadPresets(){
  try{
    var raw=localStorage.getItem('pc-presets');
    if(!raw)return;
    var parsed=JSON.parse(raw);
    if(parsed&&typeof parsed==='object'&&!Array.isArray(parsed))PRESETS=parsed;
  }catch(e){ logWarn('could not read saved presets (pc-presets); starting empty',e); }
  renderPresetList();
}

/**
 * Snapshot the current incentive configuration.
 * @returns {Object} everything needed to reproduce both panels
 */
function capturePreset(){
  function panel(keys,pfx){
    var out={};
    keys.forEach(function(k){
      var cb=document.getElementById(pfx.cb+k), iv=document.getElementById(pfx.iv+k);
      out[k]={on:cb?cb.checked:false, v:iv?iv.value:''};
    });
    return out;
  }
  return {
    cpKeys:INC_KEYS.slice(), spKeys:SP_INC_KEYS.slice(),
    labels:JSON.parse(JSON.stringify(INC_LABELS)),
    cpModes:JSON.parse(JSON.stringify(INC_MODE)),
    spModes:JSON.parse(JSON.stringify(SP_INC_MODE)),
    cp:panel(INC_KEYS,{cb:'it-',iv:'iv-'}),
    sp:panel(SP_INC_KEYS,{cb:'sit-',iv:'siv-'}),
    cdm:CDM, scm:SCM, scdm:SCDM, sscm:SSCM
  };
}

/**
 * Apply a saved preset. Keys are re-validated, since presets live in storage.
 * @param {Object} p snapshot from capturePreset
 */
function applyPreset(p){
  if(!p)return;
  INC_KEYS=(p.cpKeys||[]).filter(isValidIncKey);
  SP_INC_KEYS=(p.spKeys||[]).filter(isValidIncKey);
  if(!INC_KEYS.length)INC_KEYS=['cd','eb','qt','an','sc'];
  if(!SP_INC_KEYS.length)SP_INC_KEYS=['cd','eb','qt','an','sc'];
  Object.keys(p.labels||{}).forEach(function(k){
    if(isValidIncKey(k))INC_LABELS[k]=String(p.labels[k]);
  });
  INC_MODE={};SP_INC_MODE={};
  Object.keys(p.cpModes||{}).forEach(function(k){ if(isValidIncKey(k))INC_MODE[k]=p.cpModes[k]==='abs'?'abs':'pct'; });
  Object.keys(p.spModes||{}).forEach(function(k){ if(isValidIncKey(k))SP_INC_MODE[k]=p.spModes[k]==='abs'?'abs':'pct'; });

  renderCPIncRows();renderSPIncRows();
  function restore(keys,src,pfx,sync){
    keys.forEach(function(k){
      var e=(src||{})[k]; if(!e)return;
      var cb=document.getElementById(pfx.cb+k), iv=document.getElementById(pfx.iv+k);
      if(cb)cb.checked=!!e.on;
      if(iv&&e.v!=='')iv.value=e.v;
      sync(k);
    });
  }
  restore(INC_KEYS,p.cp,{cb:'it-',iv:'iv-'},syncToggle);
  restore(SP_INC_KEYS,p.sp,{cb:'sit-',iv:'siv-'},syncSpToggle);
  if(INC_KEYS.indexOf('cd')!==-1)setCDMode(p.cdm==='after'?'after':'before');
  if(INC_KEYS.indexOf('sc')!==-1)setSchemeMode(p.scm==='abs'?'abs':'pct');
  if(SP_INC_KEYS.indexOf('cd')!==-1)setSCDMode(p.scdm==='after'?'after':'before');
  if(SP_INC_KEYS.indexOf('sc')!==-1)setSpSchemeMode(p.sscm==='abs'?'abs':'pct');
  saveLabels();calc();
}

/** Repaint the preset dropdown from PRESETS. */
function renderPresetList(){
  var sel=el('preset-select');
  if(!sel)return;
  var names=Object.keys(PRESETS).sort();
  var cur=sel.value;
  sel.innerHTML='<option value="">Presets…</option>'+
    names.map(function(n){return '<option value="'+escHtml(n)+'">'+escHtml(n)+'</option>'}).join('');
  if(names.indexOf(cur)!==-1)sel.value=cur;
}

/** Load whichever preset the dropdown selects. */
function onPresetPick(){
  var sel=el('preset-select');
  if(!sel||!sel.value)return renderPresetList();
  loadPreset(sel.value);
}

/**
 * Apply a saved preset by name.
 * @param {string} name
 */
function loadPreset(name){
  if(!Object.prototype.hasOwnProperty.call(PRESETS,name)){
    logWarn('no preset named '+JSON.stringify(name));
    toast('That preset no longer exists');
    renderPresetList();
    return;
  }
  pushUndo('load preset');
  applyPreset(PRESETS[name]);
  var sel=el('preset-select');if(sel)sel.value=name;
  renderPresetList();
  toast('Loaded "'+name+'"',true);
}

/**
 * Validator shared by save and rename.
 * @param {string} raw the typed value
 * @param {string} [self] a name that may collide with itself without warning
 * @returns {Object|null} null, {error} or {note}, per askPrompt's contract
 */
function validatePresetName(raw,self){
  var n=String(raw||'').trim();
  if(!n)return {error:'Give the preset a name.'};
  if(n.length>40)return {error:'Keep the name to 40 characters or fewer.'};
  if(n!==self&&Object.prototype.hasOwnProperty.call(PRESETS,n))
    return {note:'"'+n+'" already exists — saving will replace it.'};
  return null;
}

/** Save the incentives currently on screen under a name. */
function savePresetAs(){
  var sel=el('preset-select');
  askPrompt({
    title:'Save preset',
    message:'Stores both incentive panels as they are now, to bring back later.',
    label:'Preset name',
    value:(sel&&sel.value)||'',
    placeholder:'e.g. Bosch — Q3 terms',
    okLabel:'Save',
    validate:function(v){return validatePresetName(v)},
    onOk:function(name){
      var overwriting=Object.prototype.hasOwnProperty.call(PRESETS,name);
      pushUndo(overwriting?'overwrite preset':'save preset');
      PRESETS[name]=capturePreset();
      savePresets();
      renderPresetList();renderPresetManager();
      // After the options exist — assigning a value with no matching option
      // is silently ignored, which left the dropdown blank.
      var s2=el('preset-select');if(s2)s2.value=name;
      toast(overwriting?'Updated "'+name+'"':'Saved "'+name+'"',true);
    }
  });
}

/**
 * Rename a preset, keeping its contents.
 * @param {string} name existing key
 */
function renamePreset(name){
  if(!Object.prototype.hasOwnProperty.call(PRESETS,name))return;
  askPrompt({
    title:'Rename preset',
    message:'Renaming "'+name+'". Its incentives are unchanged.',
    label:'New name',
    value:name,
    okLabel:'Rename',
    validate:function(v){return validatePresetName(v,name)},
    onOk:function(next){
      if(next===name)return;
      pushUndo('rename preset');
      var body=PRESETS[name];
      delete PRESETS[name];
      PRESETS[next]=body;
      savePresets();
      var sel=el('preset-select');
      var wasSelected=!!sel&&sel.value===name;
      renderPresetList();renderPresetManager();
      if(wasSelected&&sel)sel.value=next;
      toast('Renamed to "'+next+'"',true);
    }
  });
}

/**
 * Overwrite a preset with whatever is on screen now.
 * @param {string} name existing key
 */
function updatePreset(name){
  if(!Object.prototype.hasOwnProperty.call(PRESETS,name))return;
  askConfirm('Update preset','Replace "'+name+'" with the incentives currently on screen?',
    'The saved version is discarded. This can be undone.','Update',function(){
      pushUndo('update preset');
      PRESETS[name]=capturePreset();
      savePresets();renderPresetList();renderPresetManager();
      toast('Updated "'+name+'"',true);
    });
}

/**
 * Delete a preset, after confirmation.
 * @param {string} name existing key
 */
function deletePreset(name){
  if(!Object.prototype.hasOwnProperty.call(PRESETS,name))return;
  askConfirm('Delete preset','Delete the preset "'+name+'"?',
    'The incentives currently on screen are not changed. This can be undone.','Delete',function(){
      pushUndo('delete preset');
      delete PRESETS[name];
      savePresets();
      var sel=el('preset-select');
      if(sel&&sel.value===name)sel.value='';
      renderPresetList();renderPresetManager();
      toast('Deleted "'+name+'"',true);
    });
}

/** Draw the rows inside the preset manager. */
function renderPresetManager(){
  var c=el('pm-list');
  if(!c)return;
  var names=Object.keys(PRESETS).sort();
  if(!names.length){
    c.innerHTML='<p class="pm-empty">No presets yet. Set the incentives up the way you want them, '+
                'then use the button above.</p>';
    return;
  }
  c.innerHTML=names.map(function(n){
    var e=escHtml(n);
    return '<div class="pm-row">'+
      '<span class="pm-name" title="'+e+'">'+e+'</span>'+
      '<span class="pm-acts">'+
        '<button class="pm-btn" data-click="pmLoad"   data-p="'+e+'" aria-label="Load preset '+e+'">Load</button>'+
        '<button class="pm-btn" data-click="pmRename" data-p="'+e+'" aria-label="Rename preset '+e+'">Rename</button>'+
        '<button class="pm-btn" data-click="pmUpdate" data-p="'+e+'" aria-label="Update preset '+e+' from the current screen">Update</button>'+
        '<button class="pm-btn danger" data-click="pmDelete" data-p="'+e+'" aria-label="Delete preset '+e+'">Delete</button>'+
      '</span></div>';
  }).join('');
}

/** Open the preset manager. */
function openPresetManager(){
  renderPresetManager();
  openModal('presets');
}

ACT.presetManage  = function(){ openPresetManager() };
ACT.settingsPresets = function(){ closeModal('settings'); openPresetManager(); };
ACT.presetsClose  = function(){ closeModal('presets') };
ACT.presetsOverlay= function(self,event){ overlayClick(event,'presets') };
ACT.pmLoad   = function(self){ loadPreset(self.getAttribute('data-p')); closeModal('presets'); };
ACT.pmRename = function(self){ renamePreset(self.getAttribute('data-p')); };
ACT.pmUpdate = function(self){ updatePreset(self.getAttribute('data-p')); };
ACT.pmDelete = function(self){ deletePreset(self.getAttribute('data-p')); };

/* ── Target-margin solver ───────────────────────────────────────────────────
   Answers "what incentive do I need to hit X% GP?" rather than making the user
   converge on it by trial and error.
   ─────────────────────────────────────────────────────────────────────────── */
/**
 * Work out the extra CP incentive required to reach a target GP%.
 *
 * @param {number} targetGp desired gross profit percentage
 * @returns {Object|null} null when the inputs cannot support an answer
 */
function solveForGp(targetGp){
  // A GP target below 0 is as meaningless as one at or above 100: you cannot
  // aim to lose a proportion of your own selling price. Without the lower
  // bound, -20 flowed through as a legitimate target.
  if(isNaN(targetGp)||targetGp<0||targetGp>=100)return null;
  var cp=LAST_CP, sp=LAST_SP;
  if(!cp||!sp||cp.e<=0||sp.e<=0)return null;

  var effSP=effectiveSP(sp);
  var effCPNow=effectiveCP(cp);
  var gpNow=(effSP>0)?((effSP-effCPNow)/effSP)*100:null;

  // Effective CP that would achieve the target at the current selling price
  var needEffCP=effSP*(1-targetGp/100);
  var needInc=cp.e-(needEffCP-getLandedCost());   // rupees of incentive required
  var haveInc=getIncentiveInr(cp);

  return {
    gpNow:gpNow,
    targetGp:targetGp,
    needEffCP:needEffCP,
    needIncInr:needInc,
    extraInr:needInc-haveInc,
    needIncPct:(cp.e>0)?(needInc/cp.e)*100:null,
    havePct:(cp.e>0)?(haveInc/cp.e)*100:null,
    /* How far effective CP could rise before GP falls to the target. Positive
       means the target is already beaten and this is the cushion; negative
       means that much more incentive is still needed. Without this the caller
       can only describe the "need more" direction, and a target below the
       current GP comes out as a negative incentive — an instruction to make
       the stock cost more, which is not something anyone can act on. */
    cushionInr:needEffCP-effCPNow,
    alreadyMet:needInc<=haveInc,
    reachable:needInc<=cp.e && needEffCP>0
  };
}

/** Recompute and render the solver readout. */
function renderSolver(){
  var out=el('solver-out');
  if(!out)return;
  var raw=el('solver-gp');
  var target=raw?parseFloat(raw.value):NaN;
  if(isNaN(target)){out.textContent='Enter a target GP % to see what it needs.';out.className='solver-out';return}
  // Check the target before the inputs. solveForGp returns null for two
  // unrelated reasons — an impossible target, and no calculation to work from —
  // and reporting both as "Enter MRP, CP and SP first" told people to fill in
  // fields that were already full whenever they typed 100 or more.
  if(target<0||target>=100){
    out.className='solver-out bad';
    out.textContent='Target GP % must be between 0 and 99.9 — '+PCT(target)+' is not reachable at any price.';
    return;
  }
  var r=solveForGp(target);
  if(!r){out.textContent='Enter MRP, CP and SP first.';out.className='solver-out';return}
  if(!r.reachable){
    out.textContent='Not reachable — '+PCT(target)+' GP would need more incentive than the cost price.';
    out.className='solver-out bad';
    return;
  }
  // Sitting on the target: nothing to do, and quoting a ₹0.00 adjustment reads
  // like an instruction rather than a confirmation.
  if(Math.abs(r.cushionInr)<0.005){
    out.className='solver-out ok';
    out.textContent='Right on target — GP is '+PCT(r.targetGp)+'. No change needed.';
    return;
  }
  // Target already beaten. Asking "what incentive gets me to 12%" when you are
  // at 25% has no useful answer in incentive terms — it would be a negative
  // one, i.e. paying more for the stock. The question worth answering is how
  // much room there is before the target is lost.
  if(r.cushionInr>0){
    out.className='solver-out ok';
    out.textContent='Already there — GP is '+PCT(r.gpNow)+', above the '+PCT(r.targetGp)+' target. '
      +'Effective CP has '+CINR(r.cushionInr)+' of room per unit (up to '+CINR(r.needEffCP)+') '
      +'before GP drops to '+PCT(r.targetGp)+'.';
    return;
  }
  // Short of the target: the original reading, which only ever applied here.
  out.className='solver-out';
  out.textContent='Needs '+PCT(r.needIncPct)+' total CP incentive ('+CINR(r.needEffCP)+' eff. CP). '
    +'You have '+PCT(r.havePct)+' — '+CINR(Math.abs(r.extraInr))+' more per unit'
    +(r.gpNow!==null?'. Currently '+PCT(r.gpNow)+'.':'.');
}

ACT.presetPick = function(){ onPresetPick(); };
ACT.presetSave = function(){ savePresetAs(); };
ACT.solve      = function(){ renderSolver(); };

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
  // e is the target EFFECTIVE cost; landed cost is added after incentives, so
  // remove it before inverting the incentive factor.
  e-=getLandedCost();
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


/* ── Value animation ────────────────────────────────────────────────────────
   Headline figures count toward their new value rather than jumping, so the
   direction and size of a change are visible. Deliberately conservative:
   only worthwhile deltas animate, and a reduced-motion preference or a
   backgrounded tab skips straight to the final value.
   ─────────────────────────────────────────────────────────────────────────── */
var _animTimers = {};

/** True when the user has asked for reduced motion. */
function prefersReducedMotion(){
  try{ return window.matchMedia('(prefers-reduced-motion: reduce)').matches; }
  catch(e){ return false; }
}

/**
 * Ease a numeric readout from its current value to a new one.
 *
 * @param {string} id element id
 * @param {number|null} to target value
 * @param {Function} fmt formatter, e.g. INR or PCT
 * @param {Object} [opts] {minDelta} below which the value is set directly
 */
function animateValue(id, to, fmt, opts){
  opts = opts || {};
  var node = el(id);
  if(!node) return;

  var from = _animTimers[id] && _animTimers[id].current;
  if(from === undefined || from === null) from = NaN;

  // Nothing to ease toward, or movement is unwanted — set it and stop.
  if(to === null || to === undefined || isNaN(to) || prefersReducedMotion() ||
     document.hidden || isNaN(from)){
    if(_animTimers[id]) cancelAnimationFrame(_animTimers[id].raf);
    _animTimers[id] = { current: to };
    node.textContent = fmt(to);
    return;
  }

  var delta = Math.abs(to - from);
  var minDelta = opts.minDelta !== undefined ? opts.minDelta : 1;
  if(delta < minDelta){
    if(_animTimers[id]) cancelAnimationFrame(_animTimers[id].raf);
    _animTimers[id] = { current: to };
    node.textContent = fmt(to);
    return;
  }

  if(_animTimers[id]) cancelAnimationFrame(_animTimers[id].raf);
  var start = null;
  // Longer for bigger jumps, but never long enough to feel laggy.
  var dur = Math.min(520, 220 + Math.log10(1 + delta) * 90);
  var rec = { current: from, raf: 0 };
  _animTimers[id] = rec;

  function frame(ts){
    if(start === null) start = ts;
    var t = Math.min(1, (ts - start) / dur);
    // easeOutCubic: fast to begin, settling gently
    var eased = 1 - Math.pow(1 - t, 3);
    var v = from + (to - from) * eased;
    rec.current = v;
    node.textContent = fmt(v);
    if(t < 1){
      rec.raf = requestAnimationFrame(frame);
    } else {
      rec.current = to;
      node.textContent = fmt(to);
      node.classList.remove('bump');
      // Re-trigger the bump on the next frame so repeats replay
      requestAnimationFrame(function(){ node.classList.add('bump'); });
      setTimeout(function(){ node.classList.remove('bump'); }, 400);
    }
  }
  rec.raf = requestAnimationFrame(frame);
}


/* ── Break-even ─────────────────────────────────────────────────────────────
   How far the selling price can fall before the deal stops being worth doing.
   Two thresholds: zero profit, and the GP floor from Settings. Both are quoted
   incl GST, because that is the number actually negotiated with a customer.
   ─────────────────────────────────────────────────────────────────────────── */
/**
 * Selling prices at which profit hits zero and at which GP% hits the floor.
 *
 * Both are stated BEFORE SP incentives: SP incentives reduce what is actually
 * received, so the price you can quote is the threshold grossed back up by
 * whatever proportion they take.
 *
 * @param {{e:number,i:number}|null} cp
 * @param {{e:number,i:number}|null} sp current SP, used to infer the SP-incentive ratio
 * @returns {{zeroE:number,zeroI:number,floorE:number|null,floorI:number|null}|null}
 */
function breakEven(cp,sp){
  var eff=effectiveCP(cp);
  if(eff===null||isNaN(eff)||eff<=0)return null;

  // Proportion of SP that incentives give away, inferred from the current SP.
  var keep=1;
  if(sp&&sp.e>0){
    var r=getSPIncentiveInr(sp)/sp.e;
    if(r>=0&&r<1)keep=1-r;
  }
  if(keep<=0)return null;

  // Outbound landed cost is a flat amount off the top, so the list price has to
  // cover it before the incentive proportion is applied:
  //   effSP = listSP * keep - outbound   =>   listSP = (target + outbound) / keep
  var out=getSPLandedCost();

  var zeroE=(eff+out)/keep;
  var floor=getFloor();
  var floorE=null;
  if(floor.gp!==null&&floor.gp<100){
    // GP = (effSP - effCP)/effSP  =>  effSP = effCP / (1 - gp/100)
    floorE=((eff/(1-floor.gp/100))+out)/keep;
  }
  return {
    zeroE:zeroE, zeroI:zeroE*(1+G),
    floorE:floorE, floorI:floorE===null?null:floorE*(1+G)
  };
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
  R('cde',PCT(d.de));R('cdi',PCT(d.di));R('cve',CINR(cp.e));R('cvi',CINR(cp.i));R('cga',CINR(cp.i-cp.e));
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
  R('sde',PCT(d.de));R('sdi',PCT(d.di));R('sve',SINR(sp.e));R('svi',SINR(sp.i));R('sga',SINR(sp.i-sp.e));
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
  R('pvv',SINR(pr));R('pgp',PCT(gp));R('pmrg',PCT(mg));R('pspd',SINR(pr));
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
  var inc=getIncentiveInr(cp),eff=effectiveCP(cp);
  R('inc-total-pct',(inc>0&&cp)?PCT((inc/cp.e)*100):'0.00%');
  R('inc-total-inr',inc>0?CINR(inc):'—');R('inc-eff-cp',CINR(eff));
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
  if(!cp||!sp){
    ['s-be-sep','s-item-be','s-item-bef','s-order-sep','s-item-qty','s-item-order','s-item-tpr']
      .forEach(function(id){var e=el(id);if(e)e.style.display='none'});
    updateMiniResult(null,null,null);updateA11yStatus(null,null,null);
    renderSolver();
    return;
  }
  var floor=getFloor();
  var cpInc=getIncentiveInr(cp),eff=effectiveCP(cp);
  var spInc=getSPIncentiveInr(sp),effSP=effectiveSP(sp);
  var pr=effSP-eff,gp=(effSP>0)?(pr/effSP)*100:null,mg=(eff>0)?(pr/eff)*100:null;
  var dcp=discFromPrice(cp.e),dsp=discFromPrice(sp.e);
  sumSet('s-cp',CINR(cp.e),'');sumSet('s-ecp',CINR(eff),cpInc>0?'amber':'');
  sumSet('s-sp',SINR(sp.e),'');sumSet('s-esp',SINR(effSP),spInc>0?'pos':'');
  sumSet('s-inc',cpInc>0?CINR(cpInc):'—',cpInc>0?'amber':'dim');
  sumSet('s-spinc',spInc>0?SINR(spInc):'—',spInc>0?'pos':'dim');
  // Headline figures ease toward their new value; the class still updates now
  // so colour and floor warnings are never late.
  sumSet('s-pr',SINR(pr),pr>=0?'pos':'neg');
  sumSet('s-gp',PCT(gp),gpCls(gp,floor));sumSet('s-mg',PCT(mg),mgCls(mg,floor));
  // SINR, not INR: the count-up rewrites the cell, so a base-currency
  // formatter here would undo the sale-side conversion a frame later — the
  // label said $ while the number underneath it said ₹.
  animateValue('s-pr',pr,SINR,{minDelta:1});
  animateValue('s-gp',gp,PCT,{minDelta:0.5});
  animateValue('s-mg',mg,PCT,{minDelta:0.5});
  sumSet('s-dcp',PCT(dcp.de),'');sumSet('s-dsp',PCT(dsp.de),'');
  // Order-level totals — only shown once qty > 1, so single-unit use is unchanged
  var q=getQty(),multi=q>1;
  ['s-order-sep','s-item-qty','s-item-order','s-item-tpr'].forEach(function(id){
    var e=el(id);if(e)e.style.display=multi?'':'none';
  });
  if(multi){
    sumSet('s-qty',q+' units','');
    sumSet('s-order',SINR(sp.i*q),'');
    sumSet('s-tpr',SINR(pr*q),pr>=0?'pos':'neg');
  }
  // Break-even: how far SP can fall before profit or the GP floor is breached
  var be=breakEven(cp,sp);
  var beEls=['s-be-sep','s-item-be','s-item-bef'];
  if(be){
    sumSet('s-be',SINR(be.zeroI),sp&&sp.i<=be.zeroI?'neg':'');
    if(be.floorI!==null){
      sumSet('s-bef',SINR(be.floorI),sp&&sp.i<be.floorI?'warn':'');
      el('s-item-bef').style.display='';
    } else {
      el('s-item-bef').style.display='none';
    }
    el('s-be-sep').style.display='';el('s-item-be').style.display='';
  } else {
    beEls.forEach(function(id){var e=el(id);if(e)e.style.display='none'});
  }
  updateMiniResult(pr,gp,mg);
  updateA11yStatus(pr,gp,mg);
  renderSolver();
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
      msg='Profit '+SINR(pr)+', GP '+PCT(gp)+', Margin '+PCT(mg);
      var q=getQty();
      if(q>1)msg+='. Total for '+q+' units '+SINR(pr*q);
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
  if(prEl){prEl.textContent=SINR(pr);prEl.className='mini-val'+(pr<0?' neg':'')}
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
  var inc=getIncentiveInr(LAST_CP),eff=effectiveCP(LAST_CP),floor=getFloor();

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
        {v:SINR(sp.e),c:''},
        {v:SINR(sp.i),c:''},
        {v:SINR(pr),c:pr>=0?'pos':'neg'},
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
  var inc=getIncentiveInr(cp),eff=effectiveCP(cp),floor=getFloor();
  var incTxt=inc>0?' · Incentives: '+CINR(inc)+' · Eff CP: '+CINR(eff):'';
  info.innerHTML='<span>MRP: <strong>'+INR(MI)+'</strong></span><span>CP excl GST: <strong>'+CINR(cp.e)+'</strong></span>'+incTxt;

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

  // Populate results after the DOM is built. This used to need an
  // elClearCache() first: the grid is rebuilt with the same wi-*-* ids, so
  // every node the old el() cache held was detached and updateWiResults wrote
  // into nodes that were no longer displayed — the cards showed '—' on every
  // re-render after the first. el() no longer caches, so the ids resolve to
  // whatever is currently in the document.
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
    var inc=getIncentiveInr(LAST_CP),eff=effectiveCP(LAST_CP);
    var spInc=getSPIncentiveInr(LAST_SP),effSP=effectiveSP(LAST_SP);
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
    toast('Enter CP and SP first.');
    return;
  }
  var inc=getIncentiveInr(LAST_CP),eff=effectiveCP(LAST_CP);
  var spInc=getSPIncentiveInr(LAST_SP),effSP=effectiveSP(LAST_SP);
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
  var visible=rows.slice(0,HIST_SHOWN);
  var html='';
  visible.forEach(function(row){
    var h=row.h,idx=row.idx;
    var tagHtml=h.tag
      ?'<button type="button" class="hist-tag" id="tag-'+idx+'" data-click="histTagEdit" data-p="'+idx+'" title="Edit tag" aria-label="Edit tag: '+escHtml(h.tag)+'">'+escHtml(h.tag)+'</button>'
      :'<button type="button" class="hist-tag empty" id="tag-'+idx+'" data-click="histTagEdit" data-p="'+idx+'" title="Add a tag" aria-label="Add a tag to this entry">+ Tag</button>';
    // h.time / h.gst come from storage and are not guaranteed to be the
    // numbers and formatted strings this app writes.
    var timeDisp=escHtml(h.ts?relTime(h.ts):h.time);
    var timeFull=escHtml(h.ts?fmtTime(h.ts):h.time);
    var gpCls=belowFloor(h.gp,floor.gp)?'warn':(h.gp>=0?'pos':'neg');
    var mgCls=belowFloor(h.mg,floor.mg)?'warn':(h.mg>=0?'pos':'neg');
    var prCls=h.pr>=0?'pos':'neg';
    html+='<div class="hist-entry" data-idx="'+idx+'" role="listitem">'
      +'<div class="hist-inner">'
        +'<div class="hist-meta">'
          +'<span class="hist-time" id="htime-'+idx+'" title="'+timeFull+'">'+timeDisp+'</span>'
          +tagHtml
          +(h.qty>1?'<span class="hist-gst">×'+escHtml(h.qty)+'</span>':'')
          +'<span class="hist-gst">GST '+escHtml(h.gst)+'%</span>'
          +'<button class="cmp-hist-btn" data-click="histCompare" data-p="'+idx+'" aria-label="Compare entry from '+timeDisp+'">Compare</button>'
          +'<button class="hist-del-btn" data-click="histDelete" data-p="'+idx+'" aria-label="Delete entry from '+timeDisp+'" title="Delete">'
            +'<svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true"><path d="M2 2l6 6M8 2l-6 6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>'
          +'</button>'
        +'</div>'
        +'<div class="hist-vals">'
          +'<span class="hist-kv"><span class="hist-k">MRP</span><span class="hist-v">'+INR(h.mrp)+'</span></span>'
          +'<span class="hist-kv"><span class="hist-k">CP excl</span><span class="hist-v">'+CINR(h.cpE)+'</span></span>'
          +'<span class="hist-kv"><span class="hist-k">SP excl</span><span class="hist-v">'+SINR(h.spE)+'</span></span>'
          +'<span class="hist-kv"><span class="hist-k">Profit</span><span class="hist-v '+prCls+'">'+SINR(h.pr)+'</span></span>'
          +'<span class="hist-kv"><span class="hist-k">GP %</span><span class="hist-v '+gpCls+'">'+PCT(h.gp)+'</span></span>'
          +'<span class="hist-kv"><span class="hist-k">Margin %</span><span class="hist-v '+mgCls+'">'+PCT(h.mg)+'</span></span>'
        +'</div>'
        +(h.incInr>0?'<div class="hist-inc"><span class="hist-inc-k">Inc</span><span>'+CINR(h.incInr)+'</span></div>':'')
      +'</div>'
    +'</div>';
  });
  if(rows.length>visible.length){
    html+='<button type="button" class="hist-more" data-click="histMore">'
      +'Show '+Math.min(HIST_PAGE,rows.length-visible.length)+' more'
      +' <span>('+visible.length+' of '+rows.length+')</span></button>';
  }
  c.innerHTML=html;
}

/* ── History export ── */
function exportHistoryCSV(){
  if(HISTORY.length===0){
    logWarn('exportHistoryCSV called with an empty history');
    toast('No history entries to export.');
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
    var inc=getIncentiveInr(LAST_CP),eff=effectiveCP(LAST_CP);
    var spInc=getSPIncentiveInr(LAST_SP),effSP=effectiveSP(LAST_SP);
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
  function deltaINR(curV,histV,higher,side){
    if(curV===null||histV===null)return'';
    var d=curV-histV;if(Math.abs(d)<0.005)return'<span class="dv nt">—</span>';
    // Math.abs() strips the sign, so a fall has to be signed explicitly —
    // otherwise -₹50 and +₹50 render identically and only the colour differs.
    var sign=d>0?'+':'−';
    var cls=(higher?(d>0):(d<0))?'up':'dn';
    // The delta wears the same symbol as the two cells it sits between.
    return '<span class="dv '+cls+'">'+sign+symFor(side||'base')+Math.abs(d).toFixed(2)+'</span>';
  }

  // cell builders
  function hd(txt,cls){return '<div class="cmp-hd'+(cls?' '+cls:'')+'">'+(txt||'')+'</div>'}
  function lbl(txt){return '<div class="cmp-cell lbl">'+txt+'</div>'}

  function valCell(v,fmt,cls){
    var disp=v===null||v===undefined?'—':(fmt==='inr'?INR(v):PCT(v));
    return '<div class="cmp-cell'+(cls?' '+cls:'')+'">'+(disp||'—')+'</div>';
  }
  function inrCell(v,posNeg,side){
    if(v===null||v===undefined)return'<div class="cmp-cell dim">—</div>';
    var cls=posNeg?(v>=0?'cmp-pos':'cmp-neg'):'';
    return'<div class="cmp-cell '+(cls||'')+'">'+money(v,side||'base')+'</div>';
  }
  function pctCell(v,floor,isGP){
    if(v===null||v===undefined)return'<div class="cmp-cell dim">—</div>';
    var f=isGP?floor.gp:floor.mg;
    var cls=belowFloor(v,f)?'cmp-warn':(v>=0?'cmp-pos':'cmp-neg');
    return'<div class="cmp-cell '+cls+'">'+PCT(v)+'</div>';
  }
  function deltaCell(html){return'<div class="cmp-cell cmp-delta">'+(html||'<span class="dv nt">—</span>')+'</div>'}

  var rows=[
    {label:'MRP (incl GST)',   cur:cur?cur.mrp:null,   hist:hist.mrp,   fmt:'inr', higher:null, side:'base'},
    {label:'CP excl GST',      cur:cur?cur.cpE:null,   hist:hist.cpE,   fmt:'inr', higher:false, side:'cost'},
    {label:'CP incl GST',      cur:cur?cur.cpI:null,   hist:hist.cpI,   fmt:'inr', higher:false, side:'cost'},
    {label:'SP excl GST',      cur:cur?cur.spE:null,    hist:hist.spE,   fmt:'inr', higher:true, side:'sale'},
    {label:'SP incl GST',      cur:cur?cur.spI:null,    hist:hist.spI,   fmt:'inr', higher:true, side:'sale'},
    {label:'Eff. SP excl GST', cur:cur?cur.effSPE:null, hist:hist.effSPE||hist.spE, fmt:'inr', higher:true, side:'sale'},
    {label:'SP Incentives',    cur:cur?cur.spIncInr:null,hist:hist.spIncInr||0,fmt:'inr', higher:true, side:'sale'},
    {label:'Eff. CP excl GST', cur:cur?cur.effCPE:null,hist:hist.effCPE,fmt:'inr', higher:false, side:'cost'},
    {label:'Incentives',       cur:cur?cur.incInr:null,hist:hist.incInr,fmt:'inr', higher:true, side:'cost'},
    {label:'Profit',           cur:cur?cur.pr:null,    hist:hist.pr,    fmt:'inr', higher:true, posNeg:true, side:'sale'},
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
      var c=r.posNeg?inrCell(r.cur,true,r.side):(r.cur===null?'<div class="cmp-cell dim">—</div>':inrCell(r.cur,false,r.side));
      var s=r.posNeg?inrCell(r.hist,true,r.side):inrCell(r.hist,false,r.side);
      html+=c+s;
      html+=deltaCell(deltaINR(r.cur,r.hist,r.higher,r.side));
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
  var inc=getIncentiveInr(LAST_CP),eff=effectiveCP(LAST_CP);
  var spInc=getSPIncentiveInr(LAST_SP),effSP=effectiveSP(LAST_SP);
  var pr=effSP-eff;
  var gp=(effSP>0)?(pr/effSP)*100:null,mg=(eff>0)?(pr/eff)*100:null;
  var lines=['PRICING SUMMARY — '+now(),'─────────────────────────','MRP (incl GST):   '+INR(MI),'GST Rate:         '+(G*100)+'%','','CP excl GST:      '+INR(LAST_CP.e),'CP incl GST:      '+INR(LAST_CP.i)];
  if(inc>0){lines.push('CP Incentives:    '+CINR(inc));lines.push('Eff. CP excl GST: '+CINR(eff))}
  lines.push('','SP excl GST:      '+SINR(LAST_SP.e),'SP incl GST:      '+SINR(LAST_SP.i));
  if(spInc>0){lines.push('SP Incentives:    '+SINR(spInc));lines.push('Eff. SP excl GST: '+SINR(effSP))}
  lines.push('','Profit:           '+SINR(pr),'GP %:             '+PCT(gp),'Margin %:         '+PCT(mg),'─────────────────────────');
  return lines.join('\n');
}
/**
 * Copy the summary, falling back to a dialog when the clipboard is unavailable.
 */
function copyToClipboard(){
  var text=getSummaryText();
  if(!text){toast('Enter CP and SP first.');return}
  navigator.clipboard.writeText(text).then(function(){
    var btn=el('copy-btn');if(!btn)return;
    var orig=btn.innerHTML;btn.textContent='✓ Copied!';
    setTimeout(function(){btn.innerHTML=orig},1800);
  }).catch(function(e){
    logWarn('clipboard unavailable, falling back to a dialog',e);
    askPrompt({title:'Copy summary',message:'The clipboard is unavailable here — select this and copy it.',
               label:'Summary',value:text,multiline:true,okLabel:'Done',onOk:function(){}});
  });
}
/**
 * Open WhatsApp with the summary pre-filled.
 */
function sendWhatsApp(){
  var text=getSummaryText();
  if(!text){toast('Enter CP and SP first.');return}
  window.open('https://wa.me/?text='+encodeURIComponent(text),'_blank');
}
/**
 * Open the mail client with the summary pre-filled.
 */
function sendEmail(){
  var text=getSummaryText();
  if(!text){toast('Enter CP and SP first.');return}
  window.location.href='mailto:?subject='+encodeURIComponent('Pricing Summary — Sterling Spares')+'&body='+encodeURIComponent(text);
}
/**
 * Print the page using the print stylesheet.
 */
function exportPDF(){
  if(!LAST_CP||!LAST_SP){toast('Enter CP and SP first.');return}
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
    var effCPE=effectiveCP(cp);
    var effSPE=effectiveSP(sp);
    fillProfit(effCPE,effSPE);fillIncPanel(cp);fillSpIncPanel(sp);fillSummary(cp,sp);
  }else if(T==='sp'){
    cp=resolveCP();prV=parseAmt('pri');fillCP(cp);fillIncPanel(cp);
    if(cp&&!isNaN(prV)){
      var effCP2=effectiveCP(cp);
      // SP incentives are unknown until an SP exists, so they stay approximate
      // here. The outbound landed cost is a flat amount, so it can be added to
      // the required effective SP exactly.
      var spe2=spFromProfit(effCP2,PM,prV);
      if(spe2!==null)spe2+=getSPLandedCost();
      if(spe2&&spe2>0){
        sp={e:spe2,i:spe2*(1+G)};
        var effSPE2=effectiveSP(sp);
        fillSP(sp);fillProfit(effCP2,effSPE2);fillSpIncPanel(sp);fillSummary(cp,sp);
      }else{fillSP(null);fillProfit(null,null);fillSpIncPanel(null);fillSummary(cp,null)}
    }else{fillSP(null);fillProfit(null,null);fillSpIncPanel(null);fillSummary(cp,null)}
  }else if(T==='cp'){
    spD=parseFloat(el('spd').value);prV=parseAmt('pri');sp=resolveSP();fillSP(sp);
    if(sp&&!isNaN(prV)){
      var effSPE3=effectiveSP(sp);
      cp=cpFromProfit(effSPE3,PM,prV);
      if(cp&&cp.e>0){fillCP(cp);fillProfit(effectiveCP(cp),effSPE3);fillIncPanel(cp);fillSpIncPanel(sp);fillSummary(cp,sp)}
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
  if(el('landed'))el('landed').value='';
  if(el('sp-landed'))el('sp-landed').value='';
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
  if(id==='wizard'&&typeof wzCalc!=='function'){
    withExtras(function(){ bnavGo('wizard'); });
    return;
  }
  if(id==='wizard'&&typeof wzCalc!=='function'){
    withExtras(function(){ bnavGo('wizard'); });
    return;
  }
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
/**
 * Run a DOM update inside a View Transition when the browser supports one, so
 * swapping layouts cross-fades instead of snapping.
 *
 * Falls back to calling fn directly — which is also what happens under reduced
 * motion, since a transition the user did not ask for is worse than none.
 * @param {Function} fn the DOM mutation to wrap
 */
function withViewTransition(fn){
  if(typeof document.startViewTransition !== 'function' || prefersReducedMotion()){
    fn();
    return;
  }
  try{
    document.startViewTransition(fn);
  }catch(e){
    logWarn('view transition failed, applying the change directly',e);
    fn();
  }
}

function setMode(m){
  if(m!=='default'&&typeof fcBuildCards!=='function'){
    // Quick mode lives in the deferred bundle; fetch it, then retry.
    withExtras(function(){ setMode(m); });
    return;
  }
  _applyMode(m);
}

/**
 * Switch mode from a user gesture, wrapped in a View Transition so the layout
 * cross-fades. Kept separate from setMode: startViewTransition defers its
 * callback, and setMode's programmatic callers run calc() immediately after,
 * so they need it to stay synchronous.
 * @param {'default'|'quick'} m
 */
function setModeAnimated(m){
  if(m===APP_MODE){ setMode(m); return; }
  withViewTransition(function(){ setMode(m); });
}

/**
 * Apply a mode switch. Split out of setMode so the whole DOM update can be
 * handed to startViewTransition as one callback.
 * @param {'default'|'quick'} m
 */
function _applyMode(m){
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




/* ── Build CP/SP cards dynamically ── */


// Live comma formatting for quick-mode ₹ text inputs



/* ── Result card ── */
/* ── Profit input card (when solving for SP or CP) ── */




/* ── Navigation ── */




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
function setHistQuery(q){HIST_QUERY=(q||'').trim().toLowerCase();HIST_SHOWN=HIST_PAGE;renderHistory()}
/** Reveal the next page of history rows. */
function histShowMore(){HIST_SHOWN+=HIST_PAGE;renderHistory();haptic('light')}
/**
 * Apply a history filter and repaint the pills.
 * @param {'all'|'pos'|'neg'|'below'|'tagged'} f
 */
function setHistFilter(f){
  HIST_FILTER=f;
  HIST_SHOWN=HIST_PAGE;
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
  cell.outerHTML='<input class="hist-tag-input" id="tagin-'+idx+'" aria-label="Tag for this entry" value="'+escHtml(cur)+'" maxlength="24" placeholder="Tag…" autocomplete="off" '
    +'data-blur="histTagSave" data-p="'+idx+'" '
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




/* ── Quote builder (multi-line) ──
   Each line is self-contained: MRP, qty and net CP/SP discounts on MRP.
   Incentives are deliberately excluded — enter the net landed discount per line. */
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
      +'  |  SP '+SINR(r.spI)+' incl GST');
    lines.push('   Line value '+SINR(r.lineVal)+'  |  Profit '+SINR(r.linePr)+'  |  GP '+PCT(r.gp));
  });
  lines.push('');
  lines.push('─────────────────────────');
  lines.push('Lines:        '+t.lines);
  lines.push('Units:        '+t.units);
  lines.push('Order value:  '+SINR(t.val));
  lines.push('Total profit: '+SINR(t.pr));
  lines.push('Blended GP:   '+PCT(t.gp));
  return lines.join('\n');
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
    if(typeof qtIsMobile!=='function')return;   // quote bundle not loaded yet
    var nowMobile=qtIsMobile();
    if(nowMobile!==_qtWasMobile){
      _qtWasMobile=nowMobile;
      var ov=el('overlay-quote');
      if(ov&&ov.classList.contains('open'))qtRender();
    }
  },150);
});




/* ── Deferred feature loading ───────────────────────────────────────────────
   Quick mode, the wizard and the quote builder live in app-extra.js. Entry
   points below await it before handing over. Requests are de-duplicated, and a
   failure is reported rather than leaving a dead button.
   ─────────────────────────────────────────────────────────────────────────── */
var _extrasPromise = null;

/**
 * Load the deferred feature bundle, at most once.
 * @returns {Promise} resolves when app-extra.js has executed
 */
function loadExtras(){
  if(_extrasPromise) return _extrasPromise;
  _extrasPromise = new Promise(function(resolve, reject){
    var s = document.createElement('script');
    s.src = 'assets/app-extra.js';
    s.async = false;
    s.onload = function(){ resolve(); };
    s.onerror = function(e){
      _extrasPromise = null;          // allow a retry
      logError('could not load app-extra.js — quick mode, wizard and quote are unavailable', e);
      toast('Could not load that feature. Check your connection.');
      reject(e);
    };
    document.head.appendChild(s);
  });
  return _extrasPromise;
}

/**
 * Run fn once the deferred bundle is available.
 * @param {Function} fn
 */
function withExtras(fn){
  loadExtras().then(function(){ guard('deferred feature', fn); }, function(){});
}

// Warm the bundle when the browser is idle, so the first use is usually instant
// without competing with first paint for main-thread time.
if(typeof requestIdleCallback === 'function'){
  requestIdleCallback(function(){ loadExtras().catch(function(){}); }, { timeout: 4000 });
} else {
  setTimeout(function(){ loadExtras().catch(function(){}); }, 2500);
}


/* ── Share-link payload validation ──────────────────────────────────────────
   ?s= is unauthenticated base64 JSON from whoever sends you the link, applied
   directly to app state. Everything below is allow-listed: unknown keys are
   dropped, values are coerced and range-checked, and a payload that fails is
   ignored rather than partially applied.
   ─────────────────────────────────────────────────────────────────────────── */
var SHARE_VERSION = 1;

/** One of a fixed set, or the fallback. */
function pickEnum(v, allowed, fallback){
  return allowed.indexOf(v) !== -1 ? v : fallback;
}
/** A numeric string safe to drop into an input's value. */
function numStr(v, max){
  if(v === undefined || v === null) return undefined;
  var n = parseFloat(String(v).replace(/,/g, ''));
  if(isNaN(n) || !isFinite(n)) return undefined;
  if(max !== undefined && Math.abs(n) > max) return undefined;
  return String(n);
}
/**
 * Validate and normalise a decoded share payload.
 * @param {*} raw parsed JSON from the ?s= parameter or localStorage
 * @returns {Object|null} a state object containing only known-good fields,
 *   or null when the payload is not usable at all
 */
function validateShareState(raw){
  if(!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  var s = {};

  var g = parseFloat(raw.g);
  if(!isNaN(g) && g >= 0 && g <= 100) s.g = g;

  if(typeof raw.ccy === 'string' && CCY_CODES.indexOf(raw.ccy) !== -1) s.ccy = raw.ccy;
  if(typeof raw.fxs === 'string' && FX_SCOPES.indexOf(raw.fxs) !== -1) s.fxs = raw.fxs;

  if(raw.m !== undefined) s.m = numStr(raw.m, 1e12);
  ['cpd','cpv','spd','spv','pri','fgp','fmg'].forEach(function(k){
    var v = numStr(raw[k], 1e12);
    if(v !== undefined) s[k] = v;
  });

  if(raw.lc !== undefined){
    var lc = numStr(raw.lc, 1e9);
    if(lc !== undefined && parseFloat(lc) >= 0) s.lc = lc;
  }
  if(raw.slc !== undefined){
    var slc = numStr(raw.slc, 1e9);
    if(slc !== undefined && parseFloat(slc) >= 0) s.slc = slc;
  }

  var qty = parseInt(raw.qty, 10);
  if(!isNaN(qty) && qty >= 1 && qty <= 1e6) s.qty = String(qty);

  if(raw.rnd !== undefined){
    s.rnd = raw.rnd === 'off' ? 'off' : numStr(raw.rnd, 1e5);
    if(s.rnd === undefined || (s.rnd !== 'off' && parseFloat(s.rnd) <= 0)) delete s.rnd;
  }

  if(raw.t)     s.t     = pickEnum(raw.t, ['profit','sp','cp'], undefined);
  if(raw.cm)    s.cm    = pickEnum(raw.cm, ['excl','incl','manual'], undefined);
  if(raw.sm)    s.sm    = pickEnum(raw.sm, ['excl','incl','manual'], undefined);
  if(raw.cpms)  s.cpms  = pickEnum(raw.cpms, ['incl','excl'], undefined);
  if(raw.spms)  s.spms  = pickEnum(raw.spms, ['incl','excl'], undefined);
  if(raw.pm)    s.pm    = pickEnum(raw.pm, ['val','gp','margin'], undefined);
  if(raw.cdm)   s.cdm   = pickEnum(raw.cdm, ['before','after'], undefined);
  if(raw.scdm)  s.scdm  = pickEnum(raw.scdm, ['before','after'], undefined);
  if(raw.scm)   s.scm   = pickEnum(raw.scm, ['pct','abs'], undefined);
  if(raw.sscm)  s.sscm  = pickEnum(raw.sscm, ['pct','abs'], undefined);
  Object.keys(s).forEach(function(k){ if(s[k] === undefined) delete s[k]; });

  // Incentive maps are keyed by incentive key, which is interpolated into
  // element ids elsewhere — so the key rules apply here too.
  function cleanModes(obj){
    if(!obj || typeof obj !== 'object') return undefined;
    var out = {}, any = false;
    Object.keys(obj).forEach(function(k){
      if(!isValidIncKey(k)) return;
      out[k] = obj[k] === 'abs' ? 'abs' : 'pct';
      any = true;
    });
    return any ? out : undefined;
  }
  function cleanInc(obj){
    if(!obj || typeof obj !== 'object') return undefined;
    var out = {}, any = false;
    Object.keys(obj).forEach(function(k){
      if(!isValidIncKey(k)) return;
      var e = obj[k];
      if(!e || typeof e !== 'object') return;
      var v = numStr(e.v, 1e9);
      out[k] = { on: !!e.on, v: v === undefined ? '' : v };
      any = true;
    });
    return any ? out : undefined;
  }
  var im = cleanModes(raw.incm);   if(im) s.incm   = im;
  var sm = cleanModes(raw.spincm); if(sm) s.spincm = sm;
  var ic = cleanInc(raw.inc);      if(ic) s.inc    = ic;
  var sc = cleanInc(raw.spinc);    if(sc) s.spinc  = sc;

  if(raw._as !== undefined) s._as = !!raw._as;

  return Object.keys(s).length ? s : null;
}

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
    v:SHARE_VERSION,
    m:el('mrp').value,
    g:G*100,
    t:T,
    cm:CM,cpms:CPMS,cpd:el('cpd').value,cpv:el('cpv').value,
    sm:SM,spms:SPMS,spd:el('spd').value,spv:el('spv').value,
    pm:PM,pri:el('pri').value,
    cdm:CDM,scm:SCM,scdm:SCDM,sscm:SSCM,incm:INC_MODE,spincm:SP_INC_MODE,
    ccy:DISPLAY_CCY,fxs:FX_SCOPE,
    qty:el('qty')?el('qty').value:'1',rnd:ROUND_MODE,lc:el('landed')?el('landed').value:'',slc:el('sp-landed')?el('sp-landed').value:'',
    fgp:el('floor-gp').value,fmg:el('floor-mg').value,
    inc:inc,spinc:spinc
  };
}

/**
 * Apply a state object from a share link or localStorage.
 * Each field is applied independently so one bad value can't block the rest.
 * @param {Object} s state object from getShareState
 */
function applyShareState(raw){
  var s=validateShareState(raw);
  if(!s){
    logWarn('share/saved state rejected: no usable fields',raw);
    return;
  }
  try{
    if(s.ccy)setDisplayCcy(s.ccy,s.fxs);
    if(s.rnd)setRounding(s.rnd);
    if(s.qty!==undefined&&el('qty'))el('qty').value=s.qty;
    if(s.lc!==undefined&&el('landed'))el('landed').value=s.lc;
    if(s.slc!==undefined&&el('sp-landed'))el('sp-landed').value=s.slc;
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
    askPrompt({title:'Copy link',message:'The clipboard is unavailable here — select this and copy it.',
               label:'Share link',value:url,readOnly:true,maxLength:4000,okLabel:'Done',onOk:function(){}});
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
    case 'e': case 'E': openPresetManager(); break;
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
  for(var i=0;i<OB_STEPS.length;i++)dots+='<button type="button" class="ob-dot'+(i===OB_STEP?' cur':'')+'" data-click="obGoto" data-p="'+i+'" aria-label="Go to step '+(i+1)+'"'+(i===OB_STEP?' aria-current="step"':'')+'></button>';
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
loadPresets();
loadFx();renderCcyList();refreshCurrencySymbols();renderFxNote();
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




















































































/**
 * Persist the quote lines.
 */
function saveQuote(){
  try{ localStorage.setItem('pc-quote',JSON.stringify(QUOTE)) }
  catch(e){ logError('could not save quote lines (pc-quote)',e); }
}


































