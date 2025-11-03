// Local Finnhub proxy for development
// Usage (PowerShell):
//   $env:FINNHUB_API_KEY = 'your_key'
//   npm install
//   npm run start-proxy
// The proxy exposes:
//  - GET /api/quote?symbol=SYMBOL
//  - GET /api/search?q=QUERY
//  - GET /api/history?symbol=SYMBOL&from=UNIX_FROM&to=UNIX_TO&resolution=D

const express = require('express');
const fetch = require('node-fetch');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 9999;
const API_KEY = process.env.FINNHUB_API_KEY;

if (!API_KEY) {
  console.warn('Warning: FINNHUB_API_KEY not set. Proxy will return 400 for API calls.');
}

// Serve static files from project root so you can open http://localhost:9999
app.use(express.static(path.join(__dirname, '.')));

async function proxyFetch(url, res) {
  if (!API_KEY) {
    res.status(400).json({ error: 'Server missing FINNHUB_API_KEY environment variable' });
    return;
  }
  try {
    const r = await fetch(url);
    const contentType = r.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const json = await r.json();
      res.json(json);
    } else {
      const text = await r.text();
      res.send(text);
    }
  } catch (err) {
    console.error('Fetch error', err);
    res.status(500).json({ error: err.message });
  }
}

// Quote: /api/quote?symbol=AAPL
app.get('/api/quote', (req, res) => {
  const symbol = (req.query.symbol || '').toUpperCase();
  if (!symbol) return res.status(400).json({ error: 'Missing symbol' });
  const url = `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${API_KEY}`;
  proxyFetch(url, res);
});

// Search: /api/search?q=apple
app.get('/api/search', (req, res) => {
  const q = (req.query.q || '').trim();
  if (!q) return res.status(400).json({ error: 'Missing q' });
  const url = `https://finnhub.io/api/v1/search?q=${encodeURIComponent(q)}&token=${API_KEY}`;
  proxyFetch(url, res);
});

// Historical candles: /api/history?symbol=AAPL&from=1609459200&to=1640995200&resolution=D
app.get('/api/history', (req, res) => {
  const symbol = req.query.symbol;
  const from = req.query.from;
  const to = req.query.to;
  const resolution = req.query.resolution || 'D';
  if (!symbol || !from || !to) return res.status(400).json({ error: 'Missing params (symbol, from, to)' });
  const url = `https://finnhub.io/api/v1/stock/candle?symbol=${encodeURIComponent(symbol)}&resolution=${encodeURIComponent(resolution)}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&token=${API_KEY}`;
  proxyFetch(url, res);
});

app.listen(PORT, () => {
  console.log(`Finnhub proxy listening on http://localhost:${PORT}`);
});
