(function(){
  // ---- db.js ----
  const DB_NAME = 'finance-tracker';
  // Bump DB version to ensure new object stores (e.g., 'positions') are created on upgrade
  const DB_VERSION = 3;
  let _db;
  function initDb(){
    return new Promise((resolve, reject)=>{
      const openReq = indexedDB.open(DB_NAME, DB_VERSION);
      openReq.onupgradeneeded = () => {
        const d = openReq.result;
        if (!d.objectStoreNames.contains('valuations')) {
          const store = d.createObjectStore('valuations', { keyPath: 'id', autoIncrement: true });
          store.createIndex('by_date', 'date');
          store.createIndex('by_kind_name', ['kind', 'name']);
        }
        if (!d.objectStoreNames.contains('snapshots')) {
          d.createObjectStore('snapshots', { keyPath: 'date' });
        }
        if (!d.objectStoreNames.contains('transactions')) {
          const store = d.createObjectStore('transactions', { keyPath: 'id', autoIncrement: true });
          store.createIndex('by_date', 'date');
          store.createIndex('by_category', 'category');
          store.createIndex('by_account', 'account');
        }
        if (!d.objectStoreNames.contains('categories')) {
          const store = d.createObjectStore('categories', { keyPath: 'id', autoIncrement: true });
          store.createIndex('by_name', 'name', { unique: true });
        }
        if (!d.objectStoreNames.contains('positions')) {
          const store = d.createObjectStore('positions', { keyPath: 'id', autoIncrement: true });
          store.createIndex('by_symbol', 'symbol');
        }
      };
      openReq.onsuccess = () => { _db = openReq.result; resolve(); };
      openReq.onerror = () => reject(openReq.error);
    });
  }
  function addValuationPoint({ kind, name, value, date, month, desc }){
    return new Promise((resolve, reject)=>{
      const tx = _db.transaction(['valuations'], 'readwrite');
      const m = month || (typeof date === 'string' ? date : new Date(date).toISOString()).slice(0,7) + '-01';
      const data = { kind, name, value, date, month: m, desc: desc || '' };
      const req = tx.objectStore('valuations').add(data);
      req.onsuccess = () => resolve({ ...data, id: req.result });
      req.onerror = () => reject(req.error);
    });
  }
  function getAllValuations(){
    return new Promise((resolve, reject)=>{
      const tx = _db.transaction(['valuations'], 'readonly');
      const req = tx.objectStore('valuations').getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }
  function getRecentValuations(limit = 8){
    return new Promise((resolve, reject)=>{
      const tx = _db.transaction(['valuations'], 'readonly');
      const req = tx.objectStore('valuations').getAll();
      req.onsuccess = () => {
        const all = (req.result || []).sort((a,b) => b.date.localeCompare(a.date));
        resolve(all.slice(0, limit));
      };
      req.onerror = () => reject(req.error);
    });
  }
  function writeSnapshots(snapshots){
    return new Promise((resolve, reject)=>{
      const tx = _db.transaction(['snapshots'], 'readwrite');
      const store = tx.objectStore('snapshots');
      for (const s of snapshots) store.put(s);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }
  function readSnapshots(){
    return new Promise((resolve, reject)=>{
      const tx = _db.transaction(['snapshots'], 'readonly');
      const req = tx.objectStore('snapshots').getAll();
      req.onsuccess = () => resolve((req.result || []).sort((a,b)=> a.date.localeCompare(b.date)));
      req.onerror = () => reject(req.error);
    });
  }

  function deleteValuation(id){
    return new Promise((resolve, reject)=>{
      const tx = _db.transaction(['valuations'], 'readwrite');
      const req = tx.objectStore('valuations').delete(id);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  function updateValuation(id, updates){
    return new Promise((resolve, reject)=>{
      const tx = _db.transaction(['valuations'], 'readwrite');
      const store = tx.objectStore('valuations');
      const getReq = store.get(id);
      getReq.onsuccess = () => {
        const cur = getReq.result;
        if (!cur) { resolve(); return; }
        const next = { ...cur, ...updates };
        const putReq = store.put(next);
        putReq.onsuccess = () => resolve(next);
        putReq.onerror = () => reject(putReq.error);
      };
      getReq.onerror = () => reject(getReq.error);
    });
  }

  // ---- Transaction functions ----
  function addTransaction({ date, amount, description, category, account, notes }){
    return new Promise((resolve, reject)=>{
      const tx = _db.transaction(['transactions'], 'readwrite');
      const data = { 
        date: typeof date === 'string' ? date : date.toISOString(),
        amount: Number(amount),
        description: description || '',
        category: category || 'Uncategorized',
        account: account || 'General',
        notes: notes || ''
      };
      const req = tx.objectStore('transactions').add(data);
      req.onsuccess = () => resolve({ ...data, id: req.result });
      req.onerror = () => reject(req.error);
    });
  }

  function getAllTransactions(){
    return new Promise((resolve, reject)=>{
      const tx = _db.transaction(['transactions'], 'readonly');
      const req = tx.objectStore('transactions').getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }

  function deleteTransaction(id){
    return new Promise((resolve, reject)=>{
      const tx = _db.transaction(['transactions'], 'readwrite');
      const req = tx.objectStore('transactions').delete(id);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  function addCategory(name){
    return new Promise((resolve, reject)=>{
      const tx = _db.transaction(['categories'], 'readwrite');
      const req = tx.objectStore('categories').add({ name });
      req.onsuccess = () => resolve({ id: req.result, name });
      req.onerror = () => reject(req.error);
    });
  }

  function getAllCategories(){
    return new Promise((resolve, reject)=>{
      const tx = _db.transaction(['categories'], 'readonly');
      const req = tx.objectStore('categories').getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }

  // ---- Positions (stocks) ----
  function addPosition({ symbol, shares, avgCost, account, addedDate, notes }){
    return new Promise((resolve, reject)=>{
      const tx = _db.transaction(['positions'], 'readwrite');
      const data = {
        symbol: (symbol || '').toUpperCase(),
        shares: Number(shares),
        avgCost: Number(avgCost),
        account: account || 'General',
        addedDate: addedDate || new Date().toISOString(),
        notes: notes || ''
      };
      const req = tx.objectStore('positions').add(data);
      req.onsuccess = () => resolve({ ...data, id: req.result });
      req.onerror = () => reject(req.error);
    });
  }

  function getAllPositions(){
    return new Promise((resolve, reject)=>{
      const tx = _db.transaction(['positions'], 'readonly');
      const req = tx.objectStore('positions').getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }

  function deletePosition(id){
    return new Promise((resolve, reject)=>{
      const tx = _db.transaction(['positions'], 'readwrite');
      const req = tx.objectStore('positions').delete(id);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  function updatePosition(id, updates){
    return new Promise((resolve, reject)=>{
      const tx = _db.transaction(['positions'], 'readwrite');
      const store = tx.objectStore('positions');
      const getReq = store.get(id);
      getReq.onsuccess = () => {
        const cur = getReq.result;
        if (!cur) { resolve(); return; }
        const next = { ...cur, ...updates };
        const putReq = store.put(next);
        putReq.onsuccess = () => resolve(next);
        putReq.onerror = () => reject(putReq.error);
      };
      getReq.onerror = () => reject(getReq.error);
    });
  }

  // in-memory cache for positions
  let __positionsCache = [];
  async function loadPositionsCache(){
    const all = await getAllPositions();
    __positionsCache = all || [];
    console.log('Loaded', __positionsCache.length, 'positions');
  }

  function aggregatePositions(){
    const bySym = new Map();
    for (const p of __positionsCache){
      const sym = p.symbol;
      if (!bySym.has(sym)) bySym.set(sym, { symbol: sym, shares: 0, cost: 0, account: p.account });
      const rec = bySym.get(sym);
      rec.shares += Number(p.shares);
      rec.cost += Number(p.shares) * Number(p.avgCost || 0);
    }
    const out = [];
    for (const [k,v] of bySym.entries()){
      v.avgCost = v.shares ? (v.cost / v.shares) : 0;
      out.push(v);
    }
    return out;
  }

  async function renderTopPositionsForDashboard(){
    const container = document.getElementById('dashboard-top-positions');
    if (!container) return;
    if (!__positionsCache || __positionsCache.length === 0){ container.innerHTML = '<div class="muted">No positions</div>'; return; }
    // fetch latest quotes for top symbols
    const agg = aggregatePositions();
    const symbols = agg.map(a => a.symbol);
    const quotes = {};
    await Promise.all(symbols.map(async s => { try { quotes[s] = await fetchQuote(s); } catch (e) { quotes[s] = null; } }));
    const enriched = agg.map(a => { const q = quotes[a.symbol]; const price = q && q.current != null ? q.current : null; const mv = price != null ? price * a.shares : a.shares * a.avgCost; return { ...a, price, mv }; }).sort((a,b)=> (b.mv||0)-(a.mv||0));
    const top = enriched.slice(0,3);
    const total = enriched.reduce((acc,x)=>acc + (x.mv||0),0);
    container.innerHTML = `<div style="display:flex; gap:12px; align-items:center;"><div style="font-weight:700">Top Positions</div><div class="muted">Total ${formatCurrency(total)}</div></div>
      <div style="margin-top:8px;">${top.map(t=> `<div style="display:flex; justify-content:space-between; padding:6px 0; border-bottom:1px solid rgba(148,163,184,0.04);"><div><strong>${t.symbol}</strong> · ${t.shares} sh</div><div>${t.price!=null?formatCurrency(t.price):'—'} · ${formatCurrency(t.mv||0)}</div></div>`).join('')}</div>`;
  }

  // Build positions history by fetching monthly candles for each symbol and composing a monthly series of market value
  let __historyCache = {};
  let stocksChart;
  let __proxyPollInterval = null;
  async function buildPositionsHistory(){
    if (!__positionsCache || __positionsCache.length === 0) throw new Error('No positions');
    // aggregate positions
    const agg = aggregatePositions();
    const symbols = agg.map(a => a.symbol);
    // Determine date range: earliest position addedDate or now - 24 months fallback
    const addedDates = __positionsCache.map(p => new Date(p.addedDate || p.added || new Date()));
    const earliest = addedDates.length ? new Date(Math.min(...addedDates.map(d=>d.getTime()))) : new Date();
    const start = new Date(earliest.getFullYear(), earliest.getMonth(), 1);
    const now = new Date();
    const months = [];
    const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
    while (cursor <= now){ months.push(`${cursor.getFullYear()}-${String(cursor.getMonth()+1).padStart(2,'0')}-01`); cursor.setMonth(cursor.getMonth()+1); }
    // For each symbol, fetch monthly candles from start to now (resolution=M) and store close values by month
    for (const s of symbols){
      try {
        // from/to unix timestamps
        const from = Math.floor(new Date(start.getFullYear(), start.getMonth(), 1).getTime()/1000);
        const to = Math.floor(now.getTime()/1000);
        const res = await apiFetch(`/api/history?symbol=${encodeURIComponent(s)}&from=${from}&to=${to}&resolution=M`);
        if (res && res.s === 'ok' && Array.isArray(res.c)){
          // build map of month->close using res.t (unix) and res.c
          const map = {};
          for (let i=0;i<res.t.length;i++){ const dt = new Date(res.t[i]*1000); const month = `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-01`; map[month] = res.c[i]; }
          __historyCache[s] = map;
        } else {
          __historyCache[s] = {};
        }
      } catch (e){ console.warn('History fetch failed for', s, e); __historyCache[s] = {}; }
    }
    // Compose portfolio value by month
    const series = months.map(month => {
      let tot = 0;
      for (const a of agg){
        const sym = a.symbol;
        const price = (__historyCache[sym] && __historyCache[sym][month] != null) ? __historyCache[sym][month] : (a.avgCost || 0);
        tot += price * a.shares;
      }
      return { month, value: tot };
    });
    // Render on stocksChart (if available)
    if (stocksChart){ stocksChart.data.labels = series.map(s=>s.month); stocksChart.data.datasets[0].data = series.map(s=>s.value); stocksChart.update(); }
    // Update dashboard top positions too
    try { renderTopPositionsForDashboard(); } catch (e){}
  }

  // Helper to call local proxy for quotes/search/history
  async function apiFetch(path){
    try {
      const r = await fetch(path);
      if (!r.ok) throw new Error('Network response was not ok');
      return await r.json();
    } catch (err){
      console.error('apiFetch error', err);
      return null;
    }
  }

  async function fetchQuote(symbol){
    if (!symbol) return null;
    const s = symbol.toUpperCase();
    const res = await apiFetch(`/api/quote?symbol=${encodeURIComponent(s)}`);
    // Finnhub returns {c: current, h: high, l: low, o: open, pc: prevClose, t: timestamp}
    if (!res) return null;
    return {
      current: res.c,
      high: res.h,
      low: res.l,
      open: res.o,
      prevClose: res.pc,
      timestamp: res.t
    };
  }

  function renderStockSearchResult(symbol, quote){
    const container = document.getElementById('stock-search-result');
    if (!container) return;
    if (!quote) {
      container.innerHTML = `<div class="muted">No quote available for ${symbol}</div>`;
      return;
    }
    const change = quote.current != null && quote.prevClose != null ? (quote.current - quote.prevClose) : null;
    const pct = change != null && quote.prevClose ? (change / quote.prevClose) * 100 : null;
    container.innerHTML = `
      <div style="display:flex; gap:12px; align-items:center;">
        <div><strong style="font-size:16px">${symbol}</strong></div>
        <div>${quote.current != null ? formatCurrency(quote.current) : '—'}</div>
        <div class="muted">${quote.prevClose != null ? `Prev ${formatCurrency(quote.prevClose)}` : ''}</div>
        <div style="color:${(change||0) >= 0 ? '#22c55e' : '#ef4444'}; font-weight:600;">${change != null ? (change >=0 ? '+' : '') + formatCurrency(change) : ''} ${pct != null ? `(${pct.toFixed(2)}%)` : ''}</div>
      </div>`;
  }

  // Render a list of search candidates with live prices and an Add button
  function renderSearchResults(results){
    const container = document.getElementById('stock-search-result');
    if (!container) return;
    if (!results || results.length === 0){ container.innerHTML = '<div class="muted">No results</div>'; return; }
    container.innerHTML = results.map(r => {
      const symbol = r.symbol || r.displaySymbol || '';
      const name = r.description || r.displaySymbol || '';
      const priceText = r.price != null ? formatCurrency(r.price) : '—';
      return `<div class="search-row" data-symbol="${symbol}" style="display:flex; justify-content:space-between; align-items:center; padding:6px 0; border-bottom:1px solid rgba(148,163,184,0.05);">
        <div style="display:flex; gap:12px; align-items:center;"><div><strong>${symbol}</strong></div><div class="muted" style="font-size:13px;">${name}</div></div>
        <div style="display:flex; gap:8px; align-items:center;">
          <div style="min-width:80px; text-align:right;">${priceText}</div>
          <button class="secondary" data-action="choose">Use</button>
        </div>
      </div>`;
    }).join('');
    // Attach handlers for Use buttons
    container.querySelectorAll('[data-action="choose"]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const row = e.target.closest('.search-row');
        if (!row) return;
        const sym = row.getAttribute('data-symbol');
        const input = document.getElementById('position-symbol');
        if (input) input.value = sym;
        // Optionally focus shares field
        const sharesInput = document.getElementById('position-shares'); if (sharesInput) sharesInput.focus();
      });
    });
  }

  // Check proxy health (lightweight) and update status UI
  async function checkProxyStatus(){
    const el = document.getElementById('proxy-status');
    if (!el) return;
    try {
      const res = await apiFetch('/api/ping');
      if (res && res.ok) { el.textContent = 'Proxy: OK'; el.style.color = '#86efac'; }
      else { el.textContent = 'Proxy: no key'; el.style.color = '#f97316'; }
    } catch (err){ el.textContent = 'Proxy: error'; el.style.color = '#ef4444'; }
  }

  function renderPositionsList(){
    const container = document.getElementById('positions-list');
    if (!container) return;
    if (!__positionsCache || __positionsCache.length === 0) {
      container.innerHTML = '<p class="muted">No positions yet. Add one above.</p>';
      return;
    }
    // For each position fetch latest quote (parallel)
    container.innerHTML = '<p class="muted">Loading prices...</p>';
    Promise.all(__positionsCache.map(async (p) => {
      const q = await fetchQuote(p.symbol);
      const latest = q && q.current ? q.current : null;
      const marketValue = latest ? (p.shares * latest) : null;
      return { p, latest, marketValue };
    })).then(items => {
      // Build a table-like output sorted by market value desc
      const sorted = items.slice().sort((a,b) => (b.marketValue || 0) - (a.marketValue || 0));
      container.innerHTML = `
        <div style="display:grid; grid-template-columns: 1fr 120px 120px 140px; gap:12px; font-weight:600; margin-bottom:8px;">
          <div>Position</div><div>Price</div><div>Market Value</div><div>P/L</div>
        </div>
        ${sorted.map(it => {
          const p = it.p;
          const latestText = it.latest != null ? formatCurrency(it.latest) : '—';
          const mvText = it.marketValue != null ? formatCurrency(it.marketValue) : '—';
          const cost = p.shares * (p.avgCost || 0);
          const pl = (it.marketValue != null ? it.marketValue : 0) - cost;
          const plText = formatCurrency(pl);
          const plClass = pl >= 0 ? 'positive' : 'negative';
          return `
            <div class="item-row" data-id="${p.id}" style="display:grid; grid-template-columns: 1fr 120px 120px 140px; gap:12px; align-items:center; padding:8px 0; border-bottom:1px solid rgba(148,163,184,0.04);">
              <div style="display:flex; gap:12px; align-items:center;"><span class="badge">${p.symbol}</span><div><div><strong>${p.symbol}</strong> · ${p.shares} sh</div><div class="muted">Avg ${formatCurrency(p.avgCost)} · ${p.account}</div></div></div>
              <div style="text-align:right">${latestText}</div>
              <div style="text-align:right">${mvText}</div>
              <div style="display:flex; gap:8px; align-items:center; justify-content:flex-end;"><div class="${plClass}">${plText}</div><div><button class="secondary" data-action="refresh">↻</button> <button class="danger" data-action="delete">Delete</button></div></div>
            </div>`;
        }).join('')}
      `;
      // Attach handlers
      container.querySelectorAll('.item-row').forEach(row => {
        const id = Number(row.getAttribute('data-id'));
        row.querySelector('[data-action="delete"]').addEventListener('click', async () => {
          if (!confirm('Delete this position?')) return;
          await deletePosition(id);
          __positionsCache = __positionsCache.filter(x => x.id !== id);
          renderPositionsList();
          showToast('Deleted');
        });
        row.querySelector('[data-action="refresh"]').addEventListener('click', async () => {
          renderPositionsList();
        });
      });
    }).catch(err => {
      console.error('Render positions failed', err);
      container.innerHTML = '<p class="muted">Failed to load prices</p>';
    });
  }

  function initStocksPage(){
    const form = document.getElementById('add-position-form');
    const searchInput = document.getElementById('stock-search-input');
    const searchBtn = document.getElementById('stock-search-btn');
    const refreshBtn = document.getElementById('refresh-prices');
    if (form) {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const sym = document.getElementById('position-symbol').value.trim().toUpperCase();
        const shares = parseFloat(document.getElementById('position-shares').value);
        const avg = parseFloat(document.getElementById('position-avgcost').value);
        const account = document.getElementById('position-account').value.trim() || 'General';
        if (!sym || !Number.isFinite(shares) || !Number.isFinite(avg)) { showToast('Please fill required fields'); return; }
        try {
          const saved = await addPosition({ symbol: sym, shares, avgCost: avg, account });
          __positionsCache.push(saved);
          renderPositionsList();
          form.reset();
          showToast('Position added');
        } catch (err) {
          console.error('Add position failed', err);
          showToast('Add failed');
        }
      });
    }
    if (searchBtn && searchInput) {
      searchBtn.addEventListener('click', async () => {
        const q = searchInput.value.trim();
        if (!q) return;
        // check proxy quickly
        await checkProxyStatus();
        const res = await apiFetch(`/api/search?q=${encodeURIComponent(q)}`);
        if (!res || !res.result || !Array.isArray(res.result) || res.result.length === 0) { showToast('No results'); renderSearchResults([]); return; }
        const choices = res.result.slice(0,5);
        // fetch quotes for each candidate in parallel to show prices inline
        const withPrices = await Promise.all(choices.map(async (r) => {
          const symbol = (r.symbol || r.displaySymbol || '').toUpperCase();
          const qres = await fetchQuote(symbol).catch(()=>null);
          return { symbol, description: r.description || r.displaySymbol || '', price: qres && qres.current != null ? qres.current : null };
        }));
        // normalize results for renderer
        const norm = withPrices.map(w => ({ symbol: w.symbol, displaySymbol: w.symbol, description: w.description, price: w.price }));
        renderSearchResults(norm);
      });
    }
    if (refreshBtn) refreshBtn.addEventListener('click', () => renderPositionsList());
    renderPositionsList();
    // Render dashboard top positions small widget when stocks page loads
    try { renderTopPositionsForDashboard(); } catch (e) { /* ignore */ }

    // Setup portfolio chart in Stocks page
    try {
      const ctx = document.getElementById('stocks-portfolio-chart');
      if (ctx) {
        stocksChart = new Chart(ctx.getContext('2d'), {
          type: 'line',
          data: { labels: [], datasets: [{ label: 'Positions Value', data: [], borderColor: '#34d399', backgroundColor: 'rgba(52,211,153,0.12)', tension: 0.25, fill: true, pointRadius: 0 }] },
          options: { responsive: true, plugins: { legend: { display: false }, tooltip: { callbacks: { label: (ctx) => formatCurrency(ctx.parsed.y) } } }, scales: { x: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(148,163,184,0.06)' } }, y: { ticks: { color: '#94a3b8', callback: (v)=>formatShortCurrency(v) }, grid: { color: 'rgba(148,163,184,0.06)' } } } }
        });
      }
    } catch (e) { console.warn('Stocks chart init failed', e); }

    // Wire build history button
    const buildBtn = document.getElementById('build-history-btn');
    if (buildBtn) buildBtn.addEventListener('click', async () => {
      buildBtn.textContent = 'Building...'; buildBtn.disabled = true;
      try { await buildPositionsHistory(); showToast('History built'); } catch (e) { console.error(e); showToast('History failed'); }
      buildBtn.textContent = 'Build History'; buildBtn.disabled = false;
    });
    // Start proxy health polling (every 30s)
    try {
      checkProxyStatus();
      if (__proxyPollInterval) clearInterval(__proxyPollInterval);
      __proxyPollInterval = setInterval(checkProxyStatus, 30_000);
    } catch (e) { /* ignore */ }
  }

  // ---- in-memory cache for immediate UI updates ----
  let __valsCache = [];
  async function loadCacheFromDb(){ 
    const all = await getAllValuations();
    // Normalize all items to ensure they have month fields
    __valsCache = all.map(v => {
      if (!v.month && v.date) {
        const month = (typeof v.date === 'string' ? v.date : new Date(v.date).toISOString()).slice(0,7) + '-01';
        return { ...v, month };
      }
      return v;
    });
    console.log('Loaded', __valsCache.length, 'items from DB');
  }
  function addToCache(v){ 
    // Ensure month field exists
    if (!v.month && v.date) {
      v.month = (typeof v.date === 'string' ? v.date : new Date(v.date).toISOString()).slice(0,7) + '-01';
    }
    __valsCache.push(v); 
  }

  // ---- networth.js ----
  let chart;
  let currentRange = '12m';
  async function initNetWorthChart(){
    const ctx = document.getElementById('networth-chart').getContext('2d');
    chart = new Chart(ctx, {
      type: 'line',
      data: { labels: [], datasets: [{ label: 'Net Worth', data: [], borderColor: '#60a5fa', backgroundColor: 'rgba(96,165,250,0.15)', tension: 0.25, fill: true, pointRadius: 0 }] },
      options: {
        responsive: true,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: true, labels: { color: '#94a3b8' } },
          tooltip: { callbacks: { label: (ctx) => ` ${formatCurrency(ctx.parsed.y)}` } }
        },
        scales: {
          x: { ticks: { color: '#94a3b8', callback: (val, idx, ticks) => {
                const label = chart.data.labels[idx];
                return formatMonthLabel(label);
              } }, grid: { color: 'rgba(148,163,184,0.15)' } },
          y: { ticks: { color: '#94a3b8', callback: (v)=>formatShortCurrency(v) }, grid: { color: 'rgba(148,163,184,0.12)' } }
        }
      }
    });
  }
  let __snapshotsCache = [];
  function updateNetWorthChartRange(range){ currentRange = range; renderChartFromCache(); }
  async function recomputeAndRenderNetWorth(){
    // Ensure all items have month field
    const normalized = __valsCache.map(v => {
      if (!v.month && v.date) {
        const month = (typeof v.date === 'string' ? v.date : new Date(v.date).toISOString()).slice(0,7) + '-01';
        return { ...v, month };
      }
      return v;
    });
    console.log('Computing snapshots from', normalized.length, 'valuations and', __transactionsCache.length, 'transactions');
    __snapshotsCache = computeMonthlySnapshots(normalized, __transactionsCache);
    console.log('Generated', __snapshotsCache.length, 'snapshots');
    if (__snapshotsCache.length > 0) {
      console.log('Latest snapshot:', __snapshotsCache[__snapshotsCache.length - 1]);
    }
    await writeSnapshots(__snapshotsCache);
    // Enrich snapshots with positions historical market values (monthly) where possible
    try {
      await enrichSnapshotsWithPositionsHistory();
    } catch (e) { console.warn('Positions history enrichment failed', e); }
    // Incorporate current positions market value into the latest snapshot (real-time)
    try {
      await incorporatePositionsIntoSnapshots();
    } catch (e) { console.warn('Positions incorporation failed', e); }
    renderChartFromCache();
  }

  // Sum positions market value using latest quotes and apply to latest snapshot
  async function incorporatePositionsIntoSnapshots(){
    if (!__snapshotsCache || __snapshotsCache.length === 0) return;
    if (!__positionsCache || __positionsCache.length === 0) return;
    // fetch latest quotes for all unique symbols
    const symbols = [...new Set(__positionsCache.map(p => p.symbol))];
    const quotes = {};
    await Promise.all(symbols.map(async (s) => { try { const q = await fetchQuote(s); quotes[s] = q; } catch (e) { quotes[s] = null; } }));
    const latest = __snapshotsCache[__snapshotsCache.length - 1];
    let positionsValue = 0;
    for (const p of __positionsCache){
      const q = quotes[p.symbol];
      const price = q && q.current != null ? q.current : null;
      const mv = price != null ? (p.shares * price) : (p.shares * (p.avgCost || 0));
      positionsValue += mv;
    }
    // If snapshots were previously enriched, respect baseAssets; otherwise treat existing assets as base
    const base = latest.baseAssets != null ? latest.baseAssets : (latest.assets - (latest.positionsValue || 0));
    latest.baseAssets = base;
    latest.positionsValue = positionsValue;
    latest.assets = (base || 0) + positionsValue;
    latest.netWorth = latest.assets - (latest.liabilities || 0);
    // Store a helper field for UI
    // Update stats display and write snapshots again
    updateStatsDisplay();
    await writeSnapshots(__snapshotsCache);
  }

  // Enrich all snapshots with historical positions market value using monthly candles
  async function enrichSnapshotsWithPositionsHistory(){
    if (!__snapshotsCache || __snapshotsCache.length === 0) return;
    if (!__positionsCache || __positionsCache.length === 0) return;
    const agg = aggregatePositions();
    if (!agg || agg.length === 0) return;
    // Cap symbols to avoid excessive calls; pick top by cost
    const capped = agg.slice().sort((a,b)=> (b.shares*(b.avgCost||0)) - (a.shares*(a.avgCost||0))).slice(0, 12);
    const symbols = capped.map(a => a.symbol);
    // Determine date range from snapshots
    const months = __snapshotsCache.map(s => s.date).sort();
    const startMonth = months[0];
    const endMonth = months[months.length-1];
    const startDate = new Date(startMonth);
    const endDate = new Date(endMonth);
    const from = Math.floor(new Date(startDate.getFullYear(), startDate.getMonth(), 1).getTime() / 1000);
    const to = Math.floor(new Date(endDate.getFullYear(), endDate.getMonth()+1, 0).getTime() / 1000);
    // Fetch monthly candles for each symbol
    for (const s of symbols){
      try {
        const res = await apiFetch(`/api/history?symbol=${encodeURIComponent(s)}&from=${from}&to=${to}&resolution=M`);
        if (res && res.s === 'ok' && Array.isArray(res.t) && Array.isArray(res.c)){
          const map = {};
          for (let i=0;i<res.t.length;i++){ const dt = new Date(res.t[i]*1000); const month = `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-01`; map[month] = res.c[i]; }
          __historyCache = __historyCache || {};
          __historyCache[s] = map;
        } else {
          __historyCache = __historyCache || {};
          __historyCache[s] = {};
        }
      } catch (e){ console.warn('History fetch failed for', s, e); __historyCache = __historyCache || {}; __historyCache[s] = {}; }
    }
    // For each snapshot month, compute positions value
    for (const snap of __snapshotsCache){
      const month = snap.date;
      // store baseAssets if not present
      if (snap.baseAssets == null) snap.baseAssets = snap.assets;
      let positionsValue = 0;
      for (const a of capped){
        const sym = a.symbol;
        const shares = a.shares || 0;
        const price = (__historyCache[sym] && __historyCache[sym][month] != null) ? __historyCache[sym][month] : (a.avgCost || 0);
        positionsValue += (price || 0) * shares;
      }
      snap.positionsValue = positionsValue;
      snap.assets = (snap.baseAssets || 0) + positionsValue;
      snap.netWorth = snap.assets - (snap.liabilities || 0);
    }
    // persist updated snapshots
    await writeSnapshots(__snapshotsCache);
  }
  async function renderFromSnapshotsCached(){
    __snapshotsCache = await readSnapshots();
    renderChartFromCache();
  }
  function renderChartFromCache(){
    if (!chart || !__snapshotsCache || __snapshotsCache.length === 0) return;
    const filtered = filterByRange(__snapshotsCache, currentRange);
    chart.data.labels = filtered.map(s => s.date);
    chart.data.datasets[0].data = filtered.map(s => s.netWorth);
    chart.update('none'); // 'none' for instant update without animation
    updateStatsDisplay();
  }
  function updateStatsDisplay(){
    if (!__snapshotsCache || __snapshotsCache.length === 0) {
      const nwEl = document.getElementById('current-networth');
      const assetsEl = document.getElementById('total-assets');
      const liabEl = document.getElementById('total-liabilities');
      if (nwEl) nwEl.textContent = '$0';
      if (assetsEl) assetsEl.textContent = '$0';
      if (liabEl) liabEl.textContent = '$0';
      return;
    }
    const latest = __snapshotsCache[__snapshotsCache.length - 1];
    const nwEl = document.getElementById('current-networth');
    const assetsEl = document.getElementById('total-assets');
    const liabEl = document.getElementById('total-liabilities');
    // If latest includes positionsValue, show both assets and positions (positions included in assets for net worth)
    if (nwEl) nwEl.textContent = formatCurrency(latest.netWorth || 0);
    if (assetsEl) {
      const posVal = latest.positionsValue ? ` (pos ${formatCurrency(latest.positionsValue)})` : '';
      assetsEl.textContent = formatCurrency(latest.assets || 0) + posVal;
    }
    if (liabEl) liabEl.textContent = formatCurrency(latest.liabilities);
  }
  function computeMonthlySnapshots(valuations, transactions = []){
    const byKey = new Map();
    for (const v of valuations){
      const key = `${v.kind}|${v.name}`;
      if (!byKey.has(key)) byKey.set(key, []);
      const month = v.month || ((typeof v.date === 'string' ? v.date : new Date(v.date).toISOString()).slice(0,7) + '-01');
      byKey.get(key).push({ date: v.date, month, value: Number(v.value), kind: v.kind, name: v.name });
    }
    for (const arr of byKey.values()) arr.sort((a,b)=> a.month.localeCompare(b.month));
    
    // Process transactions into monthly totals
    const transactionByMonth = new Map();
    for (const t of transactions) {
      const date = typeof t.date === 'string' ? new Date(t.date) : t.date;
      const month = `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-01`;
      if (!transactionByMonth.has(month)) transactionByMonth.set(month, 0);
      transactionByMonth.set(month, transactionByMonth.get(month) + Number(t.amount));
    }
    
    // Get date range from both valuations and transactions
    const allMonths = [];
    for (const v of valuations) {
      const month = v.month || ((typeof v.date === 'string' ? v.date : new Date(v.date).toISOString()).slice(0,7) + '-01');
      allMonths.push(month);
    }
    for (const t of transactions) {
      const date = typeof t.date === 'string' ? new Date(t.date) : t.date;
      const month = `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-01`;
      allMonths.push(month);
    }
    
    if (allMonths.length === 0) return [];
    allMonths.sort();
    const firstDate = new Date(allMonths[0]);
    const now = new Date();
    const lastDate = allMonths.length > 0 ? new Date(allMonths[allMonths.length - 1]) : now;
    // Ensure we go at least to current month
    const endDate = lastDate > now ? lastDate : now;
    const cursor = new Date(firstDate.getFullYear(), firstDate.getMonth(), 1);
    const end = new Date(endDate.getFullYear(), endDate.getMonth(), 1);
    const snapshots = [];
    while (cursor <= end){
      const isoMonth = `${cursor.getFullYear()}-${String(cursor.getMonth()+1).padStart(2,'0')}-01`;
      let assets = 0, liabilities = 0;
      
      // Add valuations (assets/liabilities)
      for (const points of byKey.values()){
        let latest = null;
        for (let i = points.length-1; i>=0; i--){ const p = points[i]; if (p.month <= isoMonth){ latest = p; break; } }
        if (!latest) continue;
        if (latest.kind === 'asset') assets += latest.value; else liabilities += latest.value;
      }
      
      // Add cumulative transaction totals (treat as cash asset)
      // Sum all transactions up to and including this month
      let cumulativeTransactionTotal = 0;
      for (const [month, amount] of transactionByMonth.entries()) {
        if (month <= isoMonth) {
          cumulativeTransactionTotal += amount;
        }
      }
      assets += cumulativeTransactionTotal;
      
      snapshots.push({ date: isoMonth, assets, liabilities, netWorth: assets - liabilities });
      cursor.setMonth(cursor.getMonth()+1);
    }
    return snapshots;
  }
  function filterByRange(snaps, range){
    if (range === 'all') return snaps;
    const now = new Date();
    let start;
    if (range === '3m') start = new Date(now.getFullYear(), now.getMonth() - 3, 1);
    else if (range === '12m') start = new Date(now.getFullYear(), now.getMonth() - 12, 1);
    else if (range === 'ytd') start = new Date(now.getFullYear(), 0, 1);
    else start = new Date(now.getFullYear(), now.getMonth() - 12, 1);
    const startIso = `${start.getFullYear()}-${String(start.getMonth()+1).padStart(2,'0')}-01`;
    return snaps.filter(s => s.date >= startIso);
  }
  function formatCurrency(n){ try { return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n); } catch { return `$${n.toFixed(0)}`; } }
  function formatShortCurrency(n){ const abs = Math.abs(n); if (abs>=1_000_000_000) return `${Math.round(n/1_000_000_000)}B`; if (abs>=1_000_000) return `${Math.round(n/1_000_000)}M`; if (abs>=1_000) return `${Math.round(n/1_000)}k`; return String(Math.round(n)); }
  function formatMonthLabel(iso){
    if (!iso) return '';
    // iso expected like YYYY-MM-01
    const [y,m] = String(iso).split('-');
    const date = new Date(Number(y), Number(m)-1, 1);
    return date.toLocaleString(undefined, { month: 'long' });
  }

  // ---- app.js ----
  const views = [ 'dashboard', 'items', 'stocks', 'transactions', 'accounts', 'settings' ];
  function selectView(id){
    for (const v of views){ const el = document.getElementById(`view-${v}`); if (el) el.classList.toggle('active', v === id); }
    for (const btn of document.querySelectorAll('.nav-btn')) btn.classList.toggle('active', btn.dataset.view === id);
    if (id === 'items') renderItemsList();
    if (id === 'transactions') {
      renderTransactionsList();
      updateCategoryFilter();
    }
  }
  function initRouting(){ document.querySelectorAll('.nav-btn').forEach(btn => btn.addEventListener('click', ()=> selectView(btn.dataset.view))); }
  function initThemeToggle(){ const btn = document.getElementById('toggle-theme'); if (btn) btn.addEventListener('click', ()=> document.documentElement.classList.toggle('light')); }
  function initValuationForm(){
    const form = document.getElementById('valuation-form'); 
    if (!form) { console.error('Form not found!'); return; }
    const dateInput = document.getElementById('valuation-date');
    if (dateInput && !dateInput.value){ 
      const now = new Date(); 
      dateInput.value = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`; 
    }
    form.addEventListener('submit', async (e)=>{
      e.preventDefault();
      e.stopPropagation();
      console.log('Form submitted!');
      const typeEl = document.getElementById('valuation-type');
      const nameEl = document.getElementById('valuation-name');
      const valueEl = document.getElementById('valuation-value');
      const dateEl = document.getElementById('valuation-date');
      if (!typeEl || !nameEl || !valueEl || !dateEl) {
        console.error('Form elements not found!');
        showToast('Form error - please refresh');
        return;
      }
      const type = typeEl.value;
      const name = nameEl.value.trim();
      const value = parseFloat(valueEl.value);
      const dateStr = dateEl.value;
      console.log('Form data:', { type, name, value, dateStr });
      if (!name) { showToast('Please enter a name'); return; }
      if (!Number.isFinite(value)) { showToast('Please enter a valid value'); return; }
      if (!dateStr) { showToast('Please select a date'); return; }
      try {
        const local = new Date(dateStr + 'T12:00:00');
        if (isNaN(local.getTime())) { showToast('Invalid date'); return; }
        const record = { 
          kind: type, 
          name, 
          value: Number(value), 
          date: local.toISOString(), 
          month: `${local.getFullYear()}-${String(local.getMonth()+1).padStart(2,'0')}-01` 
        };
        console.log('Adding record:', record);
        const saved = await addValuationPoint(record);
        addToCache(saved);
        console.log('Record added to DB', saved);
        form.reset();
        if (dateInput){ 
          const now = new Date(); 
          dateInput.value = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`; 
        }
        await recomputeAndRenderNetWorth();
        await renderRecent();
        renderItemsList();
        showToast('Saved!');
        console.log('Update complete');
      } catch (err){
        console.error('Save failed', err);
        showToast('Save failed: ' + (err.message || 'Unknown error'));
      }
    });
    console.log('Form handler attached');
  }
  function initRangeControls(){
    document.querySelectorAll('.range-btn').forEach(btn => btn.addEventListener('click', ()=>{ document.querySelectorAll('.range-btn').forEach(b=>b.classList.remove('active')); btn.classList.add('active'); updateNetWorthChartRange(btn.dataset.range); }));
    const refreshBtn = document.getElementById('refresh-recent');
    if (refreshBtn) refreshBtn.addEventListener('click', renderRecent);
  }
  async function renderRecent(){
    const list = document.getElementById('recent-list'); if (!list) return;
    // Combine valuations and transactions
    const allItems = [
      ...__valsCache.map(v => ({ ...v, type: 'valuation' })),
      ...__transactionsCache.map(t => ({ 
        ...t, 
        type: 'transaction',
        name: t.description,
        value: t.amount,
        kind: t.amount >= 0 ? 'income' : 'expense'
      }))
    ].sort((a,b)=> (b.date||'').localeCompare(a.date||'' )).slice(0,8);
    
    list.innerHTML = allItems.map(it => {
      const d = new Date(it.date);
      const dateText = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
      let valueText;
      let badgeClass = it.kind;
      if (it.type === 'transaction') {
        const amount = Math.abs(it.value);
        valueText = (it.value >= 0 ? '+' : '-') + new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(amount);
        badgeClass = it.value >= 0 ? 'income' : 'expense';
      } else {
        valueText = new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(it.value);
      }
      const displayName = it.type === 'transaction' ? it.description : it.name;
      return `<li><div class="left"><span class="badge ${badgeClass}">${it.type === 'transaction' ? (it.value >= 0 ? 'Income' : 'Expense') : it.kind}</span><div><div>${displayName}</div><div class="muted">${dateText}</div></div></div><div>${valueText}</div></li>`;
    }).join('');
  }
  function renderItemsList(){
    const container = document.getElementById('items-list'); 
    if (!container) { console.error('Items list container not found'); return; }
    if (!__valsCache || __valsCache.length === 0) {
      container.innerHTML = '<p class="muted">No items yet. Add some from the Dashboard!</p>';
      return;
    }
    const items = [...__valsCache].sort((a,b)=> (b.date||'').localeCompare(a.date||'' ));
    container.innerHTML = items.map(it => {
      const d = new Date(it.date);
      const dateText = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
      const valueText = new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(it.value);
      const itemId = it.id || it._tempId || 'temp-' + Math.random();
      return `
        <div class="item-row" data-id="${itemId}">
          <div class="meta">
            <span class="badge ${it.kind}">${it.kind}</span>
            <div>
              <div><strong>${it.name}</strong></div>
              <div class="muted">${dateText}</div>
            </div>
          </div>
          <div>${valueText}</div>
          <div class="item-actions">
            <button class="secondary" data-action="toggle">Details</button>
            <button class="danger" data-action="delete">Delete</button>
          </div>
          <div class="item-details">
            <label class="muted">Description</label>
            <textarea data-field="desc" placeholder="Add a note...">${(it.desc || '').replace(/</g, '&lt;')}</textarea>
            <div style="margin-top:8px; display:flex; gap:8px;">
              <button class="primary" data-action="save">Save</button>
              <button class="secondary" data-action="cancel">Cancel</button>
            </div>
          </div>
        </div>`;
    }).join('');

    container.querySelectorAll('.item-row').forEach(row => {
      const idStr = row.getAttribute('data-id');
      const id = idStr.startsWith('temp-') ? null : Number(idStr);
      if (!id) return; // Skip items without real IDs
      row.querySelector('[data-action="toggle"]').addEventListener('click', () => {
        row.querySelector('.item-details').classList.toggle('active');
      });
      row.querySelector('[data-action="delete"]').addEventListener('click', async () => {
        if (!confirm('Delete this item?')) return;
        await deleteValuation(id);
        __valsCache = __valsCache.filter(x => x.id !== id);
        await recomputeAndRenderNetWorth();
        renderItemsList();
        await renderRecent();
        showToast('Deleted');
      });
      row.querySelector('[data-action="save"]').addEventListener('click', async () => {
        const desc = row.querySelector('textarea[data-field="desc"]').value;
        const updated = await updateValuation(id, { desc });
        const idx = __valsCache.findIndex(x => x.id === id);
        if (idx >= 0) __valsCache[idx] = updated;
        row.querySelector('.item-details').classList.remove('active');
        showToast('Saved');
      });
      row.querySelector('[data-action="cancel"]').addEventListener('click', () => {
        row.querySelector('.item-details').classList.remove('active');
      });
    });
  }
  // ---- Transaction management ----
  let __transactionsCache = [];
  let __categoriesCache = [];
  let __csvData = null;
  let __columnMapping = null;

  async function loadTransactionsCache(){
    __transactionsCache = await getAllTransactions();
    __categoriesCache = await getAllCategories();
  }

  function renderTransactionsList(filter = ''){
    const container = document.getElementById('transactions-list');
    if (!container) return;
    let filtered = [...__transactionsCache];
    const searchTerm = document.getElementById('transaction-search')?.value?.toLowerCase() || '';
    const categoryFilter = document.getElementById('transaction-category-filter')?.value || '';
    if (searchTerm) {
      filtered = filtered.filter(t => 
        t.description.toLowerCase().includes(searchTerm) ||
        t.notes.toLowerCase().includes(searchTerm) ||
        t.account.toLowerCase().includes(searchTerm)
      );
    }
    if (categoryFilter) {
      filtered = filtered.filter(t => t.category === categoryFilter);
    }
    filtered.sort((a,b) => new Date(b.date) - new Date(a.date));
    if (filtered.length === 0) {
      container.innerHTML = '<p class="muted">No transactions found. Add some or import from CSV!</p>';
      return;
    }
    container.innerHTML = filtered.map(t => {
      const d = new Date(t.date);
      const dateStr = `${d.getMonth()+1}/${d.getDate()}/${d.getFullYear()}`;
      const amount = Number(t.amount);
      const isPositive = amount >= 0;
      const amountStr = formatCurrency(Math.abs(amount));
      return `
        <div class="transaction-row">
          <div class="date">${dateStr}</div>
          <div class="description">${t.description}</div>
          <div class="amount ${isPositive ? 'positive' : 'negative'}">${isPositive ? '+' : '-'}${amountStr}</div>
          <div class="category">${t.category}</div>
          <div class="actions">
            <button class="danger" onclick="deleteTransactionById(${t.id})">Delete</button>
          </div>
        </div>`;
    }).join('');
  }

  function deleteTransactionById(id){
    if (!confirm('Delete this transaction?')) return;
    deleteTransaction(id).then(async () => {
      __transactionsCache = __transactionsCache.filter(t => t.id !== id);
      renderTransactionsList();
      updateCategoryFilter();
      await recomputeAndRenderNetWorth();
      await renderRecent();
      showToast('Deleted');
    });
  }
  window.deleteTransactionById = deleteTransactionById; // Make it global

  function updateCategoryFilter(){
    const select = document.getElementById('transaction-category-filter');
    if (!select) return;
    const categories = [...new Set(__transactionsCache.map(t => t.category))].sort();
    const current = select.value;
    select.innerHTML = '<option value="">All Categories</option>' + 
      categories.map(c => `<option value="${c}">${c}</option>`).join('');
    select.value = current;
  }

  function initTransactionForm(){
    const form = document.getElementById('transaction-form');
    const modal = document.getElementById('add-transaction-modal');
    const openBtn = document.getElementById('add-transaction-btn');
    const closeBtn = document.getElementById('close-transaction-modal');
    if (!form || !modal) return;
    if (openBtn) openBtn.addEventListener('click', () => {
      const dateInput = document.getElementById('transaction-date');
      if (dateInput && !dateInput.value) {
        const now = new Date();
        dateInput.value = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
      }
      modal.style.display = 'flex';
    });
    if (closeBtn) closeBtn.addEventListener('click', () => {
      modal.style.display = 'none';
      form.reset();
    });
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const date = document.getElementById('transaction-date').value;
      const amount = parseFloat(document.getElementById('transaction-amount').value);
      const description = document.getElementById('transaction-description').value.trim();
      const category = document.getElementById('transaction-category').value.trim() || 'Uncategorized';
      const account = document.getElementById('transaction-account').value.trim() || 'General';
      const notes = document.getElementById('transaction-notes').value.trim();
      if (!date || !Number.isFinite(amount) || !description) {
        showToast('Please fill required fields');
        return;
      }
      try {
        const saved = await addTransaction({ date, amount, description, category, account, notes });
        __transactionsCache.push(saved);
        if (!__categoriesCache.find(c => c.name === category)) {
          try {
            await addCategory(category);
            __categoriesCache.push({ name: category });
          } catch {}
        }
        renderTransactionsList();
        updateCategoryFilter();
        updateCategoryDatalist();
        await recomputeAndRenderNetWorth();
        await renderRecent();
        modal.style.display = 'none';
        form.reset();
        showToast('Transaction added!');
      } catch (err) {
        console.error('Save failed', err);
        showToast('Save failed');
      }
    });
  }

  // Quick transaction form on dashboard (small, fast-add UI)
  function initQuickTransactionForm(){
    const form = document.getElementById('quick-transaction-form');
    if (!form) return;
    // default date to today if empty
    const dateInput = document.getElementById('quick-transaction-date');
    if (dateInput && !dateInput.value) {
      const now = new Date();
      dateInput.value = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
    }

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const date = document.getElementById('quick-transaction-date').value;
      const amount = parseFloat(document.getElementById('quick-transaction-amount').value);
      const description = document.getElementById('quick-transaction-description').value.trim();
      const category = document.getElementById('quick-transaction-category').value || 'Uncategorized';
      const account = document.getElementById('quick-transaction-account').value.trim() || 'General';
      if (!date || !Number.isFinite(amount) || !description) { showToast('Please fill required fields'); return; }
      try {
        const saved = await addTransaction({ date, amount, description, category, account, notes: '' });
        __transactionsCache.push(saved);
        if (!__categoriesCache.find(c => c.name === category)) {
          try { await addCategory(category); __categoriesCache.push({ name: category }); } catch {} 
        }
        renderTransactionsList();
        updateCategoryFilter();
        updateCategoryDatalist();
        await recomputeAndRenderNetWorth();
        await renderRecent();
        form.reset();
        if (dateInput){ const now = new Date(); dateInput.value = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`; }
        showToast('Transaction added');
      } catch (err) {
        console.error('Quick add failed', err);
        showToast('Save failed');
      }
    });

    // preset category buttons
    document.querySelectorAll('.quick-cat-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const catIn = document.getElementById('quick-transaction-category');
        if (catIn) catIn.value = btn.dataset.cat;
      });
    });
  }

  function updateCategoryDatalist(){
    const datalist = document.getElementById('category-list');
    if (!datalist) return;
    const categories = [...new Set(__transactionsCache.map(t => t.category).concat(__categoriesCache.map(c => c.name)))].sort();
    datalist.innerHTML = categories.map(c => `<option value="${c}">`).join('');
  }

  function initCSVImport(){
    const modal = document.getElementById('csv-import-modal');
    const openBtn = document.getElementById('import-csv-btn');
    const closeBtn = document.getElementById('close-csv-modal');
    const fileInput = document.getElementById('csv-file-input');
    const mappingDiv = document.getElementById('csv-mapping');
    const previewDiv = document.getElementById('csv-preview');
    const previewBtn = document.getElementById('preview-csv');
    const importBtn = document.getElementById('import-csv-data');
    const cancelBtn = document.getElementById('cancel-csv');
    if (!modal) return;
    if (openBtn) openBtn.addEventListener('click', () => {
      modal.style.display = 'flex';
      __csvData = null;
      __columnMapping = null;
      mappingDiv.style.display = 'none';
      previewDiv.style.display = 'none';
      if (fileInput) fileInput.value = '';
    });
    if (closeBtn) closeBtn.addEventListener('click', () => {
      modal.style.display = 'none';
    });
    if (fileInput) fileInput.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        const text = await file.text();
        const rows = parseCSV(text);
        if (rows.length === 0) {
          showToast('CSV file is empty');
          return;
        }
        __csvData = rows;
        const headers = Object.keys(rows[0]);
        const mappingHTML = `
          <label>Date Column <select id="map-date"><option value="">Select...</option>${headers.map(h => `<option value="${h}">${h}</option>`).join('')}</select></label>
          <label>Amount Column <select id="map-amount"><option value="">Select...</option>${headers.map(h => `<option value="${h}">${h}</option>`).join('')}</select></label>
          <label>Description Column <select id="map-description"><option value="">Select...</option>${headers.map(h => `<option value="${h}">${h}</option>`).join('')}</select></label>
          <label>Category Column (optional) <select id="map-category"><option value="">Select...</option>${headers.map(h => `<option value="${h}">${h}</option>`).join('')}</select></label>
          <label>Account Column (optional) <select id="map-account"><option value="">Select...</option>${headers.map(h => `<option value="${h}">${h}</option>`).join('')}</select></label>
        `;
        document.getElementById('column-mapping').innerHTML = mappingHTML;
        mappingDiv.style.display = 'block';
        previewDiv.style.display = 'none';
      } catch (err) {
        console.error('CSV parse error', err);
        showToast('Failed to parse CSV file');
      }
    });
    if (previewBtn) previewBtn.addEventListener('click', () => {
      const dateCol = document.getElementById('map-date')?.value;
      const amountCol = document.getElementById('map-amount')?.value;
      const descCol = document.getElementById('map-description')?.value;
      if (!dateCol || !amountCol || !descCol) {
        showToast('Please map required columns (Date, Amount, Description)');
        return;
      }
      __columnMapping = {
        date: dateCol,
        amount: amountCol,
        description: descCol,
        category: document.getElementById('map-category')?.value || '',
        account: document.getElementById('map-account')?.value || ''
      };
      renderCSVPreview();
      previewDiv.style.display = 'block';
    });
    if (importBtn) importBtn.addEventListener('click', async () => {
      if (!__csvData || !__columnMapping) return;
      let imported = 0;
      let errors = 0;
      for (const row of __csvData) {
        try {
          const dateStr = row[__columnMapping.date];
          const amountStr = row[__columnMapping.amount];
          const description = row[__columnMapping.description] || '';
          if (!dateStr || !amountStr) { errors++; continue; }
          const date = parseDate(dateStr);
          const amount = parseFloat(String(amountStr).replace(/[^0-9.-]/g, ''));
          if (!date || !Number.isFinite(amount)) { errors++; continue; }
          const category = __columnMapping.category ? (row[__columnMapping.category] || 'Uncategorized') : 'Uncategorized';
          const account = __columnMapping.account ? (row[__columnMapping.account] || 'General') : 'General';
          const saved = await addTransaction({ date, amount, description, category, account });
          __transactionsCache.push(saved);
          if (!__categoriesCache.find(c => c.name === category)) {
            try {
              await addCategory(category);
              __categoriesCache.push({ name: category });
            } catch {}
          }
          imported++;
        } catch (err) {
          console.error('Import error', err);
          errors++;
        }
      }
      renderTransactionsList();
      updateCategoryFilter();
      updateCategoryDatalist();
      await recomputeAndRenderNetWorth();
      await renderRecent();
      modal.style.display = 'none';
      showToast(`Imported ${imported} transactions${errors > 0 ? ` (${errors} errors)` : ''}`);
    });
    if (cancelBtn) cancelBtn.addEventListener('click', () => {
      modal.style.display = 'none';
    });
  }

  function parseCSV(text){
    const lines = text.split('\n').map(l => l.trim()).filter(l => l);
    if (lines.length === 0) return [];
    function parseCSVLine(line){
      const result = [];
      let current = '';
      let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
          if (inQuotes && line[i+1] === '"') {
            current += '"';
            i++;
          } else {
            inQuotes = !inQuotes;
          }
        } else if (char === ',' && !inQuotes) {
          result.push(current.trim());
          current = '';
        } else {
          current += char;
        }
      }
      result.push(current.trim());
      return result;
    }
    const headers = parseCSVLine(lines[0]).map(h => h.replace(/^"|"$/g, ''));
    const rows = [];
    for (let i = 1; i < lines.length; i++) {
      const values = parseCSVLine(lines[i]).map(v => v.replace(/^"|"$/g, ''));
      if (values.length !== headers.length) continue;
      const row = {};
      headers.forEach((h, idx) => row[h] = values[idx]);
      rows.push(row);
    }
    return rows;
  }

  function parseDate(str){
    if (!str) return null;
    const cleaned = String(str).trim();
    const formats = [
      /^(\d{4})-(\d{2})-(\d{2})/, // YYYY-MM-DD
      /^(\d{2})\/(\d{2})\/(\d{4})/, // MM/DD/YYYY
      /^(\d{2})\/(\d{2})\/(\d{2})/, // MM/DD/YY
      /^(\d{1,2})\/(\d{1,2})\/(\d{4})/, // M/D/YYYY
    ];
    for (const format of formats) {
      const match = cleaned.match(format);
      if (match) {
        if (format === formats[0]) { // YYYY-MM-DD
          return new Date(match[1], match[2]-1, match[3]);
        } else if (format === formats[1] || format === formats[2]) { // MM/DD/YYYY or MM/DD/YY
          const year = format === formats[2] ? (2000 + parseInt(match[3])) : parseInt(match[3]);
          return new Date(year, match[1]-1, match[2]);
        } else { // M/D/YYYY
          return new Date(parseInt(match[3]), match[1]-1, match[2]);
        }
      }
    }
    const parsed = new Date(cleaned);
    return isNaN(parsed.getTime()) ? null : parsed;
  }

  function renderCSVPreview(){
    const table = document.getElementById('preview-table');
    if (!table || !__csvData || !__columnMapping) return;
    const preview = __csvData.slice(0, 10);
    table.innerHTML = `
      <thead>
        <tr>
          <th>Date</th>
          <th>Amount</th>
          <th>Description</th>
          <th>Category</th>
          <th>Account</th>
        </tr>
      </thead>
      <tbody>
        ${preview.map(row => {
          const dateStr = row[__columnMapping.date] || '';
          const amountStr = row[__columnMapping.amount] || '';
          const desc = row[__columnMapping.description] || '';
          const cat = __columnMapping.category ? (row[__columnMapping.category] || '') : '';
          const acc = __columnMapping.account ? (row[__columnMapping.account] || '') : '';
          return `<tr>
            <td>${dateStr}</td>
            <td>${amountStr}</td>
            <td>${desc}</td>
            <td>${cat || 'Uncategorized'}</td>
            <td>${acc || 'General'}</td>
          </tr>`;
        }).join('')}
      </tbody>
    `;
  }

  function initTransactionFilters(){
    const search = document.getElementById('transaction-search');
    const categoryFilter = document.getElementById('transaction-category-filter');
    if (search) search.addEventListener('input', () => renderTransactionsList());
    if (categoryFilter) categoryFilter.addEventListener('change', () => renderTransactionsList());
  }

  function showToast(text){
    let el = document.getElementById('toast');
    if (!el){ el = document.createElement('div'); el.id = 'toast'; el.style.position='fixed'; el.style.bottom='20px'; el.style.right='20px'; el.style.background='#111827'; el.style.border='1px solid #1f2937'; el.style.color='#e6edf3'; el.style.padding='10px 12px'; el.style.borderRadius='10px'; el.style.zIndex='100'; document.body.appendChild(el); }
    el.textContent = text; el.style.opacity='1';
    setTimeout(()=>{ el.style.transition='opacity 600ms'; el.style.opacity='0'; }, 1200);
  }
  async function bootstrap(){
    initRouting();
    initThemeToggle();
    initRangeControls();
    initValuationForm();
    initTransactionForm();
    initQuickTransactionForm();
    initCSVImport();
    initTransactionFilters();
    await initDb();
    await initNetWorthChart();
    await loadCacheFromDb();
    await loadTransactionsCache();
  await loadPositionsCache();
    if (__valsCache.length === 0){
      const now = new Date();
      const monthsBack = (n) => new Date(now.getFullYear(), now.getMonth() - n, 1);
      const seed = [
        { kind: 'asset', name: 'House', value: 400000, date: monthsBack(12).toISOString() },
        { kind: 'asset', name: 'House', value: 440000, date: monthsBack(0).toISOString() },
        { kind: 'asset', name: 'Car', value: 25000, date: monthsBack(12).toISOString() },
        { kind: 'asset', name: 'Car', value: 21000, date: monthsBack(0).toISOString() },
        { kind: 'liability', name: 'Mortgage', value: 320000, date: monthsBack(12).toISOString() },
        { kind: 'liability', name: 'Mortgage', value: 280000, date: monthsBack(0).toISOString() },
        { kind: 'asset', name: 'Cash', value: 10000, date: monthsBack(12).toISOString() },
        { kind: 'asset', name: 'Cash', value: 12000, date: monthsBack(0).toISOString() }
      ];
      for (const s of seed){ const rec = { ...s, month: s.date.slice(0,7)+'-01' }; addToCache(rec); await addValuationPoint(rec); }
    }
    await recomputeAndRenderNetWorth();
    await renderRecent();
    renderItemsList(); // Pre-render items list
    updateCategoryDatalist(); // Initialize category datalist
    // initialize stocks page
    try { initStocksPage(); } catch (e) { console.warn('Stocks init skipped', e); }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bootstrap); else bootstrap();
})();


