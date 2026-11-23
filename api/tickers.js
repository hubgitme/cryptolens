// Serverless: قیمت و تغییر ۲۴ ساعته‌ی چند ارز از Binance برای لیست سایدبار (با اعتبارسنجی ورودی)
const SYMBOL_RE = /^[A-Z0-9]{2,20}$/;
const MAX_SYMBOLS = 50;

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  if (req.method && req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'فقط GET مجاز است' });
  }

  const raw = String((req.query || {}).symbols == null ? '' : req.query.symbols);
  const symbols = [...new Set(raw.split(',').map(s => s.trim().toUpperCase()).filter(Boolean))];
  if (!symbols.length || symbols.length > MAX_SYMBOLS || symbols.some(s => !SYMBOL_RE.test(s))) {
    return res.status(400).json({ success: false, error: 'لیست نمادها نامعتبر' });
  }

  try {
    const qs = new URLSearchParams({ symbols: JSON.stringify(symbols) });
    const url = `https://api.binance.com/api/v3/ticker/24hr?${qs.toString()}`;
    const response = await fetch(url, { signal: AbortSignal.timeout(10000) });

    if (!response.ok) {
      throw new Error(`Binance API error: ${response.status}`);
    }

    const rawData = await response.json();
    if (!Array.isArray(rawData)) {
      throw new Error('Binance API error: پاسخ نامعتبر');
    }

    const bySymbol = {};
    rawData.forEach(t => {
      bySymbol[t.symbol] = {
        symbol: t.symbol,
        price: parseFloat(t.lastPrice),
        change24h: parseFloat(t.priceChangePercent),
        volume: parseFloat(t.quoteVolume)
      };
    });
    // خروجی به همان ترتیب درخواستی؛ نماد ناموجود حذف میشود
    const data = symbols.map(s => bySymbol[s]).filter(Boolean);

    res.setHeader('Cache-Control', 'public, s-maxage=15, stale-while-revalidate=30');
    res.status(200).json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};
