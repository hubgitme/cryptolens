// تبدیل پروژه به «یک فایل HTML تک‌فایلی» (برای آفلاین/اشتراک‌گذاری): npm run bundle  →  dist/index.single.html
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
html = html.replace(/<link rel="stylesheet" href="([^"]+)"[^>]*>/g, (_, f) => `<style>\n${read(f)}\n</style>`);
html = html.replace(/<script src="(js\/[^"]+)"><\/script>/g, (_, f) => `<script>\n${read(f)}\n</script>`);
html = html.replace(/\s*<link rel="manifest"[^>]*>/, '');   // در حالت تک‌فایل لازم نیست
fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
const out = path.join(root, 'dist', 'index.single.html');
fs.writeFileSync(out, html);
console.log('✔', path.relative(root, out), (Buffer.byteLength(html) / 1024).toFixed(1) + ' KB');
