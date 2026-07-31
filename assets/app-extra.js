/* Sterling Spares Pricing Calculator — deferred features.
 *
 * Quick mode (fc*), the wizard (wz*) and the quote builder (qt*). None is
 * reachable on first paint, and together they were a third of the code parsed
 * and compiled on every load. Deferring them measured TBT 353ms -> 255ms and
 * FCP 452ms -> 388ms under 4x CPU throttle.
 *
 * Boundaries come from parsing app.js with acorn, not from matching braces or
 * cutting a line range: an earlier hand-rolled attempt mis-detected a function
 * end and moved saveQuote across with it.
 *
 * State variables (FC_*, WZ_*, QUOTE) and saveQuote/loadQuote stay in the core
 * bundle — initialisation, undo and the GST label updater read them before
 * this file may have loaded.
 *
 * Loaded as a classic script into the same global scope; see loadExtras().
 */

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
  var s=el('fc-pr-sym');if(s)s.textContent=m==='val'?symFor('sale'):'%';
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
    if(el('fc-mx'))el('fc-mx').textContent=INR(me);
    if(el('fc-mg'))el('fc-mg').textContent=INR(mrpV-me);
  }
  // Update CP preview if visible
  if(el('fc-cp-e')||el('fc-cp-i')){
    var cpPrev=mrpV>0?fcResolveCP(mrpV):null;
    if(el('fc-cp-e'))el('fc-cp-e').textContent=cpPrev?CINR(cpPrev.e):'—';
    if(el('fc-cp-i'))el('fc-cp-i').textContent=cpPrev?CINR(cpPrev.i):'—';
  }
  // Update SP preview if visible
  if(el('fc-sp-e')||el('fc-sp-i')){
    var spPrev=mrpV>0?fcResolveSP(mrpV):null;
    if(el('fc-sp-e'))el('fc-sp-e').textContent=spPrev?SINR(spPrev.e):'—';
    if(el('fc-sp-i'))el('fc-sp-i').textContent=spPrev?SINR(spPrev.i):'—';
  }
  if(FC_STEP===3)fcRenderResult();
  debouncedSaveQState();
}

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
  var isRupee=(symTxt!=='%');
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
  manWrap.appendChild(fcMkField(symFor('cost'),'fc-cpv',FC_CPMS==='incl'?'CP incl GST':'CP excl GST'));
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
  acts.innerHTML='<button class="fc-btn fc-btn-back" data-click="fcBack"><svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M9 3L5 7l4 4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg> Back</button>'
    +'<button class="fc-btn fc-btn-next" data-click="fcNext">Next <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M5 3l4 4-4 4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></button>';
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
  manWrap.appendChild(fcMkField(symFor('sale'),'fc-spv',FC_SPMS==='incl'?'SP incl GST':'SP excl GST'));
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
  acts.innerHTML='<button class="fc-btn fc-btn-back" data-click="fcBack"><svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M9 3L5 7l4 4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg> Back</button>'
    +'<button class="fc-btn fc-btn-next" data-click="fcNext">'+(FC_T==='cp'?'Next':'Calculate')+' <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M5 3l4 4-4 4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></button>';
  card.appendChild(acts);
}

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
  sym.id='fc-pr-sym';sym.textContent=FC_PM==='val'?symFor('sale'):'%';
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
  acts.innerHTML='<button class="fc-btn fc-btn-back" data-click="fcBack"><svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M9 3L5 7l4 4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg> Back</button>'
    +'<button class="fc-btn fc-btn-next" data-click="fcNext">Calculate <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M5 3l4 4-4 4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></button>';
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
  html+=fcRItem('MRP (incl GST)', INR(mrpV), '', '');
  html+=fcRItem('MRP excl GST',   INR(me),   '', '');
  html+=fcRItem('CP excl GST'+(FC_T==='cp'?calcdBadge:''), cp?CINR(cp.e):'—', cpOver?'warn':'', '');
  html+=fcRItem('CP incl GST',  cp?CINR(cp.i):'—', cpOver?'warn':'', '');
  html+=fcRItem('SP excl GST'+(FC_T==='sp'?calcdBadge:''), sp?SINR(sp.e):'—', spOver?'warn':'', '');
  html+=fcRItem('SP incl GST',  sp?SINR(sp.i):'—', spOver?'warn':'', '');
  html+=fcRItem('Profit', pr!==null?SINR(pr):'—', pr!==null?(pr>=0?'pos':'neg'):'', pr!==null&&pr<0?'profit-neg':pr!==null&&pr>=0?'profit-pos':'');
  html+=fcRItem('GP %',     gp!==null?fcPCT(gp):'—', gp!==null?(gp>=0?'pos':'neg'):'', '');
  html+=fcRItem('Margin %', mg!==null?fcPCT(mg):'—', mg!==null?(mg>=0?'pos':'neg'):'', '');
  html+='</div>';

  if(cpOver)html+='<div class="fc-over-alert" style="margin-top:6px">⚠ CP incl GST exceeds MRP</div>';
  if(spOver)html+='<div class="fc-over-alert" style="margin-top:4px">⚠ SP incl GST exceeds MRP</div>';

  html+='<div class="fc-actions">'
    +'<button class="fc-btn fc-btn-back" data-click="fcBack"><svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M9 3L5 7l4 4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg> Back</button>'
    +'<div style="display:flex;gap:8px">'
    +'<button class="fc-btn fc-btn-full" data-click="fcToDefault">Full view</button>'
    +'<button class="fc-btn fc-btn-next" data-click="fcReset">New <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M7 2C4.24 2 2 4.24 2 7s2.24 5 5 5 5-2.24 5-5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><path d="M10 1.5l2 1.2-2 1.2" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg></button>'
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
  el('wz-sc-unit').textContent=m==='abs'?symFor('cost'):'%';
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
  rv('wz-rde',CINR(price.e)+' / '+de.toFixed(2)+'%',de<0?'neg':'');
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

function qtBlank(){return{desc:'',mrp:'',qty:1,cpd:'',spd:''}}

/**
 * Compute one quote line at the current GST and rounding settings.
 * @param {Object} L line record
 * @returns {Object|null} null when MRP or either discount is missing/invalid
 */
function qtCalcLine(L){
  // `parseInt(...)||1` let a negative through, since -4 is truthy — a line of
  // -4 units produced negative line values, a negative order total and a
  // negative unit count in the totals row. Clamp exactly as getQty() does on
  // the main calculator, so the two agree.
  var mrp=parseFloat(L.mrp),qty=parseInt(L.qty,10);
  if(isNaN(qty)||qty<1)qty=1;
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
  var esc=escHtml(val);
  return '<input class="qt-in '+(opts.cls||'')+'"'
    +(opts.type?' type="'+opts.type+'"':'')
    +(opts.mode?' inputmode="'+opts.mode+'"':'')
    +' value="'+esc+'" placeholder="'+(opts.ph||'')+'"'
    +(opts.min!==undefined?' min="'+opts.min+'"':'')
    +(opts.max!==undefined?' max="'+opts.max+'"':'')
    +(opts.step?' step="'+opts.step+'"':'')
    +(opts.style?' style="'+opts.style+'"':'')
    +(opts.label?' aria-label="'+opts.label+'"':'')
    +' data-focus="undoQuote"'
    +' data-input="qtSet" data-p="'+i+'" data-q="'+field+'" autocomplete="off">';
}

/**
 * Remove-line button, shared by both layouts.
 * @param {number} i line index
 * @returns {string} HTML
 */
function qtDelBtnHTML(i){
  return '<button class="qt-del" data-click="qtDelLine" data-p="'+i+'" title="Remove line" aria-label="Remove line '+(i+1)+'">'
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
      +'<td class="num" id="qtd-spi-'+i+'">'+(r?SINR(r.spI):'—')+'</td>'
      +'<td class="num" id="qtd-val-'+i+'">'+(r?SINR(r.lineVal):'—')+'</td>'
      +'<td class="num '+prCls+'" id="qtd-pr-'+i+'">'+(r?SINR(r.linePr):'—')+'</td>'
      +'<td class="num '+gpCls+'" id="qtd-gp-'+i+'">'+(r?PCT(r.gp):'—')+'</td>'
      +'<td>'+qtDelBtnHTML(i)+'</td>'
      +'</tr>';
  });
  var t=qtTotals();
  h+='</tbody><tfoot><tr class="qt-foot">'
    +'<td colspan="3">Total — '+t.lines+' line'+(t.lines===1?'':'s')+'</td>'
    +'<td class="num" id="qt-total-units">'+t.units+'</td>'
    +'<td colspan="2"></td><td></td>'
    +'<td class="num" id="qt-total-val">'+SINR(t.val)+'</td>'
    +'<td class="num '+(t.pr>=0?'qt-pos':'qt-neg')+'" id="qt-total-pr">'+SINR(t.pr)+'</td>'
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
        +'<span class="qtc-o"><span class="qtc-ol">SP incl '+g+'%</span><span id="qtd-spi-'+i+'">'+(r?SINR(r.spI):'—')+'</span></span>'
        +'<span class="qtc-o"><span class="qtc-ol">Line value</span><span id="qtd-val-'+i+'">'+(r?SINR(r.lineVal):'—')+'</span></span>'
        +'<span class="qtc-o"><span class="qtc-ol">Profit</span><span class="'+prCls+'" id="qtd-pr-'+i+'">'+(r?SINR(r.linePr):'—')+'</span></span>'
        +'<span class="qtc-o"><span class="qtc-ol">GP %</span><span class="'+gpCls+'" id="qtd-gp-'+i+'">'+(r?PCT(r.gp):'—')+'</span></span>'
      +'</div>'
    +'</div>';
  });
  var t=qtTotals();
  h+='<div class="qtc qtc-total">'
    +'<div class="qtc-thead">Total — '+t.lines+' line'+(t.lines===1?'':'s')+' · <span id="qt-total-units">'+t.units+'</span> units</div>'
    +'<div class="qtc-out">'
      +'<span class="qtc-o"><span class="qtc-ol">Order value</span><span id="qt-total-val">'+SINR(t.val)+'</span></span>'
      +'<span class="qtc-o"><span class="qtc-ol">Total profit</span><span class="'+(t.pr>=0?'qt-pos':'qt-neg')+'" id="qt-total-pr">'+SINR(t.pr)+'</span></span>'
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
    put('qtd-spi-'+i, r?SINR(r.spI):'—');
    put('qtd-val-'+i, r?SINR(r.lineVal):'—');
    put('qtd-pr-'+i,  r?SINR(r.linePr):'—', inTable?('num '+prCls):prCls);
    put('qtd-gp-'+i,  r?PCT(r.gp):'—',     inTable?('num '+gpCls):gpCls);
  });
  var t=qtTotals();
  put('qt-total-units',String(t.units));
  put('qt-total-val',SINR(t.val));
  put('qt-total-pr',SINR(t.pr),(inTable?'num ':'')+(t.pr>=0?'qt-pos':'qt-neg'));
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

/* ── Exchange rates (deferred) ──────────────────────────────────────────────
   Neither of these runs on first paint: fetchRates is a network call behind a
   user action, and onFxManual is a Settings field. The formatting and
   conversion they feed — INR(), fxRate(), toDisplay() — stay in the core,
   because every rendered amount goes through them.
   ─────────────────────────────────────────────────────────────────────────── */
/**
 * Fetch today's rates.
 *
 * @param {boolean} [quiet] suppress the success toast, for automatic refreshes
 * @returns {Promise} resolves whether or not the fetch succeeded — a missing
 *          rate is a degraded state, not an error the caller must handle
 */
function _fetchRatesImpl(quiet){
  if(_fxBusy)return Promise.resolve(false);
  if(typeof fetch!=='function'){
    logWarn('fetch is unavailable; exchange rates cannot be updated');
    if(!quiet)toast('Live rates need a newer browser');
    return Promise.resolve(false);
  }
  _fxBusy=true;
  renderFxNote();
  // Without a deadline a hung connection leaves the button spinning forever.
  var ctl=(typeof AbortController==='function')?new AbortController():null;
  var timer=setTimeout(function(){ if(ctl)ctl.abort(); },10000);
  return fetch(FX_URL,ctl?{signal:ctl.signal}:undefined)
    .then(function(r){
      if(!r.ok)throw new Error('HTTP '+r.status);
      return r.json();
    })
    .then(function(d){
      if(!d||d.result!=='success'||!d.rates||d.base_code!=='INR')
        throw new Error('unexpected payload');
      var clean={INR:1},found=0;
      CCY_CODES.forEach(function(c){
        var v=d.rates[c];
        if(typeof v==='number'&&isFinite(v)&&v>0){clean[c]=v;found++}
      });
      if(found<2)throw new Error('no usable rates in payload');
      FX.rates=clean;
      FX.fetched=nowMs();
      FX.src='live';
      saveFx();
      calc();
      renderFxNote();
      if(!quiet)toast('Rates updated',true);
      return true;
    })
    .catch(function(e){
      logError('could not fetch exchange rates from '+FX_URL,e);
      if(!quiet){
        toast(fxRate()===null?'Could not fetch rates — set one manually in Settings'
                             :'Could not fetch rates — using the saved ones');
      }
      renderFxNote();
      return false;
    })
    .then(function(r){ clearTimeout(timer); _fxBusy=false; renderFxNote(); return r; });
}

/**
 * Manual rate override, entered as rupees per unit — the way a rate is quoted.
 * @param {HTMLInputElement} inp
 */
function _onFxManualImpl(inp){
  if(DISPLAY_CCY==='INR')return;
  var raw=String(inp.value).trim();
  if(raw===''){
    if(FX.manual)delete FX.manual[DISPLAY_CCY];
    saveFx();renderFxNote();calc();
    return;
  }
  var per=parseFloat(raw);
  if(isNaN(per)||per<=0){
    logWarn('ignoring invalid manual rate: '+JSON.stringify(inp.value)+' (expected a positive number)');
    toast('Rate must be greater than 0');
    renderFxNote();
    return;
  }
  FX.manual=FX.manual||{};
  FX.manual[DISPLAY_CCY]=1/per;      // stored as units per rupee, like the API
  saveFx();renderFxNote();calc();
  toast('Using ₹'+per+' per '+DISPLAY_CCY,true);
}

/* ── Feature switches (deferred) ────────────────────────────────────────────
   Reading what a feature holds and drawing the Settings grid only happen when
   Settings is open. featOn() and applyFeatureVisibility() stay in the core:
   one is in the calculation hot path, the other runs on first paint.
   ─────────────────────────────────────────────────────────────────────────── */
/**
 * Values held by an incentive panel, as a readable list.
 * @param {'cp'|'sp'} panel
 * @returns {Array<string>}
 */
function _incValues(panel){
  var keys=panel==='cp'?INC_KEYS:SP_INC_KEYS, pfx=panel==='cp'?['it-','iv-']:['sit-','siv-'];
  var out=[];
  keys.forEach(function(k){
    var cb=document.getElementById(pfx[0]+k),iv=document.getElementById(pfx[1]+k);
    var v=iv?parseFloat(iv.value):NaN;
    if(cb&&cb.checked&&!isNaN(v)&&v>0)out.push((INC_LABELS[k]||k)+' '+v+(incIsAbsolute(panel,k)?'':'%'));
  });
  return out;
}
function _fieldVal(id){
  var e=el(id);
  if(!e)return null;
  var v=parseFloat(String(e.value).replace(/,/g,''));
  return(isNaN(v)||v===0)?null:v;
}

/** Draw the feature switches. */
function _renderFeatureGridImpl(){
  var c=el('feat-grid');
  if(!c)return;
  c.innerHTML=FEATURE_DEFS.map(function(f){
    var on=featOn(f.k);
    return '<button class="feat-chip'+(on?' on':'')+'" data-click="featToggle" data-p="'+f.k+'" '+
      'role="switch" aria-checked="'+(on?'true':'false')+'">'+
      '<span class="feat-name">'+escHtml(f.name)+'</span>'+
      '<span class="feat-hint">'+escHtml(f.hint)+'</span></button>';
  }).join('');
}
/**
 * Turn a feature on, or off after saying what that costs.
 *
 * Switching something off throws its values away, so the ones it is holding are
 * named before anything happens — "2 saved presets" is a very different
 * decision from an empty panel. Turning one back on needs no ceremony.
 *
 * @param {string} k feature key
 */
function _toggleFeatureImpl(k){
  var f=featureDef(k);
  if(!f){ logWarn('unknown feature '+JSON.stringify(k)); return }
  if(!featOn(k)){                        // switching back on
    FEATURES[k]=true;
    saveFeatures();applyFeatureVisibility();renderFeatureGrid();calc();
    toast(f.name+' is back',true);
    return;
  }
  var held=[];
  try{ held=f.values()||[] }catch(e){ logError('could not read values held by '+k,e) }
  var turnOff=function(){
    pushUndo('turn off '+f.name);
    if(held.length){ try{ f.clear() }catch(e){ logError('could not clear '+k,e) } }
    FEATURES[k]=false;
    saveFeatures();applyFeatureVisibility();renderFeatureGrid();calc();
    debouncedSaveCalcState();
    toast(f.name+' turned off',true);
  };
  if(!held.length)return turnOff();
  askConfirm('Turn off '+f.name,
    'This will clear '+held.join(', ')+'.',
    'The setting and its values are removed. This can be undone.',
    'Turn off and clear',turnOff);
}
