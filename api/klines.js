// Serverless: دریافت کندل از Binance با اعتبارسنجی ورودی (فقط مقادیر مجاز فرانت‌اند پذیرفته می‌شوند)
const INTERVALS = ['15m', '30m', '1h', '4h', '1d', '1w'];
const SYMBOL_RE = /^[A-Z0-9]{2,20}$/;

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  if (req.method && req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'فقط GET مجاز است' });
  }

  const q = req.query || {};
  const symbol = String(q.symbol == null ? 'BTCUSDT' : q.symbol).toUpperCase();
  const interval = String(q.interval == null ? '4h' : q.interval);
  const limitNum = parseInt(q.limit, 10);
  const limit = Number.isFinite(limitNum) ? Math.min(1000, Math.max(1, limitNum)) : 200;

  if (!SYMBOL_RE.test(symbol)) {
    return res.status(400).json({ success: false, error: 'نماد نامعتبر' });
  }
  if (!INTERVALS.includes(interval)) {
    return res.status(400).json({ success: false, error: 'تایم‌فریم نامعتبر' });
  }

  try {
    const qs = new URLSearchParams({ symbol, interval, limit: String(limit) });
    const url = `https://api.binance.com/api/v3/klines?${qs.toString()}`;
    const response = await fetch(url, { signal: AbortSignal.timeout(10000) });

    if (!response.ok) {
      throw new Error(`Binance API error: ${response.status}`);
    }

    const raw = await response.json();
    if (!Array.isArray(raw)) {
      throw new Error('Binance API error: پاسخ نامعتبر');
    }

    const candles = raw.map((k) => ({
      time: Math.floor(k[0] / 1000),
      open: parseFloat(k[1]),
      high: parseFloat(k[2]),
      low: parseFloat(k[3]),
      close: parseFloat(k[4]),
      volume: parseFloat(k[5]),
    }));

    res.setHeader('Cache-Control', 'public, s-maxage=15, stale-while-revalidate=30');
    res.status(200).json({ success: true, data: candles });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};
