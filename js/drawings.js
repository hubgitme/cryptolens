// js/drawings.js — ابزارهای رسم: روند، افقی، فیبوناچی، الیوت؛ جابجایی، قفل، ذخیره

// ═══════════ ابزارهای رسم (روند، افقی، فیبوناچی، الیوت) ═══════════
const DR_KEY = 'ta_drawings_v1';
const DRAW_DEFS = {
  trend: { n: 2, hint: 'خط روند' },
  hline: { n: 1, hint: 'خط افقی' },
  fib:   { n: 2, hint: 'فیبوناچی (شروع، پایان)' },
  ewi:   { n: 6, labels: ['0', '1', '2', '3', '4', '5'], hint: 'الیوت ۱-۵' },
  ewc:   { n: 4, labels: ['0', 'A', 'B', 'C'], hint: 'الیوت ABC' }
};
const FIB_COLORS = ['#9ca3af', '#ef5350', '#f59e0b', '#26a69a', '#3b82f6', '#a855f7', '#9ca3af', '#ec4899', '#14b8a6'];
let allDrawings = {}, drawSymbol = '', drawTool = 'cursor', draft = null, cursorPx = null;
let selectedId = null, drawVersion = 0, dragging = null, lastDrawSig = '';

function newDrawId() { return 'd' + Math.random().toString(36).slice(2, 9); }
function sanitizeDrawings(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object') return out;
  Object.keys(raw).slice(0, 200).forEach(sym => {
    if (!SYMBOL_RE.test(sym) || !Array.isArray(raw[sym])) return;
    const list = raw[sym].slice(0, 100).filter(d => d && DRAW_DEFS[d.type] && Array.isArray(d.pts)).map(d => ({
      id: newDrawId(), type: d.type, locked: d.locked === true,
      color: /^#[0-9a-fA-F]{6}$/.test(d.color) ? d.color : '#f59e0b',
      pts: d.pts.filter(p => p && isFinite(p.t) && isFinite(p.p)).slice(0, DRAW_DEFS[d.type].n).map(p => ({ t: +p.t, p: +p.p }))
    })).filter(d => d.pts.length >= (d.type === 'hline' ? 1 : 2));
    if (list.length) out[sym.toUpperCase()] = list;
  });
  return out;
}
function pruneDrawings() { const o = {}; Object.keys(allDrawings).forEach(k => { if (allDrawings[k].length) o[k] = allDrawings[k]; }); return o; }
function loadDrawings() { try { allDrawings = sanitizeDrawings(JSON.parse(localStorage.getItem(DR_KEY))); } catch (e) { allDrawings = {}; } }
function saveDrawings() { try { localStorage.setItem(DR_KEY, JSON.stringify(pruneDrawings())); } catch (e) {} }
function curDrawings() { if (!drawSymbol) return []; return allDrawings[drawSymbol] || (allDrawings[drawSymbol] = []); }
function onSymbolRendered(symbol) {
  if (symbol !== drawSymbol) { drawSymbol = symbol; selectedId = null; draft = null; refreshToolbar(); }
  drawVersion++;
}

const IV_SEC = { '1h': 3600, '4h': 14400, '1d': 86400, '1w': 604800 };
function ptToXY(pt) {
  if (!globalCandles.length) return null;
  const lg = (pt.t - globalCandles[0].time) / IV_SEC[currentIv];
  const x = priceChart.timeScale().logicalToCoordinate(lg), y = candleSeries.priceToCoordinate(pt.p);
  return x == null || y == null ? null : { x, y };
}
function xyToPt(x, y) {
  if (!globalCandles.length) return null;
  const lg = priceChart.timeScale().coordinateToLogical(x), p = candleSeries.coordinateToPrice(y);
  if (lg == null || p == null) return null;
  return { t: globalCandles[0].time + Math.round(lg) * IV_SEC[currentIv], p };
}
function snapPoint(x, y) {
  const pt = xyToPt(x, y); if (!pt) return null;
  if (S.magnet) {
    const c = globalCandles[Math.round((pt.t - globalCandles[0].time) / IV_SEC[currentIv])];
    if (c) {
      let best = null, bd = 18;
      ['open', 'high', 'low', 'close'].forEach(k => {
        const yy = candleSeries.priceToCoordinate(c[k]);
        if (yy != null && Math.abs(yy - y) < bd) { bd = Math.abs(yy - y); best = c[k]; }
      });
      if (best != null) pt.p = best;
    }
  }
  return pt;
}
function plotRight() {
  const el = document.getElementById('chart-price'); let w = 56;
  try { w = priceChart.priceScale('right').width(); } catch (e) {}
  return Math.max(50, el.clientWidth - w);
}
function plotBottom() {
  const el = document.getElementById('chart-price'); let h = 26;
  try { h = priceChart.timeScale().height(); } catch (e) {}
  return Math.max(50, el.clientHeight - h);
}

function setTool(t) { drawTool = t; draft = null; if (t !== 'cursor') selectedId = null; drawVersion++; refreshToolbar(); }
function refreshToolbar() {
  document.querySelectorAll('#toolbar [data-tool]').forEach(b => b.classList.toggle('active', b.dataset.tool === drawTool));
  const hint = document.getElementById('drawHint'), done = document.getElementById('drawDone');
  if (!hint) return;
  const sd = curDrawings().find(x => x.id === selectedId);
  const lb = document.getElementById('lockBtn'), la = document.getElementById('lockAllBtn');
  if (lb) { lb.disabled = !sd; lb.textContent = sd && sd.locked ? '🔓 باز کردن قفل' : '🔒 قفل'; lb.classList.toggle('active', !!(sd && sd.locked)); }
  if (la) la.classList.toggle('active', !!S.lockAll);
  if (drawTool === 'cursor') {
    hint.textContent = sd ? ((sd.locked || S.lockAll) ? 'قفل است — برای جابجایی قفل را باز کنید' : 'بکشید تا جابجا شود؛ نقطه‌ها را هم می‌توان کشید')
      : (S.lockAll ? 'همه‌ی رسم‌ها قفل‌اند' : 'برای ویرایش، روی رسم کلیک کنید');
  } else { const d = DRAW_DEFS[drawTool]; hint.textContent = draft ? `${d.hint}: نقطه ${draft.pts.length + 1} از ${d.n}` : `${d.hint}: روی چارت کلیک کنید`; }
  done.style.display = draft && draft.pts.length >= 2 && DRAW_DEFS[draft.type].n > 2 ? '' : 'none';
}
function updateMagnetBtn() { const b = document.getElementById('magnetBtn'); if (b) b.classList.toggle('active', !!S.magnet); }
function toggleMagnet() { updSetting('magnet', !S.magnet); }
function onDrawColor(v) {
  if (!/^#[0-9a-fA-F]{6}$/.test(v)) return;
  S.drawColor = v; saveSettings();
  const d = curDrawings().find(x => x.id === selectedId);
  if (d) { d.color = v; saveDrawings(); }
  drawVersion++;
}
function deleteSelected() {
  if (!selectedId) return;
  const l = curDrawings(), i = l.findIndex(d => d.id === selectedId);
  if (i >= 0) { l.splice(i, 1); saveDrawings(); }
  selectedId = null; drawVersion++; refreshToolbar();
}
function undoDrawing() { if (draft) { draft.pts.pop(); if (!draft.pts.length) draft = null; } else { curDrawings().pop(); saveDrawings(); selectedId = null; } drawVersion++; refreshToolbar(); }
function clearDrawings() {
  if (!curDrawings().length || !confirm('همه‌ی رسم‌های ' + drawSymbol + ' پاک شود؟')) return;
  allDrawings[drawSymbol] = []; saveDrawings(); selectedId = null; drawVersion++; refreshToolbar();
}
function finishDraft() {
  if (!draft || draft.pts.length < (draft.type === 'hline' ? 1 : 2)) { draft = null; refreshToolbar(); return; }
  const d = { id: newDrawId(), type: draft.type, color: S.drawColor, pts: draft.pts };
  curDrawings().push(d); selectedId = d.id; draft = null; drawTool = 'cursor';
  saveDrawings(); drawVersion++; refreshToolbar();
}
function finishDraftEarly() { if (draft) finishDraft(); }

function distSeg(px, py, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy;
  let t = l2 ? ((px - a.x) * dx + (py - a.y) * dy) / l2 : 0; t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (a.x + t * dx), py - (a.y + t * dy));
}
function fibY(d, l) { return candleSeries.priceToCoordinate(d.pts[1].p + (d.pts[0].p - d.pts[1].p) * l); }
function hitTest(x, y) {
  const R = 12, list = curDrawings();
  for (let k = list.length - 1; k >= 0; k--) {
    const d = list[k], P = d.pts.map(ptToXY);
    if (P.some(q => !q)) continue;
    if (d.type === 'hline') { if (Math.abs(P[0].y - y) < R) return d.id; continue; }
    for (let i = 0; i < P.length - 1; i++) if (distSeg(x, y, P[i], P[i + 1]) < R) return d.id;
    if (d.type === 'fib' && x >= Math.min(P[0].x, P[1].x) - R && x <= plotRight() &&
        S.fibLevels.some(l => { const yy = fibY(d, l); return yy != null && Math.abs(yy - y) < R; })) return d.id;
  }
  return null;
}
function onChartClick(param) {
  if (!param || !param.point || !globalCandles.length) return;
  if (drawTool === 'cursor') { selectedId = hitTest(param.point.x, param.point.y); drawVersion++; refreshToolbar(); return; }
  const pt = snapPoint(param.point.x, param.point.y); if (!pt) return;
  if (!draft) draft = { type: drawTool, pts: [] };
  draft.pts.push(pt);
  if (draft.pts.length >= DRAW_DEFS[draft.type].n) finishDraft(); else { drawVersion++; refreshToolbar(); }
}

function fmtPrice(p) { return p.toLocaleString('en-US', { maximumFractionDigits: lastPricePrecision }); }
function svgLine(x1, y1, x2, y2, col, w, dash) { return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${col}" stroke-width="${w}"${dash ? ` stroke-dasharray="${dash}"` : ''}/>`; }
function svgText(x, y, t, col, anchor) { return `<text x="${x}" y="${y}" fill="${col}" font-size="11" text-anchor="${anchor}" stroke="#0b0e17" stroke-width="3" paint-order="stroke">${t}</text>`; }
function drawOne(d, P, W, sel) {
  const c = d.color, sw = sel ? 2.6 : 1.6, locked = !!d.locked || S.lockAll;
  // فقط رسمِ انتخاب‌شده و بدون قفل، رویداد می‌گیرد؛ بقیه کشیدنِ چارت را مختل نمی‌کنند
  const canHit = drawTool === 'cursor' && !d.temp && sel && !locked;
  const HS = 'fill="none" stroke="transparent" stroke-width="26" style="pointer-events:stroke;cursor:move;touch-action:none"';
  const hl = (x1, y1, x2, y2) => canHit ? `<line class="dm" data-id="${d.id}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" ${HS}/>` : '';
  let s = `<g opacity="${d.temp ? 0.7 : 1}">`;
  if (d.type === 'hline') {
    s += svgLine(0, P[0].y, W, P[0].y, c, sw, '6 4') + svgText(W - 4, P[0].y - 4, fmtPrice(d.pts[0].p), c, 'end') + hl(0, P[0].y, W, P[0].y);
  } else if (P.length < 2) {
    s += `<circle cx="${P[0].x}" cy="${P[0].y}" r="4" fill="${c}"/>`;
  } else if (d.type === 'trend') {
    s += svgLine(P[0].x, P[0].y, P[1].x, P[1].y, c, sw) + hl(P[0].x, P[0].y, P[1].x, P[1].y);
  } else if (d.type === 'fib') {
    const xl = Math.min(P[0].x, P[1].x), ys = [];
    s += svgLine(P[0].x, P[0].y, P[1].x, P[1].y, '#6b7280', 1, '3 3');
    S.fibLevels.forEach((l, i) => {
      const price = d.pts[1].p + (d.pts[0].p - d.pts[1].p) * l, y = candleSeries.priceToCoordinate(price);
      if (y == null) return;
      ys.push(y);
      const col = FIB_COLORS[i % FIB_COLORS.length];
      s += svgLine(xl, y, W, y, col, sel ? 1.6 : 1) + svgText(xl + 4, y - 3, `${l} (${fmtPrice(price)})`, col, 'start');
    });
    if (canHit && ys.length) {   // کل ناحیه‌ی فیبو قابل گرفتن است
      const y0 = Math.min(...ys, P[0].y, P[1].y), y1 = Math.max(...ys, P[0].y, P[1].y);
      s += `<rect class="dm" data-id="${d.id}" x="${xl}" y="${y0}" width="${Math.max(10, W - xl)}" height="${Math.max(10, y1 - y0)}" fill="transparent" style="pointer-events:all;cursor:move;touch-action:none"/>`;
    }
  } else {
    const labels = DRAW_DEFS[d.type].labels, pts = P.map(q => q.x + ',' + q.y).join(' ');
    s += `<polyline points="${pts}" fill="none" stroke="${c}" stroke-width="${sw}" stroke-linejoin="round"/>`;
    if (canHit) s += `<polyline class="dm" data-id="${d.id}" points="${pts}" ${HS}/>`;
    P.forEach((q, i) => {
      const pr = d.pts[i].p, prev = d.pts[i - 1], next = d.pts[i + 1];
      const isHigh = (prev ? pr >= prev.p : true) && (next ? pr >= next.p : true), cy = q.y + (isHigh ? -16 : 16);
      s += `<circle cx="${q.x}" cy="${cy}" r="9" fill="#0b0e17" stroke="${c}" stroke-width="1.3"/><text x="${q.x}" y="${cy + 4}" fill="${c}" font-size="11" font-weight="700" text-anchor="middle">${labels[i] || ''}</text>`;
    });
  }
  if (sel && !d.temp) {
    if (locked) s += svgText(P[0].x + 8, P[0].y - 8, '🔒', c, 'start');
    else if (drawTool === 'cursor') P.forEach((q, i) => {
      s += `<circle cx="${q.x}" cy="${q.y}" r="7" fill="#fff" fill-opacity=".92" stroke="${c}" stroke-width="2" style="pointer-events:none"/>`;
      s += `<circle class="dh" data-id="${d.id}" data-hi="${i}" cx="${q.x}" cy="${q.y}" r="22" fill="transparent" style="pointer-events:all;cursor:move;touch-action:none"/>`;
    });
  }
  return s + '</g>';
}
function drawingsSVG(W) {
  const list = curDrawings().slice();
  if (draft) {
    const pts = draft.pts.slice();
    if (cursorPx) { const cp = xyToPt(cursorPx.x, cursorPx.y); if (cp) pts.push(cp); }
    if (pts.length) list.push({ id: '_draft', type: draft.type, color: S.drawColor, pts: pts.slice(0, DRAW_DEFS[draft.type].n), temp: true });
  }
  let out = '';
  list.forEach(d => { const P = d.pts.map(ptToXY); if (!P.some(q => !q)) out += drawOne(d, P, W, d.id === selectedId); });
  return out;
}
function drawLoop() {
  try {
    if (priceChart && candleSeries && globalCandles.length) {
      const el = document.getElementById('chart-price'), r = priceChart.timeScale().getVisibleLogicalRange();
      const ref = globalCandles[globalCandles.length - 1].close;
      const sig = [r && r.from, r && r.to, candleSeries.priceToCoordinate(ref), candleSeries.priceToCoordinate(ref * 1.05), el.clientWidth, el.clientHeight, drawVersion, drawTool, selectedId].join('|');
      if (sig !== lastDrawSig) {
        lastDrawSig = sig;
        const svg = document.getElementById('drawSvg'), W = plotRight();
        svg.setAttribute('width', W); svg.setAttribute('height', plotBottom());
        svg.innerHTML = drawingsSVG(W);
      }
    }
  } catch (e) {}
  requestAnimationFrame(drawLoop);
}
function initDrawings() {
  loadDrawings();
  priceChart.subscribeClick(onChartClick);
  priceChart.subscribeCrosshairMove(p => { cursorPx = p.point || null; if (draft) drawVersion++; });
  document.getElementById('drawSvg').addEventListener('pointerdown', e => {
    const t = e.target; if (!t.closest) return;
    const h = t.closest('[data-hi]'), m = t.closest('.dm');
    if (h) beginDrag(e, { id: h.getAttribute('data-id'), i: +h.getAttribute('data-hi') });
    else if (m) {
      const id = m.getAttribute('data-id'), d = curDrawings().find(x => x.id === id); if (!d) return;
      selectedId = id; drawVersion++; refreshToolbar();
      beginDrag(e, { id, i: null, sx: e.clientX, sy: e.clientY, origXY: d.pts.map(ptToXY) });
    }
  });
  window.addEventListener('keydown', e => {
    const tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
    if (e.key === 'Escape') { draft = null; selectedId = null; setTool('cursor'); }
    else if (e.key === 'Enter') finishDraftEarly();
    else if (e.key === 'Delete' || e.key === 'Backspace') deleteSelected();
  });
  refreshToolbar();
  requestAnimationFrame(drawLoop);
}
function beginDrag(e, info) {
  dragging = info;
  dragShield(e, 'move', onDragMove, () => { dragging = null; saveDrawings(); });
}
function onDragMove(e) {
  if (!dragging) return;
  const d = curDrawings().find(x => x.id === dragging.id); if (!d) return;
  if (dragging.i != null) {
    const r = document.getElementById('chart-price').getBoundingClientRect();
    const pt = snapPoint(e.clientX - r.left, e.clientY - r.top);
    if (pt) { d.pts[dragging.i] = pt; drawVersion++; }
  } else {
    if (dragging.origXY.some(q => !q)) return;
    const dx = e.clientX - dragging.sx, dy = e.clientY - dragging.sy;
    const np = dragging.origXY.map(q => xyToPt(q.x + dx, q.y + dy));
    if (np.every(Boolean)) { d.pts = np; drawVersion++; }
  }
}

// ═══════════ قفل رسم‌ها، پنل‌های ثابت مثل TradingView ═══════════
function toggleLockSelected() {
  const sd = curDrawings().find(x => x.id === selectedId); if (!sd) return;
  sd.locked = !sd.locked; saveDrawings(); drawVersion++; refreshToolbar();
}
function toggleLockAll() { S.lockAll = !S.lockAll; saveSettings(); drawVersion++; refreshToolbar(); }
