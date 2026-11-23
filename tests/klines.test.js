// تست اعتبارسنجی api/klines.js با fetch جعلی (بدون شبکه)
const test = require('node:test'), assert = require('node:assert/strict');
const handler = require('../api/klines.js');

function mockRes() {
  return {
    headers: {}, statusCode: null, body: null,
    setHeader(k, v) { this.headers[k] = v; },
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; }
  };
}
const ROW = [1700000000000, '100', '110', '90', '105', '12.5'];
async function call(query, fetchImpl) {
  const orig = global.fetch;
  global.fetch = fetchImpl || (async () => ({ ok: true, status: 200, json: async () => [ROW] }));
  try {
    const res = mockRes();
    await handler({ method: 'GET', query }, res);
    return res;
  } finally { global.fetch = orig; }
}

test('klines: نماد و تایم‌فریم نامعتبر رد میشوند', async () => {
  assert.equal((await call({ symbol: '<img>', interval: '4h', limit: '5' })).statusCode, 400);
  assert.equal((await call({ symbol: 'BTCUSDT', interval: '9x', limit: '5' })).statusCode, 400);
  assert.equal((await call({ symbol: 'BTCUSDT', interval: '4h', limit: '5' })).statusCode, 200);
});

test('klines: مقادیری که فرانت میفرستد پذیرفته میشوند (5 و 300/500/1000)', async () => {
  for (const limit of ['5', '300', '500', '1000']) {
    const r = await call({ symbol: 'PEPEUSDT', interval: '15m', limit });
    assert.equal(r.statusCode, 200);
    assert.equal(r.body.success, true);
  }
});

test('klines: limit بزرگ به 1000 محدود و در URL درست encode میشود', async () => {
  let seen = '';
  const r = await call({ symbol: 'btcusdt', interval: '1d', limit: '99999' }, async (url) => {
    seen = String(url);
    return { ok: true, status: 200, json: async () => [ROW] };
  });
  assert.equal(r.statusCode, 200);
  assert.match(seen, /symbol=BTCUSDT/);
  assert.match(seen, /interval=1d/);
  assert.match(seen, /limit=1000/);
});

test('klines: شکل خروجی مثل قبل است', async () => {
  const r = await call({ symbol: 'BTCUSDT', interval: '4h', limit: '1' });
  assert.deepEqual(r.body, { success: true, data: [{ time: 1700000000, open: 100, high: 110, low: 90, close: 105, volume: 12.5 }] });
});

test('klines: خطای Binance به صورت success:false برمیگردد', async () => {
  const r = await call({ symbol: 'BTCUSDT', interval: '4h', limit: '1' }, async () => ({ ok: false, status: 451, json: async () => ({}) }));
  assert.equal(r.statusCode, 500);
  assert.equal(r.body.success, false);
});
