/**
 * backfill-preventivo-lectura.integration.spec.ts — WU-1 (sdd/preventivo).
 *
 * Corre la migración `backfill_preventivo_permisos` (idéntica ejecución que
 * `prisma migrate deploy`, vía SQL crudo) sobre un fixture propio de
 * `soporte_master_test` y verifica el resultado celda por celda:
 *
 * - Un TECNICO preexistente (activo, sin las celdas) suma los 4 pares
 *   `PREVENTIVO:*` tras correr la migración.
 * - Un COLABORADOR preexistente NO recibe nada — a diferencia del backfill de
 *   CSAT, este módulo es solo para TECNICO (ADR-PV6).
 * - Un ADMINISTRADOR sigue con matriz vacía (R2, bypasea la grilla) — la
 *   migración NUNCA le agrega una celda.
 * - Un USUARIO sigue sin celdas.
 * - Correr la migración dos veces deja el mismo resultado (idempotencia,
 *   `ON CONFLICT DO NOTHING` sobre la PK compuesta).
 *
 * Precedente directo: `backfill-csat-lectura.integration.spec.ts` (mismo
 * patrón: fixture propio + ejecutar el `migration.sql` real vía SQL crudo).
 *
 * Ref tasks: sdd/preventivo/tasks WU-1.9. Ref design ADR-PV6.
 */
import * as fs from 'fs';
import * as path from 'path';
import { PrismaService } from '../../../../shared/infrastructure/persistence/prisma.service';
import { MasterPrismaClient } from '../../../../shared/infrastructure/persistence/prisma-clients';
import { PrismaClienteRepository } from '../../../../clientes/infrastructure/persistence/prisma/prisma-cliente.repository';
import { PrismaUsuarioRepository } from './prisma-usuario.repository';
import { ClienteEntity } from '../../../../clientes/domain/entities/cliente.entity';
import { UsuarioEntity } from '../../../domain/entities/usuario.entity';
import { usarLockMasterTest } from '../../../../testing/lock-master-test';

const TEST_DB_URL =
  process.env.DATABASE_URL_MASTER ??
  'postgresql://soporte:soporte@localhost:5432/soporte_master_test';

const MIGRATION_FILE = path.resolve(
  __dirname,
  '../../../../../prisma_master/migrations/20260825120100_backfill_preventivo_permisos/migration.sql',
);

// Turno exclusivo sobre la master de test compartida — ver src/testing/lock-master-test.ts.
usarLockMasterTest();

describe('Backfill PREVENTIVO:* (WU-1)', () => {
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
      nombre: 'Cliente backfill PREVENTIVO',
      razonSocial: null,
      cuit: null,
      dbName: 'test_backfill_preventivo',
      activo: true,
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
        email: `backfill-preventivo-${suffix}@integration.test`,
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

  it('TECNICO preexistente suma los 4 pares PREVENTIVO:*', async () => {
    await correrMigracion();
    expect(await celdasDe('tecnico')).toEqual(
      [
        'PREVENTIVO:LECTURA',
        'PREVENTIVO:ALTAS',
        'PREVENTIVO:MODIFICACION',
        'PREVENTIVO:BORRADO',
      ].sort(),
    );
  });

  it('COLABORADOR preexistente NO recibe nada — el módulo es solo para TECNICO (ADR-PV6)', async () => {
    await correrMigracion();
    expect(await celdasDe('colaborador')).toEqual([]);
  });

  it('[CRITICAL] ADMINISTRADOR NO recibe ninguna celda — sigue con matriz vacía (R2)', async () => {
    await correrMigracion();
    expect(await celdasDe('admin')).toEqual([]);
  });

  it('USUARIO NO recibe ninguna celda', async () => {
    await correrMigracion();
    expect(await celdasDe('usuario')).toEqual([]);
  });

  it('[CRITICAL] idempotencia: correr la migración dos veces no duplica ni cambia el resultado', async () => {
    await correrMigracion();
    await correrMigracion();

    expect(await celdasDe('tecnico')).toEqual(
      [
        'PREVENTIVO:LECTURA',
        'PREVENTIVO:ALTAS',
        'PREVENTIVO:MODIFICACION',
        'PREVENTIVO:BORRADO',
      ].sort(),
    );
  });
});
