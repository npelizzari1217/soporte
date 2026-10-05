import { describe, it, expect } from 'vitest';
import type { EquipoInformatico as PrismaEquipoInformatico } from '.prisma/tenant';
import { EquipoInformaticoMapper } from './equipo-informatico.mapper';

function fila(over: Partial<PrismaEquipoInformatico> = {}): PrismaEquipoInformatico {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    nombre: 'PC-Caja-3',
    numeroSerie: null,
    marca: null,
    modelo: null,
    fechaAdquisicion: null,
    ubicacion: null,
    modeloEquipoId: null,
    importe: null,
    fechaValoracion: null,
    observaciones: null,
    valorResidual: null,
    fechaValorResidual: null,
    activo: true,
    bajaDestino: null,
    bajaCategoria: null,
    bajaMotivo: null,
    bajaFecha: null,
    bajaUsuarioId: null,
    qrTokenHash: null,
    qrToken: null,
    qrEmitidoAt: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-02T00:00:00Z'),
    deletedAt: null,
    ...over,
  };
}

describe('EquipoInformaticoMapper — datos de baja', () => {
  it('toDomain de un equipo vigente deja los cinco datos en null', () => {
    const equipo = EquipoInformaticoMapper.toDomain(fila());
    expect(equipo.bajaDestino).toBeNull();
    expect(equipo.bajaCategoria).toBeNull();
    expect(equipo.bajaMotivo).toBeNull();
    expect(equipo.bajaFecha).toBeNull();
    expect(equipo.bajaUsuarioId).toBeNull();
  });

  it('ida y vuelta de un equipo dado de baja conserva los cinco datos', () => {
    const original = fila({
      activo: false,
      bajaDestino: 'STOCK_USADO',
      bajaCategoria: 'OTRA',
      bajaMotivo: 'no enciende',
      bajaFecha: new Date('2026-10-01T12:00:00Z'),
      bajaUsuarioId: '22222222-2222-4222-8222-222222222222',
    });

    const equipo = EquipoInformaticoMapper.toDomain(original);
    expect(equipo.activo).toBe(false);
    expect(equipo.bajaDestino).toBe('STOCK_USADO');
    expect(equipo.bajaCategoria).toBe('OTRA');

    // Las columnas `qr_*` no viajan en toPersistence: solo `guardarQr()` las escribe.
    const {
      updatedAt: _updatedAt,
      qrTokenHash: _qrHash,
      qrToken: _qrToken,
      qrEmitidoAt: _qrEmitidoAt,
      ...esperado
    } = original;
    expect(EquipoInformaticoMapper.toPersistence(equipo)).toEqual(esperado);
  });
});
