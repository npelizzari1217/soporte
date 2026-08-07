/**
 * T2.2 [UNIT] — RED→GREEN: TipoTicketMapper.toDomain (fila Prisma → TipoTicketEntity).
 * Tarea: T2.2
 */
import { TipoTicketMapper } from './tipo-ticket.mapper';
import { TipoTicketEntity } from '../../../domain/entities/tipo-ticket.entity';

function makeRow(overrides: Partial<Parameters<typeof TipoTicketMapper.toDomain>[0]> = {}) {
  return {
    id: 'tipo-ticket-uuid-001',
    codigo: 'SOPORTE',
    nombre: 'Soporte',
    activo: true,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-02'),
    deletedAt: null,
    ...overrides,
  };
}

describe('TipoTicketMapper', () => {
  describe('toDomain()', () => {
    it('convierte una fila Prisma en TipoTicketEntity con las props exactas', () => {
      const row = makeRow();

      const entity = TipoTicketMapper.toDomain(row);

      expect(entity).toBeInstanceOf(TipoTicketEntity);
      expect(entity.id).toBe('tipo-ticket-uuid-001');
      expect(entity.codigo).toBe('SOPORTE');
      expect(entity.nombre).toBe('Soporte');
      expect(entity.activo).toBe(true);
    });

    it('convierte un tipo custom dado de baja (deletedAt no-nulo)', () => {
      const deletedAt = new Date('2026-05-01');
      const row = makeRow({ codigo: 'RRHH', nombre: 'Recursos Humanos', deletedAt });

      const entity = TipoTicketMapper.toDomain(row);

      expect(entity.codigo).toBe('RRHH');
      expect(entity.isDeleted()).toBe(true);
    });
  });

  describe('toPersistence() (T11.1, PR11)', () => {
    it('convierte una TipoTicketEntity en el shape plano para Prisma upsert', () => {
      const entity = TipoTicketMapper.toDomain(makeRow());

      const data = TipoTicketMapper.toPersistence(entity);

      expect(data).toEqual({
        id: entity.id,
        codigo: entity.codigo,
        nombre: entity.nombre,
        activo: entity.activo,
        deletedAt: entity.deletedAt,
        createdAt: entity.createdAt,
      });
    });
  });
});
