import { describe, it, expect } from 'vitest'
import { mapApiError } from './map-api-error'
import { ApiError } from '@/shared/api/types'

describe('mapApiError', () => {
  it('statusCode=0 → error de red message', () => {
    const result = mapApiError(new ApiError(0, 'x'))
    expect(result).toContain('red')
  })

  it('statusCode=401 → sesión expirada message', () => {
    const result = mapApiError(new ApiError(401, 'x'))
    expect(result.toLowerCase()).toContain('sesión')
  })

  it('statusCode=403 → sin permiso message', () => {
    const result = mapApiError(new ApiError(403, 'x'))
    expect(result.toLowerCase()).toContain('permiso')
  })

  it('statusCode=404 → recurso no encontrado message', () => {
    const result = mapApiError(new ApiError(404, 'x'))
    expect(result.toLowerCase()).toContain('recurso')
  })

  it('statusCode=422 → devuelve err.message tal cual (string de dominio)', () => {
    const result = mapApiError(new ApiError(422, 'Ciclo inválido'))
    expect(result).toBe('Ciclo inválido')
  })

  it('statusCode=500 → mensaje genérico del servidor (no relanza)', () => {
    const result = mapApiError(new ApiError(500, 'Internal error'))
    expect(typeof result).toBe('string')
    expect(result.length).toBeGreaterThan(0)
    // Should return the error message or a generic fallback
    expect(result).toBeTruthy()
  })

  it('non-ApiError → cadena genérica sin lanzar', () => {
    const result = mapApiError(new Error('x'))
    expect(typeof result).toBe('string')
    expect(result.length).toBeGreaterThan(0)
  })

  it('null → cadena genérica sin lanzar', () => {
    const result = mapApiError(null)
    expect(typeof result).toBe('string')
    expect(result.length).toBeGreaterThan(0)
  })

  it('is importable from @/shared/lib/map-api-error', async () => {
    const mod = await import('@/shared/lib/map-api-error')
    expect(mod.mapApiError).toBeDefined()
    expect(typeof mod.mapApiError).toBe('function')
  })
})
