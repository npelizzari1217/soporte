/**
 * prisma-encuesta-satisfaccion.repository.integration.spec.ts — Integración
 * contra Postgres REAL (`soporte_tenant_test`, DB tenant compartida y ya
 * migrada — mismo patrón que `prisma-tickets.integration.spec.ts`: catálogo
 * de fixture propio prefijado, cleanup acotado por esos ids en `afterAll`,
 * sin TRUNCATE global). Tarea 5.3.
 *
 * El test obligatorio de esta tarea es el de `resumenPorScope()` con un
 * ticket reabierto y dos respuestas: si alguien saca el `DISTINCT ON`
 * (ADR-C8) el promedio pasa a contar las dos y el test se pone rojo.
 */
import { randomBytes, randomUUID } from 'node:crypto';
import { PrismaService } from '../../../../shared/infrastructure/persistence/prisma.service';
import { TenantContext } from '../../../../shared/tenancy/tenant-context';
import { TenantPrismaClient } from '../../../../shared/infrastructure/persistence/prisma-clients';
import { PrismaEncuestaSatisfaccionRepository } from './prisma-encuesta-satisfaccion.repository';
import { EncuestaSatisfaccionEntity } from '../../../domain/entities/encuesta-satisfaccion.entity';
import { PuntajeCsat } from '../../../domain/value-objects/puntaje-csat';

const MASTER_TEST_URL =
  process.env.DATABASE_URL_MASTER ??
  'postgresql://soporte:soporte@localhost:5432/soporte_master_test';

const TENANT_TEST_DB_NAME = 'soporte_tenant_test';
const CLIENTE_ID = 'test-cliente-csat-5-3';
const DUMMY_USUARIO_ID = '01900000-0000-7000-8000-000000000009';

describe('PrismaEncuestaSatisfaccionRepository — Integration (5.3)', () => {
  let prismaService: PrismaService;
  let tenantClient: InstanceType<typeof TenantPrismaClient>;
  let tenantContext: TenantContext;
  let repo: PrismaEncuestaSatisfaccionRepository;

  let tipoId: string;
  let estadoId: string;
  let prioridadId: string;

  const RUN_PREFIX = randomBytes(2).toString('hex');
  let numeroCounter = 0;
  function nextNumero(): string {
    numeroCounter += 1;
    return `CS5${RUN_PREFIX}${String(numeroCounter).padStart(4, '0')}`;
  }

  function withTenant<T>(fn: () => Promise<T>): Promise<T> {
    return tenantContext.run(
      { prismaClient: tenantClient, dbName: TENANT_TEST_DB_NAME, clienteId: CLIENTE_ID },
      fn,
    );
  }

  async function createTestTicket(asignadoId: string | null = null): Promise<string> {
    const ticket = await tenantClient.ticket.create({
      data: {
        numero: nextNumero(),
        titulo: 'Ticket de test 5.3',
        descripcion: null,
        tipoId,
        estadoId,
        prioridadId,
        cicloId: null,
        ticketReferenciaId: null,
        solicitanteId: DUMMY_USUARIO_ID,
        asignadoId,
        slaVenceAt: null,
        vencido: false,
        fechaCierre: null,
      },
    });
    return ticket.id;
  }

  function makeRespuesta(
    ticketId: string,
    puntajeValor: number,
    respondidaEn: Date,
  ): EncuestaSatisfaccionEntity {
    const puntaje = PuntajeCsat.create(puntajeValor).getOrThrow();
    return EncuestaSatisfaccionEntity.create({
      ticketId,
      tokenId: randomUUID(),
      puntaje,
      comentario: null,
      respondidaEn,
    });
  }

  beforeAll(async () => {
    prismaService = new PrismaService(MASTER_TEST_URL);
    tenantClient = prismaService.getTenantClient(TENANT_TEST_DB_NAME);
    tenantContext = new TenantContext();
    repo = new PrismaEncuestaSatisfaccionRepository(tenantContext);

    const tipo = await tenantClient.tipoTicket.create({
      data: { codigo: 'CS5_TEST_TIPO', nombre: 'Tipo Test 5.3', activo: true, modulo: 'SOPORTE' },
    });
    tipoId = tipo.id;

    const estado = await tenantClient.estado.create({
      data: { codigo: 'CS5_TEST_ESTADO', nombre: 'Estado Test 5.3', orden: 1, activo: true },
    });
    estadoId = estado.id;

    const prioridad = await tenantClient.prioridad.create({
      data: { codigo: 'CS5_TEST_PRIORIDAD', nombre: 'Prioridad Test 5.3', orden: 1, activo: true },
    });
    prioridadId = prioridad.id;
  }, 30_000);

  afterAll(async () => {
    // Cleanup acotado por los ids de fixture de ESTA suite (soporte_tenant_test
    // es compartida por otras suites — nunca TRUNCATE global).
    await tenantClient.encuestaSatisfaccion.deleteMany({ where: { ticket: { tipoId } } });
    await tenantClient.ticket.deleteMany({ where: { tipoId } });
    await tenantClient.prioridad.delete({ where: { id: prioridadId } });
    await tenantClient.estado.delete({ where: { id: estadoId } });
    await tenantClient.tipoTicket.delete({ where: { id: tipoId } });
    await prismaService.onModuleDestroy();
  }, 30_000);

  describe('guardar() + ultimaDeTicket()', () => {
    it('persiste una respuesta y la recupera como la última del ticket', async () => {
      const ticketId = await createTestTicket();
      const respuesta = makeRespuesta(ticketId, 4, new Date());

      await withTenant(async () => {
        await repo.guardar(respuesta);
        const ultima = await repo.ultimaDeTicket(ticketId);

        expect(ultima).not.toBeNull();
        expect(ultima!.puntaje).toBe(4);
        expect(ultima!.ticketId).toBe(ticketId);
      });
    });

    it('ultimaDeTicket() retorna null si el ticket no tiene ninguna respuesta', async () => {
      const ticketId = await createTestTicket();

      await withTenant(async () => {
        const ultima = await repo.ultimaDeTicket(ticketId);
        expect(ultima).toBeNull();
      });
    });

    it('ultimaDeTicket() devuelve la MÁS RECIENTE cuando hay varias', async () => {
      const ticketId = await createTestTicket();
      const primera = makeRespuesta(ticketId, 2, new Date('2026-01-01T00:00:00Z'));
      const segunda = makeRespuesta(ticketId, 5, new Date('2026-01-02T00:00:00Z'));

      await withTenant(async () => {
        await repo.guardar(primera);
        await repo.guardar(segunda);
        const ultima = await repo.ultimaDeTicket(ticketId);

        expect(ultima!.puntaje).toBe(5);
      });
    });
  });

  describe('resumenPorScope() — DISTINCT ON por última respuesta (ADR-C8)', () => {
    it('un ticket reabierto con DOS respuestas cuenta SOLO la última en el promedio', async () => {
      // `soporte_tenant_test` es compartida por el resto de esta suite (y
      // potencialmente otras) — se scopea por un `asignadoId` propio de ESTE
      // test para que `resumenPorScope` agregue únicamente el ticket que nos
      // interesa, sin contaminarse con fixtures de otros tests.
      const asignadoDeEsteTest = randomUUID();
      const ticketId = await createTestTicket(asignadoDeEsteTest);
      // Primera respuesta (puntaje bajo, más vieja) y segunda (puntaje alto,
      // más nueva, tras la reapertura). Si el DISTINCT ON se rompe, el
      // promedio pasa de 5 a 3 (promedia 1 y 5) — el test lo detecta.
      const vieja = makeRespuesta(ticketId, 1, new Date('2026-01-01T00:00:00Z'));
      const nueva = makeRespuesta(ticketId, 5, new Date('2026-01-05T00:00:00Z'));

      await withTenant(async () => {
        await repo.guardar(vieja);
        await repo.guardar(nueva);

        const resumen = await repo.resumenPorScope({ asignadoId: asignadoDeEsteTest });

        expect(resumen.respuestas).toBe(1);
        expect(resumen.promedio).toBe(5);
      });
    });

    it('scope sin respuestas devuelve promedio null y respuestas 0', async () => {
      await withTenant(async () => {
        const resumen = await repo.resumenPorScope({ asignadoId: randomUUID() });

        expect(resumen.promedio).toBeNull();
        expect(resumen.respuestas).toBe(0);
      });
    });

    it('filtra por asignadoId (scope de rol TECNICO, D2)', async () => {
      const asignadoA = randomUUID();
      const asignadoB = randomUUID();
      const ticketDeA = await createTestTicket(asignadoA);
      const ticketDeB = await createTestTicket(asignadoB);

      await withTenant(async () => {
        await repo.guardar(makeRespuesta(ticketDeA, 3, new Date()));
        await repo.guardar(makeRespuesta(ticketDeB, 5, new Date()));

        const resumenDeA = await repo.resumenPorScope({ asignadoId: asignadoA });

        expect(resumenDeA.respuestas).toBe(1);
        expect(resumenDeA.promedio).toBe(3);
      });
    });
  });
});
