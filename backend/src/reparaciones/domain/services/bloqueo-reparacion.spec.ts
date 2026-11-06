import { describe, expect, it } from 'vitest';
import { comprasQueBloquean, CompraVinculada } from './bloqueo-reparacion';

/**
 * Matriz de `comprasQueBloquean()` — ÚNICO lugar del sistema donde se decide
 * qué es una reparación bloqueada (design D1). No reimplementa
 * `derivarGrupoEstadoCompra`: cada caso de esta matriz espeja uno de los
 * grupos de `compras/domain/services/estado-compra.ts`, así que si la regla
 * de compras cambia, este archivo lo detecta sin tocarlo.
 *
 * Ref spec: sdd/reparacion-bloqueada-por-compra/spec, capability "Estado de
 * bloqueo derivado". Ref design: contrato `bloqueo-reparacion.ts`.
 */
describe('comprasQueBloquean', () => {
  /** Compra ACTIVA: un ítem pendiente de aprobación, sin cancelar. */
  const compraActiva = (compraId: string, numero: string): CompraVinculada => ({
    compraId,
    numero,
    tipoTicketId: null,
    cancelada: false,
    items: [
      { estadoAprobacion: 'PENDIENTE', comprado: false, entregado: false, esServicio: false },
    ],
  });

  it('una compra activa bloquea', () => {
    const vinculadas = [compraActiva('c1', 'C-0001')];

    const bloqueantes = comprasQueBloquean(vinculadas);

    expect(bloqueantes).toEqual([compraActiva('c1', 'C-0001')]);
  });

  it('una compra cancelada no bloquea', () => {
    const cancelada: CompraVinculada = {
      compraId: 'c1',
      numero: 'C-0001',
      tipoTicketId: null,
      cancelada: true,
      items: [{ estadoAprobacion: 'APROBADO', comprado: true, entregado: true, esServicio: false }],
    };

    expect(comprasQueBloquean([cancelada])).toEqual([]);
  });

  it('una compra con el 100% de sus ítems rechazados no bloquea', () => {
    const rechazada: CompraVinculada = {
      compraId: 'c1',
      numero: 'C-0001',
      tipoTicketId: null,
      cancelada: false,
      items: [
        { estadoAprobacion: 'RECHAZADO', comprado: false, entregado: false, esServicio: false },
      ],
    };

    expect(comprasQueBloquean([rechazada])).toEqual([]);
  });

  it('una compra cuyo único ítem quedó cerrado con faltante no bloquea', () => {
    const cerradaConFaltante: CompraVinculada = {
      compraId: 'c1',
      numero: 'C-0001',
      tipoTicketId: null,
      cancelada: false,
      items: [{ estadoAprobacion: 'APROBADO', comprado: true, entregado: true, esServicio: false }],
    };

    expect(comprasQueBloquean([cerradaConFaltante])).toEqual([]);
  });

  // Caso aceptado explícitamente por producto, NO un bug (tasks WU1.6): una
  // compra vinculada sin ítems cargados bloquea igual, mismo criterio que el
  // listado de compras (`derivarGrupoEstadoCompra` con `items: []` cae en
  // T1/PENDIENTE → grupo ACTIVAS).
  it('una compra sin ítems cargados bloquea igual', () => {
    const sinItems: CompraVinculada = {
      compraId: 'c1',
      numero: 'C-0001',
      tipoTicketId: null,
      cancelada: false,
      items: [],
    };

    expect(comprasQueBloquean([sinItems])).toEqual([sinItems]);
  });

  it('con dos compras vinculadas donde solo una está ACTIVAS, bloquea y devuelve solo esa', () => {
    const activa = compraActiva('c1', 'C-0001');
    const completada: CompraVinculada = {
      compraId: 'c2',
      numero: 'C-0002',
      tipoTicketId: null,
      cancelada: false,
      items: [{ estadoAprobacion: 'APROBADO', comprado: true, entregado: true, esServicio: false }],
    };

    expect(comprasQueBloquean([activa, completada])).toEqual([activa]);
  });

  describe('ítems de servicio (odd/edilicia-obra-externa, S2)', () => {
    const activaCon = (...esServicio: boolean[]): CompraVinculada => ({
      compraId: 'c1',
      numero: 'C-0001',
      tipoTicketId: null,
      cancelada: false,
      items: esServicio.map((servicio) => ({
        estadoAprobacion: 'PENDIENTE' as const,
        comprado: false,
        entregado: false,
        esServicio: servicio,
      })),
    });

    it('una compra activa cuyos ítems son todos de servicio no bloquea', () => {
      expect(comprasQueBloquean([activaCon(true, true)])).toEqual([]);
    });

    it('una compra activa mixta (servicio y bien) sigue bloqueando', () => {
      const mixta = activaCon(true, false);

      expect(comprasQueBloquean([mixta])).toEqual([mixta]);
    });

    it('junto a una compra de bienes activa, solo la de bienes bloquea', () => {
      const servicio = activaCon(true);
      const bienes = { ...activaCon(false), compraId: 'c2', numero: 'C-0002' };

      expect(comprasQueBloquean([servicio, bienes])).toEqual([bienes]);
    });
  });

  describe('bien rechazado junto a servicios (odd/decisiones-obra-externa, S3)', () => {
    type Item = CompraVinculada['items'][number];
    const item = (esServicio: boolean, estadoAprobacion: Item['estadoAprobacion']): Item => ({
      estadoAprobacion,
      comprado: false,
      entregado: false,
      esServicio,
    });
    const activa = (...items: Item[]): CompraVinculada => ({
      compraId: 'c1',
      numero: 'C-0001',
      tipoTicketId: null,
      cancelada: false,
      items,
    });

    it('un bien RECHAZADO junto a servicios no bloquea', () => {
      expect(
        comprasQueBloquean([activa(item(true, 'PENDIENTE'), item(false, 'RECHAZADO'))]),
      ).toEqual([]);
    });

    it('un bien vigente sigue bloqueando aunque haya otro bien RECHAZADO', () => {
      const compra = activa(
        item(true, 'PENDIENTE'),
        item(false, 'RECHAZADO'),
        item(false, 'APROBADO'),
      );

      expect(comprasQueBloquean([compra])).toEqual([compra]);
    });

    it('un servicio RECHAZADO no vuelve de servicio a una compra de bienes', () => {
      const compra = activa(item(true, 'RECHAZADO'), item(false, 'PENDIENTE'));

      expect(comprasQueBloquean([compra])).toEqual([compra]);
    });
  });

  // Test opcional del tasks (WU1.8) — lectura de fuente que confirma que
  // `bloqueo-reparacion.ts` no reimplementa la regla en vez de delegarla.
  it('no reimplementa la regla de estado en su propio cuerpo (lectura de fuente)', async () => {
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    const rutaFuente = path.join(__dirname, 'bloqueo-reparacion.ts');
    const fuente = await fs.readFile(rutaFuente, 'utf-8');

    expect(fuente).not.toContain('estadoAprobacion ===');
    expect(fuente).not.toContain('cantidadEntregada');
  });
});
