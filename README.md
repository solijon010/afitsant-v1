# Hisobchim POS

Restoran va kafelar uchun zamonaviy Point-of-Sale tizimi.

**Stack:** React + TypeScript + Tailwind CSS · Electron · SQLite (better-sqlite3) · Zustand

---

## Loyiha tuzilmasi

```
afitsiant-v1/
├── src/                  # React frontend (Vite)
│   ├── pages/            # Sahifalar (Login, Tables, Order, ...)
│   ├── stores/           # Zustand store (cart.ts, auth.ts, ...)
│   ├── hooks/            # Custom hooks (useCartFlush, ...)
│   └── components/       # UI komponentlar
├── electron/
│   └── main/             # Electron main process
│       ├── db/           # SQLite schema, connection, mappers
│       ├── services/     # orders, syncEngine, auth, menu, ...
│       └── ipc.ts        # IPC handler registratsiyasi
├── server/               # Standalone REST API server
│   └── src/
│       ├── routes/       # auth, menu, tables, orders, settings
│       ├── services/     # orderSync, remoteApi, settings
│       └── middleware/   # auth, error
├── shared/               # Umumiy TypeScript types
└── test/                 # Test suite (302 ta test)
```

---

## Ishga tushirish

### Electron app (asosiy POS)

```bash
npm install
npm run dev
```

### Standalone REST API server

```bash
npm run server:install
cp server/.env.example server/.env
# server/.env da DB_PATH ni to'ldiring
npm run server:dev
```

Server `http://localhost:3001` da ishga tushadi.

---

## Asosiy buyruqlar

| Buyruq | Nima qiladi |
|--------|-------------|
| `npm run dev` | Electron app development rejimida |
| `npm test` | 302 ta test (barcha 100% o'tadi) |
| `npm run server:dev` | REST API server (hot-reload) |
| `npm run server:start` | REST API server production |
| `npm run build` | Electron app build |
| `npm run typecheck` | TypeScript tekshiruv |

---

## REST API endpointlari

| Endpoint | Tavsif |
|----------|--------|
| `GET /health` | Server holati |
| `POST /auth/login` | Waiter login |
| `GET /menu` | Kategoriya + mahsulotlar |
| `GET /tables` | Xonalar + stollar + aktiv orderlar |
| `GET /orders` | Buyurtmalar ro'yxati |
| `POST /orders` | Yangi buyurtma |
| `POST /orders/:id/items` | Item qo'shish/yangilash |
| `POST /orders/:id/sync` | Remote serverga sync |
| `POST /orders/:id/close` | Buyurtmani yopish |
| `POST /orders/:id/cancel` | Bekor qilish |
| `GET /settings` | Sozlamalar |

---

## Muhim texnik detallar

- **KG mahsulotlar** (0.5 kg, 1.5 kg): server faqat butun sonlarni qabul qiladi — kasrli miqdorlar lokal saqlanadi, server order bekor qilinadi
- **Sync mexanizmi**: Zustand → SQLite IPC → WebSocket sync engine (15 soniyada bir)
- **Offline qo'llab-quvvatlash**: barcha operatsiyalar SQLite ga yoziladi, internet tiklanganida avtomatik sync
- **Double-count oldini olish**: `initialServerItemsRef` orqali server state bilan farq hisoblash

---

## Litsenziya

Private — Hisobchim © 2026
