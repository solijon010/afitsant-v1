import { Router } from 'express'
import { getSettings, patchSettings } from '../services/settings'

const router = Router()

router.get('/', (req, res) => {
  const s = getSettings()
  // apiToken ni yashiramiz
  res.json({ ...s, apiToken: s.apiToken ? '***' : null })
})

router.patch('/', (req, res, next) => {
  try {
    const patch = req.body
    // apiToken ni to'g'ridan-to'g'ri patch qilishga ruxsat berilmaydi
    delete patch.apiToken
    const updated = patchSettings(patch)
    res.json({ ...updated, apiToken: updated.apiToken ? '***' : null })
  } catch (e) { next(e) }
})

export default router
