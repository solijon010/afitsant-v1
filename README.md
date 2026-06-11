# Afisant — POS tizimi

Choyxona, restoran va kafelar uchun **Electron + React + SQLite** asosida qurilgan zamonaviy POS terminal dasturi.

> Windows uchun mo'ljallangan (`.exe`). To'liq oflayn ishlaydi, internet kelganda backend bilan avtomatik sinxronlashadi.

## Asosiy imkoniyatlar

- **Card-asosli login**: afitsantni tanlab → 4 raqamli PIN-kod kiriting
- **5 ta xato urinishdan keyin 1 daqiqaga blok**, bcrypt bilan PIN himoyalangan
- **Stol/xona/katta xona** boshqaruvi (band/bo'sh holatlar, real-time pul ko'rsatkichi)
- **Kategoriya bo'yicha tezkor buyurtma**: emoji, narx va miqdor
- **Offline-first order sync**: buyurtmalar SQLite'da saqlanadi, internet qaytganda fon rejimida serverga yuboriladi
- **ESC/POS chek printer** (USB / LAN / Windows)
- **WebSocket real-time** menyu yangilanishlari
- **Offline-first** — internet uzilsa buyurtmalar `pending` holatda qoladi, qaytganda avtomatik sinxronlanadi
- **Til**: O'zbek (lotin) va O'zbek (kirill)
- **Default seed data** — birinchi ishga tushganda 4 afitsant, 21 stol, 6 kategoriya, 21 mahsulot avtomatik qo'shiladi

## Texnik stack

| Sloy | Texnologiya |
|---|---|
| Shell | Electron 32 |
| UI | React 18 + TypeScript + Vite |
| Style | TailwindCSS 3 (dark theme) |
| State | Zustand |
| Animatsiya | Framer Motion |
| Local DB | better-sqlite3 (WAL, mmap, transactional) |
| Backend API | axios |
| Real-time | socket.io-client |
| Printer | node-thermal-printer (ESC/POS) |
| Build | electron-vite + electron-builder |

## O'rnatish

```powershell
# Node.js 20+ kerak
npm install
npm run rebuild      # better-sqlite3 ni Electron uchun qayta build
npm run dev          # dasturni rivojlanish rejimida ishga tushiradi
```

## .exe build qilish

```powershell
# NSIS installer
npm run pack:win:nsis

# Portable (yagona .exe, o'rnatish kerak emas)
npm run pack:win:portable

# Ikkalasi birga
npm run pack:win
```

Build natijasi: `dist-app/` papkasida `Afisant-0.1.0-x64.exe` (installer) va `Afisant-0.1.0-portable.exe`.

## Default afitsantlar (test uchun)

| Ism | PIN | Rol |
|---|---|---|
| Bekzod Karimov | `1234` | Super afitsant |
| Aziza G'ulomova | `2345` | Afitsant |
| Javohir Saidov | `3456` | Afitsant |
| Madina Rahmonova | `4567` | Afitsant |

> Backend bilan sinxronlangach, bu afitsantlar admin tomonidan qo'shilgan ro'yxat bilan yangilanadi.

## Backend integratsiyasi

Tizim https://api-restaurant.hisobchim.uz API bilan ishlash uchun mo'ljallangan. Sozlamalar sahifasidan token kiriting:

1. Sozlamalar → Server bo'limi → API URL va Token
2. Sozlamalarni saqlang
3. WebSocket avtomatik ulanadi va menyu/afitsantlarni serverdan tortib oladi

## Loyiha tuzilishi

```
afisant/
├── electron/
│   ├── main/
│   │   ├── index.ts              ← Asosiy process
│   │   ├── ipc.ts                ← IPC handlerlar
│   │   ├── db/                   ← SQLite schema, mappers, seed
│   │   └── services/             ← auth, menu, orders, sync, printer
│   └── preload/index.ts          ← contextBridge orqali xavfsiz API
├── shared/                       ← Main + renderer o'rtasidagi tiplar
│   ├── types.ts
│   └── ipc.ts
├── src/                          ← React renderer
│   ├── App.tsx
│   ├── main.tsx
│   ├── pages/
│   │   ├── WaiterSelect.tsx
│   │   ├── PinEntry.tsx
│   │   ├── Tables.tsx
│   │   ├── Order.tsx
│   │   └── Settings.tsx
│   ├── components/
│   ├── stores/                   ← Zustand
│   ├── hooks/
│   ├── lib/                      ← i18n, format, cn
│   └── styles/globals.css
└── electron-builder.yml
```

## Sync strategiyasi

```
[Foydalanuvchi mahsulotni bosadi]
        ↓
   Zustand savatga qo'shadi (lokal, darhol)
        ↓
   "Saqlash" yoki "Chek & Yopish"
                  ↓
   window.afisant.orders.upsertOpen() + replaceItems()
                  ↓
   SQLite (better-sqlite3 transaction)
                  ↓
   orders.sync_status = 'pending'
                  ↓
   Fon sync har 15 soniyada serverga yuboradi
                  ↓
   Muvaffaqiyatli yuborilsa sync_status = 'synced'
```

## Xavfsizlik

- `contextIsolation: true`, `nodeIntegration: false`
- Renderer faqat `window.afisant` orqali main process'ga murojaat qila oladi
- PIN-kod bcrypt (`saltRounds: 10`) bilan hashlanadi
- API token shifrlangan SQLite faylda saqlanadi (`userData`)
- CSP: faqat o'z domen va sozlangan server URL'ga ulanish

## Litsenziya

Maxfiy — faqat ichki foydalanish uchun.
