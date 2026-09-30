import { describe, expect, it } from 'vitest';
import { EventoUnidadInsumoEntity } from './evento-unidad-insumo.entity';
import { TIPOS_EVENTO_UNIDAD } from './unidad-insumo.entity';

describe('EventoUnidadInsumoEntity', () => {
  it('create() resuelve los opcionales ausentes a null y conserva los dados', () => {
    const evento = EventoUnidadInsumoEntity.create({
      unidadId: 'unidad-1',
      tipo: 'INSTALACION',
      usuarioId: 'usuario-1',
      movimientoId: 'mov-1',
      equipoId: 'equipo-1',
      componenteId: 'comp-1',
    });

    expect(evento.unidadId).toBe('unidad-1');
    expect(evento.tipo).toBe('INSTALACION');
    expect(evento.usuarioId).toBe('usuario-1');
    expect(evento.movimientoId).toBe('mov-1');
    expect(evento.equipoId).toBe('equipo-1');
    expect(evento.componenteId).toBe('comp-1');
    expect(evento.serialAnterior).toBeNull();
    expect(evento.serialNuevo).toBeNull();
    expect(evento.motivo).toBeNull();
  });

  it('componenteId es opcional: un evento sin componente lo lleva en null', () => {
    const evento = EventoUnidadInsumoEntity.create({
      unidadId: 'unidad-1',
      tipo: 'INGRESO',
      usuarioId: 'usuario-1',
    });

    expect(evento.componenteId).toBeNull();
  });

  it('acepta cada tipo del catálogo', () => {
    for (const tipo of TIPOS_EVENTO_UNIDAD) {
      const evento = EventoUnidadInsumoEntity.create({
        unidadId: 'unidad-1',
        tipo,
        usuarioId: 'usuario-1',
        motivo: 'motivo',
      });
      expect(evento.tipo).toBe(tipo);
    }
  });

  it('create() respeta el id explícito (la instalación fija el componenteId antes del INSERT)', () => {
    const evento = EventoUnidadInsumoEntity.create(
      { unidadId: 'unidad-1', tipo: 'INGRESO', usuarioId: 'usuario-1' },
      'evento-fijo',
    );

    expect(evento.id).toBe('evento-fijo');
  });

  it('normaliza el motivo: recorta los bordes y un motivo vacío queda null', () => {
    const con = EventoUnidadInsumoEntity.create({
      unidadId: 'u',
      tipo: 'BAJA_DE_DEPOSITO',
      usuarioId: 'x',
      motivo: '  se rompió  ',
    });
    const vacio = EventoUnidadInsumoEntity.create({
      unidadId: 'u',
      tipo: 'INGRESO',
      usuarioId: 'x',
      motivo: '   ',
    });

    expect(con.motivo).toBe('se rompió');
    expect(vacio.motivo).toBeNull();
  });

  it('CORRECCION_SERIAL lleva serial anterior, nuevo y motivo', () => {
    const evento = EventoUnidadInsumoEntity.create({
      unidadId: 'u',
      tipo: 'CORRECCION_SERIAL',
      usuarioId: 'x',
      serialAnterior: 'SN1',
      serialNuevo: 'SN2',
      motivo: 'typo',
    });

    expect(evento.serialAnterior).toBe('SN1');
    expect(evento.serialNuevo).toBe('SN2');
    expect(evento.motivo).toBe('typo');
  });

  it.each([undefined, null, '', '   '])(
    'CORRECCION_SERIAL sin motivo con contenido (%j) lanza',
    (motivo) => {
      expect(() =>
        EventoUnidadInsumoEntity.create({
          unidadId: 'u',
          tipo: 'CORRECCION_SERIAL',
          usuarioId: 'x',
          motivo,
        }),
      ).toThrow(/CORRECCION_SERIAL exige un motivo/);
    },
  );

  it('reconstitute() preserva id y fecha, y espeja updatedAt de createdAt', () => {
    const fecha = new Date('2026-01-01T10:00:00.000Z');

    const evento = EventoUnidadInsumoEntity.reconstitute(
      {
        unidadId: 'u',
        tipo: 'CORRECCION_SERIAL',
        movimientoId: null,
        equipoId: null,
        componenteId: null,
        serialAnterior: 'A',
        serialNuevo: 'B',
        motivo: null,
        usuarioId: 'x',
      },
      'evento-9',
      fecha,
    );

    expect(evento.id).toBe('evento-9');
    expect(evento.createdAt).toEqual(fecha);
    expect(evento.updatedAt).toEqual(fecha);
    expect(evento.isDeleted()).toBe(false);
  });

  it('es append-only: la entidad no expone mutadores de negocio', () => {
    const evento = EventoUnidadInsumoEntity.create({
      unidadId: 'u',
      tipo: 'INGRESO',
      usuarioId: 'x',
    });

    for (const nombre of ['actualizar', 'corregir', 'cambiarTipo', 'setMotivo']) {
      expect(evento).not.toHaveProperty(nombre);
    }
  });
});
