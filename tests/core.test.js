const test = require('node:test'), assert = require('node:assert/strict'), load = require('./helpers');
const X = load('core.js');

test('fmtCrossTime: برچسب کراس‌هیر مثل TradingView', () => {
  X.$("currentIv = '1h'");
  assert.equal(X.fmtCrossTime(Date.UTC(2023, 10, 3, 12, 0) / 1000), "Fri 03 Nov '23  12:00");
  X.$("currentIv = '1d'");
  assert.equal(X.fmtCrossTime(Date.UTC(2023, 10, 3, 12, 0) / 1000), "Fri 03 Nov '23");
});
test('updateTimeShift: محلی = اختلاف ساعت دستگاه، UTC = صفر', () => {
  const t = Date.UTC(2026, 10, 3, 12) / 1000;
  X.$("S.tz = 'local'"); X.updateTimeShift([{ time: t }]);
  assert.equal(X.$('TIME_SHIFT'), -new Date(t * 1000).getTimezoneOffset() * 60);
  X.$("S.tz = 'utc'"); X.updateTimeShift([{ time: t }]); assert.equal(X.$('TIME_SHIFT'), 0);
  assert.equal(X.dt(100), 100);
});
test('withLevels: خطوط سطح همیشه داخل محدوده‌ی دید قرار می‌گیرند', () => {
  const p = X.withLevels({ color: 'x' }, () => [40, 70]).autoscaleInfoProvider;
  const r = p(() => ({ priceRange: { minValue: 45, maxValue: 55 }, margins: { above: 1, below: 2 } }));
  assert.equal(r.priceRange.minValue, 40); assert.equal(r.priceRange.maxValue, 70); assert.equal(r.margins.below, 2);
  const r2 = p(() => ({ priceRange: { minValue: 10, maxValue: 90 } })); assert.equal(r2.priceRange.minValue, 10); assert.equal(r2.priceRange.maxValue, 90);
  const r3 = p(() => null); assert.equal(r3.priceRange.minValue, 40); assert.equal(r3.priceRange.maxValue, 70);
  assert.equal(X.withLevels({}, () => []).autoscaleInfoProvider(() => null), null);
});
test('sanitizeSettings: ساعت نمایش و سطح‌های RSI+SMA', () => {
  const d = X.sanitizeSettings({});
  assert.equal(d.tz, 'local'); assert.equal(d.rsisma.hi, 70); assert.equal(d.rsisma.lo, 40);
  assert.equal(X.sanitizeSettings({ tz: 'utc' }).tz, 'utc'); assert.equal(X.sanitizeSettings({ tz: 'mars' }).tz, 'local');
  const o = X.sanitizeSettings({ rsisma: { hi: 60, lo: 30 } }); assert.equal(o.rsisma.hi, 60); assert.equal(o.rsisma.lo, 30);
  const bad = X.sanitizeSettings({ rsisma: { hi: 30, lo: 60 } }); assert.equal(bad.rsisma.lo, 40); assert.equal(bad.rsisma.hi, 70);
});

test('تایم‌فریم‌ها: 15m و 30m معتبرند و مقدار نامعتبر رد میشود', () => {
  for (const iv of ['15m', '30m', '1h', '4h', '1d', '1w']) assert.equal(X.sanitizeSettings({ iv }).iv, iv);
  assert.equal(X.sanitizeSettings({ iv: '5m' }).iv, '4h');
  const D = load('core.js', 'drawings.js'); assert.equal(D.$('IV_SEC["15m"]'), 900); assert.equal(D.$('IV_SEC["30m"]'), 1800);
});

test('sanitizeSettings: فاصله‌ی بروزرسانی خودکار', () => {
  assert.equal(X.sanitizeSettings({}).refresh, 60);
  for (const v of [0, 15, 30, 60, 300]) assert.equal(X.sanitizeSettings({ refresh: v }).refresh, v);
  assert.equal(X.sanitizeSettings({ refresh: '30' }).refresh, 30);
  assert.equal(X.sanitizeSettings({ refresh: 7 }).refresh, 60);
});

test('sanitizeSettings: CCI، Williams %R و ترتیب پنل‌ها', () => {
  const d = X.sanitizeSettings({}); assert.equal(d.cci.period, 20); assert.equal(d.wpr.period, 14); assert.equal(d.cci.on, false);
  const o = X.sanitizeSettings({ cci: { on: true, period: 1 }, wpr: { on: true, period: 99999 } });
  assert.equal(o.cci.period, 2); assert.equal(o.wpr.period, 300); assert.equal(o.cci.on, true);
  const p = X.sanitizeSettings({ paneOrder: ['macd', 'rsi', 'macd', '<x>', 5, 'cs_abc123'] });
  assert.deepEqual(Array.from(p.paneOrder), ['macd', 'rsi', 'cs_abc123']);
  assert.deepEqual(Array.from(X.sanitizeSettings({ paneOrder: 'x' }).paneOrder), []);
});
