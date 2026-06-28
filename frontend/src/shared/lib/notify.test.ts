import { describe, it, expect, vi, beforeEach } from 'vitest'
import { toast } from 'sonner'
import { notify } from './notify'

describe('notify helper', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('notify.success calls toast.success with the message', () => {
    const spy = vi.spyOn(toast, 'success')
    notify.success('Ticket creado')
    expect(spy).toHaveBeenCalledWith('Ticket creado')
  })

  it('notify.error calls toast.error with the message', () => {
    const spy = vi.spyOn(toast, 'error')
    notify.error('Error al crear ticket')
    expect(spy).toHaveBeenCalledWith('Error al crear ticket')
  })

  it('is importable as named export from @/shared/lib/notify', async () => {
    const mod = await import('@/shared/lib/notify')
    expect(mod.notify).toBeDefined()
    expect(typeof mod.notify.success).toBe('function')
    expect(typeof mod.notify.error).toBe('function')
  })
})
