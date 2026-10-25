/**
 * [INTEGRATION] `PrismaHorarioLaboralUsuarioRepository` y `ResolverHorarioLaboralUsuarioService`
 * (odd/tasks/tiempo-tecnico.md, T1, S1-S2) contra una base de inquilino EFÍMERA migrada con
 * `TenantMigrationRunnerAdapter` (mismo patrón que `calendario-laboral.repositorios.integration.spec.ts`).
 *
 * El reemplazo corre dentro de un `PrismaTenantTransactionRunner` REAL; la falla a mitad de camino
 * la provoca Postgres con un trigger temporal que rechaza el día 3, sin mockear el cliente.
 *
 * No toca master: sin `usarLockMasterTest()`. Higiene: desconectar Prisma → dropDatabase.
 */
import { randomBytes } from 'node:crypto';
import { PostgresAdminService } from '../../../../clientes/infrastructure/postgres-admin.service';
import { TenantMigrationRunnerAdapter } from '../../../../clientes/infrastructure/tenant-migration-runner.adapter';
import { PrismaService } from '../../../../shared/infrastructure/persistence/prisma.service';
import { TenantPrismaClient } from '../../../../shared/infrastructure/persistence/prisma-clients';
import { TenantContext, TenantContextData } from '../../../../shared/tenancy/tenant-context';
import { PrismaTenantTransactionRunner } from '../../../../shared/infrastructure/persistence/tenant-transaction-runner';
import { CalendarioLaboralSemanal } from '../../../domain/services/calcular-sla-habil-vence.service';
import { ResolverHorarioLaboralUsuarioService } from '../../../domain/services/resolver-horario-laboral-usuario.service';
import {
  DiaHorarioEntrada,
  HorarioLaboralSemanal,
} from '../../../domain/value-objects/horario-laboral-semanal';
import { PrismaCalendarioLaboralSemanalRepository } from './prisma-calendario-laboral-semanal.repository';
import {
  HorarioLaboralUsuarioSinTenantContextError,
  PrismaHorarioLaboralUsuarioRepository,
} from './prisma-horario-laboral-usuario.repository';

const MASTER_TEST_URL =
  process.env.DATABASE_URL_MASTER ??
  'postgresql://soporte:soporte@localhost:5432/soporte_master_test';

const DB_NAME = `soporte_horario_usuario_${randomBytes(4).toString('hex')}_test`;

const TECNICO_A = '01900000-0000-7000-8000-000000000731';
const TECNICO_B = '01900000-0000-7000-8000-000000000732';
const TECNICO_SIN_HORARIO = '01900000-0000-7000-8000-000000000733';

/** Lunes a viernes de 9 a 18, el seed de `calendario_laboral_dias_cliente`. */
const HORARIO_DEL_CLIENTE: CalendarioLaboralSemanal = [
  { aperturaMinuto: null, cierreMinuto: null },
  { aperturaMinuto: 540, cierreMinuto: 1080 },
  { aperturaMinuto: 540, cierreMinuto: 1080 },
  { aperturaMinuto: 540, cierreMinuto: 1080 },
  { aperturaMinuto: 540, cierreMinuto: 1080 },
  { aperturaMinuto: 540, cierreMinuto: 1080 },
  { aperturaMinuto: null, cierreMinuto: null },
];

function horario(dias: DiaHorarioEntrada[]): HorarioLaboralSemanal {
  return HorarioLaboralSemanal.crear(dias).getValue();
}

/** Lunes a viernes con la misma ventana; sábado y domingo cerrados. */
function deLunesAViernes(aperturaMinuto: number, cierreMinuto: number): HorarioLaboralSemanal {
  return horario(
    [0, 1, 2, 3, 4, 5, 6].map((diaSemana) =>
      diaSemana === 0 || diaSemana === 6
        ? { diaSemana, aperturaMinuto: null, cierreMinuto: null }
        : { diaSemana, aperturaMinuto, cierreMinuto },
    ),
  );
}

describe('PrismaHorarioLaboralUsuarioRepository — Integration (odd/tasks/tiempo-tecnico.md, T1)', () => {
  const admin = new PostgresAdminService(MASTER_TEST_URL);
  const migrationRunner = new TenantMigrationRunnerAdapter(MASTER_TEST_URL);
  const tenantContext = new TenantContext();

  let prismaService: PrismaService;
  let tenantClient: InstanceType<typeof TenantPrismaClient>;
  let ctx: TenantContextData;
  let repo: PrismaHorarioLaboralUsuarioRepository;
  let resolver: ResolverHorarioLaboralUsuarioService;
  let txRunner: PrismaTenantTransactionRunner;

  function conContexto<T>(fn: () => Promise<T>): Promise<T> {
    return tenantContext.run(ctx, fn);
  }

  beforeAll(async () => {
    await admin.createDatabase(DB_NAME);
    await migrationRunner.run(DB_NAME);

    prismaService = new PrismaService(MASTER_TEST_URL);
    tenantClient = prismaService.getTenantClient(DB_NAME);
    ctx = {
      prismaClient: tenantClient,
      dbName: DB_NAME,
      clienteId: 'test-cliente-horario-usuario',
    };
    repo = new PrismaHorarioLaboralUsuarioRepository(tenantContext);
    resolver = new ResolverHorarioLaboralUsuarioService(
      repo,
      new PrismaCalendarioLaboralSemanalRepository(tenantContext),
    );
    txRunner = new PrismaTenantTransactionRunner(tenantContext, { error: () => {} });
  }, 60_000);

  afterAll(async () => {
    await prismaService.onModuleDestroy();
    await admin.dropDatabase(DB_NAME);
  });

  it('un usuario sin horario propio no tiene filas: obtener devuelve null y se resuelve el del cliente', () =>
    conContexto(async () => {
      expect(await repo.obtener(TECNICO_SIN_HORARIO)).toBeNull();
      expect(await resolver.obtenerParaUsuario(TECNICO_SIN_HORARIO)).toEqual({
        calendario: HORARIO_DEL_CLIENTE,
        origen: 'CLIENTE',
      });
    }));

  it('reemplazar guarda las 7 filas del usuario y se resuelve el propio, sin tocar el del cliente', () =>
    conContexto(async () => {
      const propio = deLunesAViernes(480, 960);

      await txRunner.run(() => repo.reemplazar(TECNICO_A, propio));

      expect(await repo.obtener(TECNICO_A)).toEqual(propio.aCalendario());
      expect(
        await tenantClient.horarioLaboralUsuarioDia.count({ where: { usuarioId: TECNICO_A } }),
      ).toBe(7);
      expect(await resolver.obtenerParaUsuario(TECNICO_A)).toEqual({
        calendario: propio.aCalendario(),
        origen: 'USUARIO',
      });
      expect(await resolver.obtenerParaUsuario(TECNICO_SIN_HORARIO)).toEqual({
        calendario: HORARIO_DEL_CLIENTE,
        origen: 'CLIENTE',
      });
    }));

  it('reemplazar otra vez pisa el horario del usuario y no toca el de otro', () =>
    conContexto(async () => {
      const deB = deLunesAViernes(600, 1200);
      await txRunner.run(() => repo.reemplazar(TECNICO_B, deB));
      const nuevoDeA = horario([
        { diaSemana: 0, aperturaMinuto: 600, cierreMinuto: 840 },
        { diaSemana: 1, aperturaMinuto: null, cierreMinuto: null },
        { diaSemana: 2, aperturaMinuto: 0, cierreMinuto: 1440 },
        { diaSemana: 3, aperturaMinuto: null, cierreMinuto: null },
        { diaSemana: 4, aperturaMinuto: null, cierreMinuto: null },
        { diaSemana: 5, aperturaMinuto: null, cierreMinuto: null },
        { diaSemana: 6, aperturaMinuto: 540, cierreMinuto: 780 },
      ]);

      await txRunner.run(() => repo.reemplazar(TECNICO_A, nuevoDeA));

      expect(await repo.obtener(TECNICO_A)).toEqual(nuevoDeA.aCalendario());
      expect(await repo.obtener(TECNICO_B)).toEqual(deB.aCalendario());
      expect(
        await tenantClient.horarioLaboralUsuarioDia.count({ where: { usuarioId: TECNICO_A } }),
      ).toBe(7);
    }));

  it('un fallo a mitad del reemplazo deja el horario anterior entero (rollback real)', () =>
    conContexto(async () => {
      const antes = await repo.obtener(TECNICO_A);
      expect(antes).not.toBeNull();
      // La falla la pone la base, no un mock: un trigger temporal rechaza el día 3, así que los
      // upserts de los días 0 a 2 ya corrieron dentro de la transacción cuando revienta.
      await tenantClient.$executeRawUnsafe(`
        CREATE OR REPLACE FUNCTION fallar_dia_3() RETURNS trigger AS $$
        BEGIN
          RAISE EXCEPTION 'Fallo simulado a mitad del reemplazo';
        END $$ LANGUAGE plpgsql`);
      await tenantClient.$executeRawUnsafe(`
        CREATE TRIGGER fallar_dia_3 BEFORE INSERT OR UPDATE ON horario_laboral_usuario
        FOR EACH ROW WHEN (NEW.dia_semana = 3) EXECUTE FUNCTION fallar_dia_3()`);

      try {
        await expect(
          txRunner.run(() => repo.reemplazar(TECNICO_A, deLunesAViernes(300, 600))),
        ).rejects.toThrow('Fallo simulado a mitad del reemplazo');
      } finally {
        await tenantClient.$executeRawUnsafe(
          `DROP TRIGGER IF EXISTS fallar_dia_3 ON horario_laboral_usuario`,
        );
        await tenantClient.$executeRawUnsafe(`DROP FUNCTION IF EXISTS fallar_dia_3()`);
      }

      expect(await repo.obtener(TECNICO_A)).toEqual(antes);
    }));

  it('con filas incompletas, obtener lanza nombrando al usuario y el día faltante', () =>
    conContexto(async () => {
      await tenantClient.horarioLaboralUsuarioDia.delete({
        where: { usuarioId_diaSemana: { usuarioId: TECNICO_B, diaSemana: 4 } },
      });

      await expect(repo.obtener(TECNICO_B)).rejects.toThrow(
        `falta en horario_laboral_usuario (usuario ${TECNICO_B}) la fila del día de semana 4`,
      );
      await expect(resolver.obtenerParaUsuario(TECNICO_B)).rejects.toThrow('día de semana 4');
    }));

  it('borrar quita el horario del usuario, que vuelve al del cliente, y no toca el de otro', () =>
    conContexto(async () => {
      const deA = await repo.obtener(TECNICO_A);

      await repo.borrar(TECNICO_B);

      expect(await repo.obtener(TECNICO_B)).toBeNull();
      expect(await resolver.obtenerParaUsuario(TECNICO_B)).toEqual({
        calendario: HORARIO_DEL_CLIENTE,
        origen: 'CLIENTE',
      });
      expect(await repo.obtener(TECNICO_A)).toEqual(deA);
    }));

  it('borrar a un usuario sin horario propio no falla ni cambia nada', () =>
    conContexto(async () => {
      const filasAntes = await tenantClient.horarioLaboralUsuarioDia.count();

      await expect(repo.borrar(TECNICO_SIN_HORARIO)).resolves.toBeUndefined();

      expect(await tenantClient.horarioLaboralUsuarioDia.count()).toBe(filasAntes);
    }));

  it('sin TenantContext, las tres operaciones fallan cerrado', async () => {
    // Deliberadamente fuera de `conContexto()`.
    await expect(repo.obtener(TECNICO_A)).rejects.toThrow(
      HorarioLaboralUsuarioSinTenantContextError,
    );
    await expect(repo.reemplazar(TECNICO_A, deLunesAViernes(480, 960))).rejects.toThrow(
      HorarioLaboralUsuarioSinTenantContextError,
    );
    await expect(repo.borrar(TECNICO_A)).rejects.toThrow(
      HorarioLaboralUsuarioSinTenantContextError,
    );
  });
});
