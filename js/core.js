// js/core.js — تنظیمات، ذخیره‌سازی (localStorage)، لیست ارزها، تایم‌فریم، پشتیبان‌گیری/بازیابی
// ترتیب بارگذاری در index.html مهم است: core → indicators → chart → drawings → scripts → panel → main

// ─── Globals ────────────────────────────────────────────────────────────────
let currentIv = '4h';

// ─── لیست ارزها (۱۰ ارز برتر + ذخیره‌شده‌های کاربر با localStorage) ──────────
const TOP_COINS = ['BTCUSDT','ETHUSDT','BNBUSDT','SOLUSDT','XRPUSDT','CRVUSDT','ADAUSDT','XLMUSDT','DOGEUSDT','NEARUSDT','TONUSDT','SUIUSDT','PEPEUSDT',];

function getSavedSymbols() {
  try { return JSON.parse(localStorage.getItem('savedSymbols') || '[]'); }
  catch(e) { return []; }
}

function setSavedSymbols(arr) {
  try { localStorage.setItem('savedSymbols', JSON.stringify(arr)); } catch(e) {}
}

function populateSymbolDropdown() {
  const topGroup   = document.getElementById('topCoinsGroup');
  const savedGroup = document.getElementById('savedCoinsGroup');

  topGroup.innerHTML = TOP_COINS.map(s => `<option value="${s}">${s}</option>`).join('');

  const saved = getSavedSymbols();
  savedGroup.innerHTML = saved.length
    ? saved.map(s => `<option value="${s}">${s} ⭐</option>`).join('')
    : '';
  savedGroup.style.display = saved.length ? '' : 'none';
}

function onSymbolSelect(sel) {
  if (!sel.value) return;
  document.getElementById('symbolInput').value = sel.value;
  sel.value = ''; // برگردون به حالت پیش‌فرض تا دوباره قابل انتخاب باشه
  loadData();
}

function saveCurrentSymbol() {
  const symbol = document.getElementById('symbolInput').value.trim().toUpperCase();
  if (!symbol) return;
  const saved = getSavedSymbols();
  if (!saved.includes(symbol)) {
    saved.push(symbol);
    setSavedSymbols(saved);
    populateSymbolDropdown();
  }
  document.getElementById('status').textContent = `✅ ${symbol} ذخیره شد`;
}

// ═══════════ تنظیمات، اندیکاتورها و پشتیبان‌گیری ═══════════
const LS_KEY = 'ta_settings_v1';
const OV_TYPES = { sma: 'SMA', ema: 'EMA', bb: 'Bollinger', vwap: 'VWAP' };
const OV_COLORS = ['#f59e0b', '#3b82f6', '#a855f7', '#14b8a6', '#ec4899', '#84cc16'];
const SYMBOL_RE = /^[A-Za-z0-9]{2,20}$/;
let ovSeq = 0;

function defaultSettings() {
  return {
    v: 2, symbol: 'BTCUSDT', iv: '4h', limit: 500, paneH: {}, lockAll: false, magnet: true, drawColor: '#f59e0b',
    fibLevels: [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1, 1.272, 1.618],
    overlays: [], volume: { on: false },
    rsi:   { on: true, period: 14, ob: 70, os: 30 },
    macd:  { on: true, fast: 12, slow: 26, sig: 9 },
    stoch: { on: false, k: 14, d: 3, smooth: 3 },
    atr:   { on: false, period: 14 },
    obv:   { on: false, sma: 20 },
    roc:   { on: false, period: 9 },
    adx:   { on: false, period: 14 },
    customIndicators: []
  };
}
let S = defaultSettings();

function toNum(v, def, min, max) { v = parseFloat(v); return isFinite(v) ? Math.min(max, Math.max(min, v)) : def; }
function toInt(v, def, min, max) { return Math.round(toNum(v, def, min, max)); }
function toBool(v, def) { return typeof v === 'boolean' ? v : def; }

// هر ورودی بیرونی (localStorage یا فایل پشتیبان) قبل از استفاده اینجا پاک‌سازی میشه
function sanitizeSettings(raw, imported) {
  const o = defaultSettings();
  if (!raw || typeof raw !== 'object') return o;
  if (typeof raw.symbol === 'string' && SYMBOL_RE.test(raw.symbol)) o.symbol = raw.symbol.toUpperCase();
  if (['1h', '4h', '1d', '1w'].includes(raw.iv)) o.iv = raw.iv;
  o.limit = [300, 500, 1000].includes(+raw.limit) ? +raw.limit : 500;
  o.magnet = toBool(raw.magnet, true);
  o.paneH = {};
  if (raw.paneH && typeof raw.paneH === 'object') Object.keys(raw.paneH).slice(0, 40).forEach(k => {
    if (/^\w{1,40}$/.test(k) && k !== '__proto__') { const v = toInt(raw.paneH[k], 0, 0, 2000); if (v >= 80) o.paneH[k] = v; }
  });
  if (!o.paneH.price && raw.priceH >= 200) o.paneH.price = toInt(raw.priceH, 0, 0, 2000);
  o.lockAll = toBool(raw.lockAll, false);
  if (/^#[0-9a-fA-F]{6}$/.test(raw.drawColor)) o.drawColor = raw.drawColor;
  if (Array.isArray(raw.fibLevels)) {
    const f = raw.fibLevels.map(parseFloat).filter(x => isFinite(x) && x >= -10 && x <= 20).slice(0, 15);
    if (f.length) o.fibLevels = f;
  }
  if (Array.isArray(raw.overlays)) {
    o.overlays = raw.overlays.slice(0, 12).filter(x => x && OV_TYPES[x.type]).map((x, i) => ({
      id: 'ov' + (++ovSeq), type: x.type, on: toBool(x.on, true),
      period: toInt(x.period, 20, 1, 500), mult: toNum(x.mult, 2, 0.1, 10),
      color: /^#[0-9a-fA-F]{6}$/.test(x.color) ? x.color : OV_COLORS[i % OV_COLORS.length]
    }));
  }
  o.volume.on = toBool(raw.volume && raw.volume.on, false);
  const r = raw.rsi || {};
  o.rsi = { on: toBool(r.on, true), period: toInt(r.period, 14, 2, 200), ob: toNum(r.ob, 70, 50, 100), os: toNum(r.os, 30, 0, 50) };
  if (o.rsi.os >= o.rsi.ob) { o.rsi.ob = 70; o.rsi.os = 30; }
  const m = raw.macd || {};
  o.macd = { on: toBool(m.on, true), fast: toInt(m.fast, 12, 2, 200), slow: toInt(m.slow, 26, 3, 400), sig: toInt(m.sig, 9, 1, 200) };
  if (o.macd.fast >= o.macd.slow) { o.macd.fast = 12; o.macd.slow = 26; }
  const s = raw.stoch || {};
  o.stoch = { on: toBool(s.on, false), k: toInt(s.k, 14, 2, 200), d: toInt(s.d, 3, 1, 50), smooth: toInt(s.smooth, 3, 1, 50) };
  const a = raw.atr || {};
  o.atr = { on: toBool(a.on, false), period: toInt(a.period, 14, 2, 200) };
  const ob = raw.obv || {}, ro = raw.roc || {}, ad = raw.adx || {};
  o.obv = { on: toBool(ob.on, false), sma: toInt(ob.sma, 20, 1, 500) };
  o.roc = { on: toBool(ro.on, false), period: toInt(ro.period, 9, 1, 500) };
  o.adx = { on: toBool(ad.on, false), period: toInt(ad.period, 14, 2, 100) };
  o.customIndicators = sanitizeScripts(raw.customIndicators, imported);
  return o;
}
function saveSettings() {
  const sym = document.getElementById('symbolInput').value.trim().toUpperCase();
  if (SYMBOL_RE.test(sym)) S.symbol = sym;
  S.iv = currentIv;
  try { localStorage.setItem(LS_KEY, JSON.stringify(S)); } catch (e) {}
}
function applySettingsToUI() {
  document.getElementById('symbolInput').value = S.symbol;
  setIv(S.iv);
  const dc = document.getElementById('drawColor'); if (dc) dc.value = S.drawColor;
  updateMagnetBtn();
}
function loadSettings() {
  try { const raw = JSON.parse(localStorage.getItem(LS_KEY)); if (raw) S = sanitizeSettings(raw); } catch (e) {}
  applySettingsToUI();
}
function msg(t) {
  document.getElementById('status').textContent = t;
  const el = document.getElementById('indMsg'); if (el) el.textContent = t;
}

// ─── پشتیبان‌گیری / بازیابی ─────────────────────────────────────────────────
function buildBackup() {
  saveSettings();
  return { app: 'ta-dashboard', version: 2, exportedAt: new Date().toISOString(),
           settings: S, savedSymbols: getSavedSymbols(), drawings: pruneDrawings() };
}
function downloadBackup() {
  const blob = new Blob([JSON.stringify(buildBackup(), null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'ta-backup-' + new Date().toISOString().slice(0, 10) + '.json';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  msg('✅ فایل پشتیبان دانلود شد');
}
function copyBackup() {
  const json = JSON.stringify(buildBackup());
  const fallback = () => { const t = document.getElementById('restoreText'); t.value = json; t.select(); msg('متن در کادر پایین قرار گرفت؛ کپی کنید'); };
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(json).then(() => msg('✅ کپی شد'), fallback);
  else fallback();
}
function restoreFromText(text) {
  let data;
  try { data = JSON.parse(text); } catch (e) { return msg('❌ متن/فایل JSON معتبر نیست'); }
  if (!data || data.app !== 'ta-dashboard' || !data.settings) return msg('❌ این فایل، پشتیبان این برنامه نیست');
  if (!confirm('تنظیمات فعلی با پشتیبان جایگزین شود؟')) return;
  S = sanitizeSettings(data.settings, true);
  const nScripts = S.customIndicators.length;
  if (Array.isArray(data.savedSymbols)) {
    const clean = [...new Set(data.savedSymbols.filter(s => typeof s === 'string' && SYMBOL_RE.test(s)).map(s => s.toUpperCase()))].slice(0, 100);
    setSavedSymbols(clean); populateSymbolDropdown();
  }
  if (data.drawings) { allDrawings = sanitizeDrawings(data.drawings); saveDrawings(); }
  applySettingsToUI(); saveSettings(); applyIndicatorVisibility(); drawVersion++;
  loadData();
  renderPanel();
  msg('✅ بازیابی انجام شد' + (nScripts ? ` — ${nScripts} اسکریپت غیرفعال وارد شد؛ کدها را مرور و سپس فعال کنید` : ''));
}
function restoreFromFile(inp) {
  const f = inp.files[0]; if (!f) return;
  if (f.size > 2e6) { inp.value = ''; return msg('❌ فایل خیلی بزرگ است'); }
  const r = new FileReader();
  r.onload = () => restoreFromText(String(r.result));
  r.readAsText(f); inp.value = '';
}
function resetSettings() {
  if (!confirm('تنظیمات اندیکاتورهای آماده به پیش‌فرض برگردد؟ (اسکریپت‌ها، رسم‌ها و ارزهای ذخیره‌شده حفظ می‌شوند)')) return;
  const keep = { symbol: S.symbol, iv: S.iv, limit: S.limit, magnet: S.magnet, drawColor: S.drawColor, fibLevels: S.fibLevels, paneH: S.paneH, lockAll: S.lockAll, customIndicators: S.customIndicators };
  S = sanitizeSettings(Object.assign(defaultSettings(), keep));
  saveSettings(); applyIndicatorVisibility();
  if (lastCandles.length) renderAll(false);
  renderPanel();
  msg('↺ بازنشانی شد');
}

// ─── Interval ───────────────────────────────────────────────────────────────
function setIv(iv) {
  currentIv = iv;
  ['1h','4h','1d','1w'].forEach(i =>
    document.getElementById('btn-' + i).classList.toggle('active', i === iv)
  );
  saveSettings();
}

// ─── چیدمان موبایل — مستقل از CSS media query، مستقیم با JS اعمال میشه ──────
// (بعضی مرورگرها/وب‌ویوها عرض واقعی صفحه رو درست به CSS گزارش نمی‌دن)
function applyResponsiveLayout() {
  // چیدمان فقط با CSS کنترل میشه
}

// ═══════════ کمکی‌ها ═══════════
function escHtml(s) { return String(s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch])); }
function newScriptId() { return 'cs' + Math.random().toString(36).slice(2, 9); }
function sanitizeScripts(arr, imported) {
  if (!Array.isArray(arr)) return [];
  const seen = new Set();
  return arr.slice(0, 30).filter(x => x && typeof x.code === 'string').map(x => {
    let id = typeof x.id === 'string' && /^cs[a-z0-9]{3,14}$/.test(x.id) && !seen.has(x.id) ? x.id : newScriptId();
    seen.add(id);
    const params = {};
    if (x.params && typeof x.params === 'object') Object.keys(x.params).slice(0, 30).forEach(k => {
      const v = x.params[k];
      if (/^\w{1,30}$/.test(k) && k !== '__proto__' && ((typeof v === 'number' && isFinite(v)) || typeof v === 'boolean' || (typeof v === 'string' && v.length <= 50))) params[k] = v;
    });
    return { id, name: String(x.name || 'اسکریپت').slice(0, 60), code: x.code.slice(0, 20000), on: imported ? false : toBool(x.on, true), params };
  });
}
function updSetting(k, v) {
  if (k === 'fibLevels') v = String(v).split(/[\s,،]+/).map(parseFloat).filter(isFinite);
  S[k] = v; S = sanitizeSettings(S); saveSettings(); updateMagnetBtn(); drawVersion++; renderPanel();
  if (k === 'limit') loadData();
}

function chooseIv(iv) { setIv(iv); loadData(); }
