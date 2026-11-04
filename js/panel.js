// js/panel.js — پنل 📈 اندیکاتورها و تنظیمات

// ─── پنل تنظیمات اندیکاتورها ────────────────────────────────────────────────
function onIndChange() {
  saveSettings(); applyIndicatorVisibility();
  if (lastCandles.length) renderAll(false);
  renderPanel();
}
function addOv(type) {
  if (S.overlays.length >= 12) return msg('حداکثر ۱۲ اندیکاتور');
  S.overlays.push({ id: 'ov' + (++ovSeq), type, on: true, period: type === 'vwap' ? 1 : 20, mult: 2,
    color: OV_COLORS[S.overlays.length % OV_COLORS.length] });
  onIndChange();
}
function delOv(id) { S.overlays = S.overlays.filter(o => o.id !== id); onIndChange(); }
function updOv(id, prop, val) {
  const o = S.overlays.find(x => x.id === id); if (!o) return;
  if (prop === 'on') o.on = !!val;
  else if (prop === 'period') o.period = toInt(val, o.period, 1, 500);
  else if (prop === 'mult') o.mult = toNum(val, o.mult, 0.1, 10);
  else if (prop === 'color' && /^#[0-9a-fA-F]{6}$/.test(val)) o.color = val;
  onIndChange();
}
function updPane(key, prop, val) {
  S[key][prop] = prop === 'on' ? !!val : val;
  S = sanitizeSettings(S);
  onIndChange();
}
function openInd() { renderPanel(); document.getElementById('indOverlay').classList.add('show'); }
function closeInd() { document.getElementById('indOverlay').classList.remove('show'); }
function fld(key, prop, label, attrs) {
  return `<label>${label}<input type="number" ${attrs || ''} value="${S[key][prop]}" onchange="updPane('${key}','${prop}',this.value)"></label>`;
}
function paneRow(key, title, fields) {
  return `<div class="ind-row"><input type="checkbox" ${S[key].on ? 'checked' : ''} onchange="updPane('${key}','on',this.checked)"><span class="nm">${title}</span>${fields || ''}</div>`;
}
function renderPanel() {
  const ovRows = S.overlays.map(o => `<div class="ind-row">
      <input type="checkbox" ${o.on ? 'checked' : ''} onchange="updOv('${o.id}','on',this.checked)">
      <span class="nm">${OV_TYPES[o.type]}</span>
      ${o.type === 'vwap' ? '' : `<label>دوره<input type="number" min="1" max="500" value="${o.period}" onchange="updOv('${o.id}','period',this.value)"></label>`}
      ${o.type === 'bb' ? `<label>ضریب<input type="number" step="0.1" min="0.1" max="10" value="${o.mult}" onchange="updOv('${o.id}','mult',this.value)"></label>` : ''}
      <input type="color" value="${o.color}" onchange="updOv('${o.id}','color',this.value)">
      <button onclick="delOv('${o.id}')" title="حذف">🗑</button></div>`).join('')
    || '<p class="no-data">هنوز اندیکاتوری روی نمودار قیمت اضافه نشده</p>';
  const scRows = S.customIndicators.map(sc => {
    const info = scriptInfo[sc.id] || {};
    const kind = info.kind === 'strategy' ? 'استراتژی' : info.kind === 'indicator' ? 'اندیکاتور' : '—';
    const params = (info.inputs || []).map(inp => inputField(sc, inp)).join('');
    return `<div class="ind-row">
      <input type="checkbox" ${sc.on ? 'checked' : ''} onchange="updScript('${sc.id}',this.checked)">
      <span class="nm" style="direction:rtl;text-align:right">${escHtml(sc.name)}</span><span class="tag">${kind}</span>
      <button onclick="openEditor('${sc.id}')">✎ ویرایش</button><button onclick="delScript('${sc.id}')">🗑</button></div>
      ${params ? `<div class="ind-row sub">${params}</div>` : ''}
      ${info.error ? `<div class="ind-err">${escHtml(info.error)}</div>` : ''}`;
  }).join('') || '<p class="no-data">هنوز اسکریپتی ننوشته‌اید</p>';
  document.getElementById('indModal').innerHTML = `
    <div class="ind-head"><h3>📈 اندیکاتورها و تنظیمات</h3><button onclick="closeInd()">✕</button></div>
    <div class="ind-sec"><h4>روی نمودار قیمت</h4>${ovRows}
      <div class="ind-add">
        <button onclick="addOv('ema')">+ EMA</button><button onclick="addOv('sma')">+ SMA</button>
        <button onclick="addOv('bb')">+ Bollinger</button><button onclick="addOv('vwap')">+ VWAP</button>
      </div>
      <div class="ind-row" style="margin-top:10px">
        <input type="checkbox" ${S.volume.on ? 'checked' : ''} onchange="updPane('volume','on',this.checked)"><span class="nm">Volume</span>
      </div>
    </div>
    <div class="ind-sec"><h4>پنل‌های جدا</h4>
      ${paneRow('rsi', 'RSI', fld('rsi', 'period', 'دوره', 'min="2" max="200"') + fld('rsi', 'ob', 'اشباع خرید', 'min="50" max="100"') + fld('rsi', 'os', 'اشباع فروش', 'min="0" max="50"'))}
      ${paneRow('macd', 'MACD', fld('macd', 'fast', 'سریع', 'min="2"') + fld('macd', 'slow', 'کند', 'min="3"') + fld('macd', 'sig', 'سیگنال', 'min="1"'))}
      ${paneRow('stoch', 'Stochastic', fld('stoch', 'k', 'K', 'min="2"') + fld('stoch', 'd', 'D', 'min="1"') + fld('stoch', 'smooth', 'نرم‌سازی', 'min="1"'))}
      ${paneRow('atr', 'ATR', fld('atr', 'period', 'دوره', 'min="2" max="200"'))}
      ${paneRow('obv', 'OBV + SMA', fld('obv', 'sma', 'دوره SMA', 'min="1" max="500"'))}
      ${paneRow('roc', 'ROC', fld('roc', 'period', 'دوره', 'min="1" max="500"'))}
      ${paneRow('adx', 'ADX / +DI / −DI', fld('adx', 'period', 'دوره', 'min="2" max="100"'))}
    </div>
    <div class="ind-sec"><h4>اسکریپت‌های من (اندیکاتور و استراتژی با کد)</h4>${scRows}
      <div class="ind-add">
        <button onclick="openEditor(null,'ema_cross')">+ اندیکاتور جدید</button>
        <button onclick="openEditor(null,'strat_ema')">+ استراتژی جدید</button>
      </div>
    </div>
    ${btReport()}
    <div class="ind-sec"><h4>داده و ابزارهای رسم</h4>
      <div class="ind-row">
        <label>تعداد کندل<select onchange="updSetting('limit',this.value)">${[300, 500, 1000].map(n => `<option value="${n}" ${S.limit === n ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
        <label><input type="checkbox" ${S.magnet ? 'checked' : ''} onchange="updSetting('magnet',this.checked)">Magnet (چسبیدن به OHLC)</label>
      </div>
      <div class="ind-row"><label style="flex:1">سطوح فیبوناچی<input type="text" style="flex:1;direction:ltr" value="${S.fibLevels.join(', ')}" onchange="updSetting('fibLevels',this.value)"></label></div>
      <div class="ind-row"><button onclick="resetLayout()">↺ بازنشانی اندازه‌ی پنل‌ها</button></div>
    </div>
    <div class="ind-sec"><h4>پشتیبان‌گیری و بازیابی (تنظیمات، اندیکاتورها، اسکریپت‌ها، رسم‌ها، ارزهای ذخیره‌شده)</h4>
      <div class="ind-add">
        <button onclick="downloadBackup()">⬇ دانلود فایل پشتیبان</button>
        <button onclick="document.getElementById('restoreFile').click()">⬆ بازیابی از فایل</button>
        <button onclick="copyBackup()">📋 کپی متن پشتیبان</button>
        <button onclick="resetSettings()">↺ بازنشانی اندیکاتورها</button>
      </div>
      <input type="file" id="restoreFile" accept=".json,application/json" hidden onchange="restoreFromFile(this)">
      <textarea id="restoreText" placeholder="یا متن پشتیبان را اینجا بچسبانید..."></textarea>
      <div class="ind-add" style="margin-top:6px"><button onclick="restoreFromText(document.getElementById('restoreText').value)">بازیابی از متن</button></div>
      <div class="ind-msg" id="indMsg"></div>
    </div>`;
}
