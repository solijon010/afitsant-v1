import { Router } from 'express'
import { getDb } from '../db/connection'

const router = Router()

/**
 * GET /menu
 * Barcha kategoriyalar va mahsulotlarni qaytaradi.
 */
router.get('/', (req, res) => {
  const db = getDb()
  const categories = db.prepare('SELECT * FROM categories WHERE is_active = 1 ORDER BY sort_order').all()
  const products = db.prepare('SELECT * FROM products WHERE is_available = 1 ORDER BY sort_order').all()
  res.json({ categories, products })
})

router.get('/categories', (req, res) => {
  const db = getDb()
  const rows = db.prepare('SELECT * FROM categories ORDER BY sort_order').all()
  res.json(rows)
})

router.get('/products', (req, res) => {
  const db = getDb()
  const { categoryId } = req.query
  const rows = categoryId
    ? db.prepare('SELECT * FROM products WHERE category_id = ? ORDER BY sort_order').all(categoryId)
    : db.prepare('SELECT * FROM products ORDER BY sort_order').all()
  res.json(rows)
})

router.get('/products/:id', (req, res) => {
  const db = getDb()
  const row = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id)
  if (!row) return res.status(404).json({ error: 'Mahsulot topilmadi' })
  res.json(row)
})

export default router
