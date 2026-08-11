/**
 * SB3 [INTEGRATION] — RED→GREEN: PrismaSlaTicketQueryRepository +
 * PrismaSlaTicketWriteRepository contra Postgres REAL (`soporte_tenant_test`),
 * vía `TenantContext.bind()` (mismo patrón que `prisma-catalogos.integration.spec.ts`).
 *
 * Este spec inserta sus PROPIAS filas de fixture (estado/prioridad/tipo_ticket/
 * tickets con códigos/números prefijados `SB3_TEST_*`) para no depender del
 * estado global de la DB compartida, y las limpia en `afterAll`.
 *
 * Ref spec: sdd/premium/spec S4. Ref design: ADR-P3, ADR-P4. Tarea: SB3/SB4.
 */
import { PrismaService } from '../../../../shared/infrastructure/persistence/prisma.service';
import { TenantContext } from '../../../../shared/tenancy/tenant-context';
import { TenantPrismaClient } from '../../../../shared/infrastructure/persistence/prisma-clients';
import { PrismaSlaTicketQueryRepository } from './prisma-sla-ticket-query.repository';
import { PrismaSlaTicketWriteRepository } from './prisma-sla-ticket-write.repository';

const MASTER_TEST_URL =
  process.env.DATABASE_URL_MASTER ??
  'postgresql://soporte:soporte@localhost:5432/soporte_master_test';

const TENANT_TEST_DB_NAME = 'soporte_tenant_test';
const PREFIX = 'SB3_TEST_';

describe('PrismaSlaTicketQueryRepository + PrismaSlaTicketWriteRepository — Integration (SB3/SB4)', () => {
  let prismaService: PrismaService;
  let tenantClient: InstanceType<typeof TenantPrismaClient>;
  let tenantContext: TenantContext;
  let queryRepo: PrismaSlaTicketQueryRepository;
  let writeRepo: PrismaSlaTicketWriteRepository;

  let tipoId: string;
  let prioridadId: string;
  let estadoNuevoId: string;
  let estadoResueltoId: string;

  const NOW = new Date('2026-08-06T12:00:00.000Z');
  const PASADO = new Date('2026-08-06T08:00:00.000Z'); // < NOW → vencible
  const FUTURO = new Date('2026-08-06T18:00:00.000Z'); // > NOW → no vencible

  async function crearTicket(props: {
    numero: string;
    estadoId: string;
    slaVenceAt: Date | null;
    vencido?: boolean;
    deletedAt?: Date | null;
    asignadoId?: string | null;
  }) {
    return tenantClient.ticket.create({
      data: {
        numero: props.numero,
        titulo: 'Fixture SB3',
        tipoId,
        estadoId: props.estadoId,
        prioridadId,
        solicitanteId: '00000000-0000-0000-0000-000000000001',
        asignadoId: props.asignadoId ?? '00000000-0000-0000-0000-000000000002',
        slaVenceAt: props.slaVenceAt,
        vencido: props.vencido ?? false,
        deletedAt: props.deletedAt ?? null,
      },
    });
  }

  beforeAll(async () => {
    prismaService = new PrismaService(MASTER_TEST_URL);
    tenantClient = prismaService.getTenantClient(TENANT_TEST_DB_NAME);
    tenantContext = new TenantContext();
    tenantContext.bind({
      prismaClient: tenantClient,
      dbName: TENANT_TEST_DB_NAME,
      clienteId: 'test-cliente-sla-ticket',
    });

    queryRepo = new PrismaSlaTicketQueryRepository(tenantContext);
    writeRepo = new PrismaSlaTicketWriteRepository(tenantContext);

    const tipo = await tenantClient.tipoTicket.create({
      data: { codigo: `${PREFIX}TIPO`, nombre: 'Fixture', activo: true, modulo: 'SOPORTE' },
    });
    tipoId = tipo.id;

    const prioridad = await tenantClient.prioridad.create({
      data: { codigo: `${PREFIX}PRIORIDAD`, nombre: 'Fixture', orden: 999, activo: true },
    });
    prioridadId = prioridad.id;

    const estadoNuevo = await tenantClient.estado.create({
      data: { codigo: `${PREFIX}NUEVO`, nombre: 'Nuevo', orden: 10, activo: true },
    });
    estadoNuevoId = estadoNuevo.id;

    const estadoResuelto = await tenantClient.estado.create({
      data: { codigo: 'RESUELTO', nombre: 'Resuelto fixture', orden: 999, activo: true },
    });
    estadoResueltoId = estadoResuelto.id;
  }, 30_000);

  afterAll(async () => {
    await tenantClient.ticket.deleteMany({ where: { numero: { startsWith: PREFIX } } });
    await tenantClient.tipoTicket.deleteMany({ where: { codigo: `${PREFIX}TIPO` } });
    await tenantClient.prioridad.deleteMany({ where: { codigo: `${PREFIX}PRIORIDAD` } });
    await tenantClient.estado.deleteMany({ where: { codigo: { startsWith: PREFIX } } });
    await tenantClient.estado.deleteMany({ where: { id: estadoResueltoId } });
    await prismaService.onModuleDestroy();
  }, 30_000);

  describe('findVencibles()', () => {
    it('[CRITICAL] incluye un ticket con sla_vence_at < now, vencido=false, no terminal', async () => {
      const vencible = await crearTicket({
        numero: `${PREFIX}0001`,
        estadoId: estadoNuevoId,
        slaVenceAt: PASADO,
      });

      const resultado = await queryRepo.findVencibles(NOW);

      expect(resultado.map((t) => t.id)).toContain(vencible.id);
      const fila = resultado.find((t) => t.id === vencible.id)!;
      expect(fila.asignadoId).toBe('00000000-0000-0000-0000-000000000002');
      expect(fila.solicitanteId).toBe('00000000-0000-0000-0000-000000000001');
    });

    it('excluye tickets con sla_vence_at en el futuro', async () => {
      const noVencible = await crearTicket({
        numero: `${PREFIX}0002`,
        estadoId: estadoNuevoId,
        slaVenceAt: FUTURO,
      });

      const resultado = await queryRepo.findVencibles(NOW);

      expect(resultado.map((t) => t.id)).not.toContain(noVencible.id);
    });

    it('excluye tickets ya marcados vencido=true (idempotencia de lectura)', async () => {
      const yaVencido = await crearTicket({
        numero: `${PREFIX}0003`,
        estadoId: estadoNuevoId,
        slaVenceAt: PASADO,
        vencido: true,
      });

      const resultado = await queryRepo.findVencibles(NOW);

      expect(resultado.map((t) => t.id)).not.toContain(yaVencido.id);
    });

    it('excluye tickets soft-deleted', async () => {
      const borrado = await crearTicket({
        numero: `${PREFIX}0004`,
        estadoId: estadoNuevoId,
        slaVenceAt: PASADO,
        deletedAt: new Date(),
      });

      const resultado = await queryRepo.findVencibles(NOW);

      expect(resultado.map((t) => t.id)).not.toContain(borrado.id);
    });

    it('[CRITICAL] excluye tickets en estado terminal (RESUELTO)', async () => {
      const resuelto = await crearTicket({
        numero: `${PREFIX}0005`,
        estadoId: estadoResueltoId,
        slaVenceAt: PASADO,
      });

      const resultado = await queryRepo.findVencibles(NOW);

      expect(resultado.map((t) => t.id)).not.toContain(resuelto.id);
    });
  });

  describe('marcarVencido()', () => {
    it('[CRITICAL] marca vencido=true', async () => {
      const ticket = await crearTicket({
        numero: `${PREFIX}0006`,
        estadoId: estadoNuevoId,
        slaVenceAt: PASADO,
      });

      await queryRepo.marcarVencido(ticket.id);

      const fila = await tenantClient.ticket.findUniqueOrThrow({ where: { id: ticket.id } });
      expect(fila.vencido).toBe(true);
    });

    it('idempotente: marcar dos veces no lanza y deja vencido=true', async () => {
      const ticket = await crearTicket({
        numero: `${PREFIX}0007`,
        estadoId: estadoNuevoId,
        slaVenceAt: PASADO,
      });

      await queryRepo.marcarVencido(ticket.id);
      await queryRepo.marcarVencido(ticket.id);

      const fila = await tenantClient.ticket.findUniqueOrThrow({ where: { id: ticket.id } });
      expect(fila.vencido).toBe(true);
    });
  });

  describe('PrismaSlaTicketWriteRepository.setSlaVenceAt()', () => {
    it('[CRITICAL] setea sla_vence_at con una fecha', async () => {
      const ticket = await crearTicket({
        numero: `${PREFIX}0008`,
        estadoId: estadoNuevoId,
        slaVenceAt: null,
      });
      const venceAt = new Date('2026-08-10T00:00:00.000Z');

      await writeRepo.setSlaVenceAt(ticket.id, venceAt);

      const fila = await tenantClient.ticket.findUniqueOrThrow({ where: { id: ticket.id } });
      expect(fila.slaVenceAt?.toISOString()).toBe(venceAt.toISOString());
    });

    it('setea sla_vence_at = null (sin config activa)', async () => {
      const ticket = await crearTicket({
        numero: `${PREFIX}0009`,
        estadoId: estadoNuevoId,
        slaVenceAt: new Date(),
      });

      await writeRepo.setSlaVenceAt(ticket.id, null);

      const fila = await tenantClient.ticket.findUniqueOrThrow({ where: { id: ticket.id } });
      expect(fila.slaVenceAt).toBeNull();
    });
  });
});
