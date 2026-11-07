// js/indicators.js — محاسبات خالص اندیکاتورها (بدون DOM) — قابل تست در Node

// ─── محاسبات اندیکاتورها ────────────────────────────────────────────────────
function toSeries(times, vals) { return times.map((t, i) => vals[i] != null ? { time: t, value: vals[i] } : { time: t }); }
function calcSMA(a, p) {
  const out = new Array(a.length).fill(null);
  for (let i = p - 1; i < a.length; i++) {
    let s = 0, ok = true;
    for (let j = i - p + 1; j <= i; j++) { if (a[j] == null) { ok = false; break; } s += a[j]; }
    if (ok) out[i] = s / p;
  }
  return out;
}
function calcEMA(a, p) {
  const k = 2 / (p + 1), out = new Array(a.length).fill(null), sma = calcSMA(a, p);
  let prev = null;
  for (let i = p - 1; i < a.length; i++) {
    if (prev == null) { prev = sma[i]; if (prev == null) continue; }
    else prev = a[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}
function calcBB(closes, p, mult) {
  const mid = calcSMA(closes, p), up = [], lo = [];
  mid.forEach((m, i) => {
    if (m == null) { up.push(null); lo.push(null); return; }
    let v = 0; for (let j = i - p + 1; j <= i; j++) v += (closes[j] - m) ** 2;
    const sd = Math.sqrt(v / p);
    up.push(m + mult * sd); lo.push(m - mult * sd);
  });
  return { mid, up, lo };
}
function calcVWAP(c, iv) {   // ریست روزانه (برای 1D ماهانه)
  let pv = 0, vv = 0, key = null;
  return c.map(x => {
    const d = new Date(x.time * 1000);
    const k = d.getUTCFullYear() + '-' + d.getUTCMonth() + (iv === '1d' || iv === '1w' ? '' : '-' + d.getUTCDate());
    if (k !== key) { key = k; pv = 0; vv = 0; }
    pv += (x.high + x.low + x.close) / 3 * x.volume; vv += x.volume;
    return vv ? pv / vv : null;
  });
}
function calcStoch(c, kp, dp, sm) {
  const raw = c.map((_, i) => {
    if (i < kp - 1) return null;
    let hh = -Infinity, ll = Infinity;
    for (let j = i - kp + 1; j <= i; j++) { hh = Math.max(hh, c[j].high); ll = Math.min(ll, c[j].low); }
    return hh === ll ? 50 : (c[i].close - ll) / (hh - ll) * 100;
  });
  const k = sm > 1 ? calcSMA(raw, sm) : raw;
  return { k, d: calcSMA(k, dp) };
}
function calcATR(c, p) {
  const out = new Array(c.length).fill(null);
  if (c.length < p) return out;
  const tr = c.map((x, i) => i === 0 ? x.high - x.low :
    Math.max(x.high - x.low, Math.abs(x.high - c[i - 1].close), Math.abs(x.low - c[i - 1].close)));
  let a = 0; for (let i = 0; i < p; i++) a += tr[i];
  a /= p; out[p - 1] = a;
  for (let i = p; i < c.length; i++) { a = (a * (p - 1) + tr[i]) / p; out[i] = a; }
  return out;
}

// ─── پنل‌های اضافه (Stochastic / ATR) — با روشن/خاموش کردن ساخته یا حذف میشن ──
const fx = v => v != null ? (Math.abs(v) < 1 ? v.toPrecision(4) : v.toFixed(2)) : '—';

// ─── Indicators ──────────────────────────────────────────────────────────────
function calcRSI(closes, period = 14) {
  const rsi = new Array(closes.length).fill(null);
  let g = 0, l = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i-1];
    d >= 0 ? g += d : l -= d;
  }
  let ag = g / period, al = l / period;
  rsi[period] = al === 0 ? 100 : 100 - 100 / (1 + ag / al);
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i-1];
    ag = (ag * (period-1) + Math.max(d, 0)) / period;
    al = (al * (period-1) + Math.max(-d, 0)) / period;
    rsi[i] = al === 0 ? 100 : 100 - 100 / (1 + ag / al);
  }
  return rsi;
}

function ema(arr, p) {
  const k = 2 / (p + 1), out = new Array(arr.length).fill(null);
  let s = 0; while (s < arr.length && arr[s] == null) s++;
  out[s] = arr[s];
  for (let i = s+1; i < arr.length; i++)
    out[i] = arr[i] != null ? arr[i] * k + out[i-1] * (1-k) : null;
  return out;
}

function calcMACD(closes, fast=12, slow=26, sig=9) {
  const ef = ema(closes, fast), es = ema(closes, slow);
  const ml = closes.map((_,i) => ef[i]!=null && es[i]!=null ? ef[i]-es[i] : null);
  const sl = ema(ml, sig);
  const hl = ml.map((v,i) => v!=null && sl[i]!=null ? v-sl[i] : null);
  return { ml, sl, hl };
}

function rolling(a, p, f) {
  return a.map((_, i) => {
    if (i < p - 1) return null;
    let r = a[i]; for (let j = i - p + 1; j <= i; j++) { if (a[j] == null) return null; r = f(r, a[j]); }
    return r;
  });
}

// ═══════════ اندیکاتورهای OBV+SMA / ROC / ADX و هم‌ترازی پنل‌ها ═══════════
function calcOBV(c) {
  let o = 0;
  return c.map((x, i) => { if (i > 0) o += x.close > c[i - 1].close ? x.volume : x.close < c[i - 1].close ? -x.volume : 0; return o; });
}
function calcROC(src, p) { return src.map((v, i) => i >= p && v != null && src[i - p] ? (v - src[i - p]) / src[i - p] * 100 : null); }
function calcADX(c, p) {   // ADX و ‎+DI/−DI به روش Wilder
  const n = c.length, nul = () => new Array(n).fill(null), out = { adx: nul(), pdi: nul(), mdi: nul() };
  if (n <= 2 * p) return out;
  const tr = [0], pdm = [0], mdm = [0];
  for (let i = 1; i < n; i++) {
    const up = c[i].high - c[i - 1].high, dn = c[i - 1].low - c[i].low;
    pdm.push(up > dn && up > 0 ? up : 0); mdm.push(dn > up && dn > 0 ? dn : 0);
    tr.push(Math.max(c[i].high - c[i].low, Math.abs(c[i].high - c[i - 1].close), Math.abs(c[i].low - c[i - 1].close)));
  }
  let st = 0, sp = 0, sm = 0; const dx = nul();
  for (let i = 1; i <= p; i++) { st += tr[i]; sp += pdm[i]; sm += mdm[i]; }
  for (let i = p; i < n; i++) {
    if (i > p) { st = st - st / p + tr[i]; sp = sp - sp / p + pdm[i]; sm = sm - sm / p + mdm[i]; }
    const pd = st ? 100 * sp / st : 0, md = st ? 100 * sm / st : 0;
    out.pdi[i] = pd; out.mdi[i] = md; dx[i] = pd + md ? 100 * Math.abs(pd - md) / (pd + md) : 0;
  }
  let a = 0; for (let i = p; i < 2 * p; i++) a += dx[i];
  a /= p; out.adx[2 * p - 1] = a;
  for (let i = 2 * p; i < n; i++) { a = (a * (p - 1) + dx[i]) / p; out.adx[i] = a; }
  return out;
}
const fxc = v => v != null ? v.toLocaleString('en-US', { notation: 'compact', maximumFractionDigits: 2 }) : '—';

// ─── OBV: همتراز کردن با TradingView ────────────────────────────────────────
// OBV تجمعی است و مقدار مطلقش به «کندل شروع» بستگی دارد (TradingView از ابتدای تاریخچه‌ی بارگذاری‌شده‌ی خودش
// شروع می‌کند، ما از اولین کندل دریافتی). شکل نمودار یکی است و فقط یک عدد ثابت فرق دارد؛ با یک «لنگر» جبران میشود.
function calibrateOBV(raw, times, anchor) {   // anchor: {t, v} یا null
  if (!anchor) return { values: raw, anchor: null, matched: false };
  const j = times.indexOf(anchor.t);
  if (j < 0) return { values: raw, anchor, matched: false };   // لنگر از پنجره‌ی داده بیرون رفته
  const off = anchor.v - raw[j], values = raw.map(x => x + off), k = times.length - 2;
  // لنگر به کندل بسته‌ی قبل از آخر منتقل میشود تا با جلو رفتن پنجره‌ی داده معتبر بماند
  return { values, anchor: k >= 0 ? { t: times[k], v: values[k] } : anchor, matched: true };
}
function makeObvAnchor(raw, times, target) {   // target = مقدار OBV آخرین کندل در TradingView
  const n = raw.length; if (n < 3) return null;
  return { t: times[n - 2], v: raw[n - 2] + (target - raw[n - 1]) };
}
function parseCompact(text) {   // 40.5K، 1.2M، 1,250,000، −3.1K
  const m = String(text).trim().replace(/[,\s]/g, '').replace(/\u2212/g, '-').match(/^(-?\d*\.?\d+)([kmb]?)$/i);
  return m ? parseFloat(m[1]) * { '': 1, k: 1e3, m: 1e6, b: 1e9 }[m[2].toLowerCase()] : null;
}

// ─── ادغام کندل‌های تازه در داده‌ی فعلی (بروزرسانی خودکار) ───────────────────
// کندل هم‌زمان جایگزین میشود، کندل جدید اضافه؛ اگر طول از maxLen بگذرد، قدیمی‌ترها حذف میشوند تا keepLen بماند.
function mergeCandles(old, fresh, maxLen, keepLen) {
  const map = new Map();
  old.forEach(c => map.set(c.time, c)); fresh.forEach(c => map.set(c.time, c));
  let arr = [...map.values()].sort((a, b) => a.time - b.time), removed = 0;
  if (arr.length > maxLen) { removed = arr.length - keepLen; arr = arr.slice(removed); }
  return { candles: arr, removed };
}

// ─── CCI و Williams %R ─────────────────────────────────────────────────────
function calcCCI(c, p) {
  const tp = c.map(x => (x.high + x.low + x.close) / 3), sma = calcSMA(tp, p), out = new Array(c.length).fill(null);
  for (let i = p - 1; i < c.length; i++) {
    let dev = 0; for (let j = i - p + 1; j <= i; j++) dev += Math.abs(tp[j] - sma[i]);
    dev /= p;
    out[i] = dev ? (tp[i] - sma[i]) / (0.015 * dev) : 0;
  }
  return out;
}
function calcWPR(c, p) {   // بین ‎−۱۰۰ و ۰ ؛ بالای ‎−۲۰ اشباع خرید، زیر ‎−۸۰ اشباع فروش
  return c.map((x, i) => {
    if (i < p - 1) return null;
    let hh = -Infinity, ll = Infinity;
    for (let j = i - p + 1; j <= i; j++) { hh = Math.max(hh, c[j].high); ll = Math.min(ll, c[j].low); }
    return hh === ll ? -50 : -100 * (hh - x.close) / (hh - ll);
  });
}
