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
