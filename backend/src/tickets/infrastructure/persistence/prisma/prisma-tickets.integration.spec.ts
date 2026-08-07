/**
 * T5.1, T5.3, T5.4, T5.6 [INTEGRATION] — RED→GREEN: PrismaTicketRepository
 * (save/findById/findByNumero/findLastSecuencia/findAll/delete),
 * PrismaOperacionTicketRepository (save/listByTicket),
 * PrismaArchivoRepository (save/linkToTicket/linkToOperacion — alcance PR5
 * explícito de esta sesión, adelantado desde PR10) y
 * PrismaCicloClienteRepository (findActive/findById/findAll) contra
 * Postgres REAL (`soporte_tenant_test`).
 *
 * La concurrencia de `findLastSecuencia` (T5.2, ADR-5) y el aislamiento
 * cross-DB completo (T5.7/T23) tienen specs propios (setup más pesado:
 * transacciones concurrentes reales / DB efímera provisionada).
 *
 * Fixtures propios prefijados `T5_TEST_*`/`T5TEST` (mismo patrón que
 * T2.3): la DB de test NO corre `TenantSeederAdapter` automáticamente,
 * solo está migrada. Cleanup en `afterAll` acotado por los ids de fixture
 * de ESTA suite (nunca TRUNCATE global — la DB es compartida).
 *
 * Ref spec: sdd/tickets-core/spec T4-T8, T12, T18, T20-T22, T23. Ref
 * design: "Archivos afectados" PR5, matriz de tests. Tarea: T5.1, T5.3,
 * T5.4, T5.6.
 */
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../../../../shared/infrastructure/persistence/prisma.service';
import { TenantContext } from '../../../../shared/tenancy/tenant-context';
import { TenantPrismaClient } from '../../../../shared/infrastructure/persistence/prisma-clients';

import { PrismaTicketRepository } from './prisma-ticket.repository';
import { PrismaOperacionTicketRepository } from './prisma-operacion-ticket.repository';
import { PrismaArchivoRepository } from './prisma-archivo.repository';
import { PrismaCicloClienteRepository } from './prisma-ciclo-cliente.repository';

import { TicketEntity, TicketProps } from '../../../domain/entities/ticket.entity';
import {
  OperacionTicketEntity,
  OperacionTicketProps,
} from '../../../domain/entities/operacion-ticket.entity';
import { ArchivoEntity, ArchivoProps } from '../../../domain/entities/archivo.entity';

const MASTER_TEST_URL =
  process.env.DATABASE_URL_MASTER ??
  'postgresql://soporte:soporte@localhost:5432/soporte_master_test';

const TENANT_TEST_DB_NAME = 'soporte_tenant_test';
const CLIENTE_ID = 'test-cliente-pr5';
const DUMMY_USUARIO_ID = '01900000-0000-7000-8000-000000000001';
const DUMMY_ASIGNADO_ID = '01900000-0000-7000-8000-000000000002';

describe('Tickets Persistence Repos — Integration (PR5)', () => {
  let prismaService: PrismaService;
  let tenantClient: InstanceType<typeof TenantPrismaClient>;
  let tenantContext: TenantContext;

  let ticketRepo: PrismaTicketRepository;
  let operacionRepo: PrismaOperacionTicketRepository;
  let archivoRepo: PrismaArchivoRepository;
  let cicloRepo: PrismaCicloClienteRepository;

  let tipoSoporteId: string;
  let tipoComprasId: string;
  let estadoNuevoId: string;
  let estadoEnProcesoId: string;
  let prioridadMediaId: string;
  let tipoOpCambioEstadoId: string;
  let cicloActivoId: string;

  const archivoIdsCreados: string[] = [];

  // `numero` es VARCHAR(20) en DB — prefijo corto + contador, no timestamp
  // completo, para nunca exceder el límite de columna.
  const RUN_PREFIX = randomBytes(2).toString('hex');
  let numeroCounter = 0;
  function nextNumero(): string {
    numeroCounter += 1;
    return `T5${RUN_PREFIX}${String(numeroCounter).padStart(4, '0')}`;
  }

  function makeTicketProps(overrides: Partial<TicketProps> = {}): TicketProps {
    return {
      numero: nextNumero(),
      titulo: 'Ticket de test PR5',
      descripcion: null,
      tipoId: tipoSoporteId,
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

  function makeOperacionProps(ticketId: string): OperacionTicketProps {
    return {
      ticketId,
      tipoOperacionId: tipoOpCambioEstadoId,
      descripcion: 'Ticket creado',
      estadoAnteriorId: null,
      estadoNuevoId: estadoNuevoId,
      autorId: DUMMY_USUARIO_ID,
      esInterno: false,
      metadata: null,
    };
  }

  function makeArchivoProps(suffix: string): ArchivoProps {
    return {
      storageKey: `tickets/pr5-test/archivo-${suffix}-${Date.now()}`,
      nombreOriginal: `archivo-${suffix}.pdf`,
      mimeType: 'application/pdf',
      tamanoBytes: BigInt(1024),
      subidoPorId: DUMMY_USUARIO_ID,
    };
  }

  function withTenant<T>(fn: () => Promise<T>): Promise<T> {
    return tenantContext.run(
      { prismaClient: tenantClient, dbName: TENANT_TEST_DB_NAME, clienteId: CLIENTE_ID },
      fn,
    );
  }

  beforeAll(async () => {
    prismaService = new PrismaService(MASTER_TEST_URL);
    tenantClient = prismaService.getTenantClient(TENANT_TEST_DB_NAME);
    tenantContext = new TenantContext();

    ticketRepo = new PrismaTicketRepository(tenantContext);
    operacionRepo = new PrismaOperacionTicketRepository(tenantContext);
    archivoRepo = new PrismaArchivoRepository(tenantContext);
    cicloRepo = new PrismaCicloClienteRepository(tenantContext);

    const tipoSoporte = await tenantClient.tipoTicket.create({
      data: { codigo: 'T5_TEST_SOPORTE', nombre: 'Soporte Test PR5', activo: true },
    });
    const tipoCompras = await tenantClient.tipoTicket.create({
      data: { codigo: 'T5_TEST_COMPRAS', nombre: 'Compras Test PR5', activo: true },
    });
    tipoSoporteId = tipoSoporte.id;
    tipoComprasId = tipoCompras.id;

    const estadoNuevo = await tenantClient.estado.create({
      data: { codigo: 'T5_TEST_NUEVO', nombre: 'Nuevo Test PR5', orden: 1, activo: true },
    });
    const estadoEnProceso = await tenantClient.estado.create({
      data: { codigo: 'T5_TEST_EN_PROCESO', nombre: 'En Proceso Test PR5', orden: 2, activo: true },
    });
    estadoNuevoId = estadoNuevo.id;
    estadoEnProcesoId = estadoEnProceso.id;

    const prioridadMedia = await tenantClient.prioridad.create({
      data: { codigo: 'T5_TEST_MEDIA', nombre: 'Media Test PR5', orden: 1, activo: true },
    });
    prioridadMediaId = prioridadMedia.id;

    const tipoOpCambioEstado = await tenantClient.tipoOperacion.create({
      data: { codigo: 'T5_TEST_CAMBIO_ESTADO', nombre: 'Cambio Estado Test PR5', activo: true },
    });
    tipoOpCambioEstadoId = tipoOpCambioEstado.id;

    const cicloActivo = await tenantClient.cicloCliente.create({
      data: {
        cicloVigenteId: DUMMY_USUARIO_ID,
        nombre: 'T5_TEST_CICLO_ACTIVO',
        fechaInicio: new Date('2026-01-01'),
        fechaFin: new Date('2026-12-31'),
        activo: true,
      },
    });
    cicloActivoId = cicloActivo.id;
  }, 30_000);

  afterAll(async () => {
    // Cleanup acotado por los ids de fixture de ESTA suite (nunca TRUNCATE
    // global — soporte_tenant_test es compartida por otras suites).
    if (archivoIdsCreados.length > 0) {
      await tenantClient.archivoTicket.deleteMany({
        where: { archivoId: { in: archivoIdsCreados } },
      });
      await tenantClient.archivoOperacion.deleteMany({
        where: { archivoId: { in: archivoIdsCreados } },
      });
      await tenantClient.archivo.deleteMany({ where: { id: { in: archivoIdsCreados } } });
    }
    await tenantClient.operacionTicket.deleteMany({
      where: { ticket: { tipoId: { in: [tipoSoporteId, tipoComprasId] } } },
    });
    await tenantClient.ticket.deleteMany({
      where: { tipoId: { in: [tipoSoporteId, tipoComprasId] } },
    });
    await tenantClient.cicloCliente.delete({ where: { id: cicloActivoId } });
    await tenantClient.tipoOperacion.delete({ where: { id: tipoOpCambioEstadoId } });
    await tenantClient.prioridad.delete({ where: { id: prioridadMediaId } });
    await tenantClient.estado.deleteMany({
      where: { id: { in: [estadoNuevoId, estadoEnProcesoId] } },
    });
    await tenantClient.tipoTicket.deleteMany({
      where: { id: { in: [tipoSoporteId, tipoComprasId] } },
    });
    await prismaService.onModuleDestroy();
  }, 30_000);

  // ─────────────────────────────────────────────────────────────────────
  // PrismaTicketRepository (T5.1, T5.3)
  // ─────────────────────────────────────────────────────────────────────

  describe('PrismaTicketRepository', () => {
    describe('save() + findById()', () => {
      it('persiste un ticket nuevo y lo recupera por id con UUIDv7', async () => {
        const ticket = TicketEntity.create(makeTicketProps());

        await withTenant(async () => {
          await ticketRepo.save(ticket);
          const found = await ticketRepo.findById(ticket.id);

          expect(found).not.toBeNull();
          expect(found!.id).toBe(ticket.id);
          expect(found!.numero).toBe(ticket.numero);
          expect(found!.estadoId).toBe(estadoNuevoId);
          expect(found!.deletedAt).toBeNull();
          expect(ticket.id).toMatch(
            /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
          );
        });
      });

      it('retorna null cuando el id no existe', async () => {
        await withTenant(async () => {
          const found = await ticketRepo.findById('01900000-0000-7000-8000-000000000099');
          expect(found).toBeNull();
        });
      });

      it('save() upsert — actualiza el estadoId al guardar de nuevo el mismo ticket', async () => {
        const ticket = TicketEntity.create(makeTicketProps());

        await withTenant(async () => {
          await ticketRepo.save(ticket);
          ticket.updateEstado(estadoEnProcesoId);
          await ticketRepo.save(ticket);

          const found = await ticketRepo.findById(ticket.id);
          expect(found!.estadoId).toBe(estadoEnProcesoId);
        });
      });
    });

    describe('findByNumero()', () => {
      it('encuentra un ticket por su número legible', async () => {
        const ticket = TicketEntity.create(makeTicketProps({ numero: 'T5-FINDNUM-00001' }));

        await withTenant(async () => {
          await ticketRepo.save(ticket);
          const found = await ticketRepo.findByNumero('T5-FINDNUM-00001');
          expect(found).not.toBeNull();
          expect(found!.id).toBe(ticket.id);
        });
      });

      it('retorna null cuando el número no existe', async () => {
        await withTenant(async () => {
          const found = await ticketRepo.findByNumero('T5-NOEXISTE-99999');
          expect(found).toBeNull();
        });
      });
    });

    describe('findLastSecuencia() — comportamiento secuencial (sin concurrencia, ver spec dedicado T5.2)', () => {
      it('retorna 0 cuando no hay tickets para ese tipo y año', async () => {
        await withTenant(async () => {
          const last = await ticketRepo.findLastSecuencia(tipoSoporteId, 2071);
          expect(last).toBe(0);
        });
      });

      it('retorna el mayor número de secuencia de ese tipo y año', async () => {
        await withTenant(async () => {
          await ticketRepo.save(
            TicketEntity.create(
              makeTicketProps({ numero: 'SOP-2072-00010', tipoId: tipoSoporteId }),
            ),
          );
          await ticketRepo.save(
            TicketEntity.create(
              makeTicketProps({ numero: 'SOP-2072-00042', tipoId: tipoSoporteId }),
            ),
          );
          await ticketRepo.save(
            TicketEntity.create(
              makeTicketProps({ numero: 'SOP-2072-00005', tipoId: tipoSoporteId }),
            ),
          );

          const last = await ticketRepo.findLastSecuencia(tipoSoporteId, 2072);
          expect(last).toBe(42);
        });
      });

      it('secuencias son locales al tipo — COMPRAS no interfiere con SOPORTE', async () => {
        await withTenant(async () => {
          await ticketRepo.save(
            TicketEntity.create(
              makeTicketProps({ numero: 'SOP-2073-00003', tipoId: tipoSoporteId }),
            ),
          );
          await ticketRepo.save(
            TicketEntity.create(
              makeTicketProps({ numero: 'COM-2073-00099', tipoId: tipoComprasId }),
            ),
          );

          const sopLast = await ticketRepo.findLastSecuencia(tipoSoporteId, 2073);
          const comLast = await ticketRepo.findLastSecuencia(tipoComprasId, 2073);

          expect(sopLast).toBe(3);
          expect(comLast).toBe(99);
        });
      });

      it('secuencias se resetean por año — 2074 no interfiere con 2075', async () => {
        await withTenant(async () => {
          await ticketRepo.save(
            TicketEntity.create(
              makeTicketProps({ numero: 'SOP-2074-00090', tipoId: tipoSoporteId }),
            ),
          );
          await ticketRepo.save(
            TicketEntity.create(
              makeTicketProps({ numero: 'SOP-2075-00005', tipoId: tipoSoporteId }),
            ),
          );

          const last2075 = await ticketRepo.findLastSecuencia(tipoSoporteId, 2075);
          expect(last2075).toBe(5);
        });
      });
    });

    describe('delete() — soft delete', () => {
      it('setea deleted_at y findById sigue retornando el ticket', async () => {
        const ticket = TicketEntity.create(makeTicketProps());

        await withTenant(async () => {
          await ticketRepo.save(ticket);
          await ticketRepo.delete(ticket.id);

          const found = await ticketRepo.findById(ticket.id);
          expect(found).not.toBeNull();
          expect(found!.isDeleted()).toBe(true);
          expect(found!.deletedAt).not.toBeNull();
        });
      });
    });

    describe('findAll(filtros?) — T7: filtros combinables + orden created_at DESC', () => {
      it('excluye tickets soft-deleted', async () => {
        const activo = TicketEntity.create(makeTicketProps());
        const eliminado = TicketEntity.create(makeTicketProps());

        await withTenant(async () => {
          await ticketRepo.save(activo);
          await ticketRepo.save(eliminado);
          await ticketRepo.delete(eliminado.id);

          const all = await ticketRepo.findAll();
          const ids = all.map((t) => t.id);
          expect(ids).toContain(activo.id);
          expect(ids).not.toContain(eliminado.id);
        });
      });

      it('filtra por estadoId', async () => {
        const enProceso = TicketEntity.create(makeTicketProps({ estadoId: estadoEnProcesoId }));
        const nuevo = TicketEntity.create(makeTicketProps({ estadoId: estadoNuevoId }));

        await withTenant(async () => {
          await ticketRepo.save(enProceso);
          await ticketRepo.save(nuevo);

          const result = await ticketRepo.findAll({ estadoId: estadoEnProcesoId });
          const ids = result.map((t) => t.id);
          expect(ids).toContain(enProceso.id);
          expect(ids).not.toContain(nuevo.id);
        });
      });

      it('filtra por tiposIds', async () => {
        const sop = TicketEntity.create(makeTicketProps({ tipoId: tipoSoporteId }));
        const com = TicketEntity.create(makeTicketProps({ tipoId: tipoComprasId }));

        await withTenant(async () => {
          await ticketRepo.save(sop);
          await ticketRepo.save(com);

          const result = await ticketRepo.findAll({ tiposIds: [tipoSoporteId] });
          const ids = result.map((t) => t.id);
          expect(ids).toContain(sop.id);
          expect(ids).not.toContain(com.id);
        });
      });

      it('filtra por asignadoId', async () => {
        const asignado = TicketEntity.create(makeTicketProps());
        asignado.assignTo(DUMMY_ASIGNADO_ID);
        const sinAsignar = TicketEntity.create(makeTicketProps());

        await withTenant(async () => {
          await ticketRepo.save(asignado);
          await ticketRepo.save(sinAsignar);

          const result = await ticketRepo.findAll({ asignadoId: DUMMY_ASIGNADO_ID });
          const ids = result.map((t) => t.id);
          expect(ids).toContain(asignado.id);
          expect(ids).not.toContain(sinAsignar.id);
        });
      });

      it('filtra por soloSolicitante (scope T6/T7 — USUARIO ve solo lo propio)', async () => {
        const propio = TicketEntity.create(
          makeTicketProps({ solicitanteId: '01900000-0000-7000-8000-000000000101' }),
        );
        const ajeno = TicketEntity.create(
          makeTicketProps({ solicitanteId: '01900000-0000-7000-8000-000000000102' }),
        );

        await withTenant(async () => {
          await ticketRepo.save(propio);
          await ticketRepo.save(ajeno);

          const result = await ticketRepo.findAll({
            soloSolicitante: '01900000-0000-7000-8000-000000000101',
          });
          const ids = result.map((t) => t.id);
          expect(ids).toContain(propio.id);
          expect(ids).not.toContain(ajeno.id);
        });
      });

      it('filtra por cicloId', async () => {
        const conCiclo = TicketEntity.create(makeTicketProps({ cicloId: cicloActivoId }));
        const sinCiclo = TicketEntity.create(makeTicketProps({ cicloId: null }));

        await withTenant(async () => {
          await ticketRepo.save(conCiclo);
          await ticketRepo.save(sinCiclo);

          const result = await ticketRepo.findAll({ cicloId: cicloActivoId });
          const ids = result.map((t) => t.id);
          expect(ids).toContain(conCiclo.id);
          expect(ids).not.toContain(sinCiclo.id);
        });
      });

      it('filtra por rango fechaDesde/fechaHasta', async () => {
        const enRango = TicketEntity.create(makeTicketProps());

        await withTenant(async () => {
          await ticketRepo.save(enRango);

          const ahora = new Date();
          const ayer = new Date(ahora);
          ayer.setUTCDate(ayer.getUTCDate() - 1);
          const manana = new Date(ahora);
          manana.setUTCDate(manana.getUTCDate() + 1);

          const result = await ticketRepo.findAll({ fechaDesde: ayer, fechaHasta: manana });
          const ids = result.map((t) => t.id);
          expect(ids).toContain(enRango.id);
        });
      });

      it('paginación: limit/offset acotan la página sin alterar el total (T7, PR6)', async () => {
        const tipoPaginacion = await tenantClient.tipoTicket.create({
          data: {
            codigo: `T5_TEST_PAG_${randomBytes(3).toString('hex')}`,
            activo: true,
            nombre: 'Paginacion',
          },
        });

        await withTenant(async () => {
          for (let i = 0; i < 5; i += 1) {
            await ticketRepo.save(
              TicketEntity.create(makeTicketProps({ tipoId: tipoPaginacion.id })),
            );
          }

          const pagina1 = await ticketRepo.findAll({
            tiposIds: [tipoPaginacion.id],
            limit: 2,
            offset: 0,
          });
          const pagina2 = await ticketRepo.findAll({
            tiposIds: [tipoPaginacion.id],
            limit: 2,
            offset: 2,
          });
          const total = await ticketRepo.count({ tiposIds: [tipoPaginacion.id] });

          expect(pagina1).toHaveLength(2);
          expect(pagina2).toHaveLength(2);
          expect(total).toBe(5);
          expect(pagina1.map((t) => t.id)).not.toEqual(pagina2.map((t) => t.id));
        });

        await tenantClient.ticket.deleteMany({ where: { tipoId: tipoPaginacion.id } });
        await tenantClient.tipoTicket.delete({ where: { id: tipoPaginacion.id } });
      });

      it('B1/B4: busqueda — ILIKE case-insensitive combinado (OR) en titulo/descripcion', async () => {
        const porTitulo = TicketEntity.create(
          makeTicketProps({ titulo: 'Falla de IMPRESORA en piso 3', descripcion: null }),
        );
        const porDescripcion = TicketEntity.create(
          makeTicketProps({
            titulo: 'Reclamo genérico',
            descripcion: 'El usuario reporta una impresora atascada',
          }),
        );
        const sinCoincidencia = TicketEntity.create(
          makeTicketProps({ titulo: 'Alta de usuario nuevo', descripcion: 'Sin relación' }),
        );

        await withTenant(async () => {
          await ticketRepo.save(porTitulo);
          await ticketRepo.save(porDescripcion);
          await ticketRepo.save(sinCoincidencia);

          const result = await ticketRepo.findAll({ busqueda: 'impresora' });
          const ids = result.map((t) => t.id);
          expect(ids).toContain(porTitulo.id);
          expect(ids).toContain(porDescripcion.id);
          expect(ids).not.toContain(sinCoincidencia.id);
        });
      });

      it('B1/B4: busqueda se combina (AND) con otros filtros existentes', async () => {
        const coincideAmbos = TicketEntity.create(
          makeTicketProps({ titulo: 'Router WiFi caído', estadoId: estadoEnProcesoId }),
        );
        const coincideSoloTexto = TicketEntity.create(
          makeTicketProps({ titulo: 'Router WiFi caído', estadoId: estadoNuevoId }),
        );

        await withTenant(async () => {
          await ticketRepo.save(coincideAmbos);
          await ticketRepo.save(coincideSoloTexto);

          const result = await ticketRepo.findAll({
            busqueda: 'router',
            estadoId: estadoEnProcesoId,
          });
          const ids = result.map((t) => t.id);
          expect(ids).toContain(coincideAmbos.id);
          expect(ids).not.toContain(coincideSoloTexto.id);
        });
      });

      it('B1/B4/B3: busqueda + paginacion — total refleja el universo, items la página', async () => {
        const tipoBusqueda = await tenantClient.tipoTicket.create({
          data: {
            codigo: `T5_TEST_BUSQ_${randomBytes(3).toString('hex')}`,
            activo: true,
            nombre: 'Busqueda',
          },
        });

        await withTenant(async () => {
          for (let i = 0; i < 3; i += 1) {
            await ticketRepo.save(
              TicketEntity.create(
                makeTicketProps({ tipoId: tipoBusqueda.id, titulo: `Notebook rota #${i}` }),
              ),
            );
          }

          const pagina1 = await ticketRepo.findAll({
            tiposIds: [tipoBusqueda.id],
            busqueda: 'notebook',
            limit: 2,
            offset: 0,
          });
          const total = await ticketRepo.count({
            tiposIds: [tipoBusqueda.id],
            busqueda: 'notebook',
          });

          expect(pagina1).toHaveLength(2);
          expect(total).toBe(3);
        });

        await tenantClient.ticket.deleteMany({ where: { tipoId: tipoBusqueda.id } });
        await tenantClient.tipoTicket.delete({ where: { id: tipoBusqueda.id } });
      });
    });

    describe('count(filtros?) — total real ignorando limit/offset (T7, PR6)', () => {
      it('cuenta los tickets que cumplen los filtros, excluyendo soft-deleted', async () => {
        const eliminado = TicketEntity.create(makeTicketProps({ estadoId: estadoEnProcesoId }));

        await withTenant(async () => {
          await ticketRepo.save(eliminado);
          await ticketRepo.delete(eliminado.id);

          const total = await ticketRepo.count({ estadoId: estadoEnProcesoId });
          const encontrados = await ticketRepo.findAll({ estadoId: estadoEnProcesoId });
          expect(total).toBe(encontrados.length);
        });
      });
    });

    describe('Aislamiento (T23) — repo sin TenantContext activo', () => {
      it('lanza un error descriptivo si no hay TenantContext activo', async () => {
        const looseContext = new TenantContext();
        const looseRepo = new PrismaTicketRepository(looseContext);
        await expect(looseRepo.findById('01900000-0000-7000-8000-000000000099')).rejects.toThrow(
          /No hay TenantContext activo/,
        );
      });
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // PrismaOperacionTicketRepository (T5.4)
  // ─────────────────────────────────────────────────────────────────────

  describe('PrismaOperacionTicketRepository', () => {
    it('persiste una operación y la recupera por ticketId (listByTicket)', async () => {
      const ticket = TicketEntity.create(makeTicketProps());
      const operacion = OperacionTicketEntity.create(makeOperacionProps(ticket.id));

      await withTenant(async () => {
        await ticketRepo.save(ticket);
        await operacionRepo.save(operacion);

        const ops = await operacionRepo.listByTicket(ticket.id);
        expect(ops.length).toBe(1);
        expect(ops[0].id).toBe(operacion.id);
        expect(ops[0].estadoNuevoId).toBe(estadoNuevoId);
      });
    });

    it('listByTicket() retorna en orden cronológico (created_at ASC)', async () => {
      const ticket = TicketEntity.create(makeTicketProps());
      const op1 = OperacionTicketEntity.create(makeOperacionProps(ticket.id));
      const op2 = OperacionTicketEntity.create({
        ...makeOperacionProps(ticket.id),
        descripcion: 'Segundo evento',
      });

      await withTenant(async () => {
        await ticketRepo.save(ticket);
        await operacionRepo.save(op1);
        await operacionRepo.save(op2);

        const ops = await operacionRepo.listByTicket(ticket.id);
        expect(ops.length).toBe(2);
        expect(ops[0].createdAt.getTime()).toBeLessThanOrEqual(ops[1].createdAt.getTime());
      });
    });

    it('listByTicket() retorna vacío cuando no hay operaciones', async () => {
      await withTenant(async () => {
        const ops = await operacionRepo.listByTicket('01900000-0000-7000-8000-000000000099');
        expect(ops).toHaveLength(0);
      });
    });

    it('persiste metadata JSON no-null correctamente', async () => {
      const ticket = TicketEntity.create(makeTicketProps());
      const operacion = OperacionTicketEntity.create({
        ...makeOperacionProps(ticket.id),
        metadata: { previo: null, nuevo: DUMMY_ASIGNADO_ID },
      });

      await withTenant(async () => {
        await ticketRepo.save(ticket);
        await operacionRepo.save(operacion);

        const ops = await operacionRepo.listByTicket(ticket.id);
        expect(ops[0].metadata).toEqual({ previo: null, nuevo: DUMMY_ASIGNADO_ID });
      });
    });

    it('esInterno=true se persiste y se recupera correctamente (T17/T18)', async () => {
      const ticket = TicketEntity.create(makeTicketProps());
      const notaInterna = OperacionTicketEntity.create({
        ...makeOperacionProps(ticket.id),
        esInterno: true,
      });

      await withTenant(async () => {
        await ticketRepo.save(ticket);
        await operacionRepo.save(notaInterna);

        const ops = await operacionRepo.listByTicket(ticket.id);
        expect(ops[0].esInterno).toBe(true);
      });
    });

    it('findById() recupera una operación por id (PR10, T22 — resuelve el ticket dueño desde operacionId)', async () => {
      const ticket = TicketEntity.create(makeTicketProps());
      const operacion = OperacionTicketEntity.create(makeOperacionProps(ticket.id));

      await withTenant(async () => {
        await ticketRepo.save(ticket);
        await operacionRepo.save(operacion);

        const encontrada = await operacionRepo.findById(operacion.id);
        expect(encontrada).not.toBeNull();
        expect(encontrada?.ticketId).toBe(ticket.id);
      });
    });

    it('findById() retorna null cuando el id no existe', async () => {
      await withTenant(async () => {
        const encontrada = await operacionRepo.findById('01900000-0000-7000-8000-000000000099');
        expect(encontrada).toBeNull();
      });
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // PrismaArchivoRepository (alcance PR5 explícito de esta sesión)
  // ─────────────────────────────────────────────────────────────────────

  describe('PrismaArchivoRepository', () => {
    it('persiste un archivo (metadata; el binario vive en IFileStorage, ADR-7)', async () => {
      const archivo = ArchivoEntity.create(makeArchivoProps('meta')).getOrThrow();
      archivoIdsCreados.push(archivo.id);

      await withTenant(async () => {
        await archivoRepo.save(archivo);

        const row = await tenantClient.archivo.findUnique({ where: { id: archivo.id } });
        expect(row).not.toBeNull();
        expect(row!.nombreOriginal).toBe('archivo-meta.pdf');
        expect(row!.tamanoBytes).toBe(BigInt(1024));
      });
    });

    it('linkToTicket() crea la fila en archivos_ticket (join N:M, T22)', async () => {
      const ticket = TicketEntity.create(makeTicketProps());
      const archivo = ArchivoEntity.create(makeArchivoProps('link-ticket')).getOrThrow();
      archivoIdsCreados.push(archivo.id);

      await withTenant(async () => {
        await ticketRepo.save(ticket);
        await archivoRepo.save(archivo);
        await archivoRepo.linkToTicket(archivo.id, ticket.id);

        const join = await tenantClient.archivoTicket.findUnique({
          where: { archivoId_ticketId: { archivoId: archivo.id, ticketId: ticket.id } },
        });
        expect(join).not.toBeNull();
      });
    });

    it('linkToOperacion() crea la fila en archivos_operacion (join N:M, T22)', async () => {
      const ticket = TicketEntity.create(makeTicketProps());
      const operacion = OperacionTicketEntity.create(makeOperacionProps(ticket.id));
      const archivo = ArchivoEntity.create(makeArchivoProps('link-operacion')).getOrThrow();
      archivoIdsCreados.push(archivo.id);

      await withTenant(async () => {
        await ticketRepo.save(ticket);
        await operacionRepo.save(operacion);
        await archivoRepo.save(archivo);
        await archivoRepo.linkToOperacion(archivo.id, operacion.id);

        const join = await tenantClient.archivoOperacion.findUnique({
          where: { archivoId_operacionId: { archivoId: archivo.id, operacionId: operacion.id } },
        });
        expect(join).not.toBeNull();
      });
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // PrismaCicloClienteRepository (T5.6)
  // ─────────────────────────────────────────────────────────────────────

  describe('PrismaCicloClienteRepository', () => {
    it('findActive() retorna el ciclo activo del tenant', async () => {
      await withTenant(async () => {
        const activo = await cicloRepo.findActive();
        expect(activo).not.toBeNull();
        expect(activo!.id).toBe(cicloActivoId);
        expect(activo!.activo).toBe(true);
      });
    });

    it('findById() retorna el ciclo por id', async () => {
      await withTenant(async () => {
        const ciclo = await cicloRepo.findById(cicloActivoId);
        expect(ciclo).not.toBeNull();
        expect(ciclo!.nombre).toBe('T5_TEST_CICLO_ACTIVO');
      });
    });

    it('findAll() incluye el ciclo de fixture', async () => {
      await withTenant(async () => {
        const todos = await cicloRepo.findAll();
        const ids = todos.map((c) => c.id);
        expect(ids).toContain(cicloActivoId);
      });
    });
  });
});
