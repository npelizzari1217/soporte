import { createHash, randomBytes } from 'node:crypto';

/** Token opaco de 32 bytes (D2). El crudo viaja una sola vez; solo se persiste el hash. */
export const nuevoTokenDispositivo = (): string => randomBytes(32).toString('hex');

export const hashTokenDispositivo = (token: string): string =>
  createHash('sha256').update(token).digest('hex');
