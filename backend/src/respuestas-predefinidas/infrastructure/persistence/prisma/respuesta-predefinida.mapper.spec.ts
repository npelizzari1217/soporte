import { describe, expect, it } from 'vitest';
import { RespuestaPredefinidaMapper } from './respuesta-predefinida.mapper';
import { RespuestaPredefinidaEntity } from '../../../domain/entities/respuesta-predefinida.entity';

describe('RespuestaPredefinidaMapper', () => {
  it('toDomain() convierte una fila Prisma a entidad', () => {
    const entity = RespuestaPredefinidaMapper.toDomain({
      id: 'id-1',
      titulo: 'Saludo',
      texto: 'Hola',
      activo: false,
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-01-02'),
    });

    expect(entity.id).toBe('id-1');
    expect(entity.titulo).toBe('Saludo');
    expect(entity.activo).toBe(false);
    expect(entity.updatedAt).toEqual(new Date('2026-01-02'));
  });

  it('toPersistence() convierte la entidad a shape Prisma', () => {
    const entity = RespuestaPredefinidaEntity.create(
      { titulo: 'Saludo', texto: 'Hola', activo: true },
      'id-1',
    );

    expect(RespuestaPredefinidaMapper.toPersistence(entity)).toMatchObject({
      id: 'id-1',
      titulo: 'Saludo',
      texto: 'Hola',
      activo: true,
    });
  });
});
