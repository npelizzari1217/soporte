/**
 * backfill-csat-lectura.integration.spec.ts — WU-10.1 (sdd/csat).
 *
 * Corre la migración `backfill_csat_lectura_permiso` (idéntica ejecución que
 * `prisma migrate deploy`, vía SQL crudo) sobre un fixture propio de
 * `soporte_master_test` y verifica el resultado celda por celda:
 *
 * - Un TECNICO y un COLABORADOR preexistentes (activos, sin la celda) SUMAN
 *   `CSAT:LECTURA` tras correr la migración.
 * - Un ADMINISTRADOR sigue con matriz vacía (R2, bypasea la grilla) — la
 *   migración NUNCA le agrega una celda.
 * - Un USUARIO sigue sin la celda — el preset de ese rol no la incluye.
 * - Correr la migración dos veces deja el mismo resultado (idempotencia,
 *   `ON CONFLICT DO NOTHING` sobre la PK compuesta).
 *
 * Precedente directo: `backfill-matriz-permisos.integration.spec.ts` (mismo
 * patrón: fixture propio + ejecutar el `migration.sql` real vía SQL crudo).
 * A diferencia de ese spec, NO necesita una DB efímera con schema
 * reproducido: `roles`/`membresias`/`usuario_cliente_permisos` son tablas
 * vivas en `soporte_master_test` (no las tocó el DROP de
 * `20260817180000_drop_legacy_rbac_tablas_muertas`).
 *
 * Ref tasks: sdd/csat/tasks-wu10 WU10.1. Ref hueco: #2484 punto 1.
 */
import * as fs from 'fs';
import * as path from 'path';
import { PrismaService } from '../../../../shared/infrastructure/persistence/prisma.service';
import { MasterPrismaClient } from '../../../../shared/infrastructure/persistence/prisma-clients';
import { PrismaClienteRepository } from '../../../../clientes/infrastructure/persistence/prisma/prisma-cliente.repository';
import { PrismaUsuarioRepository } from './prisma-usuario.repository';
import { ClienteEntity } from '../../../../clientes/domain/entities/cliente.entity';
import { ZonaHoraria } from '../../../../shared/domain/zona-horaria';
import { UsuarioEntity } from '../../../domain/entities/usuario.entity';
import { usarLockMasterTest } from '../../../../testing/lock-master-test';

const TEST_DB_URL =
  process.env.DATABASE_URL_MASTER ??
  'postgresql://soporte:soporte@localhost:5432/soporte_master_test';

const MIGRATION_FILE = path.resolve(
  __dirname,
  '../../../../../prisma_master/migrations/20260824120000_backfill_csat_lectura_permiso/migration.sql',
);

// Turno exclusivo sobre la master de test compartida — ver src/testing/lock-master-test.ts.
usarLockMasterTest();

describe('Backfill CSAT:LECTURA (WU-10.1)', () => {
  let prismaService: PrismaService;
  let masterClient: InstanceType<typeof MasterPrismaClient>;
  let clienteRepo: PrismaClienteRepository;
  let usuarioRepo: PrismaUsuarioRepository;
  let clienteId: string;
  const usuarioIds: Record<string, string> = {};
  const rolIds: Record<string, string> = {};

  beforeAll(() => {
    prismaService = new PrismaService(TEST_DB_URL);
    masterClient = prismaService.getMasterClient();
    clienteRepo = new PrismaClienteRepository(prismaService);
    usuarioRepo = new PrismaUsuarioRepository(prismaService);
  });

  afterAll(async () => {
    await prismaService.onModuleDestroy();
  });

  beforeEach(async () => {
    await masterClient.$executeRawUnsafe(
      'TRUNCATE TABLE usuario_cliente_permisos, membresias, refresh_tokens, usuarios, clientes, roles RESTART IDENTITY CASCADE',
    );

    const cliente = ClienteEntity.create({
      nombre: 'Cliente backfill CSAT',
      razonSocial: null,
      cuit: null,
      dbName: 'test_backfill_csat',
      activo: true,
      zonaHoraria: ZonaHoraria.crear('America/Argentina/Buenos_Aires'),
    });
    await clienteRepo.save(cliente);
    clienteId = cliente.id;

    for (const codigo of ['ADMINISTRADOR', 'TECNICO', 'COLABORADOR', 'USUARIO']) {
      const rol = await masterClient.role.create({ data: { codigo, nombre: codigo } });
      rolIds[codigo] = rol.id;
    }

    for (const [suffix, rolCodigo] of [
      ['admin', 'ADMINISTRADOR'],
      ['tecnico', 'TECNICO'],
      ['colaborador', 'COLABORADOR'],
      ['usuario', 'USUARIO'],
    ] as const) {
      const usuario = UsuarioEntity.create({
        email: `backfill-csat-${suffix}@integration.test`,
        nombre: 'Test',
        apellido: 'Backfill',
        passwordHash: '$argon2id$v=19$m=19456,t=2,p=1$test$hash',
        activo: true,
        isGlobalAdmin: false,
      });
      await usuarioRepo.save(usuario);
      usuarioIds[suffix] = usuario.id;
      await masterClient.membresia.create({
        data: {
          usuarioId: usuario.id,
          clienteId,
          rolId: rolIds[rolCodigo],
          activo: true,
        },
      });
    }
  });

  async function celdasDe(suffix: string): Promise<string[]> {
    const rows = await masterClient.usuarioClientePermiso.findMany({
      where: { usuarioId: usuarioIds[suffix] },
      select: { modulo: true, accion: true },
    });
    return rows.map((r) => `${r.modulo}:${r.accion}`).sort();
  }

  async function correrMigracion(): Promise<void> {
    const sql = fs.readFileSync(MIGRATION_FILE, 'utf8');
    await masterClient.$executeRawUnsafe(sql);
  }

  it('TECNICO preexistente suma CSAT:LECTURA', async () => {
    await correrMigracion();
    expect(await celdasDe('tecnico')).toContain('CSAT:LECTURA');
  });

  it('COLABORADOR preexistente suma CSAT:LECTURA', async () => {
    await correrMigracion();
    expect(await celdasDe('colaborador')).toContain('CSAT:LECTURA');
  });

  it('[CRITICAL] ADMINISTRADOR NO recibe la celda — sigue con matriz vacía (R2)', async () => {
    await correrMigracion();
    expect(await celdasDe('admin')).toEqual([]);
  });

  it('USUARIO NO recibe la celda — el preset de ese rol no la incluye', async () => {
    await correrMigracion();
    expect(await celdasDe('usuario')).toEqual([]);
  });

  it('[CRITICAL] idempotencia: correr la migración dos veces no duplica ni cambia el resultado', async () => {
    await correrMigracion();
    await correrMigracion();

    expect(await celdasDe('tecnico')).toEqual(['CSAT:LECTURA']);
    expect(await celdasDe('colaborador')).toEqual(['CSAT:LECTURA']);
  });
});
