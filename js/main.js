// js/main.js — راه‌اندازی برنامه (آخرین فایلی که بارگذاری میشه)

// ─── Boot ────────────────────────────────────────────────────────────────────
applyResponsiveLayout();
loadSettings();
initCharts();
populateSymbolDropdown();
applyIndicatorVisibility();
initDrawings();
initGrips();
updateMaxBtn();
loadData();   // بارگذاری خودکار هنگام باز شدن صفحه
// لایه محافظ: دوباره روی window.load هم اجرا میشه، برای اطمینان بیشتر
window.addEventListener('load', applyResponsiveLayout);

// PWA: ثبت service worker (نسخه‌ی کش در sw.js)
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => { navigator.serviceWorker.register('./sw.js'); });
}
