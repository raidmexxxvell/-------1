// error-overlay.js
// Простая панель отладки: перехват глобальных ошибок и показ поверх приложения.
(function(){
  if (window.__ERROR_OVERLAY__) return;
  const maxEntries = 100; // немного увеличим буфер
  let entries = [];
  let captureConsole = true;
  let autoOpen = true;
  let warnCount = 0;
  let errorCount = 0;

  function el(tag, css){ const n=document.createElement(tag); if(css) n.style.cssText=css; return n; }

  function ensureEl(){
    let host = document.getElementById('error-overlay');
    if (!host){
      host = el('div','position:fixed;top:0;left:0;right:0;max-height:45%;overflow:auto;z-index:4000;font:12px/1.4 monospace;background:rgba(0,0,0,.88);color:#f0b6b6;padding:6px 8px;display:none;box-shadow:0 8px 18px rgba(0,0,0,.45)');
      host.id='error-overlay';

      const bar = el('div','display:flex;align-items:center;gap:8px;margin-bottom:4px;flex-wrap:wrap');
      const title = el('div'); title.textContent='JS Monitor'; title.style.fontWeight='700';
      const counters = el('div','margin-left:auto;display:flex;gap:8px;align-items:center');
      const cntWarn = el('span'); cntWarn.id='eo-warn'; cntWarn.style.color='#facc15'; cntWarn.textContent='W:0';
      const cntErr = el('span'); cntErr.id='eo-err'; cntErr.style.color='#f87171'; cntErr.textContent='E:0';
      counters.append(cntWarn, cntErr);

      const filterWrap = el('label','display:flex;align-items:center;gap:6px;background:#111;border:1px solid #333;border-radius:6px;padding:2px 6px');
      const filterInput = document.createElement('input'); filterInput.type='text'; filterInput.placeholder='фильтр...'; filterInput.style.cssText='background:#0b0b0b;border:none;color:#ddd;outline:none'; filterInput.id='eo-filter';
      filterInput.addEventListener('input', applyFilter);
      filterWrap.append('🔎', filterInput);

      const chkConsole = document.createElement('input'); chkConsole.type='checkbox'; chkConsole.checked = captureConsole; chkConsole.id='eo-cap-console';
      chkConsole.addEventListener('change',()=>{ captureConsole = chkConsole.checked; });
      const chkLbl = el('label','display:flex;align-items:center;gap:4px'); chkLbl.append(chkConsole, document.createTextNode('console'));

      const chkAuto = document.createElement('input'); chkAuto.type='checkbox'; chkAuto.checked = autoOpen; chkAuto.id='eo-auto-open';
      chkAuto.addEventListener('change',()=>{ autoOpen = chkAuto.checked; });
      const chkAutoLbl = el('label','display:flex;align-items:center;gap:4px'); chkAutoLbl.append(chkAuto, document.createTextNode('auto-open'));

      const btnHide=btn('×','#400','#a44',()=>{ host.style.display='none'; });
      const btnClear=btn('Очистить','#222','#555',()=>{ entries=[]; list.innerHTML=''; warnCount=0; errorCount=0; updateCounters(); });
      const btnCopy=btn('Копировать','#222','#555',()=>{ try { navigator.clipboard.writeText(entries.map(e=>e.raw).join('\n')); } catch(_) {} });
      const btnToggle=btn('▼','#222','#555',()=>{ list.style.display=(list.style.display==='none'?'block':'none'); });

      bar.append(title, filterWrap, chkLbl, chkAutoLbl, btnHide, btnClear, btnCopy, btnToggle, counters);

      const list = el('div','font-size:11px;white-space:pre-wrap;word-break:break-word;'); list.id='error-overlay-list';
      host.append(bar, list); document.documentElement.appendChild(host);
    }
    return host;
  }

  function btn(text,bg,border,fn){ const b=el('button',`background:${bg};border:1px solid ${border};color:#ddd;border-radius:4px;cursor:pointer;padding:2px 6px;font-size:12px;`); b.textContent=text; b.onclick=fn; return b; }

  function updateCounters(){
    const w=document.getElementById('eo-warn'); if(w) w.textContent='W:'+warnCount;
    const e=document.getElementById('eo-err'); if(e) e.textContent='E:'+errorCount;
  }

  function renderEntry(entry){
    const line=document.createElement('div');
    line.style.margin='2px 0 6px';
    const head=el('div','display:flex;gap:6px;align-items:center');
    const time=el('span','color:#888'); time.textContent=entry.time;
    const lvl=el('span',`padding:0 6px;border-radius:4px;background:${entry.level==='warn'?'#5b4b00':'#5a1111'};color:#fff`); lvl.textContent=entry.level;
    const msg=el('span','color:#f3f3f3'); msg.textContent=entry.msg;
    head.append(time,lvl,msg);
    line.appendChild(head);
    if(entry.stack){
      const pre=el('pre','margin:2px 0 0;color:#aaa;white-space:pre-wrap'); pre.textContent=String(entry.stack).replace(/[<>]/g,'');
      line.appendChild(pre);
    }
    return line;
  }

  function applyFilter(){
    const q = (document.getElementById('eo-filter')?.value||'').toLowerCase();
    const list=document.getElementById('error-overlay-list'); if(!list) return;
    list.innerHTML='';
    entries.filter(e=>!q || (e.msg&&e.msg.toLowerCase().includes(q)) || (e.stack&&e.stack.toLowerCase().includes(q))).forEach(e=>{
      list.appendChild(renderEntry(e));
    });
  }

  function addEntry(entry){
    const host=ensureEl(); const list=host.querySelector('#error-overlay-list');
    entries.push(entry); if (entries.length>maxEntries) entries.shift();
    if(entry.level==='warn') warnCount++; else if(entry.level==='error') errorCount++;
    updateCounters();
    list.appendChild(renderEntry(entry));
    if (autoOpen) host.style.display='block';
  }

  window.addEventListener('error', (e)=>{
    try { addEntry({ level:'error', time:new Date().toISOString().split('T')[1].replace('Z',''), msg:(e.message||'Error')+' @'+e.filename+':'+e.lineno+':'+e.colno, stack:e.error && e.error.stack || '', raw:(e.message||'') }); } catch(_) {}
  });
  window.addEventListener('unhandledrejection', (e)=>{
    let msg='unhandledrejection'; let stack='';
    try { const r=e.reason; if (r){ msg += ': '+(r.message||r.status||r.toString()); stack=r.stack||''; } } catch(_) {}
    addEntry({ level:'error', time:new Date().toISOString().split('T')[1].replace('Z',''), msg, stack, raw:msg+' '+stack });
  });

  // Перехват console.warn/error (по флагу)
  try {
    const origWarn = console.warn.bind(console);
    const origError = console.error.bind(console);
    console.warn = function(){ origWarn.apply(console, arguments); if(!captureConsole) return; try { const m = Array.from(arguments).map(String).join(' '); addEntry({ level:'warn', time:new Date().toISOString().split('T')[1].replace('Z',''), msg:m, stack:'', raw:m }); } catch(_){} };
    console.error = function(){ origError.apply(console, arguments); if(!captureConsole) return; try { const m = Array.from(arguments).map(String).join(' '); addEntry({ level:'error', time:new Date().toISOString().split('T')[1].replace('Z',''), msg:m, stack:'', raw:m }); } catch(_){} };
  } catch(_){}

  console.log('[error-overlay] initialized');
  window.__ERROR_OVERLAY__ = true;
  try { window.__ERROR_OVERLAY_LOADED__ = true; } catch(_){ }
})();
