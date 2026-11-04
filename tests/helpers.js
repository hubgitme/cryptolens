// بارگذاری فایل‌های js/ در یک sandbox مشترک (مثل اسکریپت‌های کلاسیک مرورگر) برای تست در Node
const fs = require('fs'), path = require('path'), vm = require('vm');
module.exports = function load(...files) {
  const ctx = vm.createContext({ console, Math, Date, JSON });
  for (const f of files) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8'), ctx, { filename: f });
  ctx.$ = expr => vm.runInContext(expr, ctx);   // دسترسی به const/let های سطح بالا
  return ctx;
};
