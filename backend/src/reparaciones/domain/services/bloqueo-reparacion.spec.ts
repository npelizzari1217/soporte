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
    cancelada: false,
    items: [{ estadoAprobacion: 'PENDIENTE', comprado: false, entregado: false }],
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
      cancelada: true,
      items: [{ estadoAprobacion: 'APROBADO', comprado: true, entregado: true }],
    };

    expect(comprasQueBloquean([cancelada])).toEqual([]);
  });

  it('una compra con el 100% de sus ítems rechazados no bloquea', () => {
    const rechazada: CompraVinculada = {
      compraId: 'c1',
      numero: 'C-0001',
      cancelada: false,
      items: [{ estadoAprobacion: 'RECHAZADO', comprado: false, entregado: false }],
    };

    expect(comprasQueBloquean([rechazada])).toEqual([]);
  });

  it('una compra cuyo único ítem quedó cerrado con faltante no bloquea', () => {
    const cerradaConFaltante: CompraVinculada = {
      compraId: 'c1',
      numero: 'C-0001',
      cancelada: false,
      items: [{ estadoAprobacion: 'APROBADO', comprado: true, entregado: true }],
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
      cancelada: false,
      items: [{ estadoAprobacion: 'APROBADO', comprado: true, entregado: true }],
    };

    expect(comprasQueBloquean([activa, completada])).toEqual([activa]);
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
