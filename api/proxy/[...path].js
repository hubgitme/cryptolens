// پروکسی عمومی: هر درخواستی که با /api/proxy/<URL کامل> بیاد رو مستقیم فوروارد می‌کنه
// مثال: /api/proxy/https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=4h
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  try {
    const prefix = '/api/proxy/';
    const idx = req.url.indexOf(prefix);
    if (idx === -1) {
      return res.status(400).json({ error: 'مسیر نامعتبر' });
    }

    let target = req.url.slice(idx + prefix.length);
    // چون مرورگر "https://" رو موقع تبدیل به بخش‌های مسیر به "https:/" (یه اسلش) تبدیل می‌کنه، برمی‌گردونیمش
    target = target.replace(/^https:\/(?!\/)/, 'https://').replace(/^http:\/(?!\/)/, 'http://');

    const response = await fetch(target);
    const text = await response.text();

    res.setHeader('Content-Type', response.headers.get('content-type') || 'application/json');
    res.status(response.status).send(text);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
