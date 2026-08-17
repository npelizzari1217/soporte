import { describe, it, expect } from 'vitest';
import { ItemCompraEntity, ItemCompraCreateProps } from './item-compra.entity';
import {
  ItemCompraCongeladoError,
  ItemCompraYaDecididoError,
  ItemCompraNoAprobadoError,
  CantidadOrdenadaExcedeSolicitadaError,
  CantidadOrdenadaRetrocedeError,
  CantidadRecibidaExcedeOrdenadaError,
  CantidadRecibidaRetrocedeError,
  CantidadEntregadaExcedeRecibidaError,
  CantidadEntregadaRetrocedeError,
  ItemCompraYaCerradoError,
  ItemSinFaltanteError,
  MotivoCierreFaltanteRequeridoError,
  FechaEtapaFuturaError,
  FechaEtapasFueraDeOrdenError,
  EtapaNoRegistradaError,
} from '../errors/compras.errors';
import { hoyArgentina } from '../services/fecha-argentina';

/**
 * PR-6/PR-7 [UNIT] + WU-18/WU-19 [UNIT] — RED→GREEN: `ItemCompraEntity`.
 *
 * PR-6: `create()`, decisión por ítem, congelamiento — SIN CAMBIOS de
 * comportamiento en esta tanda, se mantienen tal cual.
 *
 * WU-18/WU-19 (`compras-tres-etapas-y-sectores`): las tres etapas
 * (`registrarOrden`/`registrarRecepcion`/`registrarEntrega`), sus seis
 * guards (exceso + retroceso × 3), el endurecimiento de `registrarEntrega`
 * (S47, ahora exige aprobado), `editarFechaEtapa`, y `totalItem`.
 *
 * Ref spec: sdd/redisenio-modulo-compras/spec §4.2-§4.4. Ref spec-2:
 * sdd/compras-tres-etapas-y-sectores/spec R1-R6, S42-S58.
 */

function crearPropsValidas(overrides: Partial<ItemCompraCreateProps> = {}): ItemCompraCreateProps {
  return {
    compraId: 'compra-1',
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

/** Crea un ítem ya APROBADO — precondición de las tres etapas (S47). */
function crearItemAprobado(overrides: Partial<ItemCompraCreateProps> = {}): ItemCompraEntity {
  const item = ItemCompraEntity.create(crearPropsValidas(overrides));
  item.aprobar('usuario-1');
  return item;
}

describe('ItemCompraEntity', () => {
  describe('create()', () => {
    it('crea un ítem PENDIENTE con las tres cantidades en 0, las tres fechas null y sin decisión (S4)', () => {
      const item = ItemCompraEntity.create(crearPropsValidas());

      expect(item.estadoAprobacion).toBe('PENDIENTE');
      expect(item.decidido).toBe(false);
      expect(item.decididoPorId).toBeNull();
      expect(item.decididoEn).toBeNull();
      expect(item.cantidadOrdenada).toBe(0);
      expect(item.cantidadRecibida).toBe(0);
      expect(item.cantidadEntregada).toBe(0);
      expect(item.fechaOrden).toBeNull();
      expect(item.fechaRecepcion).toBeNull();
      expect(item.fechaEntrega).toBeNull();
      expect(item.cerradoConFaltante).toBe(false);
      expect(item.motivoCierreFaltante).toBeNull();
      expect(item.compraId).toBe('compra-1');
      expect(item.cantidad).toBe(2);
    });

    it.each([
      ['cantidad = 0', { cantidad: 0 }],
      ['cantidad negativa', { cantidad: -1 }],
      ['monto negativo', { monto: -100 }],
      ['moneda fuera del catálogo', { moneda: 'XYZ' }],
      ['fechaCotizacion inválida', { fechaCotizacion: new Date('no-es-una-fecha') }],
    ])('rechaza campos inválidos: %s', (_desc, overrides) => {
      expect(() => ItemCompraEntity.create(crearPropsValidas(overrides))).toThrow();
    });
  });

  describe('decisión por ítem (§4.3) y congelamiento (§4.4) — sin cambios', () => {
    it('aprobar()/rechazar() con re-decisión bloqueada (S10)', () => {
      const item = ItemCompraEntity.create(crearPropsValidas());
      item.aprobar('usuario-1');

      const result = item.rechazar('usuario-2');

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(ItemCompraYaDecididoError);
      expect(item.estadoAprobacion).toBe('APROBADO');
    });

    it('S13: editar cantidad/monto/moneda en APROBADO falla con ItemCompraCongeladoError', () => {
      const item = crearItemAprobado();

      const result = item.actualizar({ cantidad: 99 });

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(ItemCompraCongeladoError);
    });
  });

  describe('totalItem — WU-20 (R6, ADR-T12)', () => {
    it('S57: coincide con la fórmula de subtotalItemEnCentesimas (monto × cantidad)', () => {
      const item = ItemCompraEntity.create(crearPropsValidas({ monto: 150000.5, cantidad: 3 }));
      expect(item.totalItem).toBe(450001.5);
    });

    it('S58: totalItem NO cambia cuando cambian las cantidades de ejecución', () => {
      const item = crearItemAprobado({ cantidad: 10, monto: 100 });
      const totalAntes = item.totalItem;

      item.registrarOrden(10, new Date('2026-01-16'));
      item.registrarRecepcion(6, new Date('2026-01-17'));
      item.registrarEntrega(6, new Date('2026-01-18'));

      expect(item.totalItem).toBe(totalAntes);
      expect(item.totalItem).toBe(1000);
    });
  });

  describe('registrarOrden() — R1/R2, S42, S45, S46', () => {
    it('S42: ordenar dentro de lo pedido OK', () => {
      const item = crearItemAprobado({ cantidad: 10 });

      const result = item.registrarOrden(10, new Date('2026-01-16'));

      expect(result.isOk()).toBe(true);
      expect(item.cantidadOrdenada).toBe(10);
      expect(item.fechaOrden).toEqual(new Date('2026-01-16'));
    });

    it('S45: ordenar más de lo pedido falla con CantidadOrdenadaExcedeSolicitadaError, sin mutar', () => {
      const item = crearItemAprobado({ cantidad: 5 });

      const result = item.registrarOrden(6, new Date('2026-01-16'));

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(CantidadOrdenadaExcedeSolicitadaError);
      expect(item.cantidadOrdenada).toBe(0);
      expect(item.fechaOrden).toBeNull();
    });

    it('S46: retroceder cantidadOrdenada falla con CantidadOrdenadaRetrocedeError, sin mutar', () => {
      const item = crearItemAprobado({ cantidad: 10 });
      item.registrarOrden(8, new Date('2026-01-16'));

      const result = item.registrarOrden(5, new Date('2026-01-17'));

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(CantidadOrdenadaRetrocedeError);
      expect(item.cantidadOrdenada).toBe(8);
    });

    it('S47: ordenar sobre un ítem NO aprobado falla con ItemCompraNoAprobadoError', () => {
      const item = ItemCompraEntity.create(crearPropsValidas());

      const result = item.registrarOrden(1, new Date('2026-01-16'));

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(ItemCompraNoAprobadoError);
    });
  });

  describe('registrarRecepcion() — R1/R2, S43, S46', () => {
    it('S42: recibir dentro de lo ordenado OK', () => {
      const item = crearItemAprobado({ cantidad: 10 });
      item.registrarOrden(10, new Date('2026-01-16'));

      const result = item.registrarRecepcion(6, new Date('2026-01-17'));

      expect(result.isOk()).toBe(true);
      expect(item.cantidadRecibida).toBe(6);
      expect(item.comprado).toBe(false);
    });

    it('S43: recibir más de lo ordenado falla con CantidadRecibidaExcedeOrdenadaError, sin mutar', () => {
      const item = crearItemAprobado({ cantidad: 10 });
      item.registrarOrden(6, new Date('2026-01-16'));

      const result = item.registrarRecepcion(7, new Date('2026-01-17'));

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(CantidadRecibidaExcedeOrdenadaError);
      expect(item.cantidadRecibida).toBe(0);
    });

    it('S46: retroceder cantidadRecibida falla con CantidadRecibidaRetrocedeError, sin mutar', () => {
      const item = crearItemAprobado({ cantidad: 10 });
      item.registrarOrden(10, new Date('2026-01-16'));
      item.registrarRecepcion(6, new Date('2026-01-17'));

      const result = item.registrarRecepcion(3, new Date('2026-01-18'));

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(CantidadRecibidaRetrocedeError);
      expect(item.cantidadRecibida).toBe(6);
    });
  });

  describe('registrarEntrega() — R1/R2, S44, S46, S47 (endurecimiento real, R-6)', () => {
    it('S42: entregar dentro de lo recibido OK', () => {
      const item = crearItemAprobado({ cantidad: 10 });
      item.registrarOrden(10, new Date('2026-01-16'));
      item.registrarRecepcion(8, new Date('2026-01-17'));

      const result = item.registrarEntrega(5, new Date('2026-01-18'));

      expect(result.isOk()).toBe(true);
      expect(item.cantidadEntregada).toBe(5);
    });

    it('S44: entregar más de lo recibido falla con CantidadEntregadaExcedeRecibidaError, sin mutar', () => {
      const item = crearItemAprobado({ cantidad: 10 });
      item.registrarOrden(10, new Date('2026-01-16'));
      item.registrarRecepcion(5, new Date('2026-01-17'));

      const result = item.registrarEntrega(6, new Date('2026-01-18'));

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(CantidadEntregadaExcedeRecibidaError);
      expect(item.cantidadEntregada).toBe(0);
    });

    it('S46: retroceder cantidadEntregada falla con CantidadEntregadaRetrocedeError, sin mutar', () => {
      const item = crearItemAprobado({ cantidad: 10 });
      item.registrarOrden(10, new Date('2026-01-16'));
      item.registrarRecepcion(8, new Date('2026-01-17'));
      item.registrarEntrega(5, new Date('2026-01-18'));

      const result = item.registrarEntrega(2, new Date('2026-01-19'));

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(CantidadEntregadaRetrocedeError);
      expect(item.cantidadEntregada).toBe(5);
    });

    it('S47 (R-6, endurecimiento real): entregar sobre un ítem NO aprobado falla con ItemCompraNoAprobadoError — ANTES este guard no existía', () => {
      const item = ItemCompraEntity.create(crearPropsValidas());

      const result = item.registrarEntrega(1, new Date('2026-01-18'));

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(ItemCompraNoAprobadoError);
    });
  });

  describe('S48: TERMINALIDAD — cerrado con faltante bloquea las TRES etapas', () => {
    it.each(['registrarOrden', 'registrarRecepcion', 'registrarEntrega'] as const)(
      '%s tras cerrarConFaltante() falla con ItemCompraYaCerradoError',
      (metodo) => {
        const item = crearItemAprobado({ cantidad: 6 });
        item.registrarOrden(6, new Date('2026-01-16'));
        item.registrarRecepcion(5, new Date('2026-01-17'));
        item.cerrarConFaltante('proveedor discontinuó el producto');

        const result = item[metodo](1, new Date('2026-01-20'));

        expect(result.isFail()).toBe(true);
        expect(result.getError()).toBeInstanceOf(ItemCompraYaCerradoError);
      },
    );
  });

  describe('validación de fecha — R5, S53-S56', () => {
    it('S51: sin fecha explícita, prellena con hoy (Argentina)', () => {
      const item = crearItemAprobado({ cantidad: 10 });

      item.registrarOrden(5);

      expect(item.fechaOrden).toEqual(hoyArgentina());
    });

    it('S53: fecha futura se rechaza en cualquier etapa, sin mutar', () => {
      const item = crearItemAprobado({ cantidad: 10 });
      const manana = new Date(hoyArgentina().getTime() + 24 * 60 * 60 * 1000);

      const result = item.registrarOrden(5, manana);

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(FechaEtapaFuturaError);
      expect(item.cantidadOrdenada).toBe(0);
      expect(item.fechaOrden).toBeNull();
    });

    it('S54: cargar recepción con fecha anterior a la de orden se rechaza', () => {
      const item = crearItemAprobado({ cantidad: 10 });
      item.registrarOrden(10, new Date('2026-08-10'));

      const result = item.registrarRecepcion(5, new Date('2026-08-05'));

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(FechaEtapasFueraDeOrdenError);
      expect(item.cantidadRecibida).toBe(0);
      expect(item.fechaRecepcion).toBeNull();
    });

    it('S55: editar fechaOrden a una posterior a fechaRecepcion ya registrada se rechaza, dejando las 3 fechas intactas', () => {
      const item = crearItemAprobado({ cantidad: 10 });
      item.registrarOrden(10, new Date('2026-08-10'));
      item.registrarRecepcion(8, new Date('2026-08-12'));
      item.registrarEntrega(5, new Date('2026-08-15'));

      const result = item.editarFechaEtapa('ORDEN', new Date('2026-08-13'));

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(FechaEtapasFueraDeOrdenError);
      expect(item.fechaOrden).toEqual(new Date('2026-08-10'));
      expect(item.fechaRecepcion).toEqual(new Date('2026-08-12'));
      expect(item.fechaEntrega).toEqual(new Date('2026-08-15'));
    });

    it('S55 (simétrico): editar fechaEntrega a una anterior a fechaRecepcion ya registrada se rechaza', () => {
      const item = crearItemAprobado({ cantidad: 10 });
      item.registrarOrden(10, new Date('2026-08-10'));
      item.registrarRecepcion(8, new Date('2026-08-12'));
      item.registrarEntrega(5, new Date('2026-08-15'));

      const result = item.editarFechaEtapa('ENTREGA', new Date('2026-08-11'));

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(FechaEtapasFueraDeOrdenError);
      expect(item.fechaEntrega).toEqual(new Date('2026-08-15'));
    });

    it('editarFechaEtapa acepta una fecha válida que preserva el orden', () => {
      const item = crearItemAprobado({ cantidad: 10 });
      item.registrarOrden(10, new Date('2026-08-10'));
      item.registrarRecepcion(8, new Date('2026-08-12'));

      const result = item.editarFechaEtapa('RECEPCION', new Date('2026-08-11'));

      expect(result.isOk()).toBe(true);
      expect(item.fechaRecepcion).toEqual(new Date('2026-08-11'));
    });

    it('editarFechaEtapa tras cierre con faltante falla con ItemCompraYaCerradoError', () => {
      const item = crearItemAprobado({ cantidad: 10 });
      item.registrarOrden(10, new Date('2026-08-10'));
      item.registrarRecepcion(5, new Date('2026-08-12'));
      item.cerrarConFaltante('sin stock');

      const result = item.editarFechaEtapa('ORDEN', new Date('2026-08-09'));

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(ItemCompraYaCerradoError);
    });

    // Fix post-verify W3: sin este guard, `editarFechaEtapa` le pone fecha a
    // una etapa que nunca ocurrió (no se puede "fechar" una entrega que
    // nunca se entregó). Las 3 etapas, cada una en su punto MÁS temprano
    // posible de "no registrada todavía".
    it.each([
      ['ORDEN' as const, (item: ItemCompraEntity) => item],
      [
        'RECEPCION' as const,
        (item: ItemCompraEntity) => {
          item.registrarOrden(10, new Date('2026-08-10'));
          return item;
        },
      ],
      [
        'ENTREGA' as const,
        (item: ItemCompraEntity) => {
          item.registrarOrden(10, new Date('2026-08-10'));
          item.registrarRecepcion(8, new Date('2026-08-12'));
          return item;
        },
      ],
    ])(
      'W3: editarFechaEtapa(%s) sobre una etapa NUNCA registrada falla con EtapaNoRegistradaError, sin mutar',
      (etapa, preparar) => {
        const item = preparar(crearItemAprobado({ cantidad: 10 }));

        const result = item.editarFechaEtapa(etapa, new Date('2026-08-13'));

        expect(result.isFail()).toBe(true);
        expect(result.getError()).toBeInstanceOf(EtapaNoRegistradaError);
        expect(item.fechaOrden).toEqual(etapa === 'ORDEN' ? null : new Date('2026-08-10'));
        expect(item.fechaRecepcion).toEqual(
          etapa === 'ORDEN' || etapa === 'RECEPCION' ? null : new Date('2026-08-12'),
        );
        expect(item.fechaEntrega).toBeNull();
      },
    );

    it('W3 (hermano positivo): editarFechaEtapa acepta ENTREGA cuando SÍ fue registrada', () => {
      const item = crearItemAprobado({ cantidad: 10 });
      item.registrarOrden(10, new Date('2026-08-10'));
      item.registrarRecepcion(8, new Date('2026-08-12'));
      item.registrarEntrega(5, new Date('2026-08-14'));

      const result = item.editarFechaEtapa('ENTREGA', new Date('2026-08-13'));

      expect(result.isOk()).toBe(true);
      expect(item.fechaEntrega).toEqual(new Date('2026-08-13'));
    });
  });

  describe('cerrarConFaltante() — §4.7, R3 (cantidadRecibida renombrada)', () => {
    it('S22: el cierre marca comprado Y entregado true por la cláusula OR, pese a 5<6', () => {
      const item = crearItemAprobado({ cantidad: 6 });
      item.registrarOrden(6, new Date('2026-01-16'));
      item.registrarRecepcion(5, new Date('2026-01-17'));

      const result = item.cerrarConFaltante('proveedor discontinuó el producto');

      expect(result.isOk()).toBe(true);
      expect(item.cerradoConFaltante).toBe(true);
      expect(item.cantidadRecibida).toBe(5); // NO se fuerza a la cantidad pedida
      expect(item.comprado).toBe(true);
      expect(item.entregado).toBe(true);
    });

    it('S49 (R3): cerrar con faltante cuando llegó menos de lo pedido, aunque se haya ordenado todo', () => {
      const item = crearItemAprobado({ cantidad: 10 });
      item.registrarOrden(10, new Date('2026-01-16'));
      item.registrarRecepcion(6, new Date('2026-01-17'));

      const result = item.cerrarConFaltante('motivo');

      expect(result.isOk()).toBe(true);
    });

    it('S50 (R3): no hay faltante si lo recibido alcanza lo pedido, aunque falte entregar', () => {
      const item = crearItemAprobado({ cantidad: 10 });
      item.registrarOrden(10, new Date('2026-01-16'));
      item.registrarRecepcion(10, new Date('2026-01-17'));
      item.registrarEntrega(3, new Date('2026-01-18'));

      const result = item.cerrarConFaltante('motivo');

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(ItemSinFaltanteError);
    });

    it('S24: cerrar sin motivo falla con MotivoCierreFaltanteRequeridoError', () => {
      const item = crearItemAprobado({ cantidad: 6 });
      item.registrarOrden(6, new Date('2026-01-16'));
      item.registrarRecepcion(5, new Date('2026-01-17'));

      const result = item.cerrarConFaltante('');

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(MotivoCierreFaltanteRequeridoError);
    });

    it('S25: cerrar dos veces falla con ItemCompraYaCerradoError', () => {
      const item = crearItemAprobado({ cantidad: 6 });
      item.registrarOrden(6, new Date('2026-01-16'));
      item.registrarRecepcion(5, new Date('2026-01-17'));
      item.cerrarConFaltante('motivo 1');

      const result = item.cerrarConFaltante('motivo 2');

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(ItemCompraYaCerradoError);
    });
  });
});
