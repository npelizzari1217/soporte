/**
 * T3.1 [RED] — Unit tests de CicloClienteEntity (admin) — cicloVigenteId.
 *
 * Cubre el link real al catálogo master (ADR-5): create/reconstitute deben
 * exponer cicloVigenteId como getter de dominio.
 */
import { CicloClienteEntity } from './ciclo-cliente.entity';

const fechaInicio = new Date('2026-01-01');
const fechaFin = new Date('2026-12-31');

describe('CicloClienteEntity (admin) — cicloVigenteId (T3.1)', () => {
  it('create({..., cicloVigenteId}) expone el valor via getter', () => {
    const entity = CicloClienteEntity.create({
      nombre: 'Ejercicio 2026',
      fechaInicio,
      fechaFin,
      activo: false,
      cicloVigenteId: 'uuid-x',
    });

    expect(entity.cicloVigenteId).toBe('uuid-x');
  });

  it('reconstitute({..., cicloVigenteId}) expone el valor persistido via getter', () => {
    const id = '01966a6a-0000-7000-8000-000000000003';
    const createdAt = new Date('2026-01-01');
    const updatedAt = new Date('2026-01-02');

    const entity = CicloClienteEntity.reconstitute(
      {
        nombre: 'Ejercicio 2026',
        fechaInicio,
        fechaFin,
        activo: true,
        cicloVigenteId: 'uuid-y',
      },
      id,
      createdAt,
      updatedAt,
      null,
    );

    expect(entity.cicloVigenteId).toBe('uuid-y');
  });
});
