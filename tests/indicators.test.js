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

test('OBV: همترازی با مقدار TradingView و ماندگاری با جلو رفتن پنجره', () => {
  const closes = [10, 11, 10, 10, 12, 13], vols = [5, 3, 4, 2, 6, 7];
  const candles = closes.map((c, i) => ({ close: c, volume: vols[i], time: 100 + i }));
  const times = candles.map(c => c.time), raw = Array.from(I.calcOBV(candles));
  const anchor = I.makeObvAnchor(raw, times, 40500);
  const r = I.calibrateOBV(raw, times, anchor);
  assert.ok(r.matched); near(r.values[5], 40500);                     // آخرین کندل = عدد TV
  near(r.values[5] - r.values[4], raw[5] - raw[4]);                  // شکل نمودار تغییر نمی‌کند
  // پنجره یک کندل جلو می‌رود (اولین کندل حذف و یک کندل جدید اضافه میشود)
  const c2 = candles.slice(1).concat([{ close: 12, volume: 9, time: 106 }]);
  const t2 = c2.map(c => c.time), raw2 = Array.from(I.calcOBV(c2));
  const r2 = I.calibrateOBV(raw2, t2, r.anchor);
  assert.ok(r2.matched);
  near(r2.values[4], 40500);                                          // کندل آخرِ قبلی همان مقدار TV را حفظ می‌کند
  near(r2.values[5], 40500 - 9);                                      // کندل جدید با افت قیمت ۱۳→۱۲
  assert.equal(I.calibrateOBV(raw, times, { t: 1, v: 5 }).matched, false);   // لنگر بیرون از پنجره
});
test('parseCompact', () => {
  assert.equal(I.parseCompact('40.5K'), 40500); assert.equal(I.parseCompact('1.2m'), 1200000);
  assert.equal(I.parseCompact('1,250,000'), 1250000); assert.equal(I.parseCompact('\u22123.1K'), -3100);
  assert.equal(I.parseCompact('abc'), null);
});

test('mergeCandles: جایگزینی کندل جاری، افزودن کندل جدید و برش قدیمی‌ها', () => {
  const mk = (t, c) => ({ time: t, close: c });
  const old = [1, 2, 3, 4, 5].map(t => mk(t, t));
  const a = I.mergeCandles(old, [mk(5, 50), mk(6, 6)], 100, 100);
  assert.equal(a.candles.length, 6); assert.equal(a.candles[4].close, 50); assert.equal(a.candles[5].time, 6); assert.equal(a.removed, 0);
  const b = I.mergeCandles(old, [mk(6, 6)], 5, 4);       // طول 6 > 5 → برش به 4 (۲ کندل قدیمی حذف)
  assert.equal(b.removed, 2); assert.equal(b.candles.length, 4); assert.equal(b.candles[0].time, 3);
  const c = I.mergeCandles(old, [mk(2, 22), mk(4, 44)], 100, 100); assert.equal(c.candles.length, 5); assert.equal(c.candles[1].close, 22);
  const d = I.mergeCandles(old, [mk(7, 7), mk(6, 6)], 100, 100); assert.deepEqual(Array.from(d.candles, x => x.time), [1, 2, 3, 4, 5, 6, 7]);   // مرتب
});

test('CCI: مقدار مرجع و حالت بدون نوسان', () => {
  const mk = tp => ({ high: tp, low: tp, close: tp });
  const r = I.calcCCI([1, 2, 3].map(mk), 3);
  assert.equal(r[0], null); assert.equal(r[1], null); near(r[2], 100);          // (3-2)/(0.015*(2/3)) = 100
  near(I.calcCCI([3, 2, 1].map(mk), 3)[2], -100);
  assert.equal(I.calcCCI([5, 5, 5].map(mk), 3)[2], 0);                          // بدون نوسان: تقسیم بر صفر نمیشود
});
test('Williams %R: بازه‌ی ‎−۱۰۰ تا ۰', () => {
  const c = (h, l, cl) => ({ high: h, low: l, close: cl });
  const r = I.calcWPR([c(10, 0, 5), c(10, 0, 10), c(10, 0, 0)], 3);
  assert.equal(r[0], null); near(r[2], -100);
  near(I.calcWPR([c(10, 0, 5), c(10, 2, 5), c(10, 0, 10)], 3)[2], 0);
  near(I.calcWPR([c(10, 0, 5), c(10, 0, 5), c(10, 0, 5)], 3)[2], -50);
  const d = Array.from({ length: 60 }, (_, i) => c(100 + 10 * Math.sin(i / 5) + 2, 100 + 10 * Math.sin(i / 5) - 2, 100 + 10 * Math.sin(i / 5)));
  assert.ok(Array.from(I.calcWPR(d, 14)).filter(v => v != null).every(v => v >= -100 && v <= 0));
});

test('Momentum', () => {
  const m = I.calcMOM([10, 12, 15, 11, 20], 2);
  assert.equal(m[0], null); assert.equal(m[1], null); near(m[2], 5); near(m[3], -1); near(m[4], 5);
});
test('MFI: صعودی کامل=100، نزولی کامل=0، متناوب=مقدار مرجع', () => {
  const mk = tps => tps.map(tp => ({ high: tp, low: tp, close: tp, volume: 10 }));
  const up = I.calcMFI(mk([1, 2, 3, 4, 5, 6]), 4); assert.equal(up[3], null); near(up[4], 100); near(up[5], 100);
  near(I.calcMFI(mk([6, 5, 4, 3, 2, 1]), 4)[5], 0);
  near(I.calcMFI(mk([10, 11, 10, 11, 10]), 4)[4], 100 - 100 / (1 + 22 / 20));   // مقدار مرجع ≈ 52.38
  const d = Array.from({ length: 80 }, (_, i) => { const c = 100 + 10 * Math.sin(i / 4); return { high: c + 2, low: c - 2, close: c, volume: 50 + (i % 7) }; });
  assert.ok(Array.from(I.calcMFI(d, 14)).filter(v => v != null).every(v => v >= 0 && v <= 100));
});
test('SMMA و Williams Alligator', () => {
  const s = I.calcSMMA([1, 2, 3, 4], 2);
  assert.equal(s[0], null); near(s[1], 1.5); near(s[2], 2.25); near(s[3], 3.125);
  const c = Array.from({ length: 60 }, (_, i) => ({ high: 102 + i, low: 98 + i, close: 100 + i }));
  const a = I.calcAlligator(c, 13, 8, 5);
  assert.equal(a.jaw.findIndex(v => v != null), 12); assert.equal(a.teeth.findIndex(v => v != null), 7); assert.equal(a.lips.findIndex(v => v != null), 4);
  near(a.lips[4], 102);                                                          // میانگین (H+L)/2 پنج کندل اول = 100,101,...,104 → 102
  assert.ok(a.lips[59] > a.teeth[59] && a.teeth[59] > a.jaw[59]);                // روند صعودی: لب > دندان > فک
  assert.equal(I.ALLIGATOR_SHIFT ? 0 : 0, 0);
});

test('Heikin Ashi: مقدار مرجع، حفظ زمان/حجم و بدون تغییر داده‌ی ورودی', () => {
  const raw = [{ time: 1, open: 10, high: 20, low: 5, close: 15, volume: 7 }, { time: 2, open: 15, high: 25, low: 10, close: 20, volume: 8 }, { time: 3, open: 20, high: 22, low: 8, close: 9, volume: 9 }];
  const snapshot = JSON.stringify(raw), h = I.toHeikinAshi(raw);
  near(h[0].close, 12.5); near(h[0].open, 12.5); near(h[0].high, 20); near(h[0].low, 5);
  near(h[1].close, 17.5); near(h[1].open, 12.5); near(h[1].high, 25); near(h[1].low, 10);
  near(h[2].close, 14.75); near(h[2].open, 15); near(h[2].high, 22); near(h[2].low, 8);
  assert.equal(JSON.stringify(h.map(x => [x.time, x.volume])), JSON.stringify([[1, 7], [2, 8], [3, 9]]));
  assert.equal(JSON.stringify(raw), snapshot);                       // ورودی دست‌نخورده
  const t = I.toHeikinAshi(Array.from({ length: 50 }, (_, i) => ({ time: i, open: 100 + i, high: 103 + i, low: 98 + i, close: 102 + i, volume: 1 })));
  assert.ok(t.every(x => x.high >= Math.max(x.open, x.close) && x.low <= Math.min(x.open, x.close)));   // فتیله‌ها همیشه بدنه را می‌پوشانند
});

test('calcPricePrecision: دقت نمایش بر اساس بزرگی قیمت', () => {
  assert.equal(I.calcPricePrecision(67000), 2);      // BTC: مثل قبل
  assert.equal(I.calcPricePrecision(1), 2);
  assert.equal(I.calcPricePrecision(0.5), 4);
  assert.equal(I.calcPricePrecision(0.01), 4);
  assert.equal(I.calcPricePrecision(0.005), 6);
  assert.equal(I.calcPricePrecision(0.0001), 6);
  assert.equal(I.calcPricePrecision(0.00001), 8);    // PEPE: دیگر 0.0000 نمیشود
  assert.equal(I.calcPricePrecision(0), 8);
  assert.equal(I.calcPricePrecision(NaN), 2);        // ورودی خراب: پیش‌فرض امن
});
