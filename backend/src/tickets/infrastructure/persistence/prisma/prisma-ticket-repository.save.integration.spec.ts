/**
 * [INTEGRATION] WU-3a.2 (sdd/sla-primera-respuesta-y-pausa): `PrismaTicketRepository.save` acotado
 * contra Postgres REAL (`soporte_tenant_test`, filas propias con sufijo aleatorio y limpieza al final).
 *
 * - El alta nace incorporada al reloj (acumulado 0, corre_desde = created_at).
 * - `save` con lectura vieja no pisa `slaVenceAt` ni `vencido` (sla-reloj-activo R2).
 */
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../../../../shared/infrastructure/persistence/prisma.service';
import { TenantContext } from '../../../../shared/tenancy/tenant-context';
import { TenantPrismaClient } from '../../../../shared/infrastructure/persistence/prisma-clients';
import { PrismaTicketRepository } from './prisma-ticket.repository';
import { TicketEntity } from '../../../domain/entities/ticket.entity';

const MASTER_TEST_URL =
  process.env.DATABASE_URL_MASTER ??
  'postgresql://soporte:soporte@localhost:5432/soporte_master_test';
const TENANT_TEST_DB_NAME = 'soporte_tenant_test';
const DUMMY_USUARIO_ID = '01900000-0000-7000-8000-000000000001';

describe('PrismaTicketRepository.save acotado (WU-3a.2)', () => {
  let prismaService: PrismaService;
  let client: InstanceType<typeof TenantPrismaClient>;
  let tenantContext: TenantContext;
  let ticketRepo: PrismaTicketRepository;
  let ids: { tipo: string; estado: string; prioridad: string };
  let contador = 0;

  beforeAll(async () => {
    prismaService = new PrismaService(MASTER_TEST_URL);
    client = prismaService.getTenantClient(TENANT_TEST_DB_NAME);
    tenantContext = new TenantContext();
    ticketRepo = new PrismaTicketRepository(tenantContext);
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
    };
  }, 30_000);

  afterAll(async () => {
    await client.ticket.deleteMany({ where: { tipoId: ids.tipo } });
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

  it('el alta nace incorporada: acumulado 0 y corre_desde = created_at', async () => {
    const id = await crearTicket();
    const fila = await client.ticket.findUniqueOrThrow({ where: { id } });
    expect(fila.slaAcumuladoS).toBe(0);
    expect(fila.slaCorreDesde).toEqual(fila.createdAt);
    expect(fila.slaRelojVersion).toBe(0);
  });

  it('save con lectura vieja deja slaVenceAt y vencido intactos', async () => {
    const id = await crearTicket();
    const vieja = await withTenant(() => ticketRepo.findById(id));
    const vence = new Date('2026-10-07T15:00:00.000Z');
    // El módulo SLA escribe después de la lectura (consolidación) ...
    await client.ticket.update({ where: { id }, data: { slaVenceAt: vence, vencido: true } });

    vieja!.assignTo(DUMMY_USUARIO_ID);
    await withTenant(() => ticketRepo.save(vieja!));

    const fila = await client.ticket.findUniqueOrThrow({ where: { id } });
    expect(fila.asignadoId).toBe(DUMMY_USUARIO_ID); // el save sí aplicó lo suyo
    expect(fila.slaVenceAt).toEqual(vence);
    expect(fila.vencido).toBe(true);
  });
});
