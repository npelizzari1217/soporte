import { describe, it, expect } from 'vitest';
import { TipoComponenteEntity } from './tipo-componente.entity';

/**
 * T10.4 [GREEN] — TipoComponenteEntity: read-only (solo `reconstitute`,
 * sin `create` — catálogo sembrado por el tenant-seeder, PR1).
 *
 * Ref spec: sdd/flujos-especializados/spec F3-Q3. Ref design: "Firmas TS
 * clave" (TipoComponenteEntity read-only).
 */
describe('TipoComponenteEntity', () => {
  it('reconstitute() expone codigo/activo desde persistencia', () => {
    const tipo = TipoComponenteEntity.reconstitute(
      { codigo: 'RAM', nombre: 'Memoria RAM', activo: true },
      'tipo-ram',
      new Date(),
      new Date(),
      null,
    );
    expect(tipo.id).toBe('tipo-ram');
    expect(tipo.codigo).toBe('RAM');
    expect(tipo.nombre).toBe('Memoria RAM');
    expect(tipo.activo).toBe(true);
  });

  it('reconstitute() puede representar un tipo inactivo', () => {
    const tipo = TipoComponenteEntity.reconstitute(
      { codigo: 'CPU', nombre: 'Procesador', activo: false },
      'tipo-cpu',
      new Date(),
      new Date(),
      null,
    );
    expect(tipo.activo).toBe(false);
  });
});
