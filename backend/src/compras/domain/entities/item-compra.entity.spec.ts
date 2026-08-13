import { describe, it, expect } from 'vitest';
import { ItemCompraEntity, ItemCompraCreateProps } from './item-compra.entity';
import { ItemCompraCongeladoError, ItemCompraYaDecididoError } from '../errors/compras.errors';

/**
 * PR-6 [UNIT] — RED→GREEN: `ItemCompraEntity`, parte 1 de 2.
 *
 * Cubre: `create()` con validación de campos base, `get decidido()`
 * (ADR-C3: APROBADO **y** RECHAZADO), el congelamiento de
 * `cantidad`/`monto`/`moneda` (S13, sobre AMBOS estados decididos) y la
 * decisión por ítem con re-decisión bloqueada y sin mutación (S10).
 *
 * FUERA DE ALCANCE (PR-7): registrar compra/entrega, cierre con faltante,
 * aritmética en centésimas.
 *
 * Ref spec: sdd/redisenio-modulo-compras/spec §4.2-§4.4, §6. Tarea: PR-6.
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
});
