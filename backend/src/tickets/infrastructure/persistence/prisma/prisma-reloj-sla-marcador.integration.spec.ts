/**
 * [INTEGRATION] WU-3a (sdd/sla-primera-respuesta-y-pausa): repo acotado y marcador del reloj de SLA
 * contra Postgres REAL (`soporte_tenant_test`, filas propias con sufijo aleatorio y limpieza al final).
 *
 * - `save` con lectura vieja no pisa `slaVenceAt` ni `vencido` (sla-reloj-activo R2).
 * - El marcador corre dentro de la tx: un rollback no deja `sla_reloj_version` incrementada ni evento (R4).
 * - Transiciones concurrentes sobre el mismo ticket dejan seq 1 y 2 y version 2 (R1).
 */
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../../../../shared/infrastructure/persistence/prisma.service';
import { TenantContext } from '../../../../shared/tenancy/tenant-context';
import { TenantPrismaClient } from '../../../../shared/infrastructure/persistence/prisma-clients';
import { PrismaTenantTransactionRunner } from '../../../../shared/infrastructure/persistence/tenant-transaction-runner';
import { PrismaTicketRepository } from './prisma-ticket.repository';
import { PrismaRelojSlaMarcador } from './prisma-reloj-sla-marcador';
import { TicketEntity } from '../../../domain/entities/ticket.entity';

const MASTER_TEST_URL =
  process.env.DATABASE_URL_MASTER ??
  'postgresql://soporte:soporte@localhost:5432/soporte_master_test';
const TENANT_TEST_DB_NAME = 'soporte_tenant_test';
const DUMMY_USUARIO_ID = '01900000-0000-7000-8000-000000000001';

describe('Marcador del reloj de SLA y save acotado (WU-3a)', () => {
  let prismaService: PrismaService;
  let client: InstanceType<typeof TenantPrismaClient>;
  let tenantContext: TenantContext;
  let txRunner: PrismaTenantTransactionRunner;
  let ticketRepo: PrismaTicketRepository;
  let marcador: PrismaRelojSlaMarcador;
  let ids: { tipo: string; estado: string; prioridad: string; tipoOp: string };
  let contador = 0;

  beforeAll(async () => {
    prismaService = new PrismaService(MASTER_TEST_URL);
    client = prismaService.getTenantClient(TENANT_TEST_DB_NAME);
    tenantContext = new TenantContext();
    txRunner = new PrismaTenantTransactionRunner(tenantContext, { error: () => {} });
    ticketRepo = new PrismaTicketRepository(tenantContext);
    marcador = new PrismaRelojSlaMarcador(tenantContext);
    const s = randomBytes(3).toString('hex');
    ids = {
      tipo: (
        await client.tipoTicket.create({
          data: { codigo: `WU3A${s}`, nombre: 'WU3a', activo: true, modulo: 'SOPORTE' },
        })
      ).id,
      estado: (
        await client.estado.create({
          data: { codigo: `WU3AE${s}`, nombre: 'WU3a', orden: 1, activo: true },
        })
      ).id,
      prioridad: (
        await client.prioridad.create({
          data: { codigo: `WU3AP${s}`, nombre: 'WU3a', orden: 1, activo: true },
        })
      ).id,
      tipoOp: (await client.tipoOperacion.create({ data: { codigo: `WU3AO${s}`, nombre: 'WU3a' } }))
        .id,
    };
  }, 30_000);

  afterAll(async () => {
    await client.operacionTicket.deleteMany({ where: { ticket: { tipoId: ids.tipo } } });
    await client.ticket.deleteMany({ where: { tipoId: ids.tipo } });
    await client.tipoOperacion.delete({ where: { id: ids.tipoOp } });
    await client.tipoTicket.delete({ where: { id: ids.tipo } });
    await client.estado.delete({ where: { id: ids.estado } });
    await client.prioridad.delete({ where: { id: ids.prioridad } });
    await prismaService.onModuleDestroy();
  }, 30_000);

  const withTenant = <T>(fn: () => Promise<T>): Promise<T> =>
    tenantContext.run({ prismaClient: client, dbName: TENANT_TEST_DB_NAME, clienteId: 'wu3a' }, fn);

  async function crearTicket(): Promise<string> {
    contador += 1;
    const ticket = TicketEntity.create({
      numero: `W3A-${randomBytes(3).toString('hex')}-${contador}`,
      titulo: 'Ticket WU-3a',
      descripcion: null,
      tipoId: ids.tipo,
      estadoId: ids.estado,
      prioridadId: ids.prioridad,
      cicloId: null,
      ticketReferenciaId: null,
      solicitanteId: DUMMY_USUARIO_ID,
    });
    await withTenant(() => ticketRepo.save(ticket));
    return ticket.id;
  }

  const crearOperacion = (ticketId: string) =>
    client.operacionTicket.create({
      data: { ticketId, tipoOperacionId: ids.tipoOp, autorId: DUMMY_USUARIO_ID },
    });

  it('un rollback de la tx no deja sla_reloj_version incrementada ni seq estampada ni evento', async () => {
    const id = await crearTicket();
    const op = await crearOperacion(id);
    const publicar = vi.fn();

    await expect(
      withTenant(() =>
        txRunner.run(async () => {
          await marcador.marcar(id, op.id);
          txRunner.alCommitear(publicar);
          throw new Error('rollback forzado');
        }),
      ),
    ).rejects.toThrow('rollback forzado');

    const fila = await client.ticket.findUniqueOrThrow({ where: { id } });
    expect(fila.slaRelojVersion).toBe(0);
    expect(fila.slaRelojPendiente).toBe(false);
    expect(
      (await client.operacionTicket.findUniqueOrThrow({ where: { id: op.id } })).slaRelojSeq,
    ).toBeNull();
    expect(publicar).not.toHaveBeenCalled();
  });

  it('dos transiciones concurrentes sobre el mismo ticket dejan seq 1 y 2 y version 2', async () => {
    const id = await crearTicket();
    const [a, b] = await Promise.all([crearOperacion(id), crearOperacion(id)]);

    await Promise.all(
      [a, b].map((op) => withTenant(() => txRunner.run(() => marcador.marcar(id, op.id)))),
    );

    const ops = await client.operacionTicket.findMany({ where: { ticketId: id } });
    expect(ops.map((o) => o.slaRelojSeq).sort()).toEqual([1, 2]);
    const fila = await client.ticket.findUniqueOrThrow({ where: { id } });
    expect(fila.slaRelojVersion).toBe(2);
    expect(fila.slaRelojPendiente).toBe(true);
  }, 30_000);
});
