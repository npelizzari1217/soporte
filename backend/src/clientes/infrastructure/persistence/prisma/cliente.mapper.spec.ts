/**
 * ClienteMapper — zonaHoraria (sdd/zona-horaria-por-tenant, WU-2 tarea 2.2).
 *
 * `toPersistence()` DEBE incluir la columna (queda fuera del `Omit`) y
 * `toDomain()` DEBE reconstruirla vía `ZonaHoraria.desdePersistencia` — no un
 * string crudo asignado directo a `ClienteProps.zonaHoraria`, que es del tipo
 * VO (D1, `cliente.entity.ts`).
 */
import { describe, expect, it } from 'vitest';
import type { Cliente as PrismaCliente } from '.prisma/master';
import { ClienteMapper } from './cliente.mapper';
import { ClienteEntity } from '../../../domain/entities/cliente.entity';
import { ZonaHoraria } from '../../../../shared/domain/zona-horaria';

/** Fila Prisma completa — todas las columnas SMTP en NULL (no configurado). */
const ROW_BASE: PrismaCliente = {
  id: 'id-1',
  nombre: 'Acme SA',
  razonSocial: null,
  cuit: null,
  dbName: 'acme_sa',
  activo: true,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-02T00:00:00Z'),
  deletedAt: null,
  smtpHost: null,
  smtpPort: null,
  smtpUser: null,
  smtpSecure: null,
  smtpFrom: null,
  smtpPasswordCifrada: null,
  smtpConfigUpdatedAt: null,
  smtpVerificadoAt: null,
  smtpVerificacionError: null,
  csatHabilitado: false,
  zonaHoraria: 'Europe/Madrid',
};

describe('ClienteMapper — zonaHoraria', () => {
  describe('toDomain()', () => {
    it('reconstruye la zona vía ZonaHoraria.desdePersistencia', () => {
      const entity = ClienteMapper.toDomain(ROW_BASE);

      expect(entity.zonaHoraria).toBeInstanceOf(ZonaHoraria);
      expect(entity.zonaHoraria.valor).toBe('Europe/Madrid');
    });

    it('[CRITICAL] una zona persistida inválida revienta con el mensaje de ZonaHoraria, nombrando el cliente', () => {
      const rowInvalida: PrismaCliente = { ...ROW_BASE, zonaHoraria: 'America/Nunca_Existio' };

      expect(() => ClienteMapper.toDomain(rowInvalida)).toThrow(/id-1/);
    });
  });

  describe('toPersistence()', () => {
    it('incluye zonaHoraria como el string crudo del VO (fuera del Omit)', () => {
      const entity = ClienteEntity.create(
        {
          nombre: 'Acme SA',
          razonSocial: null,
          cuit: null,
          dbName: 'acme_sa',
          activo: true,
          zonaHoraria: ZonaHoraria.crear('Europe/Madrid'),
        },
        'id-1',
      );

      const row = ClienteMapper.toPersistence(entity);

      expect(row.zonaHoraria).toBe('Europe/Madrid');
    });
  });
});
