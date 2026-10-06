/**
 * [INTEGRATION] WU-6 (sdd/sla-primera-respuesta-y-pausa, sla-primera-respuesta R1, R3): registro de la
 * primera respuesta con `CrearComentarioUseCase` y `PrismaPrimeraRespuestaWriteRepository` reales contra
 * `soporte_tenant_test`. Los fixtures llevan el prefijo `WU6P` y se borran al empezar y al terminar.
 */
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../../../../shared/infrastructure/persistence/prisma.service';
import { TenantContext } from '../../../../shared/tenancy/tenant-context';
import { TenantPrismaClient } from '../../../../shared/infrastructure/persistence/prisma-clients';
import { PrismaTenantTransactionRunner } from '../../../../shared/infrastructure/persistence/tenant-transaction-runner';
import { CrearComentarioUseCase } from '../../../application/use-cases/crear-comentario.use-case';
import { PrismaTicketRepository } from './prisma-ticket.repository';
import { PrismaOperacionTicketRepository } from './prisma-operacion-ticket.repository';
import { PrismaEstadoRepository } from './prisma-estado.repository';
import { PrismaTipoOperacionRepository } from './prisma-tipo-operacion.repository';
import { PrismaPrimeraRespuestaWriteRepository } from './prisma-primera-respuesta-write.repository';

const MASTER_TEST_URL =
  process.env.DATABASE_URL_MASTER ??
  'postgresql://soporte:soporte@localhost:5432/soporte_master_test';
const TENANT_TEST_DB_NAME = 'soporte_tenant_test';
const SOLICITANTE = '01900000-0000-7000-8000-0000000000a1';
const TECNICO = '01900000-0000-7000-8000-0000000000a2';
const PREFIJO = 'WU6P';

describe('Primera respuesta — Integration (WU-6)', () => {
  let prismaService: PrismaService;
  let client: InstanceType<typeof TenantPrismaClient>;
  let repo: PrismaPrimeraRespuestaWriteRepository;
  let useCase: CrearComentarioUseCase;
  let tipoId: string;
  let prioridadId: string;
  let estadoId: string;
  let creoComentario = false;

  async function limpiar(): Promise<void> {
    await client.operacionTicket.deleteMany({
      where: { ticket: { tipo: { codigo: { startsWith: PREFIJO } } } },
    });
    await client.ticket.deleteMany({ where: { tipo: { codigo: { startsWith: PREFIJO } } } });
    await client.tipoTicket.deleteMany({ where: { codigo: { startsWith: PREFIJO } } });
    await client.prioridad.deleteMany({ where: { codigo: { startsWith: PREFIJO } } });
  }

  beforeAll(async () => {
    prismaService = new PrismaService(MASTER_TEST_URL);
    client = prismaService.getTenantClient(TENANT_TEST_DB_NAME);
    const tenantContext = new TenantContext();
    tenantContext.bind({ prismaClient: client, dbName: TENANT_TEST_DB_NAME, clienteId: 'wu6p' });
    repo = new PrismaPrimeraRespuestaWriteRepository(tenantContext);
    useCase = new CrearComentarioUseCase(
      new PrismaTicketRepository(tenantContext),
      new PrismaOperacionTicketRepository(tenantContext),
      new PrismaEstadoRepository(tenantContext),
      new PrismaTipoOperacionRepository(tenantContext),
      { publish: vi.fn() },
      new PrismaTenantTransactionRunner(tenantContext, { error: vi.fn() }),
      repo,
    );
    await limpiar();
    const s = randomBytes(3).toString('hex');
    tipoId = (
      await client.tipoTicket.create({
        data: { codigo: `${PREFIJO}${s}`, nombre: 'WU6p', activo: true, modulo: 'SOPORTE' },
      })
    ).id;
    prioridadId = (
      await client.prioridad.create({
        data: { codigo: `${PREFIJO}P${s}`, nombre: 'WU6p', orden: 1, activo: true },
      })
    ).id;
    estadoId = (await client.estado.findUniqueOrThrow({ where: { codigo: 'EN_PROCESO' } })).id;
    // La base compartida de tests no siempre trae el catálogo sembrado: se crea solo si falta y se retira al final.
    if (!(await client.tipoOperacion.findUnique({ where: { codigo: 'COMENTARIO' } }))) {
      await client.tipoOperacion.create({ data: { codigo: 'COMENTARIO', nombre: 'Comentario' } });
      creoComentario = true;
    }
  }, 30_000);

  afterAll(async () => {
    await limpiar();
    if (creoComentario) await client.tipoOperacion.deleteMany({ where: { codigo: 'COMENTARIO' } });
    await prismaService.onModuleDestroy();
  }, 30_000);

  async function crearTicket(): Promise<string> {
    const t = await client.ticket.create({
      data: {
        numero: `${PREFIJO}-${randomBytes(3).toString('hex')}`,
        titulo: 'Ticket WU-6',
        tipoId,
        estadoId,
        prioridadId,
        solicitanteId: SOLICITANTE,
      },
    });
    return t.id;
  }

  const leer = async (id: string) =>
    client.ticket.findUniqueOrThrow({
      where: { id },
      select: { primeraRespuestaAt: true, primeraRespuestaVenceAt: true },
    });

  it('un comentario público de un técnico registra la fecha de la operación', async () => {
    const id = await crearTicket();

    const r = await useCase.execute({
      ticketId: id,
      texto: 'Hola',
      autorId: TECNICO,
      esInterno: false,
    });

    const op = await client.operacionTicket.findUniqueOrThrow({ where: { id: r.getValue().id } });
    expect((await leer(id)).primeraRespuestaAt).toEqual(op.createdAt);
  });

  it('el interno y el público del solicitante no cuentan', async () => {
    const id = await crearTicket();

    await useCase.execute({ ticketId: id, texto: 'nota', autorId: TECNICO, esInterno: true });
    await useCase.execute({
      ticketId: id,
      texto: 'consulta',
      autorId: SOLICITANTE,
      esInterno: false,
    });

    expect((await leer(id)).primeraRespuestaAt).toBeNull();
  });

  it('un segundo comentario no cambia la fecha', async () => {
    const id = await crearTicket();
    await useCase.execute({ ticketId: id, texto: 'uno', autorId: TECNICO, esInterno: false });
    const primera = (await leer(id)).primeraRespuestaAt;

    await useCase.execute({ ticketId: id, texto: 'dos', autorId: TECNICO, esInterno: false });

    expect((await leer(id)).primeraRespuestaAt).toEqual(primera);
  });

  it('dos registros concurrentes dejan UNA fecha, la del primero que escribe, y una tercera no la pisa', async () => {
    const id = await crearTicket();
    const a = new Date('2026-10-01T12:00:00.000Z');
    const b = new Date('2026-10-01T12:00:05.000Z');

    await Promise.all([repo.registrarSiFalta(id, a), repo.registrarSiFalta(id, b)]);

    const ganadora = (await leer(id)).primeraRespuestaAt as Date;
    expect([a.getTime(), b.getTime()]).toContain(ganadora.getTime());
    await repo.registrarSiFalta(id, new Date('2026-10-02T00:00:00.000Z'));
    expect((await leer(id)).primeraRespuestaAt).toEqual(ganadora);
  });

  it('borrar el comentario que registró la primera respuesta no cambia la fecha', async () => {
    const id = await crearTicket();
    const r = await useCase.execute({
      ticketId: id,
      texto: 'uno',
      autorId: TECNICO,
      esInterno: false,
    });
    const registrada = (await leer(id)).primeraRespuestaAt;
    expect(registrada).not.toBeNull();

    await client.operacionTicket.update({
      where: { id: r.getValue().id },
      data: { deletedAt: new Date() },
    });

    expect((await leer(id)).primeraRespuestaAt).toEqual(registrada);
  });

  it('fijarVencimientoSiSinRespuesta escribe sin respuesta y deja igual al ya respondido', async () => {
    const sinRespuesta = await crearTicket();
    const respondido = await crearTicket();
    const vence = new Date('2026-10-05T15:00:00.000Z');
    await repo.registrarSiFalta(respondido, new Date('2026-10-01T12:00:00.000Z'));

    await repo.fijarVencimientoSiSinRespuesta(sinRespuesta, vence);
    await repo.fijarVencimientoSiSinRespuesta(respondido, vence);

    expect((await leer(sinRespuesta)).primeraRespuestaVenceAt).toEqual(vence);
    expect((await leer(respondido)).primeraRespuestaVenceAt).toBeNull();
    await repo.fijarVencimientoSiSinRespuesta(sinRespuesta, null);
    expect((await leer(sinRespuesta)).primeraRespuestaVenceAt).toBeNull();
  });
});
