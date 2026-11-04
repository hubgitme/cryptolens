const test = require('node:test'), assert = require('node:assert/strict'), load = require('./helpers');
const I = load('indicators.js');
const mk = f => Array.from({ length: 120 }, (_, i) => { const c = f(i); return { high: c + 2, low: c - 2, open: c, close: c, volume: 10 }; });
const near = (a, b, e = 1e-9) => assert.ok(Math.abs(a - b) < e, `${a} ≉ ${b}`);

test('SMA / EMA', () => {
  const s = I.calcSMA([1, 2, 3, 4, 5], 3);
  assert.deepEqual(Array.from(s), [null, null, 2, 3, 4]);
  const e = I.calcEMA([1, 2, 3, 4, 5], 3);
  near(e[2], 2); near(e[3], 3); near(e[4], 4);   // EMA با SMA شروع میشه و روی خط راست برابر میشه
});
test('OBV و ROC', () => {
  assert.deepEqual(Array.from(I.calcOBV([{ close: 1, volume: 5 }, { close: 2, volume: 3 }, { close: 2, volume: 9 }, { close: 1, volume: 4 }])), [0, 3, 3, -1]);
  const r = I.calcROC([100, 110, 121], 1); assert.equal(r[0], null); near(r[1], 10); near(r[2], 10);
});
test('ADX: ساختار و جهت', () => {
  const up = I.calcADX(mk(i => 100 + i * 1.5), 14), dn = I.calcADX(mk(i => 300 - i * 1.5), 14);
  assert.equal(up.pdi.findIndex(v => v != null), 14);
  assert.equal(up.adx.findIndex(v => v != null), 27);   // 2*period-1
  assert.ok(up.pdi[119] > up.mdi[119] && dn.mdi[119] > dn.pdi[119]);
  for (const r of [up, dn]) for (const a of [r.adx, r.pdi, r.mdi]) assert.ok(a.filter(v => v != null).every(v => v >= 0 && v <= 100));
});
test('RSI / Stoch / ATR / MACD / BB در بازه‌ی درست', () => {
  const c = mk(i => 100 + 10 * Math.sin(i / 7)), cl = c.map(x => x.close);
  assert.ok(Array.from(I.calcRSI(cl, 14)).filter(v => v != null).every(v => v >= 0 && v <= 100));
  const st = I.calcStoch(c, 14, 3, 3); assert.ok(st.k.filter(v => v != null).every(v => v >= 0 && v <= 100));
  assert.ok(I.calcATR(c, 14).filter(v => v != null).every(v => v > 0));
  assert.equal(I.calcMACD(cl, 12, 26, 9).ml.length, cl.length);
  const b = I.calcBB(cl, 20, 2); assert.ok(b.up[30] > b.mid[30] && b.mid[30] > b.lo[30]);
});
test('toSeries: برای مقدارهای خالی «جای خالی» می‌گذارد تا همه‌ی پنل‌ها هم‌تراز بمانند', () => {
  const s = I.toSeries([10, 20, 30], [null, 5, 6]);
  assert.equal(s.length, 3); assert.equal(s[0].time, 10); assert.ok(!('value' in s[0])); assert.equal(s[1].value, 5);
});
