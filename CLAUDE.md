# Loyiha qoidalari — Claude uchun majburiy

Bu qoidalar **barcha sessiyalarda, har doim** qo'llaniladi. Istisnolar yo'q.

---

## 1. Commit xabarlari

**HECH QACHON** commit xabarida quyidagilarni yozmang:
- `Co-Authored-By: Claude`
- `Generated with Claude`
- `using Claude`
- `🤖 Generated with`
- Yoki shunga o'xshash har qanday AI/Claude iborasi

Commit xabari faqat o'zgarishni qisqacha tavsiflashi kerak:
```
# To'g'ri:
Add order history persistence
Fix table card design
Redesign PIN entry screen

# Xato:
Add feature Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
Fix bug 🤖 Generated with Claude Code
```

---

## 2. Branch ochish

`main` yoki `test` branchlariga **to'g'ridan-to'g'ri push qilmang**.

Har bir yangi vazifa uchun alohida branch oching:
```bash
git checkout -b feature/vazifa-nomi
git checkout -b fix/xato-tavsifi
git checkout -b hotfix/tezkor-tuzatish
```

---

## 3. Pull Request tartibi

- PR faqat **`test` branchga** yuboriladi — `main` ga emas
- PR sarlavhasi o'zgarishni aniq tavsiflashi kerak
- `main` ga faqat `test` orqali merge qilinadi

---

## 4. Texnologiyalar

- **Frontend:** React + TypeScript + Tailwind CSS (Vite/electron-vite)
- **Backend (Electron main):** Node.js + better-sqlite3 + bcryptjs
- **IPC:** Electron ipcMain/ipcRenderer/contextBridge
- **State:** Zustand
- **Routing:** React Router v6

---

## 5. Kod uslubi

- TypeScript — barcha yangi fayllar `.ts` / `.tsx`
- Tailwind faqat loyiha token sinflari bilan: `bg-bg-card`, `text-ink`, `border-line` va h.k.
- Har bir komponent `JSX.Element` qaytarishi kerak
- `async/await` — `Promise.then()` emas (IPC chaqiruvlarida)
