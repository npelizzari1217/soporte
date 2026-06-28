/**
 * Tests for CreateTicketSchema (Slice 2 — S2/T2.1) and UpdateTicketSchema (Slice 3 — S3/T3.1).
 *
 * TDD: RED tests written before implementation.
 * Contract-first: tests assert the schema contract, not an implementation detail.
 *
 * Spec: tickets-ui §req Schemas Zod por operación
 */

import { describe, it, expect } from 'vitest'
import { CreateTicketSchema, UpdateTicketSchema } from './schemas'

const uuid = 'd0000000-0000-4000-d000-000000000001'

describe('CreateTicketSchema', () => {
  it('fails when titulo is empty string', () => {
    const result = CreateTicketSchema.safeParse({
      titulo: '',
      tipoId: uuid,
      prioridadId: uuid,
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      const field = result.error.issues.find((i) => i.path[0] === 'titulo')
      expect(field).toBeDefined()
      // message should be in Spanish
      expect(field?.message).toMatch(/título/i)
    }
  })

  it('fails when titulo exceeds 255 characters', () => {
    const result = CreateTicketSchema.safeParse({
      titulo: 'x'.repeat(256),
      tipoId: uuid,
      prioridadId: uuid,
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      const field = result.error.issues.find((i) => i.path[0] === 'titulo')
      expect(field).toBeDefined()
    }
  })

  it('fails when tipoId is not a valid UUID', () => {
    const result = CreateTicketSchema.safeParse({
      titulo: 'ok',
      tipoId: 'no-es-uuid',
      prioridadId: uuid,
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      const field = result.error.issues.find((i) => i.path[0] === 'tipoId')
      expect(field).toBeDefined()
    }
  })

  it('fails when prioridadId is not a valid UUID', () => {
    const result = CreateTicketSchema.safeParse({
      titulo: 'ok',
      tipoId: uuid,
      prioridadId: 'no-uuid',
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      const field = result.error.issues.find((i) => i.path[0] === 'prioridadId')
      expect(field).toBeDefined()
    }
  })

  it('succeeds with required fields only; optional fields absent without error', () => {
    const result = CreateTicketSchema.safeParse({
      titulo: 'Falla red',
      tipoId: uuid,
      prioridadId: uuid,
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.descripcion).toBeUndefined()
      expect(result.data.cicloId).toBeUndefined()
      expect(result.data.fechaCreacion).toBeUndefined()
    }
  })

  it('does NOT have solicitanteId in the schema shape', () => {
    expect('solicitanteId' in CreateTicketSchema.shape).toBe(false)
  })

  // T5.1 — PR5 RED: fechaCreacion replaces fechaVencimiento
  it('has fechaCreacion field (not fechaVencimiento)', () => {
    expect('fechaCreacion' in CreateTicketSchema.shape).toBe(true)
    expect('fechaVencimiento' in CreateTicketSchema.shape).toBe(false)
  })

  it('succeeds with valid fechaCreacion (YYYY-MM-DD)', () => {
    const result = CreateTicketSchema.safeParse({
      titulo: 'ok',
      tipoId: uuid,
      prioridadId: uuid,
      fechaCreacion: '2026-01-15',
    })
    expect(result.success).toBe(true)
  })

  it('succeeds with future fechaCreacion (no range restriction)', () => {
    const result = CreateTicketSchema.safeParse({
      titulo: 'ok',
      tipoId: uuid,
      prioridadId: uuid,
      fechaCreacion: '2030-12-31',
    })
    expect(result.success).toBe(true)
  })

  it('fails when fechaCreacion has invalid format', () => {
    const result = CreateTicketSchema.safeParse({
      titulo: 'ok',
      tipoId: uuid,
      prioridadId: uuid,
      fechaCreacion: 'not-a-date',
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      const field = result.error.issues.find((i) => i.path[0] === 'fechaCreacion')
      expect(field).toBeDefined()
    }
  })

  it('succeeds when cicloId is null', () => {
    const result = CreateTicketSchema.safeParse({
      titulo: 'ok',
      tipoId: uuid,
      prioridadId: uuid,
      cicloId: null,
    })
    expect(result.success).toBe(true)
  })
})

// ─── S3/T3.1 — UpdateTicketSchema ────────────────────────────────────────────

describe('UpdateTicketSchema', () => {
  const uuid = 'd0000000-0000-4000-d000-000000000001'

  it('does NOT have tipoId in the schema shape', () => {
    expect('tipoId' in UpdateTicketSchema.shape).toBe(false)
  })

  it('does NOT have estado in the schema shape', () => {
    expect('estado' in UpdateTicketSchema.shape).toBe(false)
  })

  // T5.1 — PR5 RED: fechaVencimiento removed from update schema
  it('does NOT have fechaVencimiento in the schema shape', () => {
    expect('fechaVencimiento' in UpdateTicketSchema.shape).toBe(false)
  })

  it('succeeds with empty object (all fields optional)', () => {
    const result = UpdateTicketSchema.safeParse({})
    expect(result.success).toBe(true)
  })

  it('fails when titulo exceeds 255 characters', () => {
    const result = UpdateTicketSchema.safeParse({ titulo: 'x'.repeat(256) })
    expect(result.success).toBe(false)
    if (!result.success) {
      const field = result.error.issues.find((i) => i.path[0] === 'titulo')
      expect(field).toBeDefined()
    }
  })

  it('fails when prioridadId is not a valid UUID', () => {
    const result = UpdateTicketSchema.safeParse({ titulo: 'ok', prioridadId: 'no-uuid' })
    expect(result.success).toBe(false)
    if (!result.success) {
      const field = result.error.issues.find((i) => i.path[0] === 'prioridadId')
      expect(field).toBeDefined()
    }
  })

  it('succeeds with valid titulo and prioridadId', () => {
    const result = UpdateTicketSchema.safeParse({ titulo: 'ok', prioridadId: uuid })
    expect(result.success).toBe(true)
  })

  it('strips tipoId when passed (Zod default .strip() behavior — backend rejects it in PATCH)', () => {
    // tipoId is NOT part of UpdateTicketSchema; Zod strips unknown keys by default.
    // This prevents accidental tipoId sends to the backend (which returns 422).
    const result = UpdateTicketSchema.safeParse({ tipoId: uuid })
    expect(result.success).toBe(true)
    if (result.success) {
      expect('tipoId' in result.data).toBe(false)
    }
  })
})
