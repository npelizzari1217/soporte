/**
 * T7.1, T7.3 [INTEGRATION][RED→GREEN] — PrismaTicketEdiliciaRepository,
 * PrismaSubtareaEdiliciaRepository (save / find / delete) contra Postgres
 * REAL (`soporte_tenant_test`). `ubicacion` es texto libre embebido en
 * `ticket_edilicia` (ex-catálogo Ubicacion/PrismaUbicacionRepository
 * removido).
 *
 * Fixtures propios prefijados `T7_TEST_*` (mismo patrón que
 * `prisma-compras.integration.spec.ts`, Fase 3 PR3): la DB de test NO corre
 * `TenantSeederAdapter` automáticamente, solo está migrada. Cleanup en
 * `afterAll` acotado por los ids de fixture de ESTA suite (nunca TRUNCATE
 * global — la DB es compartida).
 *
 * Ref spec: sdd/flujos-especializados/spec F3-E1, F3-E2, F3-E3. Tarea: T7.1,
 * T7.2, T7.4.
 */
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../../../../shared/infrastructure/persistence/prisma.service';
import { TenantContext } from '../../../../shared/tenancy/tenant-context';
import { TenantPrismaClient } from '../../../../shared/infrastructure/persistence/prisma-clients';

import { PrismaTicketRepository } from '../../../../tickets/infrastructure/persistence/prisma/prisma-ticket.repository';
import { PrismaTicketEdiliciaRepository } from './prisma-ticket-edilicia.repository';
import { PrismaSubtareaEdiliciaRepository } from './prisma-subtarea-edilicia.repository';
import { PrismaComentarioReparacionRepository } from './prisma-comentario-reparacion.repository';

import { TicketEntity, TicketProps } from '../../../../tickets/domain/entities/ticket.entity';
import { TicketEdiliciaEntity } from '../../../domain/entities/ticket-edilicia.entity';
import { SubtareaEdiliciaEntity } from '../../../domain/entities/subtarea-edilicia.entity';
import { ComentarioReparacionEntity } from '../../../domain/entities/comentario-reparacion.entity';

const MASTER_TEST_URL =
  process.env.DATABASE_URL_MASTER ??
  'postgresql://soporte:soporte@localhost:5432/soporte_master_test';

const TENANT_TEST_DB_NAME = 'soporte_tenant_test';
const DUMMY_USUARIO_ID = '01900000-0000-7000-8000-000000000201';

describe('Reparaciones Persistence Repos — Integration (PR7)', () => {
  let prismaService: PrismaService;
  let tenantClient: InstanceType<typeof TenantPrismaClient>;
  let tenantContext: TenantContext;

  let ticketRepo: PrismaTicketRepository;
  let ediliciaRepo: PrismaTicketEdiliciaRepository;
  let subtareaRepo: PrismaSubtareaEdiliciaRepository;
  let comentarioRepo: PrismaComentarioReparacionRepository;

  let tipoEdiliciaId: string;
  let estadoNuevoId: string;
  let prioridadMediaId: string;

  const RUN_PREFIX = randomBytes(2).toString('hex');
  let numeroCounter = 0;
  function nextNumero(): string {
    numeroCounter += 1;
    return `T7${RUN_PREFIX}${String(numeroCounter).padStart(4, '0')}`;
  }

  // Códigos FIJOS de los fixtures de catálogo. Al ser fijos y `unique`, una
  // corrida anterior que muriera entre el alta y el cleanup dejaba las filas
  // vivas y hacía fallar el `create` de TODAS las corridas siguientes con
  // "Unique constraint failed on the fields: (`codigo`)". De ahí que la
  // limpieza corra también AL ENTRAR, no sólo al salir.
  const CODIGO_TIPO = 'T7_TEST_EDILICIA';
  const CODIGO_ESTADO = 'T7_TEST_NUEVO';
  const CODIGO_PRIORIDAD = 'T7_TEST_MEDIA';

  /**
   * Borra los fixtures de esta suite, acotado por sus códigos fijos. Idempotente
   * a propósito: sirve tanto para dejar la base limpia al terminar como para
   * recuperarla al empezar si una corrida anterior quedó a medias.
   *
   * Nunca un TRUNCATE global: `soporte_tenant_test` la comparten otras suites.
   */
  async function limpiarFixtures(): Promise<void> {
    const tipo = await tenantClient.tipoTicket.findUnique({
      where: { codigo: CODIGO_TIPO },
      select: { id: true },
    });

    if (tipo !== null) {
      const tickets = await tenantClient.ticket.findMany({
        where: { tipoId: tipo.id },
        select: { id: true },
      });
      const ids = tickets.map((t) => t.id);

      if (ids.length > 0) {
        // Los comentarios van PRIMERO: su FK a ticket_edilicia es ON DELETE
        // RESTRICT, así que borrar el satélite antes falla.
        await tenantClient.comentarioReparacion.deleteMany({
          where: { ticketEdilicia: { ticketId: { in: ids } } },
        });
        await tenantClient.subtareaEdilicia.deleteMany({
          where: { ticketEdilicia: { ticketId: { in: ids } } },
        });
        await tenantClient.ticketEdilicia.deleteMany({ where: { ticketId: { in: ids } } });
        await tenantClient.ticket.deleteMany({ where: { id: { in: ids } } });
      }
    }

    // `deleteMany` y no `delete`: con un id `undefined` (beforeAll caído antes
    // de sembrar) `delete` tira un error de validación que TAPA la causa real.
    await tenantClient.prioridad.deleteMany({ where: { codigo: CODIGO_PRIORIDAD } });
    await tenantClient.estado.deleteMany({ where: { codigo: CODIGO_ESTADO } });
    await tenantClient.tipoTicket.deleteMany({ where: { codigo: CODIGO_TIPO } });
  }

  function makeTicketProps(overrides: Partial<TicketProps> = {}): TicketProps {
    return {
      numero: nextNumero(),
      titulo: 'Ticket edilicio de test PR7',
      descripcion: null,
      tipoId: tipoEdiliciaId,
      estadoId: estadoNuevoId,
      prioridadId: prioridadMediaId,
      cicloId: null,
      ticketReferenciaId: null,
      solicitanteId: DUMMY_USUARIO_ID,
      asignadoId: null,
      slaVenceAt: null,
      vencido: false,
      fechaCierre: null,
      ...overrides,
    };
  }

  function withTenant<T>(fn: () => Promise<T>): Promise<T> {
    return tenantContext.run(
      { prismaClient: tenantClient, dbName: TENANT_TEST_DB_NAME, clienteId: 'test-cliente-pr7' },
      fn,
    );
  }

  async function crearTicketConSatelite(
    ubicacion: string,
  ): Promise<{ ticket: TicketEntity; edilicia: TicketEdiliciaEntity }> {
    const ticket = TicketEntity.create(makeTicketProps());
    const edilicia = TicketEdiliciaEntity.create({ ticketId: ticket.id, ubicacion });
    await withTenant(async () => {
      await ticketRepo.save(ticket);
      await ediliciaRepo.save(edilicia);
    });
    return { ticket, edilicia };
  }

  beforeAll(async () => {
    prismaService = new PrismaService(MASTER_TEST_URL);
    tenantClient = prismaService.getTenantClient(TENANT_TEST_DB_NAME);
    tenantContext = new TenantContext();

    ticketRepo = new PrismaTicketRepository(tenantContext);
    ediliciaRepo = new PrismaTicketEdiliciaRepository(tenantContext);
    subtareaRepo = new PrismaSubtareaEdiliciaRepository(tenantContext);
    comentarioRepo = new PrismaComentarioReparacionRepository(tenantContext);

    // Arrancar en limpio: si una corrida anterior quedó a medias, sus filas
    // siguen vivas y el alta de acá abajo choca contra el UNIQUE de `codigo`.
    await limpiarFixtures();

    const tipoEdilicia = await tenantClient.tipoTicket.create({
      data: {
        codigo: CODIGO_TIPO,
        nombre: 'Edilicia Test PR7',
        activo: true,
        modulo: 'EDILICIA',
      },
    });
    tipoEdiliciaId = tipoEdilicia.id;

    const estadoNuevo = await tenantClient.estado.create({
      data: { codigo: CODIGO_ESTADO, nombre: 'Nuevo Test PR7', orden: 1, activo: true },
    });
    estadoNuevoId = estadoNuevo.id;

    const prioridadMedia = await tenantClient.prioridad.create({
      data: { codigo: CODIGO_PRIORIDAD, nombre: 'Media Test PR7', orden: 1, activo: true },
    });
    prioridadMediaId = prioridadMedia.id;
  }, 30_000);

  afterAll(async () => {
    // Limpiar las filas ANTES de cerrar el cliente: con el pool ya cerrado los
    // borrados no llegan a ejecutarse y la base compartida queda sucia.
    await limpiarFixtures();
    await prismaService.onModuleDestroy();
  }, 30_000);

  describe('PrismaTicketEdiliciaRepository', () => {
    it('save() + findById() persiste y recupera el satélite, con ubicacion como texto libre', async () => {
      const { ticket, edilicia } = await crearTicketConSatelite('T7 Ubicacion Ticket');

      await withTenant(async () => {
        const found = await ediliciaRepo.findById(edilicia.id);
        expect(found).not.toBeNull();
        expect(found!.ticketId).toBe(ticket.id);
        expect(found!.ubicacion).toBe('T7 Ubicacion Ticket');
        expect(found!.porcentajeAvance).toBe(0);
      });
    });

    it('findByTicketId() resuelve el satélite desde el ticket base', async () => {
      const { ticket, edilicia } = await crearTicketConSatelite('T7 Ubicacion Ticket 2');

      await withTenant(async () => {
        const found = await ediliciaRepo.findByTicketId(ticket.id);
        expect(found).not.toBeNull();
        expect(found!.id).toBe(edilicia.id);
      });
    });

    it('save() upsert — persiste actualizarAvance() y asignarPersonal()', async () => {
      const { edilicia } = await crearTicketConSatelite('T7 Ubicacion Ticket 3');
      edilicia.actualizarAvance(66.67);
      edilicia.asignarPersonal(DUMMY_USUARIO_ID);

      await withTenant(async () => {
        await ediliciaRepo.save(edilicia);
        const found = await ediliciaRepo.findById(edilicia.id);
        expect(found!.porcentajeAvance).toBe(66.67);
        expect(found!.personalAsignadoId).toBe(DUMMY_USUARIO_ID);
      });
    });
  });

  describe('PrismaSubtareaEdiliciaRepository', () => {
    it('save() + findActiveByTicketEdiliciaId() excluye soft-deleted y ordena por orden', async () => {
      const { edilicia } = await crearTicketConSatelite('T7 Ubicacion Subtareas');
      const sub1 = SubtareaEdiliciaEntity.create({
        ticketEdiliciaId: edilicia.id,
        descripcion: 'Subtarea 1',
        orden: 1,
      });
      const sub2 = SubtareaEdiliciaEntity.create({
        ticketEdiliciaId: edilicia.id,
        descripcion: 'Subtarea 2 (a borrar)',
        orden: 2,
      });

      await withTenant(async () => {
        await subtareaRepo.save(sub1);
        await subtareaRepo.save(sub2);
        await subtareaRepo.delete(sub2.id);

        const activas = await subtareaRepo.findActiveByTicketEdiliciaId(edilicia.id);
        expect(activas.map((s) => s.id)).toEqual([sub1.id]);

        const borrada = await subtareaRepo.findById(sub2.id);
        expect(borrada!.isDeleted()).toBe(true);
      });
    });

    it('findActiveByTicketEdiliciaIds() agrupa por reparación preservando el orden y el filtro de activas', async () => {
      const primera = await crearTicketConSatelite('T7 Ubicacion Subtareas Lote A');
      const segunda = await crearTicketConSatelite('T7 Ubicacion Subtareas Lote B');
      const sinSubtareas = await crearTicketConSatelite('T7 Ubicacion Subtareas Lote C');

      // Mismo `orden` a propósito en las dos primeras: así el desempate por
      // `created_at ASC` queda verificado y no tapado por el `orden`.
      const segundaEnOrden = SubtareaEdiliciaEntity.create({
        ticketEdiliciaId: primera.edilicia.id,
        descripcion: 'Empate de orden, creada después',
        orden: 1,
      });
      Object.assign(segundaEnOrden, { _createdAt: new Date('2026-08-18T12:00:00.000Z') });
      const primeraEnOrden = SubtareaEdiliciaEntity.create({
        ticketEdiliciaId: primera.edilicia.id,
        descripcion: 'Empate de orden, creada antes',
        orden: 1,
      });
      Object.assign(primeraEnOrden, { _createdAt: new Date('2026-08-18T09:00:00.000Z') });
      const terceraEnOrden = SubtareaEdiliciaEntity.create({
        ticketEdiliciaId: primera.edilicia.id,
        descripcion: 'Orden mayor, va última',
        orden: 5,
      });
      const borrada = SubtareaEdiliciaEntity.create({
        ticketEdiliciaId: primera.edilicia.id,
        descripcion: 'Soft-deleted, no debe volver',
        orden: 0,
      });
      const deLaSegunda = SubtareaEdiliciaEntity.create({
        ticketEdiliciaId: segunda.edilicia.id,
        descripcion: 'Subtarea de otra reparación',
        orden: 1,
      });

      await withTenant(async () => {
        // Insertadas fuera de orden: el orden lo tiene que poner la consulta,
        // no la secuencia de inserts.
        for (const subtarea of [
          terceraEnOrden,
          segundaEnOrden,
          borrada,
          primeraEnOrden,
          deLaSegunda,
        ]) {
          await subtareaRepo.save(subtarea);
        }
        await subtareaRepo.delete(borrada.id);

        const porReparacion = await subtareaRepo.findActiveByTicketEdiliciaIds([
          primera.edilicia.id,
          segunda.edilicia.id,
          sinSubtareas.edilicia.id,
        ]);

        expect(porReparacion.get(primera.edilicia.id)?.map((s) => s.id)).toEqual([
          primeraEnOrden.id,
          segundaEnOrden.id,
          terceraEnOrden.id,
        ]);
        expect(porReparacion.get(segunda.edilicia.id)?.map((s) => s.id)).toEqual([deLaSegunda.id]);
        // Sin subtareas activas no hay entrada en el Map: el `[]` lo resuelve
        // el consumidor, igual que el `0` del conteo de comentarios.
        expect(porReparacion.has(sinSubtareas.edilicia.id)).toBe(false);
      });
    });

    it('findActiveByTicketEdiliciaIds() con lista vacía devuelve un Map vacío sin consultar', async () => {
      await withTenant(async () => {
        expect(await subtareaRepo.findActiveByTicketEdiliciaIds([])).toEqual(new Map());
      });
    });

    it('save() upsert — persiste completar()', async () => {
      const { edilicia } = await crearTicketConSatelite('T7 Ubicacion Subtareas 2');
      const sub = SubtareaEdiliciaEntity.create({
        ticketEdiliciaId: edilicia.id,
        descripcion: 'Subtarea a completar',
      });

      await withTenant(async () => {
        await subtareaRepo.save(sub);
        sub.completar(DUMMY_USUARIO_ID);
        await subtareaRepo.save(sub);

        const found = await subtareaRepo.findById(sub.id);
        expect(found!.completada).toBe(true);
        expect(found!.completadaPorId).toBe(DUMMY_USUARIO_ID);
      });
    });
  });

  describe('PrismaComentarioReparacionRepository', () => {
    it('crear() + listarPorTicketEdilicia() hace round-trip del mapper y devuelve el MÁS NUEVO PRIMERO', async () => {
      const { edilicia } = await crearTicketConSatelite('T7 Ubicacion Comentarios');
      // `createdAt` explícito y separado: el orden del listado se verifica
      // contra fechas reales, no contra la velocidad del insert.
      const viejo = ComentarioReparacionEntity.create({
        ticketEdiliciaId: edilicia.id,
        texto: 'Se pidió el repuesto X al proveedor',
        autorId: DUMMY_USUARIO_ID,
      });
      Object.assign(viejo, { _createdAt: new Date('2026-08-18T10:00:00.000Z') });
      const nuevo = ComentarioReparacionEntity.create({
        ticketEdiliciaId: edilicia.id,
        texto: 'Sigue sin llegar el repuesto X',
        autorId: DUMMY_USUARIO_ID,
      });
      Object.assign(nuevo, { _createdAt: new Date('2026-08-18T15:00:00.000Z') });

      await withTenant(async () => {
        await comentarioRepo.crear(viejo);
        await comentarioRepo.crear(nuevo);

        const comentarios = await comentarioRepo.listarPorTicketEdilicia(edilicia.id);

        expect(comentarios.map((c) => c.id)).toEqual([nuevo.id, viejo.id]);
        // Round-trip completo del mapper sobre el más nuevo.
        expect(comentarios[0].ticketEdiliciaId).toBe(edilicia.id);
        expect(comentarios[0].texto).toBe('Sigue sin llegar el repuesto X');
        expect(comentarios[0].autorId).toBe(DUMMY_USUARIO_ID);
        expect(comentarios[0].createdAt).toEqual(new Date('2026-08-18T15:00:00.000Z'));
        expect(comentarios[0].deletedAt).toBeNull();
      });
    });

    it('contarPorTicketEdilicia() cuenta por lote contra la base y omite las reparaciones sin comentarios', async () => {
      const conDos = await crearTicketConSatelite('T7 Ubicacion Conteo A');
      const conUno = await crearTicketConSatelite('T7 Ubicacion Conteo B');
      const sinComentarios = await crearTicketConSatelite('T7 Ubicacion Conteo C');

      await withTenant(async () => {
        for (const [edilicia, cantidad] of [
          [conDos.edilicia, 2],
          [conUno.edilicia, 1],
        ] as const) {
          for (let i = 0; i < cantidad; i += 1) {
            await comentarioRepo.crear(
              ComentarioReparacionEntity.create({
                ticketEdiliciaId: edilicia.id,
                texto: `Comentario ${i + 1} de conteo`,
                autorId: DUMMY_USUARIO_ID,
              }),
            );
          }
        }

        const conteos = await comentarioRepo.contarPorTicketEdilicia([
          conDos.edilicia.id,
          conUno.edilicia.id,
          sinComentarios.edilicia.id,
        ]);

        expect(conteos.get(conDos.edilicia.id)).toBe(2);
        expect(conteos.get(conUno.edilicia.id)).toBe(1);
        // El GROUP BY no emite fila para la reparación sin comentarios: el
        // `0` lo resuelve el consumidor, no el repositorio.
        expect(conteos.has(sinComentarios.edilicia.id)).toBe(false);
      });
    });

    it('contarPorTicketEdilicia() con lista vacía devuelve un Map vacío sin consultar', async () => {
      await withTenant(async () => {
        expect(await comentarioRepo.contarPorTicketEdilicia([])).toEqual(new Map());
      });
    });

    it('el CHECK de DB rechaza un texto de puro whitespace aunque el dominio se saltee', async () => {
      const { edilicia } = await crearTicketConSatelite('T7 Ubicacion Comentarios CHECK');

      await withTenant(async () => {
        await expect(
          tenantClient.comentarioReparacion.create({
            data: {
              ticketEdiliciaId: edilicia.id,
              texto: '   ',
              autorId: DUMMY_USUARIO_ID,
            },
          }),
        ).rejects.toThrow();
      });
    });
  });
});
