/**
 * local-disk-file-storage.integration.spec.ts — TDD RED phase (T1.4, PR1
 * tickets-core).
 *
 * Integration: filesystem REAL (tmp dir aislado por test run, sin mocks de
 * `fs`). No toca Postgres — LocalDiskFileStorage no depende de la DB.
 *
 * Ref design: ADR-7. Ref tasks: sdd/tickets-core/tasks PR1 T1.4.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { LocalDiskFileStorage } from './local-disk-file-storage';

describe('LocalDiskFileStorage — integration (T1.4)', () => {
  let baseDir: string;
  let storage: LocalDiskFileStorage;

  beforeEach(async () => {
    baseDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'soporte-file-storage-'));
    storage = new LocalDiskFileStorage(baseDir);
  });

  afterEach(async () => {
    await fs.promises.rm(baseDir, { recursive: true, force: true });
  });

  it('upload → read (filesystem real) → el contenido persistido es idéntico al buffer subido', async () => {
    const key = 'tickets/ticket-1/adjunto.pdf';
    const buffer = Buffer.from('contenido-real-del-pdf');

    const storageKey = await storage.upload(key, buffer, 'application/pdf');

    expect(storageKey).toBe(key);
    const persisted = await fs.promises.readFile(path.join(baseDir, key));
    expect(persisted.equals(buffer)).toBe(true);
  });

  it('upload crea subdirectorios anidados que no existían', async () => {
    const key = 'operaciones/op-99/nested/dir/foto.png';
    const buffer = Buffer.from('binario-png');

    await storage.upload(key, buffer, 'image/png');

    const exists = await fs.promises
      .access(path.join(baseDir, key))
      .then(() => true)
      .catch(() => false);
    expect(exists).toBe(true);
  });

  it('delete elimina el archivo subido (round-trip completo)', async () => {
    const key = 'tickets/ticket-2/adjunto.pdf';
    await storage.upload(key, Buffer.from('x'), 'application/pdf');

    await storage.delete(key);

    const exists = await fs.promises
      .access(path.join(baseDir, key))
      .then(() => true)
      .catch(() => false);
    expect(exists).toBe(false);
  });

  it('delete es idempotente contra el filesystem real (no lanza si no existe)', async () => {
    await expect(storage.delete('tickets/no-existe/x.pdf')).resolves.toBeUndefined();
  });
});
