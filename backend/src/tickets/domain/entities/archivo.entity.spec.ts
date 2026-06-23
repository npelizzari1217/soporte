/**
 * 3.A.1 TEST — Unit tests de ArchivoEntity (RED → GREEN con 3.A.2)
 *
 * Cubre:
 * - Validación: tamano_bytes debe ser > 0
 * - Result.fail cuando tamano_bytes <= 0
 * - Herencia de BaseEntity: id UUIDv7, timestamps
 * - Getters de propiedades de metadata del archivo
 */
import { ArchivoEntity, ArchivoProps } from './archivo.entity';

const makeArchivoProps = (overrides: Partial<ArchivoProps> = {}): ArchivoProps => ({
  storageKey: 'uploads/tickets/2026/factura-123.pdf',
  nombreOriginal: 'factura-123.pdf',
  mimeType: 'application/pdf',
  tamanoBytes: BigInt(2 * 1024 * 1024), // 2 MB
  subidoPorId: 'usuario-uuid-1',
  ...overrides,
});

describe('ArchivoEntity', () => {
  describe('Creación válida', () => {
    it('crea un archivo con tamano_bytes > 0 y retorna Result.ok', () => {
      const result = ArchivoEntity.create(makeArchivoProps());
      expect(result.isOk()).toBe(true);
      const archivo = result.getValue();
      expect(archivo.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );
    });

    it('expone los metadatos correctamente', () => {
      const props = makeArchivoProps();
      const archivo = ArchivoEntity.create(props).getValue();
      expect(archivo.storageKey).toBe(props.storageKey);
      expect(archivo.nombreOriginal).toBe(props.nombreOriginal);
      expect(archivo.mimeType).toBe(props.mimeType);
      expect(archivo.tamanoBytes).toBe(props.tamanoBytes);
      expect(archivo.subidoPorId).toBe(props.subidoPorId);
    });

    it('deletedAt es null al crear', () => {
      const archivo = ArchivoEntity.create(makeArchivoProps()).getValue();
      expect(archivo.deletedAt).toBeNull();
      expect(archivo.isDeleted()).toBe(false);
    });

    it('usa el id provisto cuando se da uno explícito', () => {
      const id = '01966a6a-0000-7000-8000-000000000020';
      const archivo = ArchivoEntity.create(makeArchivoProps(), id).getValue();
      expect(archivo.id).toBe(id);
    });
  });

  describe('Validación tamano_bytes', () => {
    it('retorna Result.fail cuando tamano_bytes es 0', () => {
      const result = ArchivoEntity.create(makeArchivoProps({ tamanoBytes: BigInt(0) }));
      expect(result.isOk()).toBe(false);
      expect(result.isFail()).toBe(true);
      expect(result.getError().message).toContain('tamano_bytes');
    });

    it('retorna Result.fail cuando tamano_bytes es negativo', () => {
      const result = ArchivoEntity.create(makeArchivoProps({ tamanoBytes: BigInt(-1) }));
      expect(result.isOk()).toBe(false);
      expect(result.getError().message).toContain('tamano_bytes');
    });

    it('acepta tamano_bytes = 1 (mínimo válido)', () => {
      const result = ArchivoEntity.create(makeArchivoProps({ tamanoBytes: BigInt(1) }));
      expect(result.isOk()).toBe(true);
    });

    it('acepta archivos grandes (tamano en BigInt)', () => {
      const bigSize = BigInt('10737418240'); // 10 GB
      const result = ArchivoEntity.create(makeArchivoProps({ tamanoBytes: bigSize }));
      expect(result.isOk()).toBe(true);
      expect(result.getValue().tamanoBytes).toBe(bigSize);
    });
  });

  describe('reconstitute()', () => {
    it('reconstruye desde DB sin validar tamano_bytes (datos ya validados)', () => {
      const archivo = ArchivoEntity.reconstitute(
        makeArchivoProps({ tamanoBytes: BigInt(1024) }),
        '01966a6a-0000-7000-8000-000000000021',
        new Date('2026-01-01'),
        new Date('2026-01-01'),
        null,
      );
      expect(archivo.id).toBe('01966a6a-0000-7000-8000-000000000021');
      expect(archivo.tamanoBytes).toBe(BigInt(1024));
    });

    it('hidrata deletedAt cuando el archivo fue soft-deleted', () => {
      const deletedAt = new Date('2026-06-01');
      const archivo = ArchivoEntity.reconstitute(
        makeArchivoProps(),
        '01966a6a-0000-7000-8000-000000000022',
        new Date('2026-01-01'),
        new Date('2026-06-01'),
        deletedAt,
      );
      expect(archivo.isDeleted()).toBe(true);
    });
  });
});
