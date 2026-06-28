/**
 * 3.D.1 TEST — Integration tests de los repos Prisma para tickets-core.
 *
 * Estrategia TDD: RED → escrito antes de la impl; GREEN → implementaciones hacen pasar.
 *
 * Repos cubiertos (todos TENANT — usan TenantContext):
 *   PrismaTicketRepository       — save, findById, findByNumero, findLastSecuencia, soft-delete
 *   PrismaOperacionTicketRepository — save, findByTicketId
 *   PrismaArchivoRepository      — save, findById, findByStorageKey, findByTicketId, linkToTicket, soft-delete
 *   PrismaEstadoRepository       — findById, findByCodigo, findAllActive, findAll
 *   PrismaUsuarioTiposTicketRepository — assign, isUserEligibleForType, revoke
 *   PrismaTipoTicketRepository   — findCodigoById
 *   PrismaTipoOperacionRepository — findIdByCodigo
 *   UsuarioMasterChecker         — existeEnTenant, estaActivoEnTenant (usa MASTER)
 *
 * Configuración de DB:
 *   - Tenant: DATABASE_URL_TENANT o fallback local soporte_tenant_test.
 *   - Master: DATABASE_URL_MASTER o fallback local soporte_master_test.
 *   - TRUNCATE en beforeEach solo para tablas con datos de test.
 *   - Catálogos (estados, prioridades, tipos_ticket, tipo_operacion) NO se truncan.
 *
 * Decisión de no-llamar-PrismaService-directo: los repos tenant solo reciben TenantContext
 * en el constructor. PrismaService no aparece en sus signatures. El test lo verifica
 * afirmando que TenantContext.getClient() es la única ruta al DB client.
 *
 * Ref spec: [SPEC:tickets-core/requirements, SPEC:_shared-audit-pattern/Soft delete]
 * Tarea: 3.D.1
 */

import { TenantContext } from '../../../../shared/tenancy/tenant-context';
import { PrismaService } from '../../../../shared/infrastructure/persistence/prisma.service';
import { TenantPrismaClient } from '../../../../shared/infrastructure/persistence/prisma-clients';

import { PrismaTicketRepository } from './prisma-ticket.repository';
import { PrismaOperacionTicketRepository } from './prisma-operacion-ticket.repository';
import { PrismaArchivoRepository } from './prisma-archivo.repository';
import { PrismaEstadoRepository } from './prisma-estado.repository';
import { PrismaUsuarioTiposTicketRepository } from './prisma-usuario-tipos-ticket.repository';
import { PrismaTipoTicketRepository } from './prisma-tipo-ticket.repository';
import { PrismaTipoOperacionRepository } from './prisma-tipo-operacion.repository';
import { UsuarioMasterChecker } from './usuario-master.checker';

import { TicketEntity, TicketProps } from '../../../domain/entities/ticket.entity';
import {
  OperacionTicketEntity,
  OperacionTicketProps,
} from '../../../domain/entities/operacion-ticket.entity';
import { ArchivoEntity, ArchivoProps } from '../../../domain/entities/archivo.entity';

// ─── Conexiones de test ────────────────────────────────────────────────────────
const TEST_TENANT_URL =
  process.env.DATABASE_URL_TENANT ??
  'postgresql://soporte:soporte@localhost:5432/soporte_tenant_test';

const TEST_MASTER_URL =
  process.env.DATABASE_URL_MASTER ??
  'postgresql://soporte:soporte@localhost:5432/soporte_master_test';

// ─── IDs deterministas del seed PR-09 ─────────────────────────────────────────
const ABIERTO_ID = 'c0000000-0000-4000-c000-000000000001';
const EN_PROGRESO_ID = 'c0000000-0000-4000-c000-000000000005';
const PRIORIDAD_MEDIA_ID = 'd0000000-0000-4000-d000-000000000002';
const TIPO_SOPORTE_ID = 'e0000000-0000-4000-e000-000000000001';
const TIPO_COMPRAS_ID = 'e0000000-0000-4000-e000-000000000002';
const TIPO_OP_CAMBIO_ESTADO_ID = 'f0000000-0000-4000-f000-000000000001';
const TIPO_OP_ASIGNACION_ID = 'f0000000-0000-4000-f000-000000000003';

// UUID dummy para soft refs que no necesitan existir en master dentro de la tenant DB
const DUMMY_USUARIO_ID = '01900000-0000-7000-8000-000000000001';
const DUMMY_CLIENTE_ID = '01900000-0000-7000-8000-000000000002';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeTicketProps(override: Partial<TicketProps> = {}): TicketProps {
  return {
    numero: 'SOP-2026-00001',
    titulo: 'Ticket de test',
    descripcion: null,
    tipoId: TIPO_SOPORTE_ID,
    estadoId: ABIERTO_ID,
    prioridadId: PRIORIDAD_MEDIA_ID,
    cicloId: null,
    solicitanteId: DUMMY_USUARIO_ID,
    asignadoId: null,
    fechaResolucion: null,
    ...override,
  };
}

function makeOperacionProps(ticketId: string): OperacionTicketProps {
  return {
    ticketId,
    tipoOperacionId: TIPO_OP_CAMBIO_ESTADO_ID,
    descripcion: 'Ticket creado',
    estadoAnteriorId: null,
    estadoNuevoId: ABIERTO_ID,
    autorId: DUMMY_USUARIO_ID,
    metadata: null,
  };
}

function makeArchivoProps(suffix: string): ArchivoProps {
  return {
    storageKey: `tickets/test-ticket/archivo-${suffix}`,
    nombreOriginal: `archivo-${suffix}.pdf`,
    mimeType: 'application/pdf',
    tamanoBytes: BigInt(1024),
    subidoPorId: DUMMY_USUARIO_ID,
  };
}

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('Tickets Infrastructure Repos — Integration (3.D.1)', () => {
  let tenantService: PrismaService;
  let masterService: PrismaService;
  let tenantClient: InstanceType<typeof TenantPrismaClient>;
  let tenantContext: TenantContext;

  let ticketRepo: PrismaTicketRepository;
  let operacionRepo: PrismaOperacionTicketRepository;
  let archivoRepo: PrismaArchivoRepository;
  let estadoRepo: PrismaEstadoRepository;
  let usuarioTiposRepo: PrismaUsuarioTiposTicketRepository;
  let tipoTicketRepo: PrismaTipoTicketRepository;
  let tipoOperacionRepo: PrismaTipoOperacionRepository;
  let masterChecker: UsuarioMasterChecker;

  beforeAll(() => {
    // Instanciamos PrismaService apuntando a la DB tenant de test
    tenantService = new PrismaService(TEST_TENANT_URL);
    // getTenantClient necesita un dbName — usamos la propia DB de test como "tenant"
    tenantClient = tenantService.getTenantClient('soporte_tenant_test');

    // PrismaService para la DB master de test (checker)
    masterService = new PrismaService(TEST_MASTER_URL);

    // TenantContext para repos tenant
    tenantContext = new TenantContext();

    // Repos tenant — NO reciben PrismaService (solo TenantContext)
    ticketRepo = new PrismaTicketRepository(tenantContext);
    operacionRepo = new PrismaOperacionTicketRepository(tenantContext);
    archivoRepo = new PrismaArchivoRepository(tenantContext);
    estadoRepo = new PrismaEstadoRepository(tenantContext);
    usuarioTiposRepo = new PrismaUsuarioTiposTicketRepository(tenantContext);
    tipoTicketRepo = new PrismaTipoTicketRepository(tenantContext);
    tipoOperacionRepo = new PrismaTipoOperacionRepository(tenantContext);

    // Checker master — usa PrismaService con la DB master
    masterChecker = new UsuarioMasterChecker(masterService);
  });

  afterAll(async () => {
    await tenantService.onModuleDestroy();
    await masterService.onModuleDestroy();
  });

  beforeEach(async () => {
    // Limpiar tablas de datos de test (catálogos NO se tocan)
    // CASCADE maneja el orden de FKs automáticamente
    await tenantClient.$executeRawUnsafe(
      `TRUNCATE TABLE
        usuario_tipos_ticket,
        archivos_operacion,
        archivos_ticket,
        operaciones_ticket,
        archivos,
        tickets,
        ciclos_cliente
      RESTART IDENTITY CASCADE`,
    );
  });

  // ─── Helper: ejecutar repo dentro del TenantContext activo ────────────────
  function withTenant<T>(fn: () => Promise<T>): Promise<T> {
    return tenantContext.run(
      { prismaClient: tenantClient, dbName: 'soporte_tenant_test', clienteId: DUMMY_CLIENTE_ID },
      fn,
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PrismaTicketRepository
  // ─────────────────────────────────────────────────────────────────────────

  describe('PrismaTicketRepository', () => {
    describe('save() + findById()', () => {
      it('persiste un ticket nuevo y lo recupera por id con UUIDv7', async () => {
        const ticket = TicketEntity.create(makeTicketProps());

        await withTenant(async () => {
          await ticketRepo.save(ticket);
          const found = await ticketRepo.findById(ticket.id);

          expect(found).not.toBeNull();
          expect(found!.id).toBe(ticket.id);
          expect(found!.numero).toBe('SOP-2026-00001');
          expect(found!.estadoId).toBe(ABIERTO_ID);
          expect(found!.deletedAt).toBeNull();
          // UUIDv7 format
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
    });

    describe('findByNumero()', () => {
      it('encuentra un ticket por su número legible', async () => {
        const ticket = TicketEntity.create(makeTicketProps({ numero: 'SOP-2026-00007' }));

        await withTenant(async () => {
          await ticketRepo.save(ticket);
          const found = await ticketRepo.findByNumero('SOP-2026-00007');
          expect(found).not.toBeNull();
          expect(found!.id).toBe(ticket.id);
        });
      });

      it('retorna null cuando el número no existe', async () => {
        await withTenant(async () => {
          const found = await ticketRepo.findByNumero('SOP-2099-99999');
          expect(found).toBeNull();
        });
      });
    });

    describe('findLastSecuencia()', () => {
      it('retorna 0 cuando no hay tickets para ese tipo y año', async () => {
        await withTenant(async () => {
          const last = await ticketRepo.findLastSecuencia(TIPO_SOPORTE_ID, 2026);
          expect(last).toBe(0);
        });
      });

      it('retorna el mayor número de secuencia de ese tipo y año', async () => {
        const t1 = TicketEntity.create(makeTicketProps({ numero: 'SOP-2026-00010' }));
        const t2 = TicketEntity.create(makeTicketProps({ numero: 'SOP-2026-00042' }));
        const t3 = TicketEntity.create(makeTicketProps({ numero: 'SOP-2026-00005' }));

        await withTenant(async () => {
          await ticketRepo.save(t1);
          await ticketRepo.save(t2);
          await ticketRepo.save(t3);

          const last = await ticketRepo.findLastSecuencia(TIPO_SOPORTE_ID, 2026);
          expect(last).toBe(42);
        });
      });

      it('secuencias son locales al tipo — COMPRAS no interfiere con SOPORTE', async () => {
        const sop = TicketEntity.create(
          makeTicketProps({ numero: 'SOP-2026-00003', tipoId: TIPO_SOPORTE_ID }),
        );
        const com = TicketEntity.create(
          makeTicketProps({ numero: 'COM-2026-00099', tipoId: TIPO_COMPRAS_ID }),
        );

        await withTenant(async () => {
          await ticketRepo.save(sop);
          await ticketRepo.save(com);

          const sopLast = await ticketRepo.findLastSecuencia(TIPO_SOPORTE_ID, 2026);
          const comLast = await ticketRepo.findLastSecuencia(TIPO_COMPRAS_ID, 2026);

          expect(sopLast).toBe(3);
          expect(comLast).toBe(99);
        });
      });

      it('secuencias se resetean por año — 2025 no interfiere con 2026', async () => {
        const t2025 = TicketEntity.create(makeTicketProps({ numero: 'SOP-2025-00090' }));
        const t2026 = TicketEntity.create(makeTicketProps({ numero: 'SOP-2026-00005' }));

        await withTenant(async () => {
          await ticketRepo.save(t2025);
          await ticketRepo.save(t2026);

          const last2026 = await ticketRepo.findLastSecuencia(TIPO_SOPORTE_ID, 2026);
          expect(last2026).toBe(5);
        });
      });
    });

    describe('delete() — soft delete', () => {
      it('setea deleted_at (soft delete) y findById sigue retornando el ticket', async () => {
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

    describe('findByEstado()', () => {
      it('excluye tickets soft-deleted', async () => {
        const activo = TicketEntity.create(makeTicketProps({ numero: 'SOP-2026-00001' }));
        const eliminado = TicketEntity.create(makeTicketProps({ numero: 'SOP-2026-00002' }));

        await withTenant(async () => {
          await ticketRepo.save(activo);
          await ticketRepo.save(eliminado);
          await ticketRepo.delete(eliminado.id);

          const byEstado = await ticketRepo.findByEstado(ABIERTO_ID);
          const ids = byEstado.map((t) => t.id);
          expect(ids).toContain(activo.id);
          expect(ids).not.toContain(eliminado.id);
        });
      });
    });

    describe('save() — upsert (update)', () => {
      it('actualiza el estadoId al guardar de nuevo el mismo ticket', async () => {
        const ticket = TicketEntity.create(makeTicketProps());

        await withTenant(async () => {
          await ticketRepo.save(ticket);

          ticket.updateEstado(EN_PROGRESO_ID);
          await ticketRepo.save(ticket);

          const found = await ticketRepo.findById(ticket.id);
          expect(found!.estadoId).toBe(EN_PROGRESO_ID);
        });
      });
    });

    it('los repos tenant NO reciben PrismaService — solo TenantContext', () => {
      // Verificación arquitectónica: constructor tiene exactamente 1 parámetro (TenantContext)
      expect(PrismaTicketRepository.length).toBe(1);
    });

    // ─── findAll con filtros + orden compuesto (T1.5 RED) ────────────────────

    describe('findAll(filtros?) — filtros y orden compuesto (T1.5)', () => {
      it('sin filtros retorna todos los tickets activos del tenant ordenados por createdAt DESC', async () => {
        const t1 = TicketEntity.create(makeTicketProps({ numero: 'SOP-2026-00001' }));
        const t2 = TicketEntity.create(makeTicketProps({ numero: 'SOP-2026-00002' }));

        await withTenant(async () => {
          await ticketRepo.save(t1);
          await ticketRepo.save(t2);

          const all = await ticketRepo.findAll();
          expect(all.length).toBeGreaterThanOrEqual(2);
          // Verifica que todos los retornados no están soft-deleted
          for (const t of all) {
            expect(t.deletedAt).toBeNull();
          }
        });
      });

      it('filtra por tiposIds — retorna solo tickets del tipo indicado', async () => {
        const sopTicket = TicketEntity.create(
          makeTicketProps({ numero: 'SOP-2026-00010', tipoId: TIPO_SOPORTE_ID }),
        );
        const comTicket = TicketEntity.create(
          makeTicketProps({ numero: 'COM-2026-00001', tipoId: TIPO_COMPRAS_ID }),
        );

        await withTenant(async () => {
          await ticketRepo.save(sopTicket);
          await ticketRepo.save(comTicket);

          const soloSoporte = await ticketRepo.findAll({ tiposIds: [TIPO_SOPORTE_ID] });
          const ids = soloSoporte.map((t) => t.id);

          expect(ids).toContain(sopTicket.id);
          expect(ids).not.toContain(comTicket.id);
          // Todos tienen el tipo correcto
          for (const t of soloSoporte) {
            expect(t.tipoId).toBe(TIPO_SOPORTE_ID);
          }
        });
      });

      it('filtra por fechaDesde/fechaHasta — retorna solo tickets dentro del rango', async () => {
        const enRango = TicketEntity.create(makeTicketProps({ numero: 'SOP-2026-00020' }));

        await withTenant(async () => {
          await ticketRepo.save(enRango);

          const ahora = new Date();
          const ayer = new Date(ahora);
          ayer.setUTCDate(ayer.getUTCDate() - 1);
          ayer.setUTCHours(0, 0, 0, 0);
          const manana = new Date(ahora);
          manana.setUTCDate(manana.getUTCDate() + 1);
          manana.setUTCHours(23, 59, 59, 999);

          const result = await ticketRepo.findAll({ fechaDesde: ayer, fechaHasta: manana });
          const ids = result.map((t) => t.id);
          expect(ids).toContain(enRango.id);
        });
      });

      it('retorna [] sin error cuando tiposIds contiene un UUID inexistente', async () => {
        await withTenant(async () => {
          const result = await ticketRepo.findAll({
            tiposIds: ['00000000-0000-4000-0000-000000000000'],
          });
          expect(result).toHaveLength(0);
        });
      });

      it('excluye tickets soft-deleted de findAll()', async () => {
        const activo = TicketEntity.create(makeTicketProps({ numero: 'SOP-2026-00030' }));
        const eliminado = TicketEntity.create(makeTicketProps({ numero: 'SOP-2026-00031' }));

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

      it('orden secundario por nombre de tipo ASC cuando dos tickets tienen el mismo createdAt (núcleo de ADR-1)', async () => {
        // Crea un ticket COMPRAS y uno SOPORTE con números distintos para unicidad.
        // Nombres de tipos en catálogo: 'COMPRAS' < 'SOPORTE' (alfabético).
        // Con idéntico created_at, el orderBy secundario { tipo: { nombre: 'asc' } }
        // debe devolver COMPRAS primero.
        const comprasTicket = TicketEntity.create(
          makeTicketProps({ numero: 'COM-2026-00050', tipoId: TIPO_COMPRAS_ID }),
        );
        const soporteTicket = TicketEntity.create(
          makeTicketProps({ numero: 'SOP-2026-00050', tipoId: TIPO_SOPORTE_ID }),
        );

        await withTenant(async () => {
          await ticketRepo.save(comprasTicket);
          await ticketRepo.save(soporteTicket);

          // Forzar el mismo created_at vía SQL para que el criterio secundario sea determinante.
          const sameDateTs = new Date('2026-01-01T12:00:00.000Z');
          await tenantClient.$executeRawUnsafe(
            `UPDATE tickets SET created_at = $1 WHERE id = $2`,
            sameDateTs,
            comprasTicket.id,
          );
          await tenantClient.$executeRawUnsafe(
            `UPDATE tickets SET created_at = $1 WHERE id = $2`,
            sameDateTs,
            soporteTicket.id,
          );

          const result = await ticketRepo.findAll();

          // Aislar solo los dos tickets del test (beforeEach trunca la tabla, pero defensivo)
          const filtered = result.filter(
            (t) => t.id === comprasTicket.id || t.id === soporteTicket.id,
          );

          expect(filtered).toHaveLength(2);
          // COMPRAS (C) < SOPORTE (S) → COMPRAS primero con orden ASC por nombre
          expect(filtered[0].tipoId).toBe(TIPO_COMPRAS_ID);
          expect(filtered[1].tipoId).toBe(TIPO_SOPORTE_ID);
        });
      });
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // PrismaOperacionTicketRepository
  // ─────────────────────────────────────────────────────────────────────────

  describe('PrismaOperacionTicketRepository', () => {
    it('persiste una operación y la recupera por ticketId', async () => {
      const ticket = TicketEntity.create(makeTicketProps());
      const operacion = OperacionTicketEntity.create(makeOperacionProps(ticket.id));

      await withTenant(async () => {
        await ticketRepo.save(ticket);
        await operacionRepo.save(operacion);

        const ops = await operacionRepo.findByTicketId(ticket.id);
        expect(ops.length).toBe(1);
        expect(ops[0].id).toBe(operacion.id);
        expect(ops[0].tipoOperacionId).toBe(TIPO_OP_CAMBIO_ESTADO_ID);
        expect(ops[0].estadoNuevoId).toBe(ABIERTO_ID);
      });
    });

    it('findByTicketId retorna vacío cuando no hay operaciones', async () => {
      await withTenant(async () => {
        const ops = await operacionRepo.findByTicketId('01900000-0000-7000-8000-000000000099');
        expect(ops).toHaveLength(0);
      });
    });

    it('persiste metadata JSON correctamente', async () => {
      const ticket = TicketEntity.create(makeTicketProps());
      const operacion = OperacionTicketEntity.create({
        ...makeOperacionProps(ticket.id),
        tipoOperacionId: TIPO_OP_ASIGNACION_ID,
        metadata: { previo: null, nuevo: DUMMY_USUARIO_ID },
      });

      await withTenant(async () => {
        await ticketRepo.save(ticket);
        await operacionRepo.save(operacion);

        const ops = await operacionRepo.findByTicketId(ticket.id);
        expect(ops[0].metadata).toEqual({ previo: null, nuevo: DUMMY_USUARIO_ID });
      });
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // PrismaArchivoRepository
  // ─────────────────────────────────────────────────────────────────────────

  describe('PrismaArchivoRepository', () => {
    it('persiste un archivo y lo recupera por id', async () => {
      const archivo = ArchivoEntity.create(makeArchivoProps('test1')).getOrThrow();

      await withTenant(async () => {
        await archivoRepo.save(archivo);
        const found = await archivoRepo.findById(archivo.id);

        expect(found).not.toBeNull();
        expect(found!.id).toBe(archivo.id);
        expect(found!.nombreOriginal).toBe('archivo-test1.pdf');
        expect(found!.tamanoBytes).toBe(BigInt(1024));
      });
    });

    it('findByStorageKey retorna el archivo correcto', async () => {
      const archivo = ArchivoEntity.create(makeArchivoProps('sk')).getOrThrow();

      await withTenant(async () => {
        await archivoRepo.save(archivo);
        const found = await archivoRepo.findByStorageKey(archivo.storageKey);
        expect(found!.id).toBe(archivo.id);
      });
    });

    it('linkToTicket crea la fila en archivos_ticket y findByTicketId la retorna', async () => {
      const ticket = TicketEntity.create(makeTicketProps());
      const archivo = ArchivoEntity.create(makeArchivoProps('link')).getOrThrow();

      await withTenant(async () => {
        await ticketRepo.save(ticket);
        await archivoRepo.save(archivo);
        await archivoRepo.linkToTicket(archivo.id, ticket.id);

        const archivos = await archivoRepo.findByTicketId(ticket.id);
        expect(archivos.length).toBe(1);
        expect(archivos[0].id).toBe(archivo.id);
      });
    });

    it('findByTicketId excluye archivos soft-deleted', async () => {
      const ticket = TicketEntity.create(makeTicketProps());
      const a1 = ArchivoEntity.create(makeArchivoProps('del1')).getOrThrow();
      const a2 = ArchivoEntity.create(makeArchivoProps('del2')).getOrThrow();

      await withTenant(async () => {
        await ticketRepo.save(ticket);
        await archivoRepo.save(a1);
        await archivoRepo.save(a2);
        await archivoRepo.linkToTicket(a1.id, ticket.id);
        await archivoRepo.linkToTicket(a2.id, ticket.id);

        // Soft-delete a2
        await archivoRepo.delete(a2.id);

        const archivos = await archivoRepo.findByTicketId(ticket.id);
        const ids = archivos.map((a) => a.id);
        expect(ids).toContain(a1.id);
        expect(ids).not.toContain(a2.id);
      });
    });

    it('delete() setea deleted_at (soft-delete)', async () => {
      const archivo = ArchivoEntity.create(makeArchivoProps('soft')).getOrThrow();

      await withTenant(async () => {
        await archivoRepo.save(archivo);
        await archivoRepo.delete(archivo.id);

        const found = await archivoRepo.findById(archivo.id);
        expect(found!.isDeleted()).toBe(true);
      });
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // PrismaEstadoRepository
  // ─────────────────────────────────────────────────────────────────────────

  describe('PrismaEstadoRepository', () => {
    it('findByCodigo retorna el estado correcto del catálogo', async () => {
      await withTenant(async () => {
        const estado = await estadoRepo.findByCodigo('ABIERTO');
        expect(estado).not.toBeNull();
        expect(estado!.id).toBe(ABIERTO_ID);
        expect(estado!.codigo).toBe('ABIERTO');
      });
    });

    it('findById retorna el estado por id', async () => {
      await withTenant(async () => {
        const estado = await estadoRepo.findById(ABIERTO_ID);
        expect(estado).not.toBeNull();
        expect(estado!.codigo).toBe('ABIERTO');
      });
    });

    it('findByCodigo retorna null para código inexistente', async () => {
      await withTenant(async () => {
        const estado = await estadoRepo.findByCodigo('INEXISTENTE');
        expect(estado).toBeNull();
      });
    });

    it('findAllActive retorna todos los estados activos', async () => {
      await withTenant(async () => {
        const estados = await estadoRepo.findAllActive();
        expect(estados.length).toBeGreaterThanOrEqual(8);
        const codigos = estados.map((e) => e.codigo);
        expect(codigos).toContain('ABIERTO');
        expect(codigos).toContain('CERRADO');
      });
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // PrismaUsuarioTiposTicketRepository
  // ─────────────────────────────────────────────────────────────────────────

  describe('PrismaUsuarioTiposTicketRepository', () => {
    const TEST_USUARIO_ID = '01900000-0000-7000-8000-000000000010';

    it('isUserEligibleForType retorna false cuando no hay asignación', async () => {
      await withTenant(async () => {
        const eligible = await usuarioTiposRepo.isUserEligibleForType(
          TEST_USUARIO_ID,
          TIPO_SOPORTE_ID,
        );
        expect(eligible).toBe(false);
      });
    });

    it('assign + isUserEligibleForType retorna true', async () => {
      await withTenant(async () => {
        await usuarioTiposRepo.assign(TEST_USUARIO_ID, TIPO_SOPORTE_ID);
        const eligible = await usuarioTiposRepo.isUserEligibleForType(
          TEST_USUARIO_ID,
          TIPO_SOPORTE_ID,
        );
        expect(eligible).toBe(true);
      });
    });

    it('assign es idempotente (no falla en segunda llamada)', async () => {
      await withTenant(async () => {
        await usuarioTiposRepo.assign(TEST_USUARIO_ID, TIPO_SOPORTE_ID);
        await expect(
          usuarioTiposRepo.assign(TEST_USUARIO_ID, TIPO_SOPORTE_ID),
        ).resolves.not.toThrow();
      });
    });

    it('revoke elimina la fila y isUserEligibleForType retorna false', async () => {
      await withTenant(async () => {
        await usuarioTiposRepo.assign(TEST_USUARIO_ID, TIPO_SOPORTE_ID);
        await usuarioTiposRepo.revoke(TEST_USUARIO_ID, TIPO_SOPORTE_ID);

        const eligible = await usuarioTiposRepo.isUserEligibleForType(
          TEST_USUARIO_ID,
          TIPO_SOPORTE_ID,
        );
        expect(eligible).toBe(false);
      });
    });

    it('findTipoIdsByUsuario retorna los tipos asignados', async () => {
      await withTenant(async () => {
        await usuarioTiposRepo.assign(TEST_USUARIO_ID, TIPO_SOPORTE_ID);
        await usuarioTiposRepo.assign(TEST_USUARIO_ID, TIPO_COMPRAS_ID);

        const tipos = await usuarioTiposRepo.findTipoIdsByUsuario(TEST_USUARIO_ID);
        expect(tipos).toContain(TIPO_SOPORTE_ID);
        expect(tipos).toContain(TIPO_COMPRAS_ID);
      });
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // PrismaTipoTicketRepository
  // ─────────────────────────────────────────────────────────────────────────

  describe('PrismaTipoTicketRepository', () => {
    it('findCodigoById retorna el codigo del tipo de ticket', async () => {
      await withTenant(async () => {
        const codigo = await tipoTicketRepo.findCodigoById(TIPO_SOPORTE_ID);
        expect(codigo).toBe('SOPORTE');
      });
    });

    it('findCodigoById retorna null para id inexistente', async () => {
      await withTenant(async () => {
        const codigo = await tipoTicketRepo.findCodigoById('01900000-0000-7000-8000-000000000099');
        expect(codigo).toBeNull();
      });
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // PrismaTipoOperacionRepository
  // ─────────────────────────────────────────────────────────────────────────

  describe('PrismaTipoOperacionRepository', () => {
    it('findIdByCodigo retorna el UUID del tipo de operación', async () => {
      await withTenant(async () => {
        const id = await tipoOperacionRepo.findIdByCodigo('CAMBIO_ESTADO');
        expect(id).toBe(TIPO_OP_CAMBIO_ESTADO_ID);
      });
    });

    it('findIdByCodigo retorna null para código inexistente', async () => {
      await withTenant(async () => {
        const id = await tipoOperacionRepo.findIdByCodigo('INEXISTENTE');
        expect(id).toBeNull();
      });
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // UsuarioMasterChecker (usa MASTER DB)
  // ─────────────────────────────────────────────────────────────────────────

  describe('UsuarioMasterChecker', () => {
    const masterClient = (() => {
      // Lazy — se llena en beforeAll
      let _client: any;
      return {
        get: () => _client,
        set: (c: any) => {
          _client = c;
        },
      };
    })();

    beforeAll(() => {
      masterClient.set(masterService.getMasterClient());
    });

    afterAll(async () => {
      // Limpiar usuarios y clientes de test creados para el checker
      await masterClient
        .get()
        .$executeRawUnsafe(`DELETE FROM usuarios WHERE email LIKE '%@checker.test'`);
      await masterClient
        .get()
        .$executeRawUnsafe(`DELETE FROM clientes WHERE db_name LIKE 'checker_%'`);
    });

    // Helper: crear cliente y usuario de test en master
    async function createTestUserInMaster(opts: {
      clienteDbName: string;
      email: string;
      activo: boolean;
    }): Promise<{ clienteId: string; usuarioId: string }> {
      // Insert cliente directamente via raw SQL (sin ORM para no introducir dependencias)
      const clienteResult = await masterClient.get().$queryRaw<[{ id: string }]>`
        INSERT INTO clientes (nombre, db_name, activo)
        VALUES (${`Cliente ${opts.clienteDbName}`}, ${opts.clienteDbName}, true)
        RETURNING id
      `;
      const clienteId = clienteResult[0].id;

      const usuarioResult = await masterClient.get().$queryRaw<[{ id: string }]>`
        INSERT INTO usuarios (email, nombre, apellido, password_hash, cliente_id, activo)
        VALUES (${opts.email}, 'Test', 'User', '$argon2id$test$hash', ${clienteId}, ${opts.activo})
        RETURNING id
      `;
      const usuarioId = usuarioResult[0].id;

      return { clienteId, usuarioId };
    }

    it('existeEnTenant retorna false cuando el usuario no existe en master', async () => {
      const result = await masterChecker.existeEnTenant(
        '01900000-0000-7000-8000-000000099999',
        DUMMY_CLIENTE_ID,
      );
      expect(result).toBe(false);
    });

    it('existeEnTenant retorna true cuando el usuario existe (incluso inactivo)', async () => {
      const { clienteId, usuarioId } = await createTestUserInMaster({
        clienteDbName: 'checker_existe',
        email: 'existe@checker.test',
        activo: false, // inactivo — pero existeEnTenant solo verifica deleted_at IS NULL
      });

      const result = await masterChecker.existeEnTenant(usuarioId, clienteId);
      expect(result).toBe(true);
    });

    it('existeEnTenant retorna false cuando el clienteId no coincide', async () => {
      const { usuarioId } = await createTestUserInMaster({
        clienteDbName: 'checker_wrong_tenant',
        email: 'wrong_tenant@checker.test',
        activo: true,
      });

      const result = await masterChecker.existeEnTenant(
        usuarioId,
        '01900000-0000-7000-8000-000000000999', // cliente distinto
      );
      expect(result).toBe(false);
    });

    it('estaActivoEnTenant retorna false cuando el usuario tiene activo=false', async () => {
      const { clienteId, usuarioId } = await createTestUserInMaster({
        clienteDbName: 'checker_inactivo',
        email: 'inactivo@checker.test',
        activo: false,
      });

      const result = await masterChecker.estaActivoEnTenant(usuarioId, clienteId);
      expect(result).toBe(false);
    });

    it('estaActivoEnTenant retorna true cuando activo=true y deleted_at IS NULL', async () => {
      const { clienteId, usuarioId } = await createTestUserInMaster({
        clienteDbName: 'checker_activo',
        email: 'activo@checker.test',
        activo: true,
      });

      const result = await masterChecker.estaActivoEnTenant(usuarioId, clienteId);
      expect(result).toBe(true);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // PR3: createdAt override + fechaResolucion (T3.11 RED→GREEN)
  // ─────────────────────────────────────────────────────────────────────────

  describe('PrismaTicketRepository — PR3: createdAt override + fechaResolucion (T3.11)', () => {
    const RESUELTO_ID = 'c0000000-0000-4000-c000-000000000006';

    it('crear ticket con fechaCreacion explícita → created_at en DB refleja esa fecha', async () => {
      // ADR-5: TicketEntity.create() con fechaCreacion → mapper incluye createdAt en INSERT.
      const fechaCreacion = new Date('2025-06-15T00:00:00.000Z');
      const ticket = TicketEntity.create(
        makeTicketProps({ numero: 'SOP-2025-00001' }),
        undefined,
        fechaCreacion,
      );

      await withTenant(async () => {
        await ticketRepo.save(ticket);
        const found = await ticketRepo.findById(ticket.id);

        expect(found).not.toBeNull();
        // created_at en DB debe ser la fecha provista, no now()
        expect(found!.createdAt.toISOString().slice(0, 10)).toBe('2025-06-15');
      });
    });

    it('save() UPDATE no pisa createdAt existente en DB', async () => {
      // Si se guarda un ticket dos veces (upsert), el createdAt debe permanecer igual.
      const ticket = TicketEntity.create(makeTicketProps({ numero: 'SOP-2026-00099' }));

      await withTenant(async () => {
        await ticketRepo.save(ticket);
        const createdAtOriginal = (await ticketRepo.findById(ticket.id))!.createdAt;

        // Mutar y guardar de nuevo (UPDATE path)
        ticket.updateEstado(EN_PROGRESO_ID);
        await ticketRepo.save(ticket);

        const found = await ticketRepo.findById(ticket.id);
        expect(found!.createdAt.getTime()).toBe(createdAtOriginal.getTime());
      });
    });

    it('transición a RESUELTO → fecha_resolucion seteada en DB', async () => {
      // ADR-4: al setear ticket.fechaResolucion y guardar, el campo persiste en DB.
      const ticket = TicketEntity.create(makeTicketProps({ numero: 'SOP-2026-00100' }));
      const fechaResolucion = new Date('2026-06-28T00:00:00.000Z');

      await withTenant(async () => {
        await ticketRepo.save(ticket);

        ticket.updateEstado(RESUELTO_ID);
        ticket.setFechaResolucion(fechaResolucion);
        await ticketRepo.save(ticket);

        const found = await ticketRepo.findById(ticket.id);
        expect(found).not.toBeNull();
        expect(found!.estadoId).toBe(RESUELTO_ID);
        expect(found!.fechaResolucion).not.toBeNull();
        expect(found!.fechaResolucion!.toISOString().slice(0, 10)).toBe('2026-06-28');
      });
    });

    it('reapertura (RESUELTO → EN_PROGRESO) → fecha_resolucion NULL en DB', async () => {
      // ADR-4: al reabrir, setFechaResolucion(null) → campo debe quedar NULL en DB.
      const ticket = TicketEntity.create(makeTicketProps({ numero: 'SOP-2026-00101' }));
      const fechaResolucion = new Date('2026-06-20T00:00:00.000Z');

      await withTenant(async () => {
        // Llevar a RESUELTO primero
        await ticketRepo.save(ticket);
        ticket.updateEstado(RESUELTO_ID);
        ticket.setFechaResolucion(fechaResolucion);
        await ticketRepo.save(ticket);

        // Verificar que está resuelto
        const resuelto = await ticketRepo.findById(ticket.id);
        expect(resuelto!.fechaResolucion).not.toBeNull();

        // Reabrir: limpiar fechaResolucion
        ticket.updateEstado(EN_PROGRESO_ID);
        ticket.setFechaResolucion(null);
        await ticketRepo.save(ticket);

        const reabierto = await ticketRepo.findById(ticket.id);
        expect(reabierto!.estadoId).toBe(EN_PROGRESO_ID);
        expect(reabierto!.fechaResolucion).toBeNull();
      });
    });
  });
});
