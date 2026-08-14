import { describe, it, expect } from 'vitest';
import { ItemCompraEntity, ItemCompraCreateProps } from './item-compra.entity';
import {
  ItemCompraCongeladoError,
  ItemCompraYaDecididoError,
  ItemCompraNoAprobadoError,
  CantidadCompradaExcedeSolicitadaError,
  CantidadCompradaRetrocedeError,
  CantidadEntregadaExcedeCompradaError,
  CantidadEntregadaRetrocedeError,
  ItemCompraYaCerradoError,
  ItemSinFaltanteError,
  MotivoCierreFaltanteRequeridoError,
} from '../errors/compras.errors';

/**
 * PR-6/PR-7 [UNIT] — RED→GREEN: `ItemCompraEntity`.
 *
 * PR-6 (parte 1): `create()` con validación de campos base, `get decidido()`
 * (ADR-C3: APROBADO **y** RECHAZADO), el congelamiento de
 * `cantidad`/`monto`/`moneda` (S13, sobre AMBOS estados decididos) y la
 * decisión por ítem con re-decisión bloqueada y sin mutación (S10).
 *
 * PR-7 (parte 2): `registrarCompra`/`registrarEntrega`/`cerrarConFaltante`,
 * los getters `comprado`/`entregado` (delegan en `itemComprado`/
 * `itemEntregado` de `domain/services/estado-compra.ts`, ADR-C1) y la
 * aritmética en centésimas (ADR-C3) — LA TRAMPA DEL FLOAT es la razón de
 * ser de esta parte.
 *
 * Ref spec: sdd/redisenio-modulo-compras/spec §4.2-§4.7, §6. Tareas: PR-6, PR-7.
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

/** Crea un ítem ya APROBADO — precondición de §4.5/§4.6/§4.7 (S16). */
function crearItemAprobado(overrides: Partial<ItemCompraCreateProps> = {}): ItemCompraEntity {
  const item = ItemCompraEntity.create(crearPropsValidas(overrides));
  item.aprobar('usuario-1');
  return item;
}

describe('ItemCompraEntity', () => {
  describe('create()', () => {
    it('crea un ítem PENDIENTE con cantidades en 0 y sin decisión (S4)', () => {
      const item = ItemCompraEntity.create(crearPropsValidas());

      expect(item.estadoAprobacion).toBe('PENDIENTE');
      expect(item.decidido).toBe(false);
      expect(item.decididoPorId).toBeNull();
      expect(item.decididoEn).toBeNull();
      expect(item.cantidadComprada).toBe(0);
      expect(item.cantidadEntregada).toBe(0);
      expect(item.cerradoConFaltante).toBe(false);
      expect(item.motivoCierreFaltante).toBeNull();
      expect(item.compraId).toBe('compra-1');
      expect(item.descripcion).toBe('Notebook Dell Latitude');
      expect(item.cantidad).toBe(2);
      expect(item.proveedor).toBe('Proveedor SA');
      expect(item.monto).toBe(150000);
      expect(item.moneda).toBe('ARS');
      expect(item.observaciones).toBeNull();
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

    it('acepta monto = 0 (límite válido, CHECK monto >= 0)', () => {
      const item = ItemCompraEntity.create(crearPropsValidas({ monto: 0 }));
      expect(item.monto).toBe(0);
    });
  });

  describe('reconstitute()', () => {
    it('restaura estado completo desde persistencia sin re-validar', () => {
      const now = new Date();
      const item = ItemCompraEntity.reconstitute(
        {
          compraId: 'compra-1',
          descripcion: 'Monitor',
          cantidad: 1,
          proveedor: 'Proveedor SA',
          monto: 50000,
          moneda: 'ARS',
          fechaCotizacion: now,
          observaciones: 'urgente',
          estadoAprobacion: 'APROBADO',
          decididoPorId: 'usuario-1',
          decididoEn: now,
          cantidadComprada: 0,
          cantidadEntregada: 0,
          cerradoConFaltante: false,
          motivoCierreFaltante: null,
        },
        'item-1',
        now,
        now,
        null,
      );

      expect(item.id).toBe('item-1');
      expect(item.estadoAprobacion).toBe('APROBADO');
      expect(item.decidido).toBe(true);
      expect(item.decididoPorId).toBe('usuario-1');
    });
  });

  describe('get decidido() — ADR-C3', () => {
    it('es false en PENDIENTE', () => {
      const item = ItemCompraEntity.create(crearPropsValidas());
      expect(item.decidido).toBe(false);
    });

    it('es true en APROBADO', () => {
      const item = ItemCompraEntity.create(crearPropsValidas());
      item.aprobar('usuario-1');
      expect(item.decidido).toBe(true);
    });

    it('es true en RECHAZADO — el caso que se olvida', () => {
      const item = ItemCompraEntity.create(crearPropsValidas());
      item.rechazar('usuario-1');
      expect(item.decidido).toBe(true);
    });
  });

  describe('decisión por ítem (§4.3)', () => {
    it('aprobar() setea estadoAprobacion, decididoPorId y decididoEn (S8)', () => {
      const item = ItemCompraEntity.create(crearPropsValidas());
      const fecha = new Date('2026-02-01');

      const result = item.aprobar('usuario-1', fecha);

      expect(result.isOk()).toBe(true);
      expect(item.estadoAprobacion).toBe('APROBADO');
      expect(item.decididoPorId).toBe('usuario-1');
      expect(item.decididoEn).toBe(fecha);
    });

    it('rechazar() setea estadoAprobacion, decididoPorId y decididoEn (S9)', () => {
      const item = ItemCompraEntity.create(crearPropsValidas());
      const fecha = new Date('2026-02-01');

      const result = item.rechazar('usuario-1', fecha);

      expect(result.isOk()).toBe(true);
      expect(item.estadoAprobacion).toBe('RECHAZADO');
      expect(item.decididoPorId).toBe('usuario-1');
      expect(item.decididoEn).toBe(fecha);
    });

    it.each([
      ['aprobar -> aprobar', 'aprobar', 'aprobar'],
      ['aprobar -> rechazar', 'aprobar', 'rechazar'],
      ['rechazar -> rechazar', 'rechazar', 'rechazar'],
      ['rechazar -> aprobar', 'rechazar', 'aprobar'],
    ] as const)(
      'S10: re-decidir falla con ItemCompraYaDecididoError Y NO MUTA (%s)',
      (_desc, primera, segunda) => {
        const item = ItemCompraEntity.create(crearPropsValidas());
        const primeraFecha = new Date('2026-02-01');
        item[primera]('usuario-1', primeraFecha);

        const estadoAntes = item.estadoAprobacion;
        const decididoPorIdAntes = item.decididoPorId;
        const decididoEnAntes = item.decididoEn;

        const result = item[segunda]('usuario-2', new Date('2026-03-01'));

        expect(result.isFail()).toBe(true);
        expect(result.getError()).toBeInstanceOf(ItemCompraYaDecididoError);
        // Estado POSTERIOR a la llamada fallida: intacto, no solo el Result.
        expect(item.estadoAprobacion).toBe(estadoAntes);
        expect(item.decididoPorId).toBe(decididoPorIdAntes);
        expect(item.decididoEn).toBe(decididoEnAntes);
      },
    );
  });

  describe('congelamiento (§4.4)', () => {
    it.each([
      ['APROBADO', 'aprobar'],
      ['RECHAZADO', 'rechazar'],
    ] as const)(
      'S13: editar cantidad/monto/moneda en %s falla con ItemCompraCongeladoError SIN mutar',
      (_estadoDesc, metodoDecision) => {
        const item = ItemCompraEntity.create(crearPropsValidas());
        item[metodoDecision]('usuario-1');

        const cantidadAntes = item.cantidad;
        const montoAntes = item.monto;
        const monedaAntes = item.moneda;

        const result = item.actualizar({ cantidad: 99, monto: 999, moneda: 'USD' });

        expect(result.isFail()).toBe(true);
        expect(result.getError()).toBeInstanceOf(ItemCompraCongeladoError);
        expect(item.cantidad).toBe(cantidadAntes);
        expect(item.monto).toBe(montoAntes);
        expect(item.moneda).toBe(monedaAntes);
      },
    );

    it('S13: editar SOLO cantidad en APROBADO también falla (no hace falta tocar los 3 campos)', () => {
      const item = ItemCompraEntity.create(crearPropsValidas());
      item.aprobar('usuario-1');

      const result = item.actualizar({ cantidad: 99 });

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(ItemCompraCongeladoError);
    });

    it('S12: editar cantidad/monto/moneda en PENDIENTE está permitido', () => {
      const item = ItemCompraEntity.create(crearPropsValidas());

      const result = item.actualizar({ cantidad: 5, monto: 200000, moneda: 'USD' });

      expect(result.isOk()).toBe(true);
      expect(item.cantidad).toBe(5);
      expect(item.monto).toBe(200000);
      expect(item.moneda).toBe('USD');
    });

    it('S14: descripcion/proveedor/fechaCotizacion/observaciones siguen editables en APROBADO', () => {
      const item = ItemCompraEntity.create(crearPropsValidas());
      item.aprobar('usuario-1');
      const nuevaFecha = new Date('2026-05-01');

      const result = item.actualizar({
        descripcion: 'Notebook Dell Latitude 5420',
        proveedor: 'Otro Proveedor SRL',
        fechaCotizacion: nuevaFecha,
        observaciones: 'actualizado post-aprobación',
      });

      expect(result.isOk()).toBe(true);
      expect(item.descripcion).toBe('Notebook Dell Latitude 5420');
      expect(item.proveedor).toBe('Otro Proveedor SRL');
      expect(item.fechaCotizacion).toBe(nuevaFecha);
      expect(item.observaciones).toBe('actualizado post-aprobación');
      // Los campos congelados no se tocaron.
      expect(item.estadoAprobacion).toBe('APROBADO');
    });

    it('S14: lo mismo en RECHAZADO — el caso que se olvida', () => {
      const item = ItemCompraEntity.create(crearPropsValidas());
      item.rechazar('usuario-1');

      const result = item.actualizar({ observaciones: 'nota post-rechazo' });

      expect(result.isOk()).toBe(true);
      expect(item.observaciones).toBe('nota post-rechazo');
    });

    it('actualizar() valida el nuevo valor de cantidad/monto/moneda en PENDIENTE (rechaza inválidos)', () => {
      const item = ItemCompraEntity.create(crearPropsValidas());
      expect(() => item.actualizar({ cantidad: -5 })).toThrow();
      expect(() => item.actualizar({ moneda: 'XYZ' })).toThrow();
    });

    it('actualizar() con PATCH semántico: undefined no toca, null limpia observaciones', () => {
      const item = ItemCompraEntity.create(crearPropsValidas({ observaciones: 'inicial' }));

      item.actualizar({ observaciones: null });
      expect(item.observaciones).toBeNull();

      item.actualizar({});
      expect(item.observaciones).toBeNull();
      expect(item.descripcion).toBe('Notebook Dell Latitude'); // no tocado
    });
  });

  // ───────────────────────────────────────────────────────────────────────
  // PR-7 — LA TRAMPA DEL FLOAT (ADR-C3): razón de ser de `enCentesimas`.
  // ───────────────────────────────────────────────────────────────────────
  describe('LA TRAMPA DEL FLOAT — aritmética en centésimas (ADR-C3)', () => {
    it('cantidad=0.3, cantidadComprada=0.1+0.2 (0.30000000000000004) => comprado debe ser true', () => {
      const item = crearItemAprobado({ cantidad: 0.3 });

      const result = item.registrarCompra(0.1 + 0.2);

      expect(result.isOk()).toBe(true);
      expect(item.comprado).toBe(true);
    });

    it('caso real de UNDERSHOOT de float: cantidad=0.1, cantidadComprada=0.7-0.6 (0.09999999999999998 en float directo, MENOR a 0.1) => comprado debe ser true', () => {
      // A diferencia del caso 0.1+0.2 (que por casualidad redondea hacia
      // arriba y ya da `true` incluso comparando floats directos), este
      // caso SÍ falla con `cantidadComprada >= cantidad` en float directo:
      // 0.7-0.6 === 0.09999999999999998 < 0.1. Verificado empíricamente
      // antes de implementar (ver apply-progress-pr7). Es el caso que
      // demuestra la necesidad real de `Math.round(x*100)`.
      const item = crearItemAprobado({ cantidad: 0.1 });

      const result = item.registrarCompra(0.7 - 0.6);

      expect(result.isOk()).toBe(true);
      expect(item.comprado).toBe(true);
    });
  });

  describe('registrarCompra() — §4.5', () => {
    it('S15: compra parcial OK, comprado sigue false', () => {
      const item = crearItemAprobado({ cantidad: 10 });

      const result = item.registrarCompra(4);

      expect(result.isOk()).toBe(true);
      expect(item.cantidadComprada).toBe(4);
      expect(item.comprado).toBe(false);
    });

    it('S16: registrar compra sobre un ítem NO aprobado falla con ItemCompraNoAprobadoError', () => {
      const item = ItemCompraEntity.create(crearPropsValidas());

      const result = item.registrarCompra(1);

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(ItemCompraNoAprobadoError);
      expect(item.cantidadComprada).toBe(0);
    });

    it('S17: comprar más de lo pedido falla con CantidadCompradaExcedeSolicitadaError, sin mutar', () => {
      const item = crearItemAprobado({ cantidad: 5 });

      const result = item.registrarCompra(6);

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(CantidadCompradaExcedeSolicitadaError);
      expect(item.cantidadComprada).toBe(0);
    });

    it('S18: retroceder la cantidad comprada falla con CantidadCompradaRetrocedeError, sin mutar', () => {
      const item = crearItemAprobado({ cantidad: 10 });
      item.registrarCompra(6);

      const result = item.registrarCompra(3);

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(CantidadCompradaRetrocedeError);
      expect(item.cantidadComprada).toBe(6);
    });

    it('registrar la misma cantidad ya registrada NO es retroceso (>=, no >)', () => {
      const item = crearItemAprobado({ cantidad: 10 });
      item.registrarCompra(6);

      const result = item.registrarCompra(6);

      expect(result.isOk()).toBe(true);
      expect(item.cantidadComprada).toBe(6);
    });
  });

  describe('registrarEntrega() — §4.6', () => {
    it('S19: entrega dentro de lo comprado OK', () => {
      const item = crearItemAprobado({ cantidad: 10 });
      item.registrarCompra(8);

      const result = item.registrarEntrega(5);

      expect(result.isOk()).toBe(true);
      expect(item.cantidadEntregada).toBe(5);
    });

    it('S20: entregar más de lo comprado falla con CantidadEntregadaExcedeCompradaError, sin mutar', () => {
      const item = crearItemAprobado({ cantidad: 10 });
      item.registrarCompra(5);

      const result = item.registrarEntrega(6);

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(CantidadEntregadaExcedeCompradaError);
      expect(item.cantidadEntregada).toBe(0);
    });

    it('S21: retroceder la cantidad entregada falla con CantidadEntregadaRetrocedeError, sin mutar', () => {
      const item = crearItemAprobado({ cantidad: 10 });
      item.registrarCompra(8);
      item.registrarEntrega(5);

      const result = item.registrarEntrega(2);

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(CantidadEntregadaRetrocedeError);
      expect(item.cantidadEntregada).toBe(5);
    });
  });

  describe('cerrarConFaltante() — §4.7', () => {
    it('S22: el cierre con faltante marca comprado Y entregado true por la cláusula OR, pese a 5<6', () => {
      const item = crearItemAprobado({ cantidad: 6 });
      item.registrarCompra(5);

      const result = item.cerrarConFaltante('proveedor discontinuó el producto');

      expect(result.isOk()).toBe(true);
      expect(item.cerradoConFaltante).toBe(true);
      expect(item.motivoCierreFaltante).toBe('proveedor discontinuó el producto');
      expect(item.cantidadComprada).toBe(5); // NO se fuerza a la cantidad pedida
      expect(item.comprado).toBe(true);
      expect(item.entregado).toBe(true);
    });

    it.each(['PENDIENTE', 'RECHAZADO'] as const)(
      'C1 (verify-report): cerrar con faltante un ítem %s (no aprobado) falla con ItemCompraNoAprobadoError, sin mutar',
      (estado) => {
        const item = ItemCompraEntity.create(crearPropsValidas({ cantidad: 6 }));
        if (estado === 'RECHAZADO') {
          item.rechazar('usuario-1');
        }

        const result = item.cerrarConFaltante('sin stock');

        expect(result.isFail()).toBe(true);
        expect(result.getError()).toBeInstanceOf(ItemCompraNoAprobadoError);
        expect(item.cerradoConFaltante).toBe(false);
        expect(item.motivoCierreFaltante).toBeNull();
      },
    );

    it('S23: cerrar sin faltante real (cantidadComprada >= cantidad) falla con ItemSinFaltanteError', () => {
      const item = crearItemAprobado({ cantidad: 5 });
      item.registrarCompra(5);

      const result = item.cerrarConFaltante('motivo');

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(ItemSinFaltanteError);
      expect(item.cerradoConFaltante).toBe(false);
    });

    it('S24: cerrar sin motivo falla con MotivoCierreFaltanteRequeridoError', () => {
      const item = crearItemAprobado({ cantidad: 6 });
      item.registrarCompra(5);

      const result = item.cerrarConFaltante('');

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(MotivoCierreFaltanteRequeridoError);
      expect(item.cerradoConFaltante).toBe(false);
    });

    describe('S25: TERMINALIDAD — cerrar con faltante bloquea TODO lo posterior sobre el ítem', () => {
      it('cerrar dos veces falla con ItemCompraYaCerradoError', () => {
        const item = crearItemAprobado({ cantidad: 6 });
        item.registrarCompra(5);
        item.cerrarConFaltante('motivo 1');

        const result = item.cerrarConFaltante('motivo 2');

        expect(result.isFail()).toBe(true);
        expect(result.getError()).toBeInstanceOf(ItemCompraYaCerradoError);
      });

      it('registrar una compra después del cierre falla con ItemCompraYaCerradoError', () => {
        const item = crearItemAprobado({ cantidad: 6 });
        item.registrarCompra(5);
        item.cerrarConFaltante('motivo');

        const result = item.registrarCompra(6);

        expect(result.isFail()).toBe(true);
        expect(result.getError()).toBeInstanceOf(ItemCompraYaCerradoError);
      });

      it('registrar una entrega después del cierre falla con ItemCompraYaCerradoError', () => {
        const item = crearItemAprobado({ cantidad: 6 });
        item.registrarCompra(5);
        item.registrarEntrega(5);
        item.cerrarConFaltante('motivo');

        // Mismo valor ya registrado (5): no excede, no retrocede — sólo el
        // cierre terminal debe bloquear esta llamada.
        const result = item.registrarEntrega(5);

        expect(result.isFail()).toBe(true);
        expect(result.getError()).toBeInstanceOf(ItemCompraYaCerradoError);
      });

      it('C1 (verify-report): terminalidad sigue ganando sobre el guard de aprobación — un ítem ya cerrado y no aprobado (registro heredado vía reconstitute) da ItemCompraYaCerradoError, no ItemCompraNoAprobadoError', () => {
        // No hay forma de llegar a este estado por la API pública después del
        // fix (S25 lo impide justamente en un ítem NO cerrado): se reconstruye
        // directo para probar el ORDEN de los guards frente a un registro ya
        // persistido (p.ej. datos heredados de antes del fix).
        const item = ItemCompraEntity.reconstitute(
          {
            compraId: 'compra-1',
            descripcion: 'Notebook Dell Latitude',
            cantidad: 6,
            proveedor: 'Proveedor SA',
            monto: 150000,
            moneda: 'ARS',
            fechaCotizacion: new Date('2026-01-15'),
            observaciones: null,
            estadoAprobacion: 'PENDIENTE',
            decididoPorId: null,
            decididoEn: null,
            cantidadComprada: 5,
            cantidadEntregada: 0,
            cerradoConFaltante: true,
            motivoCierreFaltante: 'motivo previo',
          },
          'item-1',
          new Date(),
          new Date(),
          null,
        );

        const result = item.cerrarConFaltante('motivo nuevo');

        expect(result.isFail()).toBe(true);
        expect(result.getError()).toBeInstanceOf(ItemCompraYaCerradoError);
      });
    });
  });
});
