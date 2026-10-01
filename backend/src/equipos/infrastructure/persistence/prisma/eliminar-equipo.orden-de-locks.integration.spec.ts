/**
 * [INTEGRATION] Testigo T5 (WU-3, baja-equipo-completo, ADR-2 y R13): el borrado de un equipo
 * toma el lock LE (`FOR NO KEY UPDATE`) ANTES de contar las piezas activas.
 *
 * Patrón determinista (sin carreras de dos clientes): un cliente externo toma LE `FOR SHARE` (lo
 * que toma toda alta de componente) e inserta un componente SIN commit. El `DELETE` queda
 * bloqueado detrás de él (`pg_blocking_pids`, espera acotada). Tras el COMMIT del externo, el
 * borrado relee los componentes ya con el nuevo y responde `EquipoConComponentesActivosError`:
 * si contara antes de tomar el lock, vería 0 piezas y borraría el equipo.
 */
import { randomBytes } from 'node:crypto';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaService } from '../../../../shared/infrastructure/persistence/prisma.service';
import { TenantContext } from '../../../../shared/tenancy/tenant-context';
import { TenantPrismaClient } from '../../../../shared/infrastructure/persistence/prisma-clients';
import { PrismaTenantTransactionRunner } from '../../../../shared/infrastructure/persistence/tenant-transaction-runner';
import { PrismaEquipoInformaticoRepository } from './prisma-equipo-informatico.repository';
import { PrismaComponenteEquipoRepository } from './prisma-componente-equipo.repository';
import { EliminarEquipoUseCase } from '../../../application/use-cases/eliminar-equipo.use-case';
import { EquipoConComponentesActivosError } from '../../../domain/errors/equipos.errors';

const MASTER_TEST_URL =
  process.env.DATABASE_URL_MASTER ??
  'postgresql://soporte:soporte@localhost:5432/soporte_master_test';
const TENANT_TEST_DB_NAME = 'soporte_tenant_test';
const ESPERA_MAXIMA_MS = 5_000;
const PASO_MS = 25;

describe('EliminarEquipoUseCase — orden de locks, testigo T5 (WU-3, ADR-2)', () => {
  let prismaServiceParaUrl: PrismaService;
  let pool: Pool;
  let tenantClient: InstanceType<typeof TenantPrismaClient>;
  let tenantContext: TenantContext;
  let useCase: EliminarEquipoUseCase;

  const PREFIJO = `T5E_${randomBytes(2).toString('hex')}_`;
  let equipoId: string;
  let insumoId: string;

  beforeAll(async () => {
    prismaServiceParaUrl = new PrismaService(MASTER_TEST_URL);
    pool = new Pool({
      connectionString: prismaServiceParaUrl.buildTenantUrl(TENANT_TEST_DB_NAME),
      max: 8,
    });
    tenantClient = new TenantPrismaClient({ adapter: new PrismaPg(pool) });
    tenantContext = new TenantContext();
    useCase = new EliminarEquipoUseCase(
      new PrismaEquipoInformaticoRepository(tenantContext),
      new PrismaComponenteEquipoRepository(tenantContext),
      new PrismaTenantTransactionRunner(tenantContext, { error: () => {} }),
    );

    const familia = await tenantClient.familiaInsumo.create({
      data: { codigo: `${PREFIJO}F`, nombre: 'Familia T5 borrado', esRepuesto: true },
    });
    const unidadMedida = await tenantClient.unidadMedida.create({
      data: { codigo: `${PREFIJO}U`, nombre: 'Entera T5 borrado', entera: true },
    });
    insumoId = (
      await tenantClient.insumo.create({
        data: {
          codigo: `${PREFIJO}I`,
          nombre: 'Repuesto T5 borrado',
          familiaId: familia.id,
          unidadMedidaId: unidadMedida.id,
        },
      })
    ).id;
    equipoId = (
      await tenantClient.equipoInformatico.create({ data: { nombre: `${PREFIJO}Equipo` } })
    ).id;
  }, 30_000);

  afterAll(async () => {
    await tenantClient.componenteEquipo.deleteMany({ where: { equipoId } });
    await tenantClient.equipoInformatico.deleteMany({ where: { id: equipoId } });
    await tenantClient.insumo.deleteMany({ where: { codigo: { startsWith: PREFIJO } } });
    await tenantClient.familiaInsumo.deleteMany({ where: { codigo: { startsWith: PREFIJO } } });
    await tenantClient.unidadMedida.deleteMany({ where: { codigo: { startsWith: PREFIJO } } });
    await tenantClient.$disconnect();
    await pool.end().catch(() => undefined);
    await prismaServiceParaUrl.onModuleDestroy();
  }, 30_000);

  it('T5: con un alta de componente en vuelo (LE FOR SHARE), el borrado espera, relee y rechaza', async () => {
    const externo = await pool.connect();
    const sonda = await pool.connect();
    try {
      await externo.query('BEGIN');
      await externo.query('SELECT id FROM equipos_informaticos WHERE id = $1 FOR SHARE', [
        equipoId,
      ]);
      await externo.query(
        `INSERT INTO componentes_equipo (equipo_id, insumo_id, descripcion, updated_at)
         VALUES ($1, $2, 'alta en vuelo', now())`,
        [equipoId, insumoId],
      );
      const { rows: pidRows } = await externo.query('SELECT pg_backend_pid() AS pid');
      const pidExterno = pidRows[0].pid as number;

      const borrado = tenantContext.run(
        { prismaClient: tenantClient, dbName: TENANT_TEST_DB_NAME, clienteId: 'test-cliente-t5e' },
        () => useCase.execute({ equipoId }),
      );

      // El borrado queda bloqueado detrás del externo (espera acotada, no un sleep ciego).
      let bloqueado = false;
      const limite = Date.now() + ESPERA_MAXIMA_MS;
      while (!bloqueado && Date.now() < limite) {
        const { rows } = await sonda.query(
          `SELECT count(*)::int AS n FROM pg_stat_activity
           WHERE datname = current_database() AND $1::int = ANY(pg_blocking_pids(pid))`,
          [pidExterno],
        );
        bloqueado = (rows[0].n as number) > 0;
        if (!bloqueado) await new Promise((r) => setTimeout(r, PASO_MS));
      }
      expect(bloqueado).toBe(true);

      await externo.query('COMMIT');
      const result = await borrado;

      expect(result.isFail()).toBe(true);
      const error = result.getError();
      expect(error).toBeInstanceOf(EquipoConComponentesActivosError);
      expect((error as EquipoConComponentesActivosError).cantidad).toBe(1);
      const equipo = await tenantClient.equipoInformatico.findUniqueOrThrow({
        where: { id: equipoId },
      });
      expect(equipo.deletedAt).toBeNull();
    } finally {
      await externo.query('ROLLBACK').catch(() => undefined);
      externo.release();
      sonda.release();
    }
  });
});
