// js/scripts.js — اسکریپت‌های کاربر (اندیکاتور/استراتژی)، بک‌تست و ویرایشگر کد

// ═══════════ اسکریپت‌های کاربر (اندیکاتور/استراتژی با کد) ═══════════
const scriptInfo = {}, btResults = {};
let csOverlaySeries = [];
function makeTA(candles) {
  const g = (x, i) => Array.isArray(x) ? x[i] : x;
  const cmp = (a, b, f) => candles.map((_, i) => { const a1 = g(a, i), b1 = g(b, i), a0 = g(a, i - 1), b0 = g(b, i - 1); return i > 0 && a1 != null && b1 != null && a0 != null && b0 != null && f(a1, b1, a0, b0); });
  const rel = (a, b, f) => candles.map((_, i) => { const x = g(a, i), y = g(b, i); return x != null && y != null && f(x, y); });
  return {
    sma: calcSMA, ema: calcEMA,
    rsi: (src, p) => src.length > (p || 14) ? calcRSI(src, p || 14) : src.map(() => null),
    atr: p => calcATR(candles, p || 14),
    bb: (src, p, m) => calcBB(src, p || 20, m || 2),
    macd: (src, f, s, sg) => { const r = calcMACD(src, f || 12, s || 26, sg || 9); return { macd: r.ml, signal: r.sl, hist: r.hl }; },
    stoch: (k, d, sm) => calcStoch(candles, k || 14, d || 3, sm || 3),
    vwap: () => calcVWAP(candles, currentIv),
    obv: () => calcOBV(candles), roc: (src, p) => calcROC(src, p || 9),
    adx: p => { const r = calcADX(candles, p || 14); return { adx: r.adx, pdi: r.pdi, mdi: r.mdi }; },
    highest: (a, p) => rolling(a, p, Math.max), lowest: (a, p) => rolling(a, p, Math.min),
    change: (a, k) => a.map((v, i) => i >= (k || 1) && v != null && a[i - (k || 1)] != null ? v - a[i - (k || 1)] : null),
    crossover: (a, b) => cmp(a, b, (a1, b1, a0, b0) => a1 > b1 && a0 <= b0),
    crossunder: (a, b) => cmp(a, b, (a1, b1, a0, b0) => a1 < b1 && a0 >= b0),
    gt: (a, b) => rel(a, b, (x, y) => x > y), lt: (a, b) => rel(a, b, (x, y) => x < y),
    and: (...as) => candles.map((_, i) => as.every(a => !!g(a, i))),
    or: (...as) => candles.map((_, i) => as.some(a => !!g(a, i))),
    not: a => candles.map((_, i) => !g(a, i))
  };
}
const SCRIPT_BLOCKED = ['window', 'document', 'fetch', 'localStorage', 'sessionStorage', 'XMLHttpRequest', 'globalThis', 'self', 'Function', 'navigator', 'location', 'indexedDB', 'WebSocket', 'parent', 'top'];
const SCRIPT_NAMES = ['open', 'high', 'low', 'close', 'volume', 'time', 'ta', 'indicator', 'strategy', 'input', 'plot', 'hline', 'longEntry', 'longExit', 'shortEntry', 'shortExit', 'stopLoss', 'takeProfit'];
const HEX = /^#[0-9a-fA-F]{6}$/;

function runScript(sc, candles) {
  const res = { kind: 'indicator', overlay: false, title: sc.name, plots: [], hlines: [], inputs: [], sig: {}, sl: 0, tp: 0, fee: 0.1, error: null };
  const n = candles.length, col = k => candles.map(c => c[k]);
  const arr = (v, what) => { if (!Array.isArray(v) || v.length !== n) throw new Error(`${what}: باید آرایه‌ای هم‌طول کندل‌ها (${n}) باشد`); return v; };
  const api = {
    indicator: (title, o) => { res.kind = 'indicator'; if (title) res.title = String(title).slice(0, 60); res.overlay = !!(o && o.overlay); },
    strategy: (title, o) => { res.kind = 'strategy'; if (title) res.title = String(title).slice(0, 60); res.overlay = !!(o && o.overlay); if (o && isFinite(o.fee)) res.fee = Math.min(5, Math.max(0, +o.fee)); },
    input: (name, def) => {
      if (typeof name !== 'string' || !/^\w{1,30}$/.test(name)) throw new Error('نام input فقط حروف انگلیسی، عدد و _ (حداکثر ۳۰ کاراکتر)');
      if (!['number', 'boolean', 'string'].includes(typeof def)) throw new Error('مقدار پیش‌فرض input باید عدد، true/false یا متن باشد');
      if (!res.inputs.some(x => x.name === name)) res.inputs.push({ name, def });
      const v = sc.params && sc.params[name];
      if (v === undefined) return def;
      if (typeof def === 'number') { const x = parseFloat(v); return isFinite(x) ? x : def; }
      return typeof def === 'boolean' ? !!v : String(v);
    },
    plot: (vals, title, color, type) => {
      if (res.plots.length >= 8) throw new Error('حداکثر ۸ plot مجاز است');
      arr(vals, 'plot');
      res.plots.push({ name: String(title || 'plot' + (res.plots.length + 1)).slice(0, 30), color: HEX.test(color) ? color : OV_COLORS[res.plots.length % 6],
        type: type === 'histogram' ? 'histogram' : 'line', values: vals.map(v => typeof v === 'number' && isFinite(v) ? v : null) });
    },
    hline: (price, color) => { if (isFinite(price) && res.hlines.length < 6) res.hlines.push({ price: +price, color: HEX.test(color) ? color : '#6b7280' }); },
    longEntry: v => { res.sig.longEntry = arr(v, 'longEntry'); }, longExit: v => { res.sig.longExit = arr(v, 'longExit'); },
    shortEntry: v => { res.sig.shortEntry = arr(v, 'shortEntry'); }, shortExit: v => { res.sig.shortExit = arr(v, 'shortExit'); },
    stopLoss: p => { res.sl = Math.max(0, +p || 0); }, takeProfit: p => { res.tp = Math.max(0, +p || 0); }
  };
  try {
    const fn = new Function(...SCRIPT_NAMES, ...SCRIPT_BLOCKED, '"use strict";\n' + sc.code);
    fn(col('open'), col('high'), col('low'), col('close'), col('volume'), col('time'), makeTA(candles),
       ...SCRIPT_NAMES.slice(7).map(k => api[k]), ...SCRIPT_BLOCKED.map(() => undefined));
  } catch (e) { res.error = (e && e.message) || String(e); }
  return res;
}

function backtest(r, candles) {
  const n = candles.length, s = r.sig, fee = r.fee / 100;
  const sg = (k, i) => !!(s[k] && s[k][i]);
  let pos = 0, entryPx = 0, entryIdx = 0, eq = 1, pend = {};
  const trades = [], curve = new Array(n).fill(1), markers = [];
  const close = (i, px, reason, forced) => {
    const ret = pos * (px / entryPx - 1) - 2 * fee; eq *= 1 + ret;
    trades.push({ dir: pos, entryIdx, exitIdx: i, entry: entryPx, exit: px, ret: ret * 100, reason, open: !!forced });
    if (!forced) markers.push({ time: candles[i].time, position: pos > 0 ? 'aboveBar' : 'belowBar', color: '#ffc107', shape: 'circle', text: 'X' });
    pos = 0;
  };
  const enter = (i, dir) => {
    pos = dir; entryPx = candles[i].open; entryIdx = i;
    markers.push({ time: candles[i].time, position: dir > 0 ? 'belowBar' : 'aboveBar', color: dir > 0 ? '#26a69a' : '#ef5350', shape: dir > 0 ? 'arrowUp' : 'arrowDown', text: dir > 0 ? 'L' : 'S' });
  };
  for (let i = 0; i < n; i++) {
    const c = candles[i];
    if (i > 0) {   // سیگنال کندل قبل، در قیمت باز این کندل اجرا میشه
      if (pos > 0 && (pend.lx || pend.se)) close(i, c.open, 'signal');
      else if (pos < 0 && (pend.sx || pend.le)) close(i, c.open, 'signal');
      if (pos === 0) { if (pend.le) enter(i, 1); else if (pend.se) enter(i, -1); }
    }
    if (pos !== 0 && (r.sl || r.tp)) {
      const slPx = r.sl ? entryPx * (1 - pos * r.sl / 100) : null, tpPx = r.tp ? entryPx * (1 + pos * r.tp / 100) : null;
      if (pos > 0) { if (slPx != null && c.low <= slPx) close(i, Math.min(slPx, c.open), 'SL'); else if (tpPx != null && c.high >= tpPx) close(i, Math.max(tpPx, c.open), 'TP'); }
      else { if (slPx != null && c.high >= slPx) close(i, Math.max(slPx, c.open), 'SL'); else if (tpPx != null && c.low <= tpPx) close(i, Math.min(tpPx, c.open), 'TP'); }
    }
    curve[i] = pos !== 0 ? eq * (1 + pos * (c.close / entryPx - 1) - fee) : eq;
    pend = { le: sg('longEntry', i), lx: sg('longExit', i), se: sg('shortEntry', i), sx: sg('shortExit', i) };
  }
  if (pos !== 0) { close(n - 1, candles[n - 1].close, 'open', true); curve[n - 1] = eq; }
  let peak = 1, maxDD = 0; curve.forEach(v => { peak = Math.max(peak, v); maxDD = Math.max(maxDD, (peak - v) / peak); });
  const wins = trades.filter(t => t.ret > 0), sumW = wins.reduce((a, t) => a + t.ret, 0), sumL = trades.filter(t => t.ret <= 0).reduce((a, t) => a - t.ret, 0);
  const rets = trades.map(t => t.ret);
  return { trades, curve, markers, stats: {
    n: trades.length, winRate: trades.length ? wins.length / trades.length * 100 : 0, totalRet: (eq - 1) * 100,
    avg: trades.length ? rets.reduce((a, b) => a + b, 0) / trades.length : 0,
    best: rets.length ? Math.max(...rets) : 0, worst: rets.length ? Math.min(...rets) : 0,
    pf: sumL ? sumW / sumL : null, maxDD: maxDD * 100, buyHold: (candles[n - 1].close / candles[0].open - 1) * 100 } };
}

function fillCustomPane(key, r, times) {
  let p = extraPanes[key];
  if (!p) { p = makePane(key); p.series = []; extraPanes[key] = p; }
  p.series.forEach(s => { try { p.chart.removeSeries(s); } catch (e) {} });
  p.series = r.plots.map(pl => {
    const s = pl.type === 'histogram'
      ? p.chart.addHistogramSeries({ color: pl.color, priceLineVisible: false, lastValueVisible: false })
      : p.chart.addLineSeries(r.hlines.length ? withLevels({ color: pl.color, lineWidth: 1.5, priceLineVisible: false }, () => r.hlines.map(h => h.price)) : { color: pl.color, lineWidth: 1.5, priceLineVisible: false });
    s.setData(toSeries(times, pl.values)); return s;
  });
  r.hlines.forEach(h => { if (p.series[0]) p.series[0].createPriceLine({ price: h.price, color: h.color, lineWidth: 1, lineStyle: 2, axisLabelVisible: false }); });
  p.custom = r.plots;
  p.xh = p.series[0] ? { series: p.series[0], vals: r.plots[0].values } : null;
  document.getElementById(`lg-${key}-title`).textContent = r.title;
}
function renderCustom(candles, times) {
  csOverlaySeries.forEach(s => { try { priceChart.removeSeries(s); } catch (e) {} }); csOverlaySeries = [];
  Object.keys(btResults).forEach(k => delete btResults[k]);
  const want = new Set(), markers = [];
  S.customIndicators.filter(sc => sc.on).forEach(sc => {
    const r = runScript(sc, candles);
    scriptInfo[sc.id] = { kind: r.kind, inputs: r.inputs, error: r.error };
    if (r.error) return;
    if (r.kind === 'strategy') { const bt = backtest(r, candles); bt.title = r.title; btResults[sc.id] = bt; markers.push(...bt.markers); }
    if (!r.plots.length) return;
    if (r.overlay) {
      r.plots.forEach(pl => {
        const s = priceChart.addLineSeries({ color: pl.color, lineWidth: 1.5, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
        s.setData(toSeries(times, pl.values)); csOverlaySeries.push(s);
        overlayDefs.push({ label: pl.name + ' ', color: pl.color, vals: pl.values });
      });
    } else { const key = 'cs_' + sc.id; want.add(key); fillCustomPane(key, r, times); }
  });
  Object.keys(extraPanes).filter(k => k.startsWith('cs_') && !want.has(k)).forEach(removePane);
  candleSeries.setMarkers(markers.map(m => ({ ...m, time: dt(m.time) })).sort((a, b) => a.time - b.time));
}

function updScript(id, on) { const sc = S.customIndicators.find(s => s.id === id); if (sc) { sc.on = !!on; onIndChange(); } }
function updParam(id, name, val) {
  const sc = S.customIndicators.find(s => s.id === id), inp = ((scriptInfo[id] || {}).inputs || []).find(x => x.name === name);
  if (!sc || !inp) return;
  sc.params[name] = typeof inp.def === 'number' ? (isFinite(parseFloat(val)) ? parseFloat(val) : inp.def) : typeof inp.def === 'boolean' ? !!val : String(val).slice(0, 50);
  onIndChange();
}
function delScript(id) {
  const sc = S.customIndicators.find(s => s.id === id);
  if (!sc || !confirm(`اسکریپت «${sc.name}» حذف شود؟`)) return;
  S.customIndicators = S.customIndicators.filter(s => s.id !== id); delete scriptInfo[id]; onIndChange();
}
function inputField(sc, inp) {
  const v = sc.params[inp.name] !== undefined ? sc.params[inp.name] : inp.def, nm = escHtml(inp.name);
  if (typeof inp.def === 'boolean') return `<label><input type="checkbox" ${v ? 'checked' : ''} onchange="updParam('${sc.id}','${nm}',this.checked)">${nm}</label>`;
  if (typeof inp.def === 'number') return `<label>${nm}<input type="number" step="any" value="${+v}" onchange="updParam('${sc.id}','${nm}',this.value)"></label>`;
  return `<label>${nm}<input type="text" style="width:90px" value="${escHtml(String(v))}" onchange="updParam('${sc.id}','${nm}',this.value)"></label>`;
}

function fmtT(t) {
  const o = { day: '2-digit', month: '2-digit', year: '2-digit' };
  if (S.tz === 'utc') o.timeZone = 'UTC';
  if (currentIv !== '1d' && currentIv !== '1w') { o.hour = '2-digit'; o.minute = '2-digit'; o.hour12 = false; }
  return new Date(t * 1000).toLocaleString('en-GB', o);
}
function sparkline(eq) {
  const mn = Math.min(...eq), mx = Math.max(...eq), rg = mx - mn || 1;
  const pts = eq.map((v, i) => `${(i / (eq.length - 1) * 300).toFixed(1)},${(56 - (v - mn) / rg * 52).toFixed(1)}`).join(' ');
  return `<svg viewBox="0 0 300 60" style="width:100%;height:60px;direction:ltr"><polyline points="${pts}" fill="none" stroke="#2962ff" stroke-width="1.5"/></svg>`;
}
function btReport() {
  const ids = Object.keys(btResults).filter(id => S.customIndicators.some(s => s.id === id && s.on));
  if (!ids.length) return '';
  const pc = v => `<b class="${v >= 0 ? 'bt-up' : 'bt-dn'}">${v.toFixed(2)}%</b>`;
  return `<div class="ind-sec"><h4>نتیجه بک‌تست — ${escHtml(lastSymbol)} ${currentIv} (${lastCandles.length} کندل)</h4>` + ids.map(id => {
    const b = btResults[id], st = b.stats, sc = S.customIndicators.find(s => s.id === id);
    const rows = b.trades.slice(-30).reverse().map((t, i) => `<tr><td>${b.trades.length - i}</td><td>${t.dir > 0 ? 'Long' : 'Short'}</td><td>${fmtT(candles0(t.entryIdx))}</td><td>${fmtT(candles0(t.exitIdx))}</td><td>${t.reason}${t.open ? ' (باز)' : ''}</td><td class="${t.ret >= 0 ? 'bt-up' : 'bt-dn'}">${t.ret.toFixed(2)}%</td></tr>`).join('');
    return `<div class="bt-card"><b>${escHtml(b.title || sc.name)}</b>
      <div class="bt-grid">
        <div>بازده کل${pc(st.totalRet)}</div><div>خرید و نگهداری${pc(st.buyHold)}</div><div>تعداد معامله<b>${st.n}</b></div>
        <div>درصد برد<b>${st.winRate.toFixed(1)}%</b></div><div>میانگین معامله${pc(st.avg)}</div><div>Profit Factor<b>${st.pf == null ? '—' : st.pf.toFixed(2)}</b></div>
        <div>بیشترین افت<b class="bt-dn">-${st.maxDD.toFixed(2)}%</b></div><div>بهترین${pc(st.best)}</div><div>بدترین${pc(st.worst)}</div>
      </div>${sparkline(b.curve)}
      <div class="bt-tbl"><table><tr><th>#</th><th>جهت</th><th>ورود</th><th>خروج</th><th>علت</th><th>سود</th></tr>${rows}</table></div></div>`;
  }).join('') + `<p class="no-data">ورود در قیمت باز کندل بعد از سیگنال، کارمزد هر طرف طبق strategy(…,{fee}) ؛ نتیجه‌ی گذشته تضمین آینده نیست.</p></div>`;
}
function candles0(i) { return lastCandles[i] ? lastCandles[i].time : 0; }

// ─── ویرایشگر اسکریپت ───
const TEMPLATES = {
  ema_cross: { name: 'تقاطع EMA (روی قیمت)', code:
"indicator('EMA Cross', { overlay: true });\nconst fast = ta.ema(close, input('fast', 9));\nconst slow = ta.ema(close, input('slow', 21));\nplot(fast, 'Fast', '#f59e0b');\nplot(slow, 'Slow', '#3b82f6');" },
  rsi_sma: { name: 'RSI + SMA (پنل جدا)', code:
"indicator('RSI + SMA');\nconst r = ta.rsi(close, input('len', 14));\nplot(r, 'RSI', '#ffc107');\nplot(ta.sma(r, input('smaLen', 9)), 'SMA', '#3b82f6');\nhline(70, '#ef5350');\nhline(30, '#26a69a');" },
  strat_ema: { name: 'استراتژی تقاطع EMA', code:
"strategy('EMA Cross Strategy', { fee: 0.1, overlay: true });\nconst fast = ta.ema(close, input('fast', 9));\nconst slow = ta.ema(close, input('slow', 21));\nlongEntry(ta.crossover(fast, slow));\nlongExit(ta.crossunder(fast, slow));\nshortEntry(ta.crossunder(fast, slow));\nshortExit(ta.crossover(fast, slow));\nstopLoss(input('sl', 3));      // درصد؛ 0 = غیرفعال\ntakeProfit(input('tp', 6));\nplot(fast, 'Fast', '#f59e0b');\nplot(slow, 'Slow', '#3b82f6');" },
  strat_rsi: { name: 'استراتژی برگشت RSI (فقط لانگ)', code:
"strategy('RSI Reversal', { fee: 0.1 });\nconst r = ta.rsi(close, input('len', 14));\nconst lo = input('oversold', 30), hi = input('overbought', 70);\nlongEntry(ta.crossover(r, lo));\nlongExit(ta.crossover(r, hi));\nplot(r, 'RSI', '#ffc107');\nhline(lo, '#26a69a');\nhline(hi, '#ef5350');" }
};
let editingId = null;
function edErr(t) { document.getElementById('edErr').textContent = t; }
function openEditor(id, tpl) {
  editingId = id || null;
  const sc = id ? S.customIndicators.find(s => s.id === id) : null, t = TEMPLATES[tpl || 'ema_cross'];
  document.getElementById('edName').value = sc ? sc.name : t.name;
  document.getElementById('edCode').value = sc ? sc.code : t.code;
  document.getElementById('edForce').style.display = 'none'; edErr('');
  document.getElementById('edOverlay').classList.add('show');
}
function closeEditor() { document.getElementById('edOverlay').classList.remove('show'); }
function loadTemplate(k) {
  if (!k || !TEMPLATES[k]) return;
  if (editingId && !confirm('کد فعلی با نمونه جایگزین شود؟')) return;
  document.getElementById('edCode').value = TEMPLATES[k].code;
  if (!editingId) document.getElementById('edName').value = TEMPLATES[k].name;
}
function edKey(e) {
  if (e.key !== 'Tab') return;
  e.preventDefault();
  const t = e.target, s = t.selectionStart;
  t.value = t.value.slice(0, s) + '  ' + t.value.slice(t.selectionEnd); t.selectionStart = t.selectionEnd = s + 2;
}
function saveEditor(force) {
  const name = document.getElementById('edName').value.trim().slice(0, 60) || 'اسکریپت بدون نام';
  const code = document.getElementById('edCode').value.slice(0, 20000);
  if (!code.trim()) return edErr('کد خالی است');
  const existing = editingId && S.customIndicators.find(s => s.id === editingId);
  if (!existing && S.customIndicators.length >= 30) return edErr('حداکثر ۳۰ اسکریپت');
  const tmp = { id: existing ? existing.id : newScriptId(), name, code, on: true, params: existing ? existing.params : {} };
  if (!force && lastCandles.length) {
    const r = runScript(tmp, lastCandles);
    if (r.error) { edErr('خطا: ' + r.error + '\nاگر می‌خواهید با همین کد ذخیره شود «ذخیره با وجود خطا» را بزنید.'); document.getElementById('edForce').style.display = ''; return; }
  }
  if (existing) { existing.name = name; existing.code = code; existing.on = true; } else S.customIndicators.push(tmp);
  closeEditor(); onIndChange();
}
