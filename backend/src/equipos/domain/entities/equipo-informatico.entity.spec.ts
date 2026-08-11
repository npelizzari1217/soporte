import { describe, it, expect } from 'vitest';
import { EquipoInformaticoEntity } from './equipo-informatico.entity';

/**
 * T10.1 [U][RED] — EquipoInformaticoEntity: `deactivate()` (activo=false)
 * distinto de `softDelete()` (deletedAt); `actualizar()`. La asignación a
 * personas se eliminó del dominio Equipos — vive solo en `Ticket`.
 *
 * Ref spec: sdd/flujos-especializados/spec F3-Q1. Ref design: ADR-9.
 */
describe('EquipoInformaticoEntity', () => {
  function makeEquipo() {
    return EquipoInformaticoEntity.create({
      nombre: 'Notebook Dell 5420',
      numeroSerie: 'SN-001',
      marca: 'Dell',
      modelo: 'Latitude 5420',
      fechaAdquisicion: new Date('2025-01-01'),
      ubicacion: null,
      importe: null,
      fechaValoracion: null,
      observaciones: null,
      valorResidual: null,
      fechaValorResidual: null,
    });
  }

  it('create() inicializa activo=true y deletedAt=null', () => {
    const equipo = makeEquipo();
    expect(equipo.activo).toBe(true);
    expect(equipo.isDeleted()).toBe(false);
    expect(equipo.nombre).toBe('Notebook Dell 5420');
    expect(equipo.numeroSerie).toBe('SN-001');
  });

  it('deactivate() setea activo=false SIN tocar deletedAt (distinto de softDelete)', () => {
    const equipo = makeEquipo();
    equipo.deactivate();
    expect(equipo.activo).toBe(false);
    expect(equipo.isDeleted()).toBe(false);
  });

  it('softDelete() (heredado de BaseEntity) setea deletedAt SIN tocar activo', () => {
    const equipo = makeEquipo();
    equipo.softDelete();
    expect(equipo.isDeleted()).toBe(true);
    expect(equipo.activo).toBe(true);
  });

  it('actualizar() aplica PATCH semántico (undefined no toca, null limpia)', () => {
    const equipo = makeEquipo();
    equipo.actualizar({ nombre: 'Notebook Dell 5420 (actualizado)', marca: undefined });
    expect(equipo.nombre).toBe('Notebook Dell 5420 (actualizado)');
    expect(equipo.marca).toBe('Dell');

    equipo.actualizar({ ubicacion: 'oficina 1' });
    expect(equipo.ubicacion).toBe('OFICINA 1'); // normalizada a mayúscula (invariante de dominio)
    equipo.actualizar({ ubicacion: null });
    expect(equipo.ubicacion).toBeNull();
  });

  it('create() normaliza ubicacion a mayúscula', () => {
    const equipo = EquipoInformaticoEntity.create({
      nombre: 'Notebook Dell 5420',
      numeroSerie: 'SN-002',
      marca: null,
      modelo: null,
      fechaAdquisicion: null,
      ubicacion: 'oficina 1',
      importe: null,
      fechaValoracion: null,
      observaciones: null,
      valorResidual: null,
      fechaValorResidual: null,
    });
    expect(equipo.ubicacion).toBe('OFICINA 1');
  });

  it('reconstitute() restaura estado desde persistencia', () => {
    const createdAt = new Date('2025-01-01');
    const updatedAt = new Date('2025-02-01');
    const equipo = EquipoInformaticoEntity.reconstitute(
      {
        nombre: 'Equipo reconstituido',
        numeroSerie: null,
        marca: null,
        modelo: null,
        fechaAdquisicion: null,
        ubicacion: null,
        importe: null,
        fechaValoracion: null,
        observaciones: null,
        valorResidual: null,
        fechaValorResidual: null,
        activo: false,
      },
      'id-reconstituido',
      createdAt,
      updatedAt,
      null,
    );
    expect(equipo.id).toBe('id-reconstituido');
    expect(equipo.activo).toBe(false);
    expect(equipo.createdAt).toEqual(createdAt);
  });
});
