import 'reflect-metadata';
import { describe, it, expect } from 'vitest';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  CrearCompraHttpDto,
  AgregarItemCompraHttpDto,
  EditarItemCompraHttpDto,
  RegistrarCompraDeItemHttpDto,
  RegistrarEntregaDeItemHttpDto,
  CerrarItemConFaltanteHttpDto,
  CancelarCompraHttpDto,
  ListarComprasQueryDto,
  toCompraDetalleResponseDto,
} from './compras.dto';
import { CompraEntity } from '../../domain/entities/compra.entity';
import { ItemCompraEntity } from '../../domain/entities/item-compra.entity';

/**
 * compras.dto.spec.ts — RED→GREEN (PR-20, Fase E).
 *
 * ÚNICO objetivo de valor: probar que la validación de `class-validator`
 * RECHAZA exactamente los datos que, sin este DTO, alcanzarían los 10
 * `throw` planos de `ItemCompraEntity`/`CompraEntity` (ver
 * `sdd/redisenio-modulo-compras/riesgo-throws-planos`). Un test que sólo
 * pasa datos válidos no prueba nada — por cada regla, un caso que la viola.
 *
 * No se testean getters/setters ni mappers triviales (política de testing:
 * sólo lógica no obvia) — la ÚNICA excepción es `toCompraDetalleResponseDto`,
 * que filtra ítems soft-deleted (no es un mapeo 1:1 trivial).
 */

const VALIDOS_ITEM = {
  descripcion: 'Notebook Dell Latitude',
  cantidad: 2,
  proveedor: 'Proveedor SA',
  monto: 150000,
  moneda: 'ARS',
  fechaCotizacion: '2026-08-13',
};

describe('CrearCompraHttpDto', () => {
  it('acepta datos válidos sin errores', async () => {
    const dto = plainToInstance(CrearCompraHttpDto, {
      motivo: 'Reposición de notebooks',
      fechaSolicitud: '2026-08-13',
    });
    const errores = await validate(dto);
    expect(errores).toHaveLength(0);
  });

  it.each([
    [
      'motivo vacío (cubre throw plano CompraEntity: motivo obligatorio)',
      { motivo: '', fechaSolicitud: '2026-08-13' },
      'motivo',
    ],
    ['motivo ausente', { fechaSolicitud: '2026-08-13' }, 'motivo'],
    [
      'fechaSolicitud inválida (cubre throw plano CompraEntity: fechaSolicitud inválida)',
      { motivo: 'x', fechaSolicitud: 'no-es-una-fecha' },
      'fechaSolicitud',
    ],
    ['fechaSolicitud ausente', { motivo: 'x' }, 'fechaSolicitud'],
  ])('rechaza: %s', async (_desc, payload, propiedadEsperada) => {
    const dto = plainToInstance(CrearCompraHttpDto, payload);
    const errores = await validate(dto);
    expect(errores.some((e) => e.property === propiedadEsperada)).toBe(true);
  });

  it('S66 (WU-09): acepta sectorId opcional', async () => {
    const dto = plainToInstance(CrearCompraHttpDto, {
      motivo: 'Reposición de notebooks',
      fechaSolicitud: '2026-08-13',
      sectorId: '00000000-0000-4000-8000-000000000001',
    });
    const errores = await validate(dto);
    expect(errores).toHaveLength(0);
  });
});

describe('AgregarItemCompraHttpDto', () => {
  it('acepta datos válidos sin errores', async () => {
    const dto = plainToInstance(AgregarItemCompraHttpDto, VALIDOS_ITEM);
    const errores = await validate(dto);
    expect(errores).toHaveLength(0);
  });

  it.each([
    [
      'cantidad = 0 (cubre throw plano ItemCompraEntity: cantidad debe ser > 0)',
      { ...VALIDOS_ITEM, cantidad: 0 },
      'cantidad',
    ],
    ['cantidad negativa', { ...VALIDOS_ITEM, cantidad: -1 }, 'cantidad'],
    [
      'monto negativo (cubre throw plano ItemCompraEntity: monto no puede ser negativo)',
      { ...VALIDOS_ITEM, monto: -1 },
      'monto',
    ],
    [
      'moneda fuera del set cerrado ARS/USD/EUR (cubre throw plano ItemCompraEntity: moneda inválida)',
      { ...VALIDOS_ITEM, moneda: 'GBP' },
      'moneda',
    ],
    [
      'fechaCotizacion inválida (cubre throw plano ItemCompraEntity: fechaCotizacion inválida)',
      { ...VALIDOS_ITEM, fechaCotizacion: 'no-es-una-fecha' },
      'fechaCotizacion',
    ],
    ['descripcion vacía', { ...VALIDOS_ITEM, descripcion: '' }, 'descripcion'],
    ['proveedor vacío', { ...VALIDOS_ITEM, proveedor: '' }, 'proveedor'],
  ])('rechaza: %s', async (_desc, payload, propiedadEsperada) => {
    const dto = plainToInstance(AgregarItemCompraHttpDto, payload);
    const errores = await validate(dto);
    expect(errores.some((e) => e.property === propiedadEsperada)).toBe(true);
  });
});

describe('EditarItemCompraHttpDto', () => {
  it('acepta un PATCH parcial vacío (todos los campos opcionales)', async () => {
    const dto = plainToInstance(EditarItemCompraHttpDto, {});
    const errores = await validate(dto);
    expect(errores).toHaveLength(0);
  });

  it.each([
    [
      'cantidad = 0 si se provee (cubre throw plano ItemCompraEntity: cantidad debe ser > 0)',
      { cantidad: 0 },
      'cantidad',
    ],
    [
      'monto negativo si se provee (cubre throw plano ItemCompraEntity: monto no puede ser negativo)',
      { monto: -1 },
      'monto',
    ],
    [
      'moneda inválida si se provee (cubre throw plano ItemCompraEntity: moneda inválida)',
      { moneda: 'GBP' },
      'moneda',
    ],
    [
      'fechaCotizacion inválida si se provee (cubre throw plano ItemCompraEntity: fechaCotizacion inválida)',
      { fechaCotizacion: 'no-es-una-fecha' },
      'fechaCotizacion',
    ],
  ])('rechaza: %s', async (_desc, payload, propiedadEsperada) => {
    const dto = plainToInstance(EditarItemCompraHttpDto, payload);
    const errores = await validate(dto);
    expect(errores.some((e) => e.property === propiedadEsperada)).toBe(true);
  });
});

describe('RegistrarCompraDeItemHttpDto', () => {
  it('acepta cantidadComprada válida', async () => {
    const dto = plainToInstance(RegistrarCompraDeItemHttpDto, { cantidadComprada: 1 });
    const errores = await validate(dto);
    expect(errores).toHaveLength(0);
  });

  it('rechaza cantidadComprada negativa', async () => {
    const dto = plainToInstance(RegistrarCompraDeItemHttpDto, { cantidadComprada: -1 });
    const errores = await validate(dto);
    expect(errores.some((e) => e.property === 'cantidadComprada')).toBe(true);
  });
});

describe('RegistrarEntregaDeItemHttpDto', () => {
  it('acepta cantidadEntregada válida', async () => {
    const dto = plainToInstance(RegistrarEntregaDeItemHttpDto, { cantidadEntregada: 1 });
    const errores = await validate(dto);
    expect(errores).toHaveLength(0);
  });

  it('rechaza cantidadEntregada negativa', async () => {
    const dto = plainToInstance(RegistrarEntregaDeItemHttpDto, { cantidadEntregada: -1 });
    const errores = await validate(dto);
    expect(errores.some((e) => e.property === 'cantidadEntregada')).toBe(true);
  });
});

describe('CerrarItemConFaltanteHttpDto', () => {
  it('acepta motivo no vacío', async () => {
    const dto = plainToInstance(CerrarItemConFaltanteHttpDto, {
      motivo: 'Faltó stock del proveedor',
    });
    const errores = await validate(dto);
    expect(errores).toHaveLength(0);
  });

  it('rechaza motivo vacío', async () => {
    const dto = plainToInstance(CerrarItemConFaltanteHttpDto, { motivo: '' });
    const errores = await validate(dto);
    expect(errores.some((e) => e.property === 'motivo')).toBe(true);
  });
});

describe('CancelarCompraHttpDto', () => {
  it('acepta motivo no vacío', async () => {
    const dto = plainToInstance(CancelarCompraHttpDto, { motivo: 'Ya no se necesita' });
    const errores = await validate(dto);
    expect(errores).toHaveLength(0);
  });

  it.each([
    [
      'motivo vacío (cubre throw plano CompraEntity.cancelar: motivoCancelacion obligatorio)',
      { motivo: '' },
    ],
    ['motivo ausente (cubre throw plano CompraEntity.cancelar: motivoCancelacion obligatorio)', {}],
  ])('rechaza: %s', async (_desc, payload) => {
    const dto = plainToInstance(CancelarCompraHttpDto, payload);
    const errores = await validate(dto);
    expect(errores.some((e) => e.property === 'motivo')).toBe(true);
  });
});

describe('ListarComprasQueryDto', () => {
  it('acepta paginación válida (con transform de string a number, como el query real)', async () => {
    const dto = plainToInstance(
      ListarComprasQueryDto,
      { pagina: '2', porPagina: '50' },
      { enableImplicitConversion: false },
    );
    const errores = await validate(dto);
    expect(errores).toHaveLength(0);
  });

  it('rechaza porPagina fuera de rango (> 100)', async () => {
    const dto = plainToInstance(ListarComprasQueryDto, { porPagina: 101 });
    const errores = await validate(dto);
    expect(errores.some((e) => e.property === 'porPagina')).toBe(true);
  });

  it('rechaza pagina < 1', async () => {
    const dto = plainToInstance(ListarComprasQueryDto, { pagina: 0 });
    const errores = await validate(dto);
    expect(errores.some((e) => e.property === 'pagina')).toBe(true);
  });

  // ─── WU-14 (sdd/compras-tres-etapas-y-sectores) — los 5 filtros de negocio ──

  it("WU-14: 'soloEnCurso=false' en la querystring (string) se transforma al boolean false, no truthy", async () => {
    const dto = plainToInstance(ListarComprasQueryDto, { soloEnCurso: 'false' });
    const errores = await validate(dto);
    expect(errores).toHaveLength(0);
    expect(dto.soloEnCurso).toBe(false);
  });

  it("WU-14: 'soloEnCurso=true' en la querystring se transforma al boolean true", async () => {
    const dto = plainToInstance(ListarComprasQueryDto, { soloEnCurso: 'true' });
    const errores = await validate(dto);
    expect(errores).toHaveLength(0);
    expect(dto.soloEnCurso).toBe(true);
  });

  it('WU-14: acepta cicloId/sectorId UUID y fechaDesde/fechaHasta ISO', async () => {
    const dto = plainToInstance(ListarComprasQueryDto, {
      cicloId: '00000000-0000-4000-8000-000000000001',
      sectorId: '00000000-0000-4000-8000-000000000002',
      fechaDesde: '2026-01-01',
      fechaHasta: '2026-12-31',
    });
    const errores = await validate(dto);
    expect(errores).toHaveLength(0);
  });

  it('WU-14: rechaza cicloId que no es UUID', async () => {
    const dto = plainToInstance(ListarComprasQueryDto, { cicloId: 'no-es-uuid' });
    const errores = await validate(dto);
    expect(errores.some((e) => e.property === 'cicloId')).toBe(true);
  });
});

describe('toCompraDetalleResponseDto', () => {
  const now = new Date('2026-01-01T00:00:00.000Z');

  function makeCompraConItems(): CompraEntity {
    const itemActivo = ItemCompraEntity.reconstitute(
      {
        compraId: 'compra-1',
        descripcion: 'Item activo',
        cantidad: 1,
        proveedor: 'Proveedor SA',
        monto: 100,
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
      },
      'item-activo',
      now,
      now,
      null,
    );
    const itemEliminado = ItemCompraEntity.reconstitute(
      {
        compraId: 'compra-1',
        descripcion: 'Item eliminado',
        cantidad: 1,
        proveedor: 'Proveedor SA',
        monto: 100,
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
      },
      'item-eliminado',
      now,
      now,
      now,
    );

    return CompraEntity.reconstitute(
      {
        numero: 'COM-2026-00001',
        fechaSolicitud: now,
        motivo: 'Reposición',
        descripcion: null,
        solicitanteId: 'solicitante-1',
        cicloId: 'ciclo-1',
        canceladaEn: null,
        canceladoPorId: null,
        motivoCancelacion: null,
      },
      [itemActivo, itemEliminado],
      'compra-1',
      now,
      now,
      null,
    );
  }

  it('excluye los ítems soft-deleted del detalle expuesto por HTTP', () => {
    const dto = toCompraDetalleResponseDto(makeCompraConItems());

    expect(dto.items).toHaveLength(1);
    expect(dto.items[0].id).toBe('item-activo');
  });

  it('S67 (WU-09): expone sectorId=null cuando la compra no tiene sector asignado', () => {
    const dto = toCompraDetalleResponseDto(makeCompraConItems());
    expect(dto.sectorId).toBeNull();
  });
});
