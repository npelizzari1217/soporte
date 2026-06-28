import { toast } from 'sonner'

/**
 * notify — wrapper fino sobre sonner toast.
 *
 * ADR-5: Wrapper swappable + espiable en tests.
 * Permite cambiar la librería de toast sin tocar features.
 * Los tests espían notify.success/error directamente en vez de
 * asertar sobre el portal DOM de sonner.
 *
 * Design: §1.5 helper notify.
 */
export const notify = {
  success: (msg: string) => toast.success(msg),
  error: (msg: string) => toast.error(msg),
}
