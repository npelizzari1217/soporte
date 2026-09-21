/**
 * local-disk-file-storage.spec.ts — TDD RED phase (T1.3, PR1 tickets-core).
 *
 * Unit: mockea `fs.promises` — no toca el filesystem real (eso es T1.4,
 * integration round-trip contra un tmp dir real).
 *
 * Ref design: ADR-7. Ref tasks: sdd/tickets-core/tasks PR1 T1.3.
 */
import * as fs from 'fs';
import * as path from 'path';
import { LocalDiskFileStorage } from './local-disk-file-storage';

vi.mock('fs', () => ({
  promises: {
    mkdir: vi.fn(),
    writeFile: vi.fn(),
    unlink: vi.fn(),
    readFile: vi.fn(),
  },
}));

describe('LocalDiskFileStorage', () => {
  const baseDir = '/var/soporte/storage';
  let storage: LocalDiskFileStorage;

  beforeEach(() => {
    vi.clearAllMocks();
    storage = new LocalDiskFileStorage(baseDir);
  });

  describe('upload()', () => {
    it('crea el directorio destino y escribe el buffer en {baseDir}/{key}', async () => {
      const key = 'tickets/abc-123/adjunto.pdf';
      const buffer = Buffer.from('contenido-fake');

      const result = await storage.upload(key, buffer, 'application/pdf');

      expect(fs.promises.mkdir).toHaveBeenCalledWith(
        expect.stringContaining('tickets'),
        expect.objectContaining({ recursive: true }),
      );
      expect(fs.promises.writeFile).toHaveBeenCalledWith(
        expect.stringContaining(key.split('/').join(path.sep)),
        buffer,
      );
      expect(result).toBe(key);
    });

    it('retorna la storage_key recibida (sin normalizarla)', async () => {
      const key = 'operaciones/op-1/foto.png';
      const result = await storage.upload(key, Buffer.from('x'), 'image/png');

      expect(result).toBe(key);
    });
  });

  describe('retrieve()', () => {
    it('devuelve el Buffer del archivo existente en {baseDir}/{key}', async () => {
      const key = 'clientes/abc-123/logo.png';
      const buffer = Buffer.from('contenido-fake');
      (fs.promises.readFile as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(buffer);

      const result = await storage.retrieve(key);

      expect(fs.promises.readFile).toHaveBeenCalledWith(
        expect.stringContaining(key.split('/').join(path.sep)),
      );
      expect(result).toBe(buffer);
    });

    it('devuelve null si el archivo no existe (ENOENT), sin lanzar', async () => {
      const enoent = Object.assign(new Error('no existe'), { code: 'ENOENT' });
      (fs.promises.readFile as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(enoent);

      await expect(storage.retrieve('clientes/x/logo.png')).resolves.toBeNull();
    });

    it('propaga errores que no sean ENOENT', async () => {
      const boom = Object.assign(new Error('disco lleno'), { code: 'EIO' });
      (fs.promises.readFile as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(boom);

      await expect(storage.retrieve('clientes/x/logo.png')).rejects.toThrow('disco lleno');
    });
  });

  describe('delete()', () => {
    it('elimina el archivo en {baseDir}/{key}', async () => {
      const key = 'tickets/abc-123/adjunto.pdf';

      await storage.delete(key);

      expect(fs.promises.unlink).toHaveBeenCalledWith(
        expect.stringContaining(key.split('/').join(path.sep)),
      );
    });

    it('es idempotente: si el archivo no existe (ENOENT) no lanza', async () => {
      const enoent = Object.assign(new Error('no existe'), { code: 'ENOENT' });
      (fs.promises.unlink as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(enoent);

      await expect(storage.delete('tickets/x/y.pdf')).resolves.toBeUndefined();
    });

    it('propaga errores que no sean ENOENT', async () => {
      const boom = Object.assign(new Error('disco lleno'), { code: 'ENOSPC' });
      (fs.promises.unlink as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(boom);

      await expect(storage.delete('tickets/x/y.pdf')).rejects.toThrow('disco lleno');
    });
  });
});
