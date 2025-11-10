import { initDb, addValuationPoint, getAllValuations, getRecentValuations } from './db.js';
import { initNetWorthChart, updateNetWorthChartRange, recomputeAndRenderNetWorth } from './networth.js';

const views = [ 'dashboard', 'transactions', 'accounts', 'settings' ];

function selectView(id) {
  for (const v of views) {
    const el = document.getElementById(`view-${v}`);
    el.classList.toggle('active', v === id);
  }
  for (const btn of document.querySelectorAll('.nav-btn')) {
    btn.classList.toggle('active', btn.dataset.view === id);
  }
}

function initRouting() {
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => selectView(btn.dataset.view));
  });
}

function initThemeToggle() {
  const btn = document.getElementById('toggle-theme');
  btn.addEventListener('click', () => {
    document.documentElement.classList.toggle('light');
  });
}

function initValuationForm() {
  const form = document.getElementById('valuation-form');
  // default date to today
  const dateInput = document.getElementById('valuation-date');
  if (dateInput && !dateInput.value) {
    const now = new Date();
    dateInput.value = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
  }
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const type = document.getElementById('valuation-type').value;
    const name = document.getElementById('valuation-name').value.trim();
    const value = parseFloat(document.getElementById('valuation-value').value);
    const dateStr = document.getElementById('valuation-date').value;
    const usedDate = dateStr || dateInput.value;
    if (!name || !Number.isFinite(value) || !usedDate) return;

    const date = new Date(usedDate);
    await addValuationPoint({ kind: type, name, value, date: date.toISOString() });

    // Clear and refresh
    form.reset();
    if (dateInput && !dateInput.value) {
      const now = new Date();
      dateInput.value = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
    }
    await recomputeAndRenderNetWorth();
    await renderRecent();
  });
}

function initRangeControls() {
  document.querySelectorAll('.range-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.range-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      updateNetWorthChartRange(btn.dataset.range);
    });
  });
  const refreshBtn = document.getElementById('refresh-recent');
  if (refreshBtn) refreshBtn.addEventListener('click', renderRecent);
}

async function renderRecent() {
  const list = document.getElementById('recent-list');
  if (!list) return;
  const items = await getRecentValuations(8);
  list.innerHTML = items.map(it => {
    const d = new Date(it.date);
    const dateText = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    const valueText = new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(it.value);
    return `
      <li>
        <div class="left">
          <span class="badge ${it.kind}">${it.kind}</span>
          <div>
            <div>${it.name}</div>
            <div class="muted">${dateText}</div>
          </div>
        </div>
        <div>${valueText}</div>
      </li>`;
  }).join('');
}

async function bootstrap() {
  initRouting();
  initThemeToggle();
  initRangeControls();

  await initDb();
  await initNetWorthChart();

  // Demo seed if empty
  const vals = await getAllValuations();
  if (vals.length === 0) {
    const now = new Date();
    const monthsBack = (n) => new Date(now.getFullYear(), now.getMonth() - n, 1);
    const seed = [
      { kind: 'asset', name: 'House', value: 400000, date: monthsBack(12).toISOString() },
      { kind: 'asset', name: 'House', value: 410000, date: monthsBack(9).toISOString() },
      { kind: 'asset', name: 'House', value: 420000, date: monthsBack(6).toISOString() },
      { kind: 'asset', name: 'House', value: 430000, date: monthsBack(3).toISOString() },
      { kind: 'asset', name: 'House', value: 440000, date: monthsBack(0).toISOString() },

      { kind: 'asset', name: 'Car', value: 25000, date: monthsBack(12).toISOString() },
      { kind: 'asset', name: 'Car', value: 23000, date: monthsBack(6).toISOString() },
      { kind: 'asset', name: 'Car', value: 21000, date: monthsBack(0).toISOString() },

      { kind: 'liability', name: 'Mortgage', value: 320000, date: monthsBack(12).toISOString() },
      { kind: 'liability', name: 'Mortgage', value: 310000, date: monthsBack(9).toISOString() },
      { kind: 'liability', name: 'Mortgage', value: 300000, date: monthsBack(6).toISOString() },
      { kind: 'liability', name: 'Mortgage', value: 290000, date: monthsBack(3).toISOString() },
      { kind: 'liability', name: 'Mortgage', value: 280000, date: monthsBack(0).toISOString() },

      { kind: 'asset', name: 'Cash', value: 10000, date: monthsBack(12).toISOString() },
      { kind: 'asset', name: 'Cash', value: 12000, date: monthsBack(0).toISOString() },
    ];
    for (const s of seed) {
      await addValuationPoint(s);
    }
  }

  await recomputeAndRenderNetWorth();
  await renderRecent();
}

bootstrap();


