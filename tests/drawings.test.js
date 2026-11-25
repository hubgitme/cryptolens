const test = require('node:test'), assert = require('node:assert/strict'), load = require('./helpers');
const D = load('core.js', 'drawings.js');

test('posStats خرید: هدف +۱۰٪، ضرر ۵٪، R:R ‏۲', () => {
  const s = D.posStats(100, 110, 95, true);
  assert.equal(s.tpPct, 10); assert.equal(s.slPct, 5); assert.equal(s.rr, 2);
});
test('posStats فروش: هدف پایین‌تر سود است', () => {
  const s = D.posStats(100, 90, 105, false);
  assert.equal(s.tpPct, 10); assert.equal(s.slPct, 5); assert.equal(s.rr, 2);
});
test('posStats فروش با هدف بالاتر: سود منفی می‌شود', () => {
  const s = D.posStats(100, 110, 95, false);
  assert.equal(s.tpPct, -10); assert.equal(s.slPct, 5); assert.equal(s.rr, 2);
});
test('posStats ورودی نامعتبر: null', () => {
  assert.equal(D.posStats(0, 110, 95, true), null);
  assert.equal(D.posStats(100, 110, 100, true), null);   // حد ضرر برابر ورود
  assert.equal(D.posStats(100, NaN, 95, true), null);
  assert.equal(D.posStats(100, 110, 95, true).rr.toFixed(2), '2.00');
});

test('deoverlapChips: برچسب‌های هم‌پوشان ۱۸ پیکسل فاصله می‌گیرند', () => {
  const out = D.deoverlapChips(
    [{ y: 100, price: 1, color: '#fff' }, { y: 105, price: 2, color: '#fff' }, { y: 110, price: 3, color: '#fff' }], 500);
  assert.deepEqual(out.map(c => c.y), [100, 118, 136]);
});
test('deoverlapChips: خارج از محدوده حذف و مرتب می‌شوند', () => {
  const out = D.deoverlapChips(
    [{ y: 300, price: 3, color: '#fff' }, { y: -50, price: 1, color: '#fff' }, { y: 600, price: 4, color: '#fff' }, { y: 100, price: 2, color: '#fff' }], 500);
  assert.deepEqual(out.map(c => c.price), [2, 3]);
});

test('DRAW_DEFS: پوزیشن خرید/فروش ۳ نقطه‌ای', () => {
  assert.equal(D.$('DRAW_DEFS.long.n'), 3);
  assert.equal(D.$('DRAW_DEFS.short.n'), 3);
});
test('sanitizeDrawings: پوزیشن ناقص (کمتر از ۳ نقطه) حذف می‌شود', () => {
  const mk = pts => ({ type: 'long', color: '#f59e0b', pts });
  const out = D.sanitizeDrawings({
    BTCUSDT: [mk([{ t: 1, p: 100 }, { t: 2, p: 110 }]),
              mk([{ t: 1, p: 100 }, { t: 2, p: 110 }, { t: 3, p: 95 }]),
              { type: 'short', color: '#f59e0b', pts: [{ t: 1, p: 100 }, { t: 2, p: 90 }, { t: 3, p: 105 }] },
              { type: 'trend', color: '#f59e0b', pts: [{ t: 1, p: 100 }, { t: 2, p: 110 }] }]
  });
  assert.equal(out.BTCUSDT.length, 3);
  assert.deepEqual(out.BTCUSDT.map(d => d.type), ['long', 'short', 'trend']);
});

test('rangeStats: تغییر قیمت، درصد و تعداد کندل', () => {
  const s = D.rangeStats({ t: 0, p: 100 }, { t: 14 * 3600, p: 110 }, 3600);
  assert.equal(s.diff, 10); assert.equal(s.pct, 10); assert.equal(s.bars, 15);
});
test('rangeStats نزولی: تغییر و درصد منفی', () => {
  const s = D.rangeStats({ t: 0, p: 200 }, { t: 4 * 3600, p: 190 }, 3600);
  assert.equal(s.diff, -10); assert.equal(s.pct, -5); assert.equal(s.bars, 5);
});
test('rangeStats ورودی نامعتبر: null', () => {
  assert.equal(D.rangeStats({ t: 0, p: 0 }, { t: 3600, p: 110 }, 3600), null);
  assert.equal(D.rangeStats(null, { t: 3600, p: 110 }, 3600), null);
});
test('DRAW_DEFS: بازه قیمت ۲ نقطه‌ای', () => {
  assert.equal(D.$('DRAW_DEFS.range.n'), 2);
});
test('sanitizeDrawings: بازه قیمت با ۲ نقطه نگه داشته می‌شود', () => {
  const out = D.sanitizeDrawings({
    BTCUSDT: [{ type: 'range', color: '#f59e0b', pts: [{ t: 1, p: 100 }, { t: 2, p: 110 }] },
              { type: 'range', color: '#f59e0b', pts: [{ t: 1, p: 100 }] }]
  });
  assert.equal(out.BTCUSDT.length, 1);
  assert.equal(out.BTCUSDT[0].type, 'range');
});

test('deoverlapChips: برچسب پایین پنل به بالا کشیده می‌شود، نه اینکه بریده شود', () => {
  const out = D.deoverlapChips(
    [{ y: 470, price: 1, color: '#fff' }, { y: 480, price: 2, color: '#fff' }, { y: 490, price: 3, color: '#fff' }], 500);
  assert.ok(out.every(c => c.y <= 491), 'none past bottom');
  assert.deepEqual(out.map(c => c.y), [455, 473, 491]);
});
test('deoverlapChips: دسته‌ی بلندتر از پنل از بالا چسبانده می‌شود', () => {
  const chips = Array.from({ length: 10 }, (_, i) => ({ y: 90 + i * 5, price: i, color: '#fff' }));
  const out = D.deoverlapChips(chips, 100);
  assert.ok(out.every(c => c.y >= -9 && c.y <= 109));
  for (let i = 1; i < out.length; i++) assert.ok(out[i].y - out[i - 1].y >= 18);
});
