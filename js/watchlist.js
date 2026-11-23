// js/watchlist.js — سایدبار لیست ارزها و قیمت‌ها (مثل TradingView): دسکتاپ کنار چارت، موبایل کشویی
// در سطح بالا هیچ دسترسی به DOM ندارد تا در Node قابل تست باشد؛ راه‌اندازی از main.js با initWatchlist انجام میشود.

let wlRows = [], wlQuery = '', wlBusy = false, wlTimer = null;

// لیست ارزهای سایدبار: ارزهای برتر + ذخیره‌شده‌های کاربر، منهای حذف‌شده‌ها (hidden)
function wlSymbols(hidden) {
  const h = new Set(hidden || (S.watchlist && S.watchlist.hidden) || []);
  return [...new Set(TOP_COINS.concat(getSavedSymbols()))].filter(s => !h.has(s));
}
// حذف ارز از لیست با ❌: از لیست و از ذخیره‌شده‌ها برداشته میشود؛ برگرداندن با ⭐ یا بازنشانی
function removeWlSymbol(sym) {
  if (!SYMBOL_RE.test(sym)) return;
  if (!S.watchlist.hidden.includes(sym)) S.watchlist.hidden = S.watchlist.hidden.concat(sym);
  const saved = getSavedSymbols();
  if (saved.includes(sym)) { setSavedSymbols(saved.filter(s => s !== sym)); populateSymbolDropdown(); refreshStar(); }
  wlRows = wlRows.filter(r => r.symbol !== sym);
  saveSettings(); renderWatchlist();
}
function resetWlHidden() {
  S.watchlist.hidden = [];
  saveSettings(); fetchWatchlist();
}
// مرتب‌سازی خالص (قابل تست): default = ترتیب ورودی، change = بیشترین رشد ۲۴ ساعته، volume = بیشترین حجم
function wlSortRows(rows, sort) {
  const a = rows.slice();
  if (sort === 'change') a.sort((x, y) => (y.change24h || 0) - (x.change24h || 0));
  else if (sort === 'volume') a.sort((x, y) => (y.volume || 0) - (x.volume || 0));
  return a;
}
function wlFilterRows(rows, q) {
  const s = String(q || '').trim().toUpperCase();
  return s ? rows.filter(r => r.symbol.includes(s)) : rows.slice();
}
function wlFmtPrice(p) {
  return p == null || !isFinite(p) ? '—' : p.toLocaleString('en-US', { maximumFractionDigits: calcPricePrecision(p) });
}

async function fetchWatchlist() {
  if (wlBusy || !S.watchlist.open || document.hidden) return;
  wlBusy = true;
  try {
    const res = await fetch(`/api/tickers?symbols=${encodeURIComponent(wlSymbols().join(','))}`);
    const json = await res.json();
    if (!json.success || !Array.isArray(json.data)) throw new Error(json.error || 'خطا در دریافت قیمت‌ها');
    wlRows = json.data;
    renderWatchlist();
    const st = document.getElementById('wlStatus');
    if (st) { const d = new Date(), p = n => String(n).padStart(2, '0'); st.textContent = `بروزرسانی ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`; }
  } catch (e) {
    const st = document.getElementById('wlStatus');
    if (st) st.textContent = '❌ ' + e.message;
  } finally { wlBusy = false; }
}
function startWlAutoRefresh() {
  clearInterval(wlTimer); wlTimer = null;
  if (S.refresh > 0) wlTimer = setInterval(fetchWatchlist, S.refresh * 1000);
}

function renderWatchlist() {
  const el = document.getElementById('wlList');
  if (!el) return;
  const saved = new Set(getSavedSymbols());
  const rows = wlSortRows(wlFilterRows(wlRows, wlQuery), S.watchlist.sort);
  if (!rows.length) {
    el.innerHTML = `<p class="no-data">${wlRows.length ? 'ارزی با این جستجو پیدا نشد' : 'در حال دریافت قیمت‌ها…'}</p>`;
    return;
  }
  el.innerHTML = rows.map(r => {
    const up = (r.change24h || 0) >= 0;
    return `<div class="wl-row${r.symbol === lastSymbol ? ' cur' : ''}" onclick="selectWatchlistSymbol('${escHtml(r.symbol)}')">
      <button class="wl-del" onclick="event.stopPropagation();removeWlSymbol('${escHtml(r.symbol)}')" title="حذف از لیست" aria-label="حذف ${escHtml(r.symbol)}">✕</button>
      <span class="wl-sym">${escHtml(r.symbol)}${saved.has(r.symbol) ? ' ⭐' : ''}<small>حجم ${fxc(r.volume)}</small></span>
      <span class="wl-nums"><b dir="ltr">${wlFmtPrice(r.price)}</b><small class="${up ? 'up' : 'dn'}" dir="ltr">${up ? '▲' : '▼'}${Math.abs(r.change24h || 0).toFixed(2)}%</small></span>
    </div>`;
  }).join('');
}

function applyWatchlistLayout() {
  const aside = document.getElementById('wlAside');
  if (!aside) return;
  const open = !!S.watchlist.open, mobile = window.innerWidth <= 768;
  aside.classList.toggle('show', open);
  const back = document.getElementById('wlBackdrop');
  if (back) back.classList.toggle('show', open && mobile);   // دسکتاپ: کنار چارت (بدون بک‌دراپ)؛ موبایل: کشویی
  const btn = document.getElementById('wlBtn');
  if (btn) btn.classList.toggle('active', open);
  if (typeof resizeChartsNow === 'function') requestAnimationFrame(() => resizeChartsNow());
}
function toggleWatchlist(force) {
  S.watchlist.open = force !== undefined ? !!force : !S.watchlist.open;
  saveSettings(); applyWatchlistLayout();
  if (S.watchlist.open) fetchWatchlist();
}
function selectWatchlistSymbol(sym) {
  if (!SYMBOL_RE.test(sym)) return;
  document.getElementById('symbolInput').value = sym;
  refreshStar(); loadData(); renderWatchlist();
  if (window.innerWidth <= 768) toggleWatchlist(false);   // موبایل (کشویی): بعد از انتخاب بسته شود؛ دسکتاپ کنار چارت میماند
}
function onWlSearch(v) { wlQuery = v; renderWatchlist(); }
function onWlSort(v) { S.watchlist.sort = v; S = sanitizeSettings(S); saveSettings(); renderWatchlist(); }

function initWatchlist() {
  const sel = document.getElementById('wlSort');
  if (sel) sel.value = S.watchlist.sort;
  applyWatchlistLayout();
  renderWatchlist();
  startWlAutoRefresh();
  if (S.watchlist.open) fetchWatchlist();
  window.addEventListener('resize', applyWatchlistLayout);
  window.addEventListener('keydown', e => {
    const tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
    if (e.key === 'Escape' && S.watchlist.open) toggleWatchlist(false);
  });
}
