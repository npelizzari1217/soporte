import { describe, it, expect } from 'vitest';
import {
  CompraAgregarItemProps,
  CompraCreateProps,
  CompraEntity,
  CompraProps,
} from './compra.entity';
import { ItemCompraEntity, ItemCompraProps } from './item-compra.entity';
import { derivarEstadoCompra, CompraParaDerivacion } from '../services/estado-compra';
import {
  CompraCanceladaError,
  CompraConComprasRegistradasError,
  CompraYaCanceladaError,
  CompraYaCerradaError,
  ItemCompraAprobadoNoEliminableError,
  ItemCompraCongeladoError,
  ItemCompraNoEncontradoError,
} from '../errors/compras.errors';

/**
 * PR-8 [UNIT] — RED→GREEN: `CompraEntity`, parte 1/2 (raíz del agregado).
 *
 * Cubre §4.1 (`create()`), §4.2 (ABM de ítems: S4-S7) y la garantía
 * estructural de que `estado`/`comprado`/`cerrado` DELEGAN en
 * `derivarEstadoCompra` (ADR-C1) sin re-derivar la tabla de verdad acá.
 *
 * FUERA de alcance (PR-9, parte 2/2): `cancelar()` y `totalesPorMoneda` —
 * NO se testean en este archivo.
 *
 * Ref spec: sdd/redisenio-modulo-compras/spec §4.1, §4.2, §6. Tarea: PR-8.
 */

function crearPropsValidas(overrides: Partial<CompraCreateProps> = {}): CompraCreateProps {
  return {
    numero: 'COM-2026-00001',
    fechaSolicitud: new Date('2026-01-10'),
    motivo: 'Renovación de equipos de la sucursal norte',
    descripcion: null,
    solicitanteId: 'usuario-1',
    cicloId: 'ciclo-1',
    ...overrides,
  };
}

function datosItemValido(overrides: Partial<CompraAgregarItemProps> = {}): CompraAgregarItemProps {
  return {
    descripcion: 'Notebook Dell Latitude',
    cantidad: 2,
    proveedor: 'Proveedor SA',
    monto: 150000,
    moneda: 'ARS',
    fechaCotizacion: new Date('2026-01-15'),
    observaciones: null,
    ...overrides,
  };
}

/** Construye una `CompraEntity` cancelada vía `reconstitute()` — `cancelar()` es de PR-9, no existe todavía. */
function crearCompraCancelada(items: ItemCompraEntity[] = []): CompraEntity {
  const now = new Date();
  const props: CompraProps = {
    numero: 'COM-2026-00002',
    fechaSolicitud: now,
    motivo: 'Compra cancelada de prueba',
    descripcion: null,
    solicitanteId: 'usuario-1',
    cicloId: 'ciclo-1',
    canceladaEn: now,
    canceladoPorId: 'usuario-2',
    motivoCancelacion: 'Ya no se necesita',
  };
  return CompraEntity.reconstitute(props, items, 'compra-cancelada-1', now, now, null);
}

/** Construye un `ItemCompraEntity` vía `reconstitute()`, para usar como fixture dentro de una `Compra` cancelada. */
function crearItemFixture(overrides: Partial<ItemCompraProps> = {}): ItemCompraEntity {
  const now = new Date();
  const props: ItemCompraProps = {
    compraId: 'compra-cancelada-1',
    descripcion: 'Monitor',
    cantidad: 1,
    proveedor: 'Proveedor SA',
    monto: 50000,
    moneda: 'ARS',
    fechaCotizacion: now,
    observaciones: null,
    estadoAprobacion: 'PENDIENTE',
    decididoPorId: null,
    decididoEn: null,
    cantidadComprada: 0,
    cantidadEntregada: 0,
    cerradoConFaltante: false,
    motivoCierreFaltante: null,
    ...overrides,
  };
  return ItemCompraEntity.reconstitute(props, 'item-fixture-1', now, now, null);
}

describe('CompraEntity', () => {
  describe('create() — §4.1', () => {
    it('S1: nace PENDIENTE (T1, n=0), comprado y cerrado en false, sin cancelar', () => {
      const compra = CompraEntity.create(crearPropsValidas());

      expect(compra.estado).toBe('PENDIENTE');
      expect(compra.comprado).toBe(false);
      expect(compra.cerrado).toBe(false);
      expect(compra.items).toHaveLength(0);
      expect(compra.canceladaEn).toBeNull();
      expect(compra.canceladoPorId).toBeNull();
      expect(compra.motivoCancelacion).toBeNull();
      expect(compra.numero).toBe('COM-2026-00001');
      expect(compra.motivo).toBe('Renovación de equipos de la sucursal norte');
      expect(compra.solicitanteId).toBe('usuario-1');
      expect(compra.cicloId).toBe('ciclo-1');
    });

    it.each([
      ['numero vacío', { numero: '' }],
      ['numero solo espacios', { numero: '   ' }],
      ['motivo vacío', { motivo: '' }],
      ['fechaSolicitud inválida', { fechaSolicitud: new Date('no-es-una-fecha') }],
      ['solicitanteId vacío', { solicitanteId: '' }],
      ['cicloId vacío', { cicloId: '' }],
    ])('rechaza campos inválidos: %s', (_desc, overrides) => {
      expect(() => CompraEntity.create(crearPropsValidas(overrides))).toThrow();
    });
  });

  describe('reconstitute()', () => {
    it('restaura estado completo desde persistencia sin re-validar, incluyendo ítems', () => {
      const now = new Date();
      const item = crearItemFixture();
      const compra = CompraEntity.reconstitute(
        {
          numero: 'COM-2026-00003',
          fechaSolicitud: now,
          motivo: 'Compra reconstituida',
          descripcion: 'con descripción',
          solicitanteId: 'usuario-1',
          cicloId: 'ciclo-1',
          canceladaEn: null,
          canceladoPorId: null,
          motivoCancelacion: null,
        },
        [item],
        'compra-1',
        now,
        now,
        null,
      );

      expect(compra.id).toBe('compra-1');
      expect(compra.items).toHaveLength(1);
      expect(compra.items[0].id).toBe('item-fixture-1');
    });
  });

  describe('agregarItem() — §4.2', () => {
    it('agrega un ítem nuevo PENDIENTE con cantidades en 0', () => {
      const compra = CompraEntity.create(crearPropsValidas());

      const result = compra.agregarItem(datosItemValido());

      expect(result.isOk()).toBe(true);
      expect(compra.items).toHaveLength(1);
      expect(compra.items[0].estadoAprobacion).toBe('PENDIENTE');
      expect(compra.items[0].compraId).toBe(compra.id);
    });

    describe('S4: agregar un ítem a una compra ya decidida devuelve el estado a PENDIENTE', () => {
      it.each([
        ['APROBADO', 'aprobar'],
        ['RECHAZADO', 'rechazar'],
      ] as const)(
        'desde %s (T2, consecuencia intencional del estado 100%% derivado)',
        (estadoEsperado, metodoDecision) => {
          const compra = CompraEntity.create(crearPropsValidas());
          compra.agregarItem(datosItemValido());
          const primerItem = compra.items[0];
          primerItem[metodoDecision]('usuario-1');
          expect(compra.estado).toBe(estadoEsperado);

          const result = compra.agregarItem(
            datosItemValido({ descripcion: 'Ítem nuevo, nace PENDIENTE' }),
          );

          expect(result.isOk()).toBe(true);
          expect(compra.estado).toBe('PENDIENTE');
        },
      );
    });
  });

  describe('editarItem() — §4.2/§4.4', () => {
    it('edita un campo de un ítem PENDIENTE', () => {
      const compra = CompraEntity.create(crearPropsValidas());
      compra.agregarItem(datosItemValido());
      const item = compra.items[0];

      const result = compra.editarItem(item.id, { cantidad: 5 });

      expect(result.isOk()).toBe(true);
      expect(item.cantidad).toBe(5);
    });

    it('propaga ItemCompraCongeladoError si el ítem ya fue decidido (S13, delegado a ItemCompraEntity)', () => {
      const compra = CompraEntity.create(crearPropsValidas());
      compra.agregarItem(datosItemValido());
      const item = compra.items[0];
      item.aprobar('usuario-1');

      const result = compra.editarItem(item.id, { cantidad: 99 });

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(ItemCompraCongeladoError);
    });

    it('falla con ItemCompraNoEncontradoError si el id no corresponde a un ítem activo', () => {
      const compra = CompraEntity.create(crearPropsValidas());

      const result = compra.editarItem('id-inexistente', { cantidad: 5 });

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(ItemCompraNoEncontradoError);
    });
  });

  describe('eliminarItem() — §4.2', () => {
    it('S6: eliminar un ítem PENDIENTE es OK (soft-delete)', () => {
      const compra = CompraEntity.create(crearPropsValidas());
      compra.agregarItem(datosItemValido());
      const item = compra.items[0];

      const result = compra.eliminarItem(item.id);

      expect(result.isOk()).toBe(true);
      expect(item.isDeleted()).toBe(true);
    });

    it('S6: eliminar un ítem RECHAZADO es OK (soft-delete)', () => {
      const compra = CompraEntity.create(crearPropsValidas());
      compra.agregarItem(datosItemValido());
      const item = compra.items[0];
      item.rechazar('usuario-1');

      const result = compra.eliminarItem(item.id);

      expect(result.isOk()).toBe(true);
      expect(item.isDeleted()).toBe(true);
    });

    it('S7: eliminar un ítem APROBADO está PROHIBIDO -> ItemCompraAprobadoNoEliminableError, sin tocar el ítem', () => {
      const compra = CompraEntity.create(crearPropsValidas());
      compra.agregarItem(datosItemValido());
      const item = compra.items[0];
      item.aprobar('usuario-1');

      const result = compra.eliminarItem(item.id);

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(ItemCompraAprobadoNoEliminableError);
      expect(item.isDeleted()).toBe(false);
    });

    it('falla con ItemCompraNoEncontradoError si el id no corresponde a un ítem activo', () => {
      const compra = CompraEntity.create(crearPropsValidas());

      const result = compra.eliminarItem('id-inexistente');

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(ItemCompraNoEncontradoError);
    });

    it('los ítems eliminados NO cuentan para "n" en la derivación de estado (spec §2)', () => {
      const compra = CompraEntity.create(crearPropsValidas());
      compra.agregarItem(datosItemValido({ descripcion: 'Item A' }));
      compra.agregarItem(datosItemValido({ descripcion: 'Item B' }));
      const [itemA, itemB] = compra.items;
      itemA.aprobar('usuario-1');
      // itemB sigue PENDIENTE => estado global PENDIENTE (T2), pese a itemA aprobado.
      expect(compra.estado).toBe('PENDIENTE');

      compra.eliminarItem(itemB.id);

      // Sólo queda itemA activo (n=1, nA=1) => APROBADO (T3).
      expect(compra.estado).toBe('APROBADO');
    });
  });

  describe('S5: ABM de ítems sobre una compra cancelada — CompraCanceladaError, sin mutar', () => {
    it('agregarItem() falla con CompraCanceladaError', () => {
      const compra = crearCompraCancelada();

      const result = compra.agregarItem(datosItemValido());

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(CompraCanceladaError);
      expect(compra.items).toHaveLength(0);
    });

    it('editarItem() falla con CompraCanceladaError', () => {
      const item = crearItemFixture();
      const compra = crearCompraCancelada([item]);

      const result = compra.editarItem(item.id, { cantidad: 99 });

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(CompraCanceladaError);
      expect(item.cantidad).toBe(1);
    });

    it('eliminarItem() falla con CompraCanceladaError', () => {
      const item = crearItemFixture();
      const compra = crearCompraCancelada([item]);

      const result = compra.eliminarItem(item.id);

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(CompraCanceladaError);
      expect(item.isDeleted()).toBe(false);
    });
  });

  describe('estado/.comprado/.cerrado DELEGAN en derivarEstadoCompra — garantía estructural (ADR-C1)', () => {
    it('el getter coincide EXACTAMENTE con la función pura invocada directamente sobre el mismo caso armado a mano', () => {
      const compra = CompraEntity.create(crearPropsValidas());
      compra.agregarItem(
        datosItemValido({ descripcion: 'Aprobado y comprado/entregado completo', cantidad: 3 }),
      );
      compra.agregarItem(datosItemValido({ descripcion: 'Aprobado, sin comprar', cantidad: 5 }));
      compra.agregarItem(datosItemValido({ descripcion: 'Rechazado', cantidad: 1 }));
      const [itemA, itemB, itemC] = compra.items;
      itemA.aprobar('usuario-1');
      itemA.registrarCompra(itemA.cantidad);
      itemA.registrarEntrega(itemA.cantidad);
      itemB.aprobar('usuario-1');
      itemC.rechazar('usuario-1');

      // Caso armado a mano, re-expresado como CompraParaDerivacion (la
      // MISMA forma estructural que consume derivarEstadoCompra) e invocado
      // DIRECTO sobre la función pura — sin pasar por la entidad.
      const estructural: CompraParaDerivacion = {
        cancelada: compra.canceladaEn !== null,
        items: compra.items.map((item) => ({
          estadoAprobacion: item.estadoAprobacion,
          comprado: item.comprado,
          entregado: item.entregado,
        })),
      };
      const esperado = derivarEstadoCompra(estructural);

      expect(compra.estado).toBe(esperado.estado);
      expect(compra.comprado).toBe(esperado.comprado);
      expect(compra.cerrado).toBe(esperado.cerrado);

      // Caso concreto no trivial (evita que ambos lados coincidan por estar
      // ambos rotos de la misma forma): APROBADO_PARCIALMENTE, comprado
      // false porque itemB (aprobado) no se compró.
      expect(compra.estado).toBe('APROBADO_PARCIALMENTE');
      expect(compra.comprado).toBe(false);
      expect(compra.cerrado).toBe(false);
    });

    it('Regla 0: compra cancelada => CANCELADO, comprado y cerrado false, sin importar los ítems', () => {
      const item = crearItemFixture({
        estadoAprobacion: 'APROBADO',
        cantidadComprada: 1,
        cantidadEntregada: 1,
      });
      const compra = crearCompraCancelada([item]);

      expect(compra.estado).toBe('CANCELADO');
      expect(compra.comprado).toBe(false);
      expect(compra.cerrado).toBe(false);
    });
  });

  describe('cancelar() — §4.8 (PR-9, parte 2/2)', () => {
    it('S27: cancela una compra sin compras registradas — OK, setea canceladaEn/canceladoPorId/motivoCancelacion', () => {
      const compra = CompraEntity.create(crearPropsValidas());
      compra.agregarItem(datosItemValido());
      const momento = new Date('2026-02-01');

      const result = compra.cancelar('usuario-2', 'Ya no se necesita', momento);

      expect(result.isOk()).toBe(true);
      expect(compra.canceladaEn).toBe(momento);
      expect(compra.canceladoPorId).toBe('usuario-2');
      expect(compra.motivoCancelacion).toBe('Ya no se necesita');
      expect(compra.estado).toBe('CANCELADO');
    });

    it('S31: cancela una compra SIN ítems (n=0) — PERMITIDO (guarda existencial sobre conjunto vacío no viola, a diferencia de §3)', () => {
      const compra = CompraEntity.create(crearPropsValidas());
      expect(compra.items).toHaveLength(0);

      const result = compra.cancelar('usuario-2', 'No se necesita más', new Date());

      expect(result.isOk()).toBe(true);
      expect(compra.estado).toBe('CANCELADO');
    });

    it('S29: cancelar con algún ítem con cantidadComprada > 0 -> CompraConComprasRegistradasError (el camino correcto es cerrar con faltante)', () => {
      const compra = CompraEntity.create(crearPropsValidas());
      compra.agregarItem(datosItemValido({ cantidad: 5 }));
      const item = compra.items[0];
      item.aprobar('usuario-1');
      item.registrarCompra(2);

      const result = compra.cancelar('usuario-2', 'Motivo cualquiera', new Date());

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(CompraConComprasRegistradasError);
      expect(compra.canceladaEn).toBeNull();
    });

    it('S28: cancelar una compra ya cerrada -> CompraYaCerradaError', () => {
      const compra = CompraEntity.create(crearPropsValidas());
      compra.agregarItem(datosItemValido({ cantidad: 3 }));
      const item = compra.items[0];
      item.aprobar('usuario-1');
      item.registrarCompra(3);
      item.registrarEntrega(3);
      expect(compra.cerrado).toBe(true); // precondición del test

      const result = compra.cancelar('usuario-2', 'Motivo cualquiera', new Date());

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(CompraYaCerradaError);
      expect(compra.canceladaEn).toBeNull();
    });

    it('S30: cancelar una compra ya cancelada -> CompraYaCanceladaError, sin sobrescribir los datos de la primera cancelación', () => {
      const compra = CompraEntity.create(crearPropsValidas());
      const primeraCancelacion = compra.cancelar('usuario-2', 'Primer motivo', new Date());
      expect(primeraCancelacion.isOk()).toBe(true);

      const result = compra.cancelar('usuario-3', 'Segundo intento', new Date());

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(CompraYaCanceladaError);
      expect(compra.canceladoPorId).toBe('usuario-2');
      expect(compra.motivoCancelacion).toBe('Primer motivo');
    });

    it('cancelar sin motivoCancelacion es una precondición de dominio -> throw (ningún error del catálogo de 19 está reservado para esto)', () => {
      const compra = CompraEntity.create(crearPropsValidas());

      expect(() => compra.cancelar('usuario-2', '', new Date())).toThrow();
      expect(() => compra.cancelar('usuario-2', '   ', new Date())).toThrow();
      expect(compra.canceladaEn).toBeNull();
    });

    it('Regla 0 tras cancelar: CANCELADO aunque TODOS los ítems estén APROBADO (sin comprar, T3 sin la cancelación)', () => {
      const compra = CompraEntity.create(crearPropsValidas());
      compra.agregarItem(datosItemValido());
      const item = compra.items[0];
      item.aprobar('usuario-1');
      expect(compra.estado).toBe('APROBADO'); // precondición del test: sin cancelar, T3

      const result = compra.cancelar('usuario-2', 'Motivo cualquiera', new Date());

      expect(result.isOk()).toBe(true);
      expect(compra.estado).toBe('CANCELADO');
    });
  });

  describe('totalesPorMoneda — §7 punto 1 (decisión confirmada por el usuario)', () => {
    it('suma monto × cantidad de TODOS los ítems no eliminados, SIN filtrar por estadoAprobacion', () => {
      const compra = CompraEntity.create(crearPropsValidas());
      compra.agregarItem(datosItemValido({ descripcion: 'Pendiente', monto: 10, cantidad: 1 }));
      compra.agregarItem(datosItemValido({ descripcion: 'Aprobado', monto: 20, cantidad: 1 }));
      compra.agregarItem(datosItemValido({ descripcion: 'Rechazado', monto: 30, cantidad: 1 }));
      const [, aprobado, rechazado] = compra.items;
      aprobado.aprobar('usuario-1');
      rechazado.rechazar('usuario-1');

      expect(compra.totalesPorMoneda).toEqual({ ARS: 60 });
    });

    it('agrupa por moneda cuando hay más de una moneda en la misma compra', () => {
      const compra = CompraEntity.create(crearPropsValidas());
      compra.agregarItem(datosItemValido({ moneda: 'ARS', monto: 100, cantidad: 2 }));
      compra.agregarItem(datosItemValido({ moneda: 'USD', monto: 50, cantidad: 3 }));

      expect(compra.totalesPorMoneda).toEqual({ ARS: 200, USD: 150 });
    });

    it('excluye los ítems eliminados (soft-delete) del total', () => {
      const compra = CompraEntity.create(crearPropsValidas());
      compra.agregarItem(datosItemValido({ monto: 100, cantidad: 1 }));
      const item = compra.items[0];
      compra.eliminarItem(item.id);

      expect(compra.totalesPorMoneda).toEqual({});
    });

    it('aritmética en centésimas (ADR-C3): suma exacta donde la suma en float directo da un resultado distinto (verificado: 0.1+0.1+0.1 !== 0.3)', () => {
      const compra = CompraEntity.create(crearPropsValidas());
      compra.agregarItem(datosItemValido({ monto: 0.1, cantidad: 1 }));
      compra.agregarItem(datosItemValido({ monto: 0.1, cantidad: 1 }));
      compra.agregarItem(datosItemValido({ monto: 0.1, cantidad: 1 }));

      expect(0.1 + 0.1 + 0.1).not.toBe(0.3); // documenta la trampa que este test evita
      expect(compra.totalesPorMoneda.ARS).toBe(0.3);
    });
  });
});
