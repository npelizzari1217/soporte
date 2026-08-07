/**
 * T5.1 (alcance PR5, pull-forward de T10.3) [U] TEST —
 * `ArchivoMapper.toDomain`/`toPersistence` (RED → GREEN).
 *
 * Unit puro: fila Prisma fake (sin DB) → ArchivoEntity, y viceversa.
 *
 * Tarea: alcance PR5 explícito de esta sesión (PrismaArchivoRepository +
 * mapper adelantados desde PR10).
 */
import type { Archivo as PrismaArchivo } from '.prisma/tenant';
import { ArchivoMapper } from './archivo.mapper';
import { ArchivoEntity } from '../../../domain/entities/archivo.entity';

function makeFakeRow(overrides: Partial<PrismaArchivo> = {}): PrismaArchivo {
  return {
    id: '01966a6a-0000-7000-8000-000000000020',
    storageKey: 'tickets/ticket-1/archivo-1',
    nombreOriginal: 'captura.png',
    mimeType: 'image/png',
    tamanoBytes: BigInt(2048),
    subidoPorId: 'usuario-id',
    createdAt: new Date('2026-01-10T10:00:00.000Z'),
    updatedAt: new Date('2026-01-10T10:00:00.000Z'),
    deletedAt: null,
    ...overrides,
  };
}

describe('ArchivoMapper', () => {
  describe('toDomain()', () => {
    it('mapea todos los campos de una fila Prisma a ArchivoEntity', () => {
      const row = makeFakeRow();
      const entity = ArchivoMapper.toDomain(row);

      expect(entity.id).toBe(row.id);
      expect(entity.storageKey).toBe(row.storageKey);
      expect(entity.nombreOriginal).toBe(row.nombreOriginal);
      expect(entity.mimeType).toBe(row.mimeType);
      expect(entity.tamanoBytes).toBe(BigInt(2048));
      expect(entity.subidoPorId).toBe(row.subidoPorId);
      expect(entity.deletedAt).toBeNull();
    });
  });

  describe('toPersistence()', () => {
    it('convierte ArchivoEntity a un objeto plano para INSERT', () => {
      const entity = ArchivoEntity.create(
        {
          storageKey: 'tickets/t1/a1',
          nombreOriginal: 'doc.pdf',
          mimeType: 'application/pdf',
          tamanoBytes: BigInt(1024),
          subidoPorId: 'usuario-id',
        },
        '01966a6a-0000-7000-8000-000000000021',
      ).getOrThrow();

      const data = ArchivoMapper.toPersistence(entity);

      expect(data.id).toBe(entity.id);
      expect(data.storageKey).toBe('tickets/t1/a1');
      expect(data.tamanoBytes).toBe(BigInt(1024));
      expect(data.deletedAt).toBeNull();
    });
  });
});
