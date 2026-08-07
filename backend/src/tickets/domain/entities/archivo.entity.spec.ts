/**
 * T3.6 [UNIT] — RED→GREEN: ArchivoEntity (metadata de adjuntos).
 *
 * `create()` valida `tamanoBytes > 0` (CHECK de dominio y de DB) y
 * retorna `Result.fail(ArchivoTamanoCeroError)` si viola. El binario
 * NUNCA se persiste acá: solo metadata + `storageKey` (IFileStorage,
 * ADR-7).
 *
 * Ref spec: sdd/tickets-core/spec T20, T21. Ref design: ADR-7. Tarea: T3.6.
 */
import { ArchivoEntity } from './archivo.entity';
import { ArchivoTamanoCeroError } from '../errors/tickets.errors';

function baseProps() {
  return {
    storageKey: 'tickets/ticket-uuid/archivo-uuid',
    nombreOriginal: 'foto-equipo.png',
    mimeType: 'image/png',
    tamanoBytes: BigInt(2048),
    subidoPorId: 'usuario-uuid',
  };
}

describe('ArchivoEntity', () => {
  describe('create()', () => {
    it('crea una instancia con las props dadas y un id UUIDv7 generado', () => {
      const result = ArchivoEntity.create(baseProps());

      expect(result.isOk()).toBe(true);
      const archivo = result.getValue();
      expect(archivo.storageKey).toBe('tickets/ticket-uuid/archivo-uuid');
      expect(archivo.nombreOriginal).toBe('foto-equipo.png');
      expect(archivo.mimeType).toBe('image/png');
      expect(archivo.tamanoBytes).toBe(BigInt(2048));
      expect(archivo.subidoPorId).toBe('usuario-uuid');
      expect(archivo.id).toMatch(/^[0-9a-f-]{36}$/);
    });

    it('falla con ArchivoTamanoCeroError cuando tamanoBytes=0', () => {
      const result = ArchivoEntity.create({ ...baseProps(), tamanoBytes: BigInt(0) });

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(ArchivoTamanoCeroError);
    });

    it('falla con ArchivoTamanoCeroError cuando tamanoBytes es negativo', () => {
      const result = ArchivoEntity.create({ ...baseProps(), tamanoBytes: BigInt(-1) });

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(ArchivoTamanoCeroError);
    });

    it('acepta un id explícito (mapper de infraestructura)', () => {
      const result = ArchivoEntity.create(baseProps(), 'explicit-id-001');
      expect(result.getValue().id).toBe('explicit-id-001');
    });
  });

  describe('reconstitute()', () => {
    it('reconstruye una entidad desde persistencia sin re-validar tamanoBytes', () => {
      const createdAt = new Date('2026-01-01T00:00:00Z');
      const updatedAt = new Date('2026-01-01T00:00:00Z');

      const archivo = ArchivoEntity.reconstitute(
        baseProps(),
        'db-uuid-archivo',
        createdAt,
        updatedAt,
        null,
      );

      expect(archivo.id).toBe('db-uuid-archivo');
      expect(archivo.createdAt).toEqual(createdAt);
      expect(archivo.updatedAt).toEqual(updatedAt);
      expect(archivo.deletedAt).toBeNull();
    });
  });

  describe('softDelete() (heredado de BaseEntity)', () => {
    it('marca el archivo como eliminado lógicamente', () => {
      const archivo = ArchivoEntity.create(baseProps()).getValue();
      archivo.softDelete();
      expect(archivo.isDeleted()).toBe(true);
    });
  });
});
