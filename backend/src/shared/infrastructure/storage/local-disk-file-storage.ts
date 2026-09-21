import * as fs from 'fs';
import * as path from 'path';
import { IFileStorage } from '../../domain/ports/i-file-storage';

/**
 * LocalDiskFileStorage — implementación de IFileStorage sobre el filesystem
 * del server (beta/dev, sin dependencia de un bucket externo).
 *
 * Guarda el binario bajo `{baseDir}/{key}` (storage key determinística,
 * ADR-7: `tickets/{ticketId}/{archivoId}` u `operaciones/{opId}/{archivoId}`,
 * generada por el use case consumidor). `baseDir` es configurable vía
 * `STORAGE_DIR` (default `./storage`) — ver shared.module.ts.
 *
 * Ref design: ADR-7. Ref tasks: sdd/tickets-core/tasks PR1 T1.3/T1.4.
 */
export class LocalDiskFileStorage implements IFileStorage {
  constructor(private readonly baseDir: string = path.join(process.cwd(), 'storage')) {}

  async upload(key: string, buffer: Buffer, _mime: string): Promise<string> {
    // `_mime` se acepta para cumplir IFileStorage; el almacenamiento en disco
    // no lo necesita para escribir el archivo (la validación de mime whitelist
    // ocurre en la capa interface, PR10 — T21).
    const fullPath = path.join(this.baseDir, key);
    const dir = path.dirname(fullPath);

    await fs.promises.mkdir(dir, { recursive: true });
    await fs.promises.writeFile(fullPath, buffer);

    return key;
  }

  async delete(key: string): Promise<void> {
    const fullPath = path.join(this.baseDir, key);

    try {
      await fs.promises.unlink(fullPath);
    } catch (err: unknown) {
      // Idempotente: si el archivo no existe, no lanzamos error.
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw err;
      }
    }
  }

  async retrieve(key: string): Promise<Buffer | null> {
    const fullPath = path.join(this.baseDir, key);

    try {
      return await fs.promises.readFile(fullPath);
    } catch (err: unknown) {
      // Simétrico con delete(): archivo ausente no es un error observable.
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        return null;
      }
      throw err;
    }
  }
}
