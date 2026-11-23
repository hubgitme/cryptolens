// تست اعتبارسنجی api/tickers.js با fetch جعلی (بدون شبکه)
const test = require('node:test'), assert = require('node:assert/strict');
const handler = require('../api/tickers.js');

function mockRes() {
  return {
    headers: {}, statusCode: null, body: null,
    setHeader(k, v) { this.headers[k] = v; },
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; }
  };
}
const ROWS = [
  { symbol: 'ETHUSDT', lastPrice: '3500.5', priceChangePercent: '-1.25', quoteVolume: '9000' },
  { symbol: 'BTCUSDT', lastPrice: '67000', priceChangePercent: '2.5', quoteVolume: '20000' }
];
async function call(query, fetchImpl) {
  const orig = global.fetch;
  global.fetch = fetchImpl || (async () => ({ ok: true, status: 200, json: async () => ROWS }));
  try {
    const res = mockRes();
    await handler({ method: 'GET', query }, res);
    return res;
  } finally { global.fetch = orig; }
}

test('tickers: لیست خالی یا نماد نامعتبر رد میشود', async () => {
  assert.equal((await call({})).statusCode, 400);
  assert.equal((await call({ symbols: '' })).statusCode, 400);
  assert.equal((await call({ symbols: 'BTCUSDT,<img>' })).statusCode, 400);
  assert.equal((await call({ symbols: 'BTCUSDT,ETHUSDT' })).statusCode, 200);
});

test('tickers: خروجی به ترتیب درخواستی و با شکل درست است', async () => {
  const r = await call({ symbols: 'BTCUSDT,ETHUSDT,NOPEUSDT' });
  assert.equal(r.statusCode, 200);
  assert.deepEqual(r.body, { success: true, data: [
    { symbol: 'BTCUSDT', price: 67000, change24h: 2.5, volume: 20000 },
    { symbol: 'ETHUSDT', price: 3500.5, change24h: -1.25, volume: 9000 }
  ] });
});

test('tickers: نماد تکراری و حروف کوچک نرمال میشوند', async () => {
  let seen = '';
  const r = await call({ symbols: 'btcusdt,BTCUSDT' }, async (url) => {
    seen = String(url);
    return { ok: true, status: 200, json: async () => ROWS };
  });
  assert.equal(r.statusCode, 200);
  assert.equal(r.body.data.length, 1);
  assert.match(decodeURIComponent(seen), /\["BTCUSDT"\]/);
});

test('tickers: خطای Binance به صورت success:false برمیگردد', async () => {
  const r = await call({ symbols: 'BTCUSDT' }, async () => ({ ok: false, status: 451, json: async () => ({}) }));
  assert.equal(r.statusCode, 500);
  assert.equal(r.body.success, false);
});
