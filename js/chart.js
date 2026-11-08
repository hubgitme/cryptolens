// js/chart.js — ساخت چارت و پنل‌ها، چیدمان/اندازه، دریافت داده، رندر، اندیکاتورهای روی چارت و پنل‌های جدا

let priceChart, rsiChart, macdChart;
let candleSeries, rsiSeries, rsiOB, rsiOS, macdLineSeries, macdSignalSeries, macdHistSeries;
let globalCandles = [], globalRsi = [], globalMacdL = [], globalMacdS = [], globalMacdH = [];
let lastPricePrecision = 2;
let isSyncing = false;
let allCharts = [];
let lastCandles = [], lastSymbol = '';
let overlaySeries = [], overlayDefs = [], volSeries = null;
const extraPanes = {}, extraData = {};

// ─── Chart helpers (مشترک بین پنل‌های اصلی و پنل‌های اضافه) ─────────────────
function baseChartOptions() {
  return {
    layout: { background: { color: '#0b0e17' }, textColor: '#6b7280' },
    grid: { vertLines: { color: '#1e2535' }, horzLines: { color: '#1e2535' } },
    crosshair: { mode: LightweightCharts.CrosshairMode.Magnet },
    timeScale: { borderColor: '#1e2535', timeVisible: true, secondsVisible: false, rightOffset: 5, barSpacing: 9, visible: false },   // محور زمان فقط در نوار ثابت پایین صفحه
    localization: { timeFormatter: fmtCrossTime },
    rightPriceScale: { borderColor: '#1e2535' },
    handleScroll: true,
    handleScale: true,
  };
}
function hookSync(src) {
  src.timeScale().subscribeVisibleLogicalRangeChange(range => {
    if (isSyncing || !range) return;
    isSyncing = true;
    allCharts.forEach(t => { if (t !== src) { try { t.timeScale().setVisibleLogicalRange(range); } catch (e) {} } });
    isSyncing = false;
  });
}

// ─── Overlay روی نمودار قیمت (SMA/EMA/Bollinger/VWAP/Volume) ─────────────────
function renderOverlays(candles, times) {
  overlaySeries.forEach(s => { try { priceChart.removeSeries(s); } catch (e) {} });
  overlaySeries = []; overlayDefs = [];
  if (volSeries) { try { priceChart.removeSeries(volSeries); } catch (e) {} volSeries = null; }
  const closes = candles.map(c => c.close);
  const line = (vals, color, w, style) => {
    const s = priceChart.addLineSeries({ color, lineWidth: w || 1.5, lineStyle: style || 0,
      priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
    s.setData(toSeries(times, vals)); overlaySeries.push(s);
  };
  S.overlays.filter(o => o.on).forEach(o => {
    if (o.type === 'sma' || o.type === 'ema') {
      const v = o.type === 'sma' ? calcSMA(closes, o.period) : calcEMA(closes, o.period);
      line(v, o.color);
      overlayDefs.push({ label: `${OV_TYPES[o.type]} ${o.period} `, color: o.color, vals: v });
    } else if (o.type === 'bb') {
      const b = calcBB(closes, o.period, o.mult);
      line(b.up, o.color, 1); line(b.lo, o.color, 1); line(b.mid, o.color, 1, 2);
      overlayDefs.push({ label: `BB ${o.period},${o.mult} `, color: o.color, vals: b.mid });
    } else if (o.type === 'vwap') {
      const v = calcVWAP(candles, currentIv);
      line(v, o.color);
      overlayDefs.push({ label: 'VWAP ', color: o.color, vals: v });
    } else if (o.type === 'alligator') {
      // Williams Alligator: سه SMMA از (H+L)/2 با جابه‌جایی رو به جلو؛ بخشی از خطوط به آینده‌ی چارت می‌رسد
      const al = calcAlligator(candles, o.jaw, o.teeth, o.lips), n = candles.length, step = IV_SEC[currentIv] || 1, lastT = candles[n - 1].time;
      [['jaw', '#2962ff', 'Jaw'], ['teeth', '#ef5350', 'Teeth'], ['lips', '#26a69a', 'Lips']].forEach(([key, color, name]) => {
        const off = ALLIGATOR_SHIFT[key], v = al[key], data = [], shifted = new Array(n).fill(null);
        for (let i = 0; i < n; i++) {
          if (v[i] == null) continue;
          const j = i + off;
          data.push({ time: j < n ? times[j] : dt(lastT + (j - (n - 1)) * step), value: v[i] });
          if (j < n) shifted[j] = v[i];
        }
        const sr = priceChart.addLineSeries({ color, lineWidth: 1.5, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
        sr.setData(data); overlaySeries.push(sr);
        overlayDefs.push({ label: `${name} `, color, vals: shifted });
      });
    }
  });
  if (S.volume.on) {
    volSeries = priceChart.addHistogramSeries({ priceFormat: { type: 'volume' }, priceScaleId: 'vol',
      lastValueVisible: false, priceLineVisible: false });
    volSeries.priceScale().applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });
    volSeries.setData(candles.map((c, i) => ({ time: times[i], value: c.volume,
      color: c.close >= c.open ? 'rgba(38,166,154,0.45)' : 'rgba(239,83,80,0.45)' })));
    overlayDefs.push({ label: 'Vol ', color: '#6b7280', vals: candles.map(c => c.volume), compact: true });
  }
}
function updateOverlayLegend(idx) {
  const el = document.getElementById('legend-ov');
  if (!el) return;
  el.innerHTML = overlayDefs.map(d => {
    const v = d.vals[idx];
    const t = v == null ? '—' : v.toLocaleString('en-US',
      d.compact ? { notation: 'compact', maximumFractionDigits: 2 } : { maximumFractionDigits: lastPricePrecision });
    return `<span class="lg-item" style="color:${d.color}">${d.label}<b class="lg-val">${t}</b></span>`;
  }).join('');
}
const EXTRA_DEFS = {
  stoch: {
    title: () => `Stoch (${S.stoch.k},${S.stoch.d},${S.stoch.smooth})`,
    build(ch) {
      const k = ch.addLineSeries(withLevels({ color: '#2962ff', lineWidth: 1.5, priceLineVisible: false }, () => [20, 80]));
      const d = ch.addLineSeries({ color: '#ff6d00', lineWidth: 1.5, priceLineVisible: false });
      [80, 20].forEach(p => k.createPriceLine({ price: p, color: '#6b7280', lineWidth: 1, lineStyle: 2, axisLabelVisible: false }));
      return { k, d };
    },
    compute: c => calcStoch(c, S.stoch.k, S.stoch.d, S.stoch.smooth),
    fill(sr, data, t) { sr.k.setData(toSeries(t, data.k)); sr.d.setData(toSeries(t, data.d)); },
    legend: (data, i) => `<span style="color:#2962ff">%K ${fx(data.k[i])}</span> <span style="color:#ff6d00">%D ${fx(data.d[i])}</span>`
  },
  atr: {
    title: () => `ATR (${S.atr.period})`,
    build(ch) { return { a: ch.addLineSeries({ color: '#ffc107', lineWidth: 1.5, priceLineVisible: false }) }; },
    compute: c => ({ a: calcATR(c, S.atr.period) }),
    fill(sr, data, t) { sr.a.setData(toSeries(t, data.a)); },
    legend: (data, i) => `<span style="color:#ffc107">${fx(data.a[i])}</span>`
  }
};
function syncExtraPane(key, on) {
  if (on && !extraPanes[key]) {
    const p = makePane(key); p.series = EXTRA_DEFS[key].build(p.chart); extraPanes[key] = p;
  } else if (!on && extraPanes[key]) removePane(key);
  if (extraPanes[key]) document.getElementById(`lg-${key}-title`).textContent = EXTRA_DEFS[key].title();
}
function renderExtras(candles, times) {
  Object.keys(EXTRA_DEFS).forEach(k => {
    if (!extraPanes[k]) return;
    const def = EXTRA_DEFS[k];
    extraData[k] = def.compute(candles);
    def.fill(extraPanes[k].series, extraData[k], times);
    document.getElementById(`lg-${k}-title`).textContent = def.title(extraData[k]);
    const mk = { stoch: 'k', atr: 'a', obv: 'o', roc: 'r', adx: 'a', rsisma: 'r', cci: 'c', wpr: 'w', mom: 'm', mfi: 'f' }[k];   // خط اصلی هر پنل برای هم‌گام‌سازی کراس‌هیر
    extraPanes[k].xh = { series: extraPanes[k].series[mk], vals: extraData[k][mk] };
  });
}
function updateExtraLegends(idx) {
  Object.keys(extraPanes).forEach(k => {
    const el = document.getElementById(`lg-${k}-vals`), p = extraPanes[k];
    if (!el) return;
    if (p.custom) el.innerHTML = p.custom.map(pl => `<span style="color:${pl.color}">${escHtml(pl.name)} ${fx(pl.values[idx])}</span>`).join(' ');
    else if (extraData[k]) el.innerHTML = EXTRA_DEFS[k].legend(extraData[k], idx);
  });
}
function applyIndicatorVisibility() {
  document.getElementById('wrap-rsi').style.display = S.rsi.on ? '' : 'none';
  document.getElementById('wrap-macd').style.display = S.macd.on ? '' : 'none';
  document.getElementById('lg-rsi-title').textContent = `RSI (${S.rsi.period})`;
  document.getElementById('lg-macd-title').textContent = `MACD (${S.macd.fast},${S.macd.slow},${S.macd.sig})`;
  syncExtraPane('stoch', S.stoch.on);
  syncExtraPane('atr', S.atr.on);
  syncExtraPane('obv', S.obv.on);
  syncExtraPane('rsisma', S.rsisma.on);
  syncExtraPane('roc', S.roc.on);
  syncExtraPane('adx', S.adx.on);
  syncExtraPane('cci', S.cci.on);
  syncExtraPane('wpr', S.wpr.on);
  syncExtraPane('mom', S.mom.on);
  syncExtraPane('mfi', S.mfi.on);
  applyPaneOrder();
  applyLockState();
  resizeChartsNow();
}

// ─── Chart heights ──────────────────────────────────────────────────────────
function visiblePaneKeys() {
  const k = ['price'];
  if (S.rsi.on) k.push('rsi');
  if (S.macd.on) k.push('macd');
  Object.keys(extraPanes).forEach(x => k.push(x));
  return k;
}
function calcHeights() {
  const colH = Math.max(document.getElementById('chartsCol').clientHeight, 300);
  const out = {};
  out.price = chartMax ? colH - 4 : (S.paneH.price || Math.max(300, Math.round(colH * 0.62)));
  visiblePaneKeys().forEach(k => { if (k !== 'price') out[k] = S.paneH[k] || 180; });
  return out;
}
// ─── Resize — چارت‌ها رو موقع چرخش/تغییر سایز صفحه دوباره اندازه می‌کنه ──
function resizeChartsNow() {
  applyResponsiveLayout();
  if (!priceChart) return;
  const h = calcHeights(), m = allPaneCharts();
  Object.keys(m).forEach(k => {
    if (h[k] == null) return;
    const el = document.getElementById('chart-' + k);
    el.style.height = h[k] + 'px';
    m[k].resize(el.clientWidth, h[k]);
  });
  sizeTimeAxis();
}
let resizeTimer = null;
function handleResize() {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(resizeChartsNow, 150);
}
window.addEventListener('resize', handleResize);
window.addEventListener('orientationchange', handleResize);

// ─── Init Charts ────────────────────────────────────────────────────────────
function initCharts() {
  const h = calcHeights();

  const base = baseChartOptions();
  // Price (candlestick)
  document.getElementById('chart-price').style.height = h.price + 'px';
  priceChart = LightweightCharts.createChart(document.getElementById('chart-price'), { ...base, height: h.price });
  candleSeries = priceChart.addCandlestickSeries({
    upColor: '#26a69a', downColor: '#ef5350',
    borderUpColor: '#26a69a', borderDownColor: '#ef5350',
    wickUpColor: '#26a69a', wickDownColor: '#ef5350',
    priceFormat: { type: 'price', precision: 4, minMove: 0.01 }, // ← تعداد رقم اعشار قیمت اینجا
  });

  // RSI
  document.getElementById('chart-rsi').style.height = h.rsi + 'px';
  rsiChart = LightweightCharts.createChart(document.getElementById('chart-rsi'), { ...base, height: h.rsi });
  rsiSeries = rsiChart.addLineSeries({ color: '#ffc107', lineWidth: 1.5 });
  rsiOB = rsiChart.addLineSeries({ color: '#ef5350', lineWidth: 1, lineStyle: 2 });
  rsiOS = rsiChart.addLineSeries({ color: '#26a69a', lineWidth: 1, lineStyle: 2 });

  // MACD
  document.getElementById('chart-macd').style.height = h.macd + 'px';
  macdChart = LightweightCharts.createChart(document.getElementById('chart-macd'), { ...base, height: h.macd });
  macdLineSeries   = macdChart.addLineSeries({ color: '#2962ff', lineWidth: 1.5 });
  macdSignalSeries = macdChart.addLineSeries({ color: '#ff6d00', lineWidth: 1.5 });
  macdHistSeries   = macdChart.addHistogramSeries({ priceFormat: { type: 'price', precision: 4 } });

  allCharts = [priceChart, rsiChart, macdChart];
  allCharts.forEach(hookSync);
  [rsiChart, macdChart].forEach(c => c.applyOptions(PANE_INTERACT));
  hookCrosshair(priceChart, 'price'); hookCrosshair(rsiChart, 'rsi'); hookCrosshair(macdChart, 'macd');
}

// ─── نوار ساعت ثابت پایین صفحه (مثل TradingView): پنل‌ها اسکرول میشوند، این نوار ثابت می‌ماند ───
const AXIS_CHART_H = 90;
let axisChart = null, axisSeries = null, globalCloses = [];
function initTimeAxis() {
  const base = baseChartOptions();
  axisChart = LightweightCharts.createChart(document.getElementById('timeAxisChart'), {
    ...base, height: AXIS_CHART_H,
    timeScale: { ...base.timeScale, visible: true },
    rightPriceScale: { visible: true, borderVisible: false },
    handleScroll: { mouseWheel: false, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false },
    handleScale: { mouseWheel: false, pinch: true, axisPressedMouseMove: { time: true, price: false } }
  });
  axisSeries = axisChart.addLineSeries({ color: 'rgba(0,0,0,0)', lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
  allCharts.push(axisChart); hookSync(axisChart); hookCrosshair(axisChart, 'axis');
  sizeTimeAxis();
}
function sizeTimeAxis() {
  if (!axisChart) return;
  const col = document.getElementById('chartsCol'), bar = document.getElementById('timeAxisBar'), el = document.getElementById('timeAxisChart');
  let h = 28; try { h = Math.round(axisChart.timeScale().height()) || 28; } catch (e) {}
  bar.style.height = h + 'px';
  bar.style.paddingRight = Math.max(0, col.offsetWidth - col.clientWidth) + 'px';   // جبران نوار اسکرول تا ستون‌ها هم‌تراز بمانند
  const w = col.clientWidth; el.style.width = w + 'px'; el.style.height = AXIS_CHART_H + 'px';
  axisChart.resize(w, AXIS_CHART_H);
}

// ─── خط عمودی کراس‌هیر روی همه‌ی پنل‌ها (قیمت، RSI، MACD، پنل‌های جدا، اسکریپت‌ها و نوار ساعت) ───
function candleIndexAt(time) {
  if (!globalCandles.length) return -1;
  const g = Math.round((time - dt(globalCandles[0].time)) / (IV_SEC[currentIv] || 1)), c = globalCandles[g];
  return c && dt(c.time) === time ? g : globalCandles.findIndex(x => dt(x.time) === time);
}
function crosshairTargets() {
  const list = [{ key: 'price', chart: priceChart, series: candleSeries, vals: globalCloses }];
  if (S.rsi.on) list.push({ key: 'rsi', chart: rsiChart, series: rsiSeries, vals: globalRsi });
  if (S.macd.on) list.push({ key: 'macd', chart: macdChart, series: macdLineSeries, vals: globalMacdL });
  Object.keys(extraPanes).forEach(k => { const p = extraPanes[k]; if (p.xh) list.push({ key: k, chart: p.chart, series: p.xh.series, vals: p.xh.vals }); });
  if (axisChart) list.push({ key: 'axis', chart: axisChart, series: axisSeries, vals: null });
  return list;
}
function hookCrosshair(chart, key) {
  chart.subscribeCrosshairMove(param => {
    if (isSyncing) return;
    const idx = param.time ? candleIndexAt(param.time) : -1;
    isSyncing = true;
    try {
      crosshairTargets().forEach(t => {
        if (t.key === key) return;
        try {
          if (!param.time) t.chart.clearCrosshairPosition();
          else { const v = idx >= 0 && t.vals ? t.vals[idx] : null; t.chart.setCrosshairPosition(v == null ? 0 : v, param.time, t.series); }
        } catch (e) {}
      });
    } finally { isSyncing = false; }
    if (!param.time) showLastLegend(); else if (idx !== -1) updateLegendByIndex(idx);
  });
}

// ─── Pane Legends (سبک TradingView — بالا-چپ هر پنل، همیشه یه مقدار نشون میده) ──
function updateLegendByIndex(idx) {
  const c   = globalCandles[idx];
  const rsi = globalRsi[idx];
  const ml  = globalMacdL[idx];
  const sl  = globalMacdS[idx];
  const hl  = globalMacdH[idx];
  if (!c) return;

  const fmt  = v => v != null ? v.toFixed(2) : '—';
  const fmtP = v => v != null ? v.toLocaleString('en-US', { maximumFractionDigits: lastPricePrecision }) : '—';

  document.getElementById('lg-open').textContent  = fmtP(c.open);
  document.getElementById('lg-high').textContent  = fmtP(c.high);
  document.getElementById('lg-low').textContent   = fmtP(c.low);
  const closeEl = document.getElementById('lg-close');
  closeEl.textContent = fmtP(c.close);
  closeEl.className = 'lg-val ' + (c.close >= c.open ? 'up' : 'dn');

  const rsiEl = document.getElementById('lg-rsi');
  rsiEl.textContent = fmt(rsi);
  rsiEl.className = 'lg-val' + (rsi >= S.rsi.ob ? ' dn' : rsi <= S.rsi.os ? ' up' : '');

  document.getElementById('lg-macd').textContent   = fmt(ml);
  document.getElementById('lg-signal').textContent = fmt(sl);
  const histEl = document.getElementById('lg-hist');
  histEl.textContent = fmt(hl);
  histEl.className = 'lg-val ' + (hl >= 0 ? 'up' : 'dn');
  updateOverlayLegend(idx);
  updateExtraLegends(idx);
}

function showLastLegend() {
  if (globalCandles.length) updateLegendByIndex(globalCandles.length - 1);
}

// ─── Load ────────────────────────────────────────────────────────────────────
async function loadData() {
  const symbol = document.getElementById('symbolInput').value.trim().toUpperCase();
  if (!symbol) return;
  if (!SYMBOL_RE.test(symbol)) { document.getElementById('status').textContent = '❌ نماد نامعتبر'; return; }
  const key = `${symbol}|${currentIv}|${S.limit}`;
  if (inflightKey === key) return;
  inflightKey = key;
  document.activeElement && document.activeElement.blur();
  saveSettings();
  document.getElementById('loader').classList.add('show');
  document.getElementById('loadBtn').disabled = true;
  document.getElementById('status').textContent = 'در حال دریافت...';
  try {
    const res = await fetch(`/api/klines?symbol=${symbol}&interval=${currentIv}&limit=${S.limit}`);
    const json = await res.json();
    if (inflightKey !== key) return;   // درخواست جدیدتری شروع شده، این نتیجه کنار گذاشته میشه
    if (!json.success) throw new Error(json.error || 'خطا در دریافت داده');
    lastCandles = json.data; lastSymbol = symbol; lastUpdate = Date.now();
    renderAll(true);
    renderPanel();
  } catch (e) {
    if (inflightKey === key) document.getElementById('status').textContent = '❌ ' + e.message;
  } finally {
    if (inflightKey === key) {
      inflightKey = null;
      document.getElementById('loader').classList.remove('show');
      document.getElementById('loadBtn').disabled = false;
    }
  }
}

function renderAll(resetView, quiet) {   // quiet: بروزرسانی بی‌صدای هر دقیقه (بدون ریست مقیاس/اندازه/نمای کاربر)
  const symbol = lastSymbol, candles = S.chartType === 'ha' ? toHeikinAshi(lastCandles) : lastCandles;   // هیکن‌آشی: اندیکاتورها هم مثل TradingView روی همین کندل‌ها حساب میشوند
  if (!candles.length) return;
  try {
    const closes = candles.map(c => c.close);
    updateTimeShift(candles);
    const times = candles.map(c => dt(c.time));
    const rsiArr = calcRSI(closes, S.rsi.period);
    const { ml, sl, hl } = calcMACD(closes, S.macd.fast, S.macd.slow, S.macd.sig);
    globalCandles = candles; globalCloses = closes; globalRsi = rsiArr; globalMacdL = ml; globalMacdS = sl; globalMacdH = hl;
    const small = closes[closes.length - 1] < 1;
    lastPricePrecision = small ? 4 : 2;
    candleSeries.applyOptions({ priceFormat: { type: 'price', precision: lastPricePrecision, minMove: small ? 0.0001 : 0.01 } });
    candleSeries.setData(candles.map((c, i) => ({ ...c, time: times[i] })));
    if (!quiet) priceChart.priceScale('right').applyOptions({ autoScale: true });
    rsiSeries.setData(toSeries(times, rsiArr));
    rsiOB.setData(times.map(t => ({ time: t, value: S.rsi.ob })));
    rsiOS.setData(times.map(t => ({ time: t, value: S.rsi.os })));
    macdLineSeries.setData(toSeries(times, ml));
    macdSignalSeries.setData(toSeries(times, sl));
    macdHistSeries.setData(times.map((t, i) => hl[i] != null ? { time: t, value: hl[i], color: hl[i] >= 0 ? '#26a69a' : '#ef5350' } : { time: t }));
    if (axisSeries) {   // نوار ساعت تا ۳۰ کندل آینده هم برچسب دارد (برای خطوط Alligator و فضای سمت راست)
      const step = IV_SEC[currentIv] || 1, lastT = candles[candles.length - 1].time;
      axisSeries.setData(times.concat(Array.from({ length: 30 }, (_, k) => dt(lastT + (k + 1) * step))).map(t => ({ time: t, value: 0 })));
    }
    renderOverlays(candles, times);
    renderExtras(candles, times);
    renderCustom(candles, times);
    document.getElementById('lg-symbol').textContent = `${symbol} · ${currentIv.toUpperCase()}${S.chartType === 'ha' ? ' · HA' : ''}`;
    showLastLegend();
    if (!quiet) {
      resizeChartsNow();
      rsiChart.priceScale('right').applyOptions({ autoScale: true });
      macdChart.priceScale('right').applyOptions({ autoScale: true });
    }
    if (resetView) {
      const barsToShow = window.innerWidth <= 768 ? 55 : 120, total = candles.length;
      priceChart.timeScale().setVisibleLogicalRange({ from: Math.max(0, total - barsToShow), to: total + 3 });
    }
    onSymbolRendered(symbol);
    applyPaneOrder();
    updateLiveInfo();
    if (!quiet) scheduleAlign();
    if (!quiet) document.getElementById('status').textContent = `${symbol} · ${currentIv}${S.chartType === 'ha' ? ' · HA' : ''} · ${candles.length} کندل`;
  } catch (e) {
    document.getElementById('status').textContent = '❌ ' + e.message;
  }
}
function makePane(key) {
  const wrap = document.createElement('div');
  wrap.className = 'chart-wrap'; wrap.id = 'wrap-' + key;
  wrap.innerHTML = `<div class="pane-legend"><span class="lg-symbol" id="lg-${key}-title"></span><span class="pane-btns"><button class="mv-up" onclick="movePane('${key}',-1)" title="بالاتر">▲</button><button class="mv-dn" onclick="movePane('${key}',1)" title="پایین‌تر">▼</button><button onclick="openInd()" title="تنظیمات">⚙</button><button onclick="closePane('${key}')" title="حذف از چارت">✕</button></span><span class="lg-item" id="lg-${key}-vals"></span></div><div id="chart-${key}"></div>`;
  document.getElementById('chartsCol').insertBefore(wrap, document.getElementById('chartsPad'));
  const el = document.getElementById('chart-' + key);
  el.style.height = '180px';
  const chart = LightweightCharts.createChart(el, { ...baseChartOptions(), ...(S.lockAll ? PANE_LOCKED : PANE_INTERACT), height: 180 });
  allCharts.push(chart); hookSync(chart);
  hookCrosshair(chart, key);
  const r = priceChart && priceChart.timeScale().getVisibleLogicalRange();
  if (r) { try { chart.timeScale().setVisibleLogicalRange(r); } catch (e) {} }
  addGrip(wrap, key); keepPaneAutoscale(chart, el);
  return { chart, wrap };
}

function removePane(key) {
  const p = extraPanes[key]; if (!p) return;
  allCharts = allCharts.filter(c => c !== p.chart);
  p.chart.remove(); p.wrap.remove();
  delete extraPanes[key]; delete extraData[key];
}

// ═══════════ جابجایی رسم‌ها / تقسیم صفحه / بارگذاری خودکار ═══════════
let inflightKey = null, chartMax = false;
// پنل‌های اندیکاتور: چرخ موس/کشیدن عمودی صفحه را اسکرول می‌کند و کشیدن محور قیمت (کشیده‌شدن نمودار) غیرفعال است
const PANE_INTERACT = { handleScroll: { mouseWheel: false, vertTouchDrag: false }, handleScale: { mouseWheel: false, axisPressedMouseMove: { time: true, price: false } } };
const PANE_LOCKED = { handleScroll: false, handleScale: false };   // «قفل همه»: هیچ حرکت/زومی در پنل‌ها
function applyLockState() {
  const col = document.getElementById('chartsCol'); if (col) col.classList.toggle('locked', !!S.lockAll);
  const opts = S.lockAll ? PANE_LOCKED : PANE_INTERACT;
  Object.entries(allPaneCharts()).forEach(([k, ch]) => { if (k !== 'price') { try { ch.applyOptions(opts); } catch (e) {} } });
}
// بعد از هر کشیدن، مقیاس قیمت پنل دوباره خودکار میشود تا نمودار «کشیده» نماند
function keepPaneAutoscale(chart, el) {
  el.addEventListener('pointerup', () => { try { chart.priceScale('right').applyOptions({ autoScale: true }); } catch (e) {} });
}

// لایه‌ی شفاف تمام‌صفحه موقع کشیدن، تا موس/لمس از دست نره (حتی وقتی SVG دوباره ساخته میشه)
function dragShield(e, cursor, onMove, onEnd) {
  e.preventDefault(); e.stopPropagation();
  const sh = document.createElement('div');
  sh.style.cssText = `position:fixed;inset:0;z-index:99999;cursor:${cursor};touch-action:none;`;
  document.body.appendChild(sh);
  try { sh.setPointerCapture(e.pointerId); } catch (_) {}
  const end = () => { sh.remove(); onEnd(); };
  sh.addEventListener('pointermove', onMove);
  sh.addEventListener('pointerup', end); sh.addEventListener('pointercancel', end);
}
function updateMaxBtn() {
  const b = document.getElementById('maxBtn'); if (!b) return;
  b.classList.toggle('active', chartMax);
  b.title = chartMax ? 'کوچک‌کردن چارت (نمایش اندیکاتورها)' : 'بزرگ‌کردن چارت';
}
function toggleChartMax() {
  chartMax = !chartMax; updateMaxBtn(); resizeChartsNow();
  document.getElementById('chartsCol').scrollTop = 0; drawVersion++;
}

function allPaneCharts() {
  const m = { price: priceChart, rsi: rsiChart, macd: macdChart };
  Object.keys(extraPanes).forEach(k => { m[k] = extraPanes[k].chart; });
  return m;
}

function closePane(key) {
  if (['rsi', 'macd', 'stoch', 'atr', 'obv', 'rsisma', 'roc', 'adx', 'cci', 'wpr', 'mom', 'mfi'].includes(key)) S[key].on = false;
  else { const sc = S.customIndicators.find(s => 'cs_' + s.id === key); if (sc) sc.on = false; }
  onIndChange();
}
function addGrip(wrap, key) {
  const g = document.createElement('div');
  g.className = 'grip'; g.title = 'بکشید تا ارتفاع تغییر کند (دابل‌کلیک: پیش‌فرض)';
  wrap.appendChild(g);
  g.addEventListener('pointerdown', e => {
    const startY = e.clientY, startH = calcHeights()[key] || 180;
    dragShield(e, 'ns-resize', ev => {
      if (key === 'price') { chartMax = false; updateMaxBtn(); }
      S.paneH[key] = Math.max(key === 'price' ? 200 : 80, Math.min(1500, Math.round(startH + ev.clientY - startY)));
      resizeChartsNow();
    }, () => { saveSettings(); drawVersion++; });
  });
  g.addEventListener('dblclick', () => { delete S.paneH[key]; if (key === 'price') { chartMax = false; updateMaxBtn(); } resizeChartsNow(); saveSettings(); drawVersion++; });
}
function initGrips() {
  ['price', 'rsi', 'macd'].forEach(k => addGrip(document.getElementById('wrap-' + k), k));
  keepPaneAutoscale(rsiChart, document.getElementById('chart-rsi')); keepPaneAutoscale(macdChart, document.getElementById('chart-macd'));
}
function resetLayout() {   // اندازه و ترتیب پنل‌ها به پیش‌فرض
  S.paneH = {}; S.paneOrder = []; chartMax = false; updateMaxBtn(); applyPaneOrder(); saveSettings(); resizeChartsNow(); drawVersion++;
  msg('↺ اندازه و ترتیب پنل‌ها بازنشانی شد');
}
const lineOpt = color => ({ color, lineWidth: 1.5, priceLineVisible: false });
EXTRA_DEFS.obv = {
  title: d => `OBV (SMA ${S.obv.sma})` + (d && d.cal ? ' · همتراز با TV' : d && d.lost ? ' · ⚠ همترازی منقضی' : ''),
  build(ch) {
    return { o: ch.addLineSeries({ ...lineOpt('#2962ff'), priceFormat: { type: 'custom', formatter: fxc, minMove: 1 } }),
             s: ch.addLineSeries({ ...lineOpt('#ff6d00'), priceFormat: { type: 'custom', formatter: fxc, minMove: 1 } }) };
  },
  compute: c => {
    const key = obvKey(), a0 = S.obv.anchors[key];
    const r = calibrateOBV(calcOBV(c), c.map(x => x.time), a0);
    if (r.matched && r.anchor && (!a0 || r.anchor.t !== a0.t)) { S.obv.anchors[key] = r.anchor; saveSettings(); }
    return { o: r.values, s: calcSMA(r.values, S.obv.sma), cal: r.matched, lost: !!a0 && !r.matched };
  },
  fill(sr, d, t) { sr.o.setData(toSeries(t, d.o)); sr.s.setData(toSeries(t, d.s)); },
  legend: (d, i) => `<span style="color:#2962ff">OBV ${fxc(d.o[i])}</span> <span style="color:#ff6d00">SMA ${fxc(d.s[i])}</span>`
};
EXTRA_DEFS.rsisma = {
  title: () => `RSI (${S.rsisma.period}) SMA (${S.rsisma.sma})`,
  build(ch) {
    const r = ch.addLineSeries(withLevels(lineOpt('#ffc107'), () => [S.rsisma.lo, S.rsisma.hi]));
    return { r, m: ch.addLineSeries(lineOpt('#3b82f6')), lines: [] };
  },
  compute: c => {
    const cl = c.map(x => x.close), r = cl.length > S.rsisma.period ? calcRSI(cl, S.rsisma.period) : cl.map(() => null);
    return { r, m: calcSMA(r, S.rsisma.sma) };
  },
  fill(sr, d, t) {
    sr.r.setData(toSeries(t, d.r)); sr.m.setData(toSeries(t, d.m));
    // خطوط سطح (پیش‌فرض ۷۰ و ۴۰) همراه عدد روی محور، با تغییر تنظیمات دوباره ساخته میشوند
    sr.lines.forEach(l => { try { sr.r.removePriceLine(l); } catch (e) {} });
    sr.lines = [[S.rsisma.hi, '#ef5350'], [S.rsisma.lo, '#26a69a']].map(([price, color]) =>
      sr.r.createPriceLine({ price, color, lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: '' }));
  },
  legend: (d, i) => `<span style="color:#ffc107">RSI ${fx(d.r[i])}</span> <span style="color:#3b82f6">SMA ${fx(d.m[i])}</span>`
};
EXTRA_DEFS.cci = {
  title: () => `CCI (${S.cci.period})`,
  build(ch) {
    const c = ch.addLineSeries(withLevels(lineOpt('#2962ff'), () => [100, -100]));
    [[100, '#6b7280', true], [-100, '#6b7280', true], [0, '#374151', false]].forEach(([price, color, lbl]) =>
      c.createPriceLine({ price, color, lineWidth: 1, lineStyle: 2, axisLabelVisible: lbl, title: '' }));
    return { c };
  },
  compute: cd => ({ c: calcCCI(cd, S.cci.period) }),
  fill(sr, d, t) { sr.c.setData(toSeries(t, d.c)); },
  legend: (d, i) => `<span style="color:#2962ff">${fx(d.c[i])}</span>`
};
EXTRA_DEFS.wpr = {
  title: () => `%R (${S.wpr.period})`,
  build(ch) {
    const w = ch.addLineSeries(withLevels(lineOpt('#7e57c2'), () => [-20, -80]));
    [[-20, '#ef5350'], [-80, '#26a69a']].forEach(([price, color]) =>
      w.createPriceLine({ price, color, lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: '' }));
    return { w };
  },
  compute: cd => ({ w: calcWPR(cd, S.wpr.period) }),
  fill(sr, d, t) { sr.w.setData(toSeries(t, d.w)); },
  legend: (d, i) => `<span style="color:#7e57c2">${fx(d.w[i])}</span>`
};
EXTRA_DEFS.mom = {
  title: () => `MOM (${S.mom.period})`,
  build(ch) {
    const m = ch.addLineSeries(withLevels(lineOpt('#ffa726'), () => [0]));
    m.createPriceLine({ price: 0, color: '#6b7280', lineWidth: 1, lineStyle: 2, axisLabelVisible: false, title: '' });
    return { m };
  },
  compute: c => ({ m: calcMOM(c.map(x => x.close), S.mom.period) }),
  fill(sr, d, t) { sr.m.setData(toSeries(t, d.m)); },
  legend: (d, i) => `<span style="color:#ffa726">${fx(d.m[i])}</span>`
};
EXTRA_DEFS.mfi = {
  title: () => `MFI (${S.mfi.period})`,
  build(ch) {
    const f = ch.addLineSeries(withLevels(lineOpt('#00bcd4'), () => [80, 20]));
    [[80, '#ef5350'], [20, '#26a69a']].forEach(([price, color]) =>
      f.createPriceLine({ price, color, lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: '' }));
    return { f };
  },
  compute: c => ({ f: calcMFI(c, S.mfi.period) }),
  fill(sr, d, t) { sr.f.setData(toSeries(t, d.f)); },
  legend: (d, i) => `<span style="color:#00bcd4">${fx(d.f[i])}</span>`
};
EXTRA_DEFS.roc = {
  title: () => `ROC (${S.roc.period})`,
  build(ch) { const r = ch.addLineSeries(withLevels(lineOpt('#a855f7'), () => [0])); r.createPriceLine({ price: 0, color: '#6b7280', lineWidth: 1, lineStyle: 2, axisLabelVisible: false }); return { r }; },
  compute: c => ({ r: calcROC(c.map(x => x.close), S.roc.period) }),
  fill(sr, d, t) { sr.r.setData(toSeries(t, d.r)); },
  legend: (d, i) => `<span style="color:#a855f7">${fx(d.r[i])}%</span>`
};
EXTRA_DEFS.adx = {
  title: () => `ADX (${S.adx.period})`,
  build(ch) {
    const a = ch.addLineSeries(withLevels({ ...lineOpt('#f59e0b'), lineWidth: 2 }, () => [25]));
    a.createPriceLine({ price: 25, color: '#6b7280', lineWidth: 1, lineStyle: 2, axisLabelVisible: false });
    return { a, p: ch.addLineSeries(lineOpt('#26a69a')), m: ch.addLineSeries(lineOpt('#ef5350')) };
  },
  compute: c => { const r = calcADX(c, S.adx.period); return { a: r.adx, p: r.pdi, m: r.mdi }; },
  fill(sr, d, t) { sr.a.setData(toSeries(t, d.a)); sr.p.setData(toSeries(t, d.p)); sr.m.setData(toSeries(t, d.m)); },
  legend: (d, i) => `<span style="color:#f59e0b">ADX ${fx(d.a[i])}</span> <span style="color:#26a69a">+DI ${fx(d.p[i])}</span> <span style="color:#ef5350">−DI ${fx(d.m[i])}</span>`
};

// پهنای محور قیمت همه‌ی چارت‌ها یکسان میشه تا کندل‌ها و اندیکاتورها دقیقاً زیر هم بیفتن
let alignTimer = null;
function scheduleAlign() {   // پهنای محور قیمت همه‌ی چارت‌ها یکسان میشود تا کندل‌ها و اندیکاتورها و نوار ساعت دقیقاً زیر هم بیفتند
  clearTimeout(alignTimer);
  alignTimer = setTimeout(() => {
    const charts = Object.values(allPaneCharts());
    charts.forEach(ch => { try { ch.applyOptions({ rightPriceScale: { minimumWidth: 0 } }); } catch (e) {} });
    alignTimer = setTimeout(() => {
      let mx = 0;
      charts.forEach(ch => { try { mx = Math.max(mx, ch.priceScale('right').width()); } catch (e) {} });
      if (mx) {
        const all = axisChart ? charts.concat(axisChart) : charts;
        all.forEach(ch => { try { ch.applyOptions({ rightPriceScale: { minimumWidth: Math.ceil(mx) } }); } catch (e) {} });
      }
      sizeTimeAxis(); drawVersion++;
    }, 120);
  }, 60);
}

// ═══════════ بروزرسانی خودکار قیمت (پیش‌فرض هر ۱ دقیقه؛ در پنل قابل تنظیم) ═══════════
let refreshTimer = null, refreshBusy = false, lastUpdate = 0;
async function refreshLatest() {
  if (refreshBusy || inflightKey || dragging || !lastCandles.length || document.hidden) return;
  const symbol = lastSymbol, iv = currentIv;
  refreshBusy = true;
  try {
    const res = await fetch(`/api/klines?symbol=${symbol}&interval=${iv}&limit=5`);   // فقط چند کندل آخر
    const json = await res.json();
    if (!json.success || !Array.isArray(json.data) || symbol !== lastSymbol || iv !== currentIv || inflightKey) return;
    lastUpdate = Date.now();
    const oldLen = lastCandles.length, prev = lastCandles[oldLen - 1];
    const m = mergeCandles(lastCandles, json.data, S.limit + 120, S.limit), last = m.candles[m.candles.length - 1];
    if (m.candles.length === oldLen && !m.removed && last.close === prev.close && last.high === prev.high && last.low === prev.low && last.volume === prev.volume) { updateLiveInfo(); return; }
    const r = priceChart.timeScale().getVisibleLogicalRange(), appended = m.candles.length + m.removed - oldLen;
    lastCandles = m.candles;
    renderAll(false, true);
    if (r) {   // اگر کاربر روی آخرین کندل بود، با کندل جدید جلو میرود؛ وگرنه نمای او حفظ میشود
      const shift = r.to >= oldLen - 1 ? appended - m.removed : -m.removed;
      if (shift) priceChart.timeScale().setVisibleLogicalRange({ from: r.from + shift, to: r.to + shift });
    }
  } catch (e) { /* قطعی اینترنت/سرور: دور بعد دوباره تلاش میشود */ }
  finally { refreshBusy = false; }
}
function startAutoRefresh() {
  clearInterval(refreshTimer); refreshTimer = null;
  if (S.refresh > 0) refreshTimer = setInterval(refreshLatest, S.refresh * 1000);
  updateLiveInfo();
}
function updateLiveInfo() {   // قیمت لحظه‌ای + درصد کندل جاری + ساعت آخرین بروزرسانی
  const el = document.getElementById('liveInfo');
  if (!el || !lastCandles.length) return;
  const c = lastCandles[lastCandles.length - 1], chg = (c.close / c.open - 1) * 100, d = new Date(lastUpdate || Date.now()), p = n => String(n).padStart(2, '0');
  el.innerHTML = `<span class="live-dot${S.refresh ? ' on' : ''}"></span><b>${fmtPrice(c.close)}</b> <span class="${chg >= 0 ? 'up' : 'dn'}">${chg >= 0 ? '▲' : '▼'}${Math.abs(chg).toFixed(2)}%</span> <span class="lt">${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}</span>`;
  el.title = S.refresh ? `بروزرسانی خودکار هر ${S.refresh >= 60 ? S.refresh / 60 + ' دقیقه' : S.refresh + ' ثانیه'}` : 'بروزرسانی خودکار خاموش است';
}
document.addEventListener('visibilitychange', () => { if (!document.hidden && S.refresh > 0 && Date.now() - lastUpdate > S.refresh * 500) refreshLatest(); });
window.addEventListener('online', () => { if (S.refresh > 0) refreshLatest(); });

// ═══════════ جابجایی پنل‌های اندیکاتور (▲▼ روی عنوان هر پنل) ═══════════
const BUILTIN_PANES = ['rsi', 'macd', 'stoch', 'atr', 'obv', 'rsisma', 'roc', 'adx', 'cci', 'wpr', 'mom', 'mfi'];
function fullPaneOrder() {   // ترتیب کامل، شامل پنل‌های فعلاً مخفی
  const known = new Set(BUILTIN_PANES.concat(Object.keys(extraPanes))), out = [];
  S.paneOrder.forEach(k => { if (known.has(k) && !out.includes(k)) out.push(k); });
  ['rsi', 'macd'].concat(Object.keys(extraPanes)).forEach(k => { if (!out.includes(k)) out.push(k); });   // پنل تازه ته لیست می‌نشیند
  BUILTIN_PANES.forEach(k => { if (!out.includes(k)) out.push(k); });
  return out;
}
function visiblePaneOrder() {
  return fullPaneOrder().filter(k => k === 'rsi' ? S.rsi.on : k === 'macd' ? S.macd.on : !!extraPanes[k]);
}
function applyPaneOrder() {
  const col = document.getElementById('chartsCol'), pad = document.getElementById('chartsPad');
  if (!col || !pad) return;
  const want = visiblePaneOrder().map(k => document.getElementById('wrap-' + k)).filter(Boolean);
  const cur = Array.from(col.children).filter(w => w.classList.contains('chart-wrap') && w.id !== 'wrap-price' && w.style.display !== 'none');
  if (!(want.length === cur.length && want.every((w, i) => w === cur[i]))) {
    const top = col.scrollTop;
    want.forEach(w => col.insertBefore(w, pad));
    col.scrollTop = top;
  }
  want.forEach((w, i) => {
    const up = w.querySelector('.mv-up'), dn = w.querySelector('.mv-dn');
    if (up) up.disabled = i === 0; if (dn) dn.disabled = i === want.length - 1;
  });
}
function movePane(key, dir) {
  const vis = visiblePaneOrder(), i = vis.indexOf(key), j = i + dir;
  if (i < 0 || j < 0 || j >= vis.length) return;
  const full = fullPaneOrder(), a = full.indexOf(vis[i]), b = full.indexOf(vis[j]);
  [full[a], full[b]] = [full[b], full[a]];
  S.paneOrder = full; saveSettings();
  applyPaneOrder(); resizeChartsNow(); drawVersion++;
}

// ═══════════ کندل هیکن آشی (Heikin Ashi) ═══════════
function updateHaBtn() {
  const b = document.getElementById('haBtn'); if (!b) return;
  b.classList.toggle('active', S.chartType === 'ha');
  b.title = S.chartType === 'ha' ? 'برگشت به کندل معمولی' : 'کندل هیکن آشی (Heikin Ashi)';
}
function toggleHA() { updSetting('chartType', S.chartType === 'ha' ? 'candles' : 'ha'); }
