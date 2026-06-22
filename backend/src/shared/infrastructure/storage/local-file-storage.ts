import * as fs from 'fs';
import * as path from 'path';
import { IFileStorage } from '../../domain/ports/i-file-storage';

/**
 * LocalFileStorage — implementación de IFileStorage para desarrollo y tests.
 *
 * Guarda los archivos en el sistema de archivos local bajo el directorio
 * `uploads/` del proyecto. NO debe usarse en producción.
 *
 * La implementación de producción (S3FileStorage) sigue la misma interfaz
 * y se registra en el módulo de infraestructura para el entorno prod.
 */
export class LocalFileStorage implements IFileStorage {
  private readonly baseDir: string;

  constructor(baseDir?: string) {
    this.baseDir = baseDir ?? path.join(process.cwd(), 'uploads');
  }

  async upload(key: string, buffer: Buffer, _mime: string): Promise<string> {
    // `_mime` is accepted to satisfy IFileStorage interface; local storage
    // does not need it to write the file (the key already carries the extension).
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
      // Idempotente: si el archivo no existe, no lanzamos error
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw err;
      }
    }
  }
}
