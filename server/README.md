# Hisobchim POS — Standalone REST API Server

Electron ilovasidan mustaqil ishlaydigan Express.js REST API serveri.
Xuddi shu SQLite bazasiga ulanadi va remote server bilan sinxronlashadi.

---

## Ishga tushirish

```bash
# 1. Dependencies o'rnatish
npm install

# 2. Muhit sozlamalari
cp .env.example .env
# .env faylni oching va DB_PATH ni to'ldiring

# 3. Development (hot-reload)
npm run dev

# 4. Production
npm run build
npm start
```

---

## Muhit o'zgaruvchilari (.env)

| O'zgaruvchi | Tavsif | Default |
|-------------|--------|---------|
| `DB_PATH` | SQLite fayl yo'li **(majburiy)** | — |
| `PORT` | HTTP port | `3001` |
| `REMOTE_API_URL` | Remote server URL | `https://api-restaurant.hisobchim.uz` |
| `REMOTE_WS_URL` | WebSocket URL | `wss://api-restaurant.hisobchim.uz` |
| `API_TOKEN` | Boshlang'ich API token | — |
| `BRANCH_ID` | Branch ID | — |
| `CORS_ORIGIN` | CORS origin | `*` |

**macOS da DB_PATH:**
```
DB_PATH=/Users/SIZNING_ISMINGIZ/Library/Application Support/uz.hisobchim.pos/afisant.db
```

---

## API endpointlari

### Holat
```
GET /health
```

### Autentifikatsiya
```
POST /auth/login     { phone, password }
POST /auth/logout
```

### Menyu
```
GET /menu            — kategoriyalar + mahsulotlar
GET /menu/categories
GET /menu/products
GET /menu/products/:id
```

### Stollar
```
GET /tables          — xonalar + stollar + aktiv orderlar
GET /tables/areas
GET /tables/:id
```

### Buyurtmalar
```
GET    /orders              ?status=open&tableId=1
GET    /orders/:id
POST   /orders              { tableId, waiterId?, notes? }
POST   /orders/:id/items    { items: [...] }
PATCH  /orders/:id/items/:itemId
DELETE /orders/:id/items/:itemId
POST   /orders/:id/sync     — remote serverga yuborish
POST   /orders/:id/close
POST   /orders/:id/cancel
```

### Sozlamalar
```
GET   /settings
PATCH /settings
```

---

## Misol so'rovlar

```bash
# Holat tekshirish
curl http://localhost:3001/health

# Login
curl -X POST http://localhost:3001/auth/login \
  -H "Content-Type: application/json" \
  -d '{"phone":"+998901234567","password":"secret"}'

# Menyu olish
curl http://localhost:3001/menu \
  -H "Authorization: Bearer YOUR_TOKEN"

# Buyurtma yaratish
curl -X POST http://localhost:3001/orders \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"tableId":1}'
```
