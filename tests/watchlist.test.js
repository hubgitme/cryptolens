const test = require('node:test'), assert = require('node:assert/strict'), load = require('./helpers');
const X = load('core.js', 'indicators.js', 'watchlist.js');
const rows = [
  { symbol: 'BTCUSDT', price: 67000, change24h: 2.5, volume: 20000 },
  { symbol: 'ETHUSDT', price: 3500, change24h: -1.25, volume: 9000 },
  { symbol: 'PEPEUSDT', price: 0.00001, change24h: 9.9, volume: 500 }
];

test('wlSortRows: پیش‌فرض، رشد و حجم', () => {
  assert.deepEqual(Array.from(X.wlSortRows(rows, 'default'), r => r.symbol), ['BTCUSDT', 'ETHUSDT', 'PEPEUSDT']);
  assert.deepEqual(Array.from(X.wlSortRows(rows, 'change'), r => r.symbol), ['PEPEUSDT', 'BTCUSDT', 'ETHUSDT']);
  assert.deepEqual(Array.from(X.wlSortRows(rows, 'volume'), r => r.symbol), ['BTCUSDT', 'ETHUSDT', 'PEPEUSDT']);
  assert.equal(rows[0].symbol, 'BTCUSDT');   // ورودی دست نمیخورد
});

test('wlFilterRows: جستجو بدون حساسیت به حروف', () => {
  assert.deepEqual(Array.from(X.wlFilterRows(rows, 'pepe'), r => r.symbol), ['PEPEUSDT']);
  assert.deepEqual(Array.from(X.wlFilterRows(rows, 'USDT'), r => r.symbol), ['BTCUSDT', 'ETHUSDT', 'PEPEUSDT']);
  assert.equal(X.wlFilterRows(rows, '').length, 3);
  assert.equal(X.wlFilterRows(rows, 'zzz').length, 0);
});

test('wlSymbols: ارزهای برتر بدون تکرار و بدون حذف‌شده‌ها', () => {
  const s = Array.from(X.wlSymbols());
  assert.ok(s.includes('BTCUSDT') && s.includes('PEPEUSDT'));
  assert.equal(new Set(s).size, s.length);
  const h = Array.from(X.wlSymbols(['BTCUSDT']));
  assert.ok(!h.includes('BTCUSDT') && h.includes('ETHUSDT'));
});

test('wlFmtPrice: قیمت PEPE صفر نمیشود', () => {
  assert.equal(X.wlFmtPrice(67000), '67,000');
  assert.notEqual(X.wlFmtPrice(0.00001), '0');
  assert.equal(X.wlFmtPrice(null), '—');
});

test('sanitizeSettings: تنظیمات سایدبار', () => {
  const d = X.sanitizeSettings({});
  assert.equal(d.watchlist.open, false); assert.equal(d.watchlist.pinned, false); assert.equal(d.watchlist.sort, 'default');
  const o = X.sanitizeSettings({ watchlist: { open: true, pinned: true, sort: 'change' } });
  assert.equal(o.watchlist.open, true); assert.equal(o.watchlist.pinned, true); assert.equal(o.watchlist.sort, 'change');
  assert.equal(X.sanitizeSettings({ watchlist: { sort: 'evil' } }).watchlist.sort, 'default');
  assert.deepEqual(Array.from(X.sanitizeSettings({ watchlist: { hidden: ['btcusdt', 'BTCUSDT', '<x>', 5] } }).watchlist.hidden), ['BTCUSDT']);
  assert.deepEqual(Array.from(X.sanitizeSettings({}).watchlist.hidden), []);
});
