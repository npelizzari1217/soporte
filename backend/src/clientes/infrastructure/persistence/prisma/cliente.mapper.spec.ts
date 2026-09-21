/**
 * cliente.mapper.spec.ts — WU1 T1.7 (sdd/logo-por-cliente).
 *
 * Test OBLIGATORIO de round-trip: `toDomain(toPersistence(clienteConLogo))`
 * debe conservar las 3 columnas de logo. Es el control de seguridad central
 * de esta work unit (design.md D4/H4): `toPersistence()` devuelve un
 * `Omit<PrismaCliente, ...>` — si `toDomain()` no hidrata las 3 columnas de
 * logo, un `PATCH /clientes/:id` de datos comerciales borra el logo en
 * silencio vía el `upsert` de `prisma-cliente.repository.ts` (evidencia del
 * riesgo, read-only).
 *
 * Unit puro: NO toca Postgres. Construye una fila `PrismaCliente` fake y
 * pasa por las dos direcciones del mapper.
 */
import type { Cliente as PrismaCliente } from '.prisma/master';
import { ClienteMapper } from './cliente.mapper';
import { ClienteEntity } from '../../../domain/entities/cliente.entity';

const filaConLogo: PrismaCliente = {
  id: 'cliente-id-1',
  nombre: 'Acme SA',
  razonSocial: null,
  cuit: null,
  dbName: 'acme_sa',
  activo: true,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
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
  logoStorageKey: 'clientes/cliente-id-1/uuid-1',
  logoMimeType: 'image/png',
  logoUpdatedAt: new Date('2026-09-20T12:00:00Z'),
};

describe('ClienteMapper — round-trip del logo (WU1 T1.7)', () => {
  it('toDomain() hidrata las 3 columnas de logo desde la fila Prisma', () => {
    const entidad = ClienteMapper.toDomain(filaConLogo);

    expect(entidad.logoStorageKey).toBe('clientes/cliente-id-1/uuid-1');
    expect(entidad.logoMimeType).toBe('image/png');
    expect(entidad.logoUpdatedAt).toEqual(new Date('2026-09-20T12:00:00Z'));
  });

  it('toPersistence() incluye las 3 columnas de logo', () => {
    const entidad = ClienteMapper.toDomain(filaConLogo);

    const persistido = ClienteMapper.toPersistence(entidad);

    expect(persistido.logoStorageKey).toBe('clientes/cliente-id-1/uuid-1');
    expect(persistido.logoMimeType).toBe('image/png');
    expect(persistido.logoUpdatedAt).toEqual(new Date('2026-09-20T12:00:00Z'));
  });

  it('round-trip completo: toDomain(toPersistence(cliente)) conserva el logo', () => {
    const clienteOriginal = ClienteEntity.reconstitute(
      {
        nombre: 'Acme SA',
        razonSocial: null,
        cuit: null,
        dbName: 'acme_sa',
        activo: true,
        csatHabilitado: false,
        logoStorageKey: 'clientes/cliente-id-1/uuid-1',
        logoMimeType: 'image/png',
        logoUpdatedAt: new Date('2026-09-20T12:00:00Z'),
      },
      'cliente-id-1',
      new Date('2026-01-01T00:00:00Z'),
      new Date('2026-01-01T00:00:00Z'),
      null,
    );

    const persistido = ClienteMapper.toPersistence(clienteOriginal);
    // El round-trip real pasa por Prisma (que sí trae createdAt/updatedAt);
    // acá reconstruimos la fila completa como lo haría una lectura real.
    const filaCompleta: PrismaCliente = {
      ...filaConLogo,
      ...persistido,
      createdAt: clienteOriginal.createdAt,
      updatedAt: clienteOriginal.updatedAt,
    };

    const clienteReconstituido = ClienteMapper.toDomain(filaCompleta);

    expect(clienteReconstituido.logoStorageKey).toBe(clienteOriginal.logoStorageKey);
    expect(clienteReconstituido.logoMimeType).toBe(clienteOriginal.logoMimeType);
    expect(clienteReconstituido.logoUpdatedAt).toEqual(clienteOriginal.logoUpdatedAt);
  });

  it('PATCH de datos comerciales (editar()) no borra el logo tras el round-trip', () => {
    const clienteOriginal = ClienteMapper.toDomain(filaConLogo);

    // Simula un PATCH comercial: solo cambia nombre, nunca toca el logo.
    clienteOriginal.editar({ nombre: 'Acme SRL' });

    const persistido = ClienteMapper.toPersistence(clienteOriginal);
    const filaTrasPatch: PrismaCliente = {
      ...filaConLogo,
      ...persistido,
    };
    const clienteReleido = ClienteMapper.toDomain(filaTrasPatch);

    expect(clienteReleido.nombre).toBe('Acme SRL');
    expect(clienteReleido.logoStorageKey).toBe('clientes/cliente-id-1/uuid-1');
    expect(clienteReleido.logoMimeType).toBe('image/png');
    expect(clienteReleido.logoUpdatedAt).toEqual(new Date('2026-09-20T12:00:00Z'));
  });

  it('sin logo, las 3 columnas viajan como null en ambas direcciones', () => {
    const filaSinLogo: PrismaCliente = {
      ...filaConLogo,
      logoStorageKey: null,
      logoMimeType: null,
      logoUpdatedAt: null,
    };

    const entidad = ClienteMapper.toDomain(filaSinLogo);
    expect(entidad.logoStorageKey).toBeNull();

    const persistido = ClienteMapper.toPersistence(entidad);
    expect(persistido.logoStorageKey).toBeNull();
    expect(persistido.logoMimeType).toBeNull();
    expect(persistido.logoUpdatedAt).toBeNull();
  });
});
