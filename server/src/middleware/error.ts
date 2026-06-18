import type { Request, Response, NextFunction } from 'express'

export function errorHandler(err: any, req: Request, res: Response, _next: NextFunction): void {
  console.error('[SERVER ERROR]', err?.message ?? err)
  const status = err?.status ?? err?.statusCode ?? 500
  res.status(status).json({ error: err?.message ?? 'Ichki server xatosi' })
}

export function notFound(req: Request, res: Response): void {
  res.status(404).json({ error: `Topilmadi: ${req.method} ${req.path}` })
}
