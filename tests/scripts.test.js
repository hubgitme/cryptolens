const test = require('node:test'), assert = require('node:assert/strict'), load = require('./helpers');
const X = load('core.js', 'indicators.js', 'scripts.js');
const cds = (opens, extra = {}) => opens.map((o, i) => ({ time: 1000 + i * 14400, open: o, high: o + 1, low: o - 1, close: o, volume: 1, ...extra }));
const sig = (n, idx) => Array.from({ length: n }, (_, i) => idx.includes(i));

test('بک‌تست: ورود در open کندل بعد از سیگنال، خروج با سیگنال', () => {
  const c = cds([100, 100, 110, 120, 132, 132]);
  const r = X.backtest({ sig: { longEntry: sig(6, [1]), longExit: sig(6, [3]) }, sl: 0, tp: 0, fee: 0 }, c);
  assert.equal(r.trades.length, 1);
  assert.ok(Math.abs(r.stats.totalRet - 20) < 1e-9);   // 110 → 132
  assert.equal(r.trades[0].entryIdx, 2); assert.equal(r.trades[0].exitIdx, 4);
});
test('بک‌تست: حد ضرر + کارمزد', () => {
  const c = cds([100, 100, 110, 108, 100, 100]); c[3].low = 100;
  const r = X.backtest({ sig: { longEntry: sig(6, [1]) }, sl: 5, tp: 0, fee: 0.1 }, c);
  assert.equal(r.trades[0].reason, 'SL');
  assert.ok(Math.abs(r.trades[0].ret - (-5 - 0.2)) < 1e-9);   // ‎−۵٪ و ۲ بار کارمزد ۰٫۱٪
});
test('بک‌تست: معامله‌ی باز آخر دوره بسته (باز) علامت می‌خورد و با سود ترکیبی سازگار است', () => {
  const c = cds([100, 100, 105, 110, 115, 120]);
  const r = X.backtest({ sig: { longEntry: sig(6, [0]) }, sl: 0, tp: 0, fee: 0 }, c);
  assert.equal(r.trades[0].open, true);
  const prod = r.trades.reduce((a, t) => a * (1 + t.ret / 100), 1);
  assert.ok(Math.abs((prod - 1) * 100 - r.stats.totalRet) < 1e-9);
});
test('runScript: plot، input و پارامتر ذخیره‌شده', () => {
  const c = cds([1, 2, 3, 4, 5]);
  const sc = { name: 't', code: "indicator('x'); const n = input('n', 2); plot(ta.sma(close, n), 'S', '#ffffff');", params: { n: 3 } };
  const r = X.runScript(sc, c);
  assert.equal(r.error, null); assert.equal(r.plots.length, 1);
  assert.deepEqual(Array.from(r.plots[0].values), [null, null, 2, 3, 4]);
  assert.equal(r.inputs[0].name, 'n');
});
test('runScript: دسترسی به document/fetch بسته است و خطا درست گزارش میشود', () => {
  const c = cds([1, 2, 3]);
  assert.ok(X.runScript({ name: 'e', code: 'document.title = "x"', params: {} }, c).error);
  assert.ok(X.runScript({ name: 'e', code: 'fetch("/x")', params: {} }, c).error);
  assert.ok(X.runScript({ name: 'e', code: 'const x = ;', params: {} }, c).error);
  assert.ok(X.runScript({ name: 'e', code: "plot([1,2], 'bad')", params: {} }, c).error);   // طول آرایه اشتباه
});
test('sanitizeSettings: ورودی مخرب پاک‌سازی میشود و اسکریپت‌های واردشده غیرفعال‌اند', () => {
  const bad = X.sanitizeSettings({ symbol: '<img>', iv: '9x', overlays: [{ type: 'evil' }, { type: 'ema', period: -5, color: 'red;x' }], rsi: { os: 90, ob: 10 } });
  assert.equal(bad.symbol, 'BTCUSDT'); assert.equal(bad.iv, '4h'); assert.equal(bad.overlays.length, 1);
  assert.equal(bad.overlays[0].period, 1); assert.match(bad.overlays[0].color, /^#[0-9a-f]{6}$/i);
  assert.ok(bad.rsi.os < bad.rsi.ob);
  const imp = X.sanitizeSettings({ customIndicators: [{ id: 'csabc123', name: 'a', code: 'plot(close)', on: true }] }, true);
  assert.equal(imp.customIndicators[0].on, false);
  assert.equal(X.sanitizeSettings({ iv: '1w' }).iv, '1w');
});
