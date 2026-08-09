# 📊 تحلیل تکنیکال ارز دیجیتال

## ویژگی‌ها
- دریافت داده زنده از Binance
- نمودار خطی قیمت با علامت‌گذاری دره/قله
- اندیکاتور RSI (14) با سطوح اشباع
- اندیکاتور MACD (12,26,9)
- بازه‌های 1H / 4H / 1D
- تشخیص Pivot Points تکنیکال

## استقرار روی Vercel

```bash
npm i -g vercel
vercel
```

## ساختار پروژه
```
/
├── index.html        # فرانت‌اند اصلی
├── api/
│   └── klines.js     # Serverless Function بایننس
├── vercel.json
└── package.json
```
