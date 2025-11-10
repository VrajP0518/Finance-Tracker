import { getAllValuations, writeSnapshots, readSnapshots } from './db.js';

let chart;
let currentRange = '12m';

export async function initNetWorthChart() {
  const ctx = document.getElementById('networth-chart').getContext('2d');
  chart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: [],
      datasets: [
        {
          label: 'Net Worth',
          data: [],
          borderColor: '#60a5fa',
          backgroundColor: 'rgba(96,165,250,0.15)',
          tension: 0.25,
          fill: true,
          pointRadius: 0,
        }
      ]
    },
    options: {
      responsive: true,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: true, labels: { color: '#94a3b8' } },
        tooltip: {
          callbacks: {
            label: (ctx) => ` ${formatCurrency(ctx.parsed.y)}`
          }
        }
      },
      scales: {
        x: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(148,163,184,0.15)' } },
        y: { ticks: { color: '#94a3b8', callback: (v) => formatShortCurrency(v) }, grid: { color: 'rgba(148,163,184,0.12)' } }
      }
    }
  });
}

export function updateNetWorthChartRange(range) {
  currentRange = range;
  renderFromSnapshotsCached();
}

export async function recomputeAndRenderNetWorth() {
  const vals = await getAllValuations();
  const snaps = computeMonthlySnapshots(vals);
  await writeSnapshots(snaps);
  await renderFromSnapshotsCached();
}

async function renderFromSnapshotsCached() {
  const snaps = await readSnapshots();
  const filtered = filterByRange(snaps, currentRange);
  chart.data.labels = filtered.map(s => s.date);
  chart.data.datasets[0].data = filtered.map(s => s.netWorth);
  chart.update();
}

function computeMonthlySnapshots(valuations) {
  // Map of key (kind|name) -> sorted valuation points
  const byKey = new Map();
  for (const v of valuations) {
    const key = `${v.kind}|${v.name}`;
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push({ date: v.date, value: Number(v.value), kind: v.kind, name: v.name });
  }
  for (const arr of byKey.values()) {
    arr.sort((a,b) => a.date.localeCompare(b.date));
  }

  if (valuations.length === 0) return [];

  const firstDate = new Date(valuations.map(v => v.date).sort()[0]);
  const lastDate = new Date(valuations.map(v => v.date).sort().slice(-1)[0]);
  // Build month buckets from first to last
  const cursor = new Date(firstDate.getFullYear(), firstDate.getMonth(), 1);
  const end = new Date(lastDate.getFullYear(), lastDate.getMonth(), 1);

  const snapshots = [];
  while (cursor <= end) {
    const isoMonth = `${cursor.getFullYear()}-${String(cursor.getMonth()+1).padStart(2,'0')}-01`;
    let assets = 0;
    let liabilities = 0;

    for (const [key, points] of byKey.entries()) {
      // Find latest point at or before this month
      let latest = null;
      for (let i = points.length - 1; i >= 0; i--) {
        const p = points[i];
        if (p.date <= isoMonth) { latest = p; break; }
      }
      if (!latest) continue;
      if (latest.kind === 'asset') assets += latest.value; else liabilities += latest.value;
    }
    snapshots.push({ date: isoMonth, assets, liabilities, netWorth: assets - liabilities });

    // advance month
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return snapshots;
}

function filterByRange(snaps, range) {
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

function formatCurrency(n) {
  try { return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n); }
  catch { return `$${n.toFixed(0)}`; }
}
function formatShortCurrency(n) {
  const abs = Math.abs(n);
  if (abs >= 1_000_000_000) return `${Math.round(n/1_000_000_000)}B`;
  if (abs >= 1_000_000) return `${Math.round(n/1_000_000)}M`;
  if (abs >= 1_000) return `${Math.round(n/1_000)}k`;
  return String(Math.round(n));
}


