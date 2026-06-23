/**
 * 5.C.1 TEST — Integration tests de los repos Prisma para el módulo Reparaciones.
 *
 * Estrategia TDD: RED → escrito antes de la impl; GREEN → implementaciones hacen pasar.
 *
 * Repos cubiertos (todos TENANT — usan TenantContext):
 *   PrismaUbicacionRepository    — findById, findAllActive, findSubtree (CTE), save, delete (soft)
 *   PrismaTicketEdiliciaRepository — findByTicketId, findById, findByUbicacionId, save (incl. avance), delete (soft)
 *   PrismaSubtareaEdiliciaRepository — findById, findActiveByTicketEdiliciaId,
 *                                       findAllByTicketEdiliciaId, save, delete (soft)
 *
 * Configuración de DB:
 *   - Tenant: DATABASE_URL_TENANT o fallback local soporte_tenant_test.
 *   - TRUNCATE en beforeEach para tablas de test (catálogos NO se tocan).
 *
 * Pattern:
 *   - Repos solo reciben TenantContext — NUNCA PrismaService directo.
 *   - withTenant<T>(fn) simula el TenantContext activo sin NestJS DI.
 *   - Tickets de test se crean primero (FK requerida por ticket_edilicia.ticket_id).
 *   - Ubicaciones de test se crean antes de tickets edilicios (FK ticket_edilicia.ubicacion_id).
 *
 * Ref spec: [SPEC:reparaciones/requirements]
 *   - Soft delete subtarea no cuenta en avance (5.C.1)
 *   - TicketEdilicia actualiza porcentaje_avance via save (5.C.1)
 * Tarea: 5.C.1
 */

import { TenantContext } from '../../../../shared/tenancy/tenant-context';
import { PrismaService } from '../../../../shared/infrastructure/persistence/prisma.service';
import { TenantPrismaClient } from '../../../../shared/infrastructure/persistence/prisma-clients';

import { PrismaUbicacionRepository } from './prisma-ubicacion.repository';
import { PrismaTicketEdiliciaRepository } from './prisma-ticket-edilicia.repository';
import { PrismaSubtareaEdiliciaRepository } from './prisma-subtarea-edilicia.repository';

import { UbicacionEntity } from '../../../domain/entities/ubicacion.entity';
import { TicketEdiliciaEntity } from '../../../domain/entities/ticket-edilicia.entity';
import { SubtareaEdiliciaEntity } from '../../../domain/entities/subtarea-edilicia.entity';

// ─── Conexión de test ──────────────────────────────────────────────────────────
const TEST_TENANT_URL =
  process.env.DATABASE_URL_TENANT ??
  'postgresql://soporte:soporte@localhost:5432/soporte_tenant_test';

// ─── IDs deterministas del seed PR-09 ─────────────────────────────────────────
const ABIERTO_ID = 'c0000000-0000-4000-c000-000000000001';
const PRIORIDAD_MEDIA_ID = 'd0000000-0000-4000-d000-000000000002';
const TIPO_EDILICIA_ID = 'e0000000-0000-4000-e000-000000000003';

// UUID dummy para soft refs (no requieren existir en master)
const DUMMY_USUARIO_ID = '01900000-0000-7000-8000-000000000001';
const DUMMY_CLIENTE_ID = '01900000-0000-7000-8000-000000000002';

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('Reparaciones Infrastructure Repos — Integration (5.C.1)', () => {
  let tenantService: PrismaService;
  let tenantClient: InstanceType<typeof TenantPrismaClient>;
  let tenantContext: TenantContext;

  let ubicacionRepo: PrismaUbicacionRepository;
  let ticketEdiliciaRepo: PrismaTicketEdiliciaRepository;
  let subtareaRepo: PrismaSubtareaEdiliciaRepository;

  /** ID de ubicación raíz creada en beforeEach. */
  let ubicacionRaizId: string;
  /** ID del ticket base creado en beforeEach para FK de ticket_edilicia. */
  let baseTicketId: string;
  /** ID del ticket_edilicia creado en beforeEach para FK de subtareas. */
  let ticketEdiliciaId: string;

  beforeAll(() => {
    tenantService = new PrismaService(TEST_TENANT_URL);
    tenantClient = tenantService.getTenantClient('soporte_tenant_test');
    tenantContext = new TenantContext();

    ubicacionRepo = new PrismaUbicacionRepository(tenantContext);
    ticketEdiliciaRepo = new PrismaTicketEdiliciaRepository(tenantContext);
    subtareaRepo = new PrismaSubtareaEdiliciaRepository(tenantContext);
  });

  afterAll(async () => {
    await tenantService.onModuleDestroy();
  });

  beforeEach(async () => {
    // Limpia en orden correcto (FKs):
    await tenantClient.$executeRawUnsafe(`
      TRUNCATE TABLE
        subtareas_edilicia,
        ticket_edilicia,
        ubicaciones,
        archivos_ticket,
        archivos_operacion,
        archivos,
        operaciones_ticket,
        tickets,
        ciclos_cliente
      RESTART IDENTITY CASCADE
    `);

    // Crea una ubicación raíz base
    const ubicRaiz = UbicacionEntity.create({ nombre: 'Edificio Central' });
    ubicacionRaizId = ubicRaiz.id;
    await withTenant(() => ubicacionRepo.save(ubicRaiz));

    // Crea un ticket base de tipo EDILICIA
    await tenantClient.$executeRawUnsafe(`
      INSERT INTO tickets (id, numero, titulo, tipo_id, estado_id, prioridad_id, solicitante_id)
      VALUES (
        '00000002-0000-7000-8000-000000000001',
        'EDI-2026-00001',
        'Ticket edilicio base',
        '${TIPO_EDILICIA_ID}',
        '${ABIERTO_ID}',
        '${PRIORIDAD_MEDIA_ID}',
        '${DUMMY_USUARIO_ID}'
      )
    `);
    baseTicketId = '00000002-0000-7000-8000-000000000001';

    // Crea un ticket_edilicia base para tests de subtareas
    const te = TicketEdiliciaEntity.create(baseTicketId, ubicacionRaizId);
    ticketEdiliciaId = te.id;
    await withTenant(() => ticketEdiliciaRepo.save(te));
  });

  // ─── Helper: ejecutar dentro del TenantContext activo ─────────────────────
  function withTenant<T>(fn: () => Promise<T>): Promise<T> {
    return tenantContext.run(
      { prismaClient: tenantClient, dbName: 'soporte_tenant_test', clienteId: DUMMY_CLIENTE_ID },
      fn,
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PrismaUbicacionRepository
  // ─────────────────────────────────────────────────────────────────────────

  describe('PrismaUbicacionRepository', () => {
    describe('findById()', () => {
      it('retorna la ubicación por su id', async () => {
        const found = await withTenant(() => ubicacionRepo.findById(ubicacionRaizId));
        expect(found).not.toBeNull();
        expect(found!.id).toBe(ubicacionRaizId);
        expect(found!.nombre).toBe('Edificio Central');
        expect(found!.padreId).toBeNull();
        expect(found!.activo).toBe(true);
      });

      it('retorna null para un id inexistente', async () => {
        const found = await withTenant(() =>
          ubicacionRepo.findById('99999999-9999-4000-9999-999999999999'),
        );
        expect(found).toBeNull();
      });
    });

    describe('save() — create + update', () => {
      it('persiste una ubicación raíz nueva', async () => {
        const ub = UbicacionEntity.create({ nombre: 'Torre Norte', descripcion: 'Edificio B' });
        await withTenant(() => ubicacionRepo.save(ub));

        const found = await withTenant(() => ubicacionRepo.findById(ub.id));
        expect(found).not.toBeNull();
        expect(found!.nombre).toBe('Torre Norte');
        expect(found!.descripcion).toBe('Edificio B');
        expect(found!.padreId).toBeNull();
        expect(found!.activo).toBe(true);
      });

      it('persiste una ubicación hija con padre_id', async () => {
        const hijo = UbicacionEntity.create({
          nombre: 'Piso 3',
          padreId: ubicacionRaizId,
        });
        await withTenant(() => ubicacionRepo.save(hijo));

        const found = await withTenant(() => ubicacionRepo.findById(hijo.id));
        expect(found!.padreId).toBe(ubicacionRaizId);
      });

      it('actualiza la ubicación existente (upsert)', async () => {
        const ub = await withTenant(() => ubicacionRepo.findById(ubicacionRaizId));
        ub!.desactivar();
        await withTenant(() => ubicacionRepo.save(ub!));

        const updated = await withTenant(() => ubicacionRepo.findById(ubicacionRaizId));
        expect(updated!.activo).toBe(false);
      });
    });

    describe('findAllActive()', () => {
      it('retorna solo ubicaciones con activo=true y deleted_at IS NULL', async () => {
        const inactiva = UbicacionEntity.create({ nombre: 'Depósito (inactivo)' });
        inactiva.desactivar();
        const softDeleted = UbicacionEntity.create({ nombre: 'Demolido (deleted)' });
        await withTenant(async () => {
          await ubicacionRepo.save(inactiva);
          await ubicacionRepo.save(softDeleted);
          await ubicacionRepo.delete(softDeleted.id);
        });

        const activas = await withTenant(() => ubicacionRepo.findAllActive());
        // Solo ubicacionRaiz (activo=true, not deleted) debe aparecer
        const ids = activas.map((u) => u.id);
        expect(ids).toContain(ubicacionRaizId);
        expect(ids).not.toContain(inactiva.id);
        expect(ids).not.toContain(softDeleted.id);
      });
    });

    describe('delete() — soft delete', () => {
      it('setea deleted_at sin eliminar la fila', async () => {
        await withTenant(() => ubicacionRepo.delete(ubicacionRaizId));

        // findById debe seguir devolviendo la entidad
        const found = await withTenant(() => ubicacionRepo.findById(ubicacionRaizId));
        expect(found).not.toBeNull();
        expect(found!.isDeleted()).toBe(true);
        expect(found!.deletedAt).not.toBeNull();
      });
    });

    describe('findSubtree() — CTE recursiva', () => {
      it('retorna [raíz] cuando la ubicación no tiene hijos', async () => {
        const tree = await withTenant(() => ubicacionRepo.findSubtree(ubicacionRaizId));
        expect(tree).toHaveLength(1);
        expect(tree[0].id).toBe(ubicacionRaizId);
      });

      it('retorna raíz + hijo cuando hay un nivel de jerarquía', async () => {
        const hijo = UbicacionEntity.create({ nombre: 'Piso 1', padreId: ubicacionRaizId });
        await withTenant(() => ubicacionRepo.save(hijo));

        const tree = await withTenant(() => ubicacionRepo.findSubtree(ubicacionRaizId));
        const ids = tree.map((u) => u.id);
        expect(ids).toContain(ubicacionRaizId);
        expect(ids).toContain(hijo.id);
        expect(tree).toHaveLength(2);
      });

      it('retorna raíz + hijo + nieto para árbol de 2 niveles', async () => {
        const hijo = UbicacionEntity.create({ nombre: 'Piso 2', padreId: ubicacionRaizId });
        const nieto = UbicacionEntity.create({ nombre: 'Sala A', padreId: hijo.id });
        await withTenant(async () => {
          await ubicacionRepo.save(hijo);
          await ubicacionRepo.save(nieto);
        });

        const tree = await withTenant(() => ubicacionRepo.findSubtree(ubicacionRaizId));
        const ids = tree.map((u) => u.id);
        expect(ids).toContain(ubicacionRaizId);
        expect(ids).toContain(hijo.id);
        expect(ids).toContain(nieto.id);
        expect(tree).toHaveLength(3);
      });

      it('excluye nodos soft-deleted del subárbol', async () => {
        const hijo = UbicacionEntity.create({ nombre: 'Piso Eliminado', padreId: ubicacionRaizId });
        await withTenant(async () => {
          await ubicacionRepo.save(hijo);
          await ubicacionRepo.delete(hijo.id); // soft delete el hijo
        });

        const tree = await withTenant(() => ubicacionRepo.findSubtree(ubicacionRaizId));
        const ids = tree.map((u) => u.id);
        expect(ids).toContain(ubicacionRaizId);
        expect(ids).not.toContain(hijo.id);
        expect(tree).toHaveLength(1);
      });

      it('retorna vacío cuando la ubicación raíz no existe', async () => {
        const tree = await withTenant(() =>
          ubicacionRepo.findSubtree('99999999-9999-4000-9999-999999999999'),
        );
        expect(tree).toHaveLength(0);
      });

      it('retorna vacío cuando la ubicación raíz está soft-deleted', async () => {
        await withTenant(() => ubicacionRepo.delete(ubicacionRaizId));

        const tree = await withTenant(() => ubicacionRepo.findSubtree(ubicacionRaizId));
        expect(tree).toHaveLength(0);
      });

      it('no llama PrismaService directamente — solo usa TenantContext', () => {
        expect(PrismaUbicacionRepository.prototype.constructor.length).toBe(1);
      });
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // PrismaTicketEdiliciaRepository
  // ─────────────────────────────────────────────────────────────────────────

  describe('PrismaTicketEdiliciaRepository', () => {
    describe('findByTicketId() — relación 1:1', () => {
      it('retorna el ticket_edilicia por ticket_id', async () => {
        const found = await withTenant(() => ticketEdiliciaRepo.findByTicketId(baseTicketId));
        expect(found).not.toBeNull();
        expect(found!.ticketId).toBe(baseTicketId);
        expect(found!.ubicacionId).toBe(ubicacionRaizId);
        expect(found!.porcentajeAvance).toBe(0);
        expect(found!.personalAsignadoId).toBeNull();
      });

      it('retorna null cuando el ticket_id no tiene ticket_edilicia', async () => {
        // Crear segundo ticket base sin ticket_edilicia
        await tenantClient.$executeRawUnsafe(`
          INSERT INTO tickets (id, numero, titulo, tipo_id, estado_id, prioridad_id, solicitante_id)
          VALUES (
            '00000002-0000-7000-8000-000000000002',
            'EDI-2026-00002',
            'Ticket sin edilicia',
            '${TIPO_EDILICIA_ID}',
            '${ABIERTO_ID}',
            '${PRIORIDAD_MEDIA_ID}',
            '${DUMMY_USUARIO_ID}'
          )
        `);
        const found = await withTenant(() =>
          ticketEdiliciaRepo.findByTicketId('00000002-0000-7000-8000-000000000002'),
        );
        expect(found).toBeNull();
      });
    });

    describe('findById()', () => {
      it('retorna el ticket_edilicia por su id técnico', async () => {
        const found = await withTenant(() => ticketEdiliciaRepo.findById(ticketEdiliciaId));
        expect(found).not.toBeNull();
        expect(found!.id).toBe(ticketEdiliciaId);
      });

      it('retorna null para id inexistente', async () => {
        const found = await withTenant(() =>
          ticketEdiliciaRepo.findById('99999999-9999-4000-9999-999999999999'),
        );
        expect(found).toBeNull();
      });
    });

    describe('save() — actualiza porcentaje_avance (5.C.1)', () => {
      it('persiste el porcentaje_avance actualizado (verifica spec 5.C.1)', async () => {
        const te = await withTenant(() => ticketEdiliciaRepo.findById(ticketEdiliciaId));
        expect(te).not.toBeNull();
        expect(te!.porcentajeAvance).toBe(0);

        te!.actualizarAvance(66.67);
        await withTenant(() => ticketEdiliciaRepo.save(te!));

        const updated = await withTenant(() => ticketEdiliciaRepo.findById(ticketEdiliciaId));
        expect(updated!.porcentajeAvance).toBeCloseTo(66.67, 2);
      });

      it('persiste personal_asignado_id al asignar personal', async () => {
        const te = await withTenant(() => ticketEdiliciaRepo.findById(ticketEdiliciaId));
        te!.asignarPersonal(DUMMY_USUARIO_ID);
        await withTenant(() => ticketEdiliciaRepo.save(te!));

        const updated = await withTenant(() => ticketEdiliciaRepo.findById(ticketEdiliciaId));
        expect(updated!.personalAsignadoId).toBe(DUMMY_USUARIO_ID);
      });
    });

    describe('findByUbicacionId()', () => {
      it('retorna los tickets edilicios que referencian la ubicación', async () => {
        const found = await withTenant(() => ticketEdiliciaRepo.findByUbicacionId(ubicacionRaizId));
        expect(found).toHaveLength(1);
        expect(found[0].ticketId).toBe(baseTicketId);
      });

      it('excluye soft-deleted de findByUbicacionId', async () => {
        await withTenant(() => ticketEdiliciaRepo.delete(ticketEdiliciaId));

        const found = await withTenant(() => ticketEdiliciaRepo.findByUbicacionId(ubicacionRaizId));
        expect(found).toHaveLength(0);
      });

      it('retorna vacío cuando ningún ticket referencia la ubicación', async () => {
        const otraUbic = UbicacionEntity.create({ nombre: 'Sin tickets' });
        await withTenant(() => ubicacionRepo.save(otraUbic));

        const found = await withTenant(() => ticketEdiliciaRepo.findByUbicacionId(otraUbic.id));
        expect(found).toHaveLength(0);
      });
    });

    describe('delete() — soft delete', () => {
      it('setea deleted_at sin eliminar la fila', async () => {
        await withTenant(() => ticketEdiliciaRepo.delete(ticketEdiliciaId));

        const found = await withTenant(() => ticketEdiliciaRepo.findById(ticketEdiliciaId));
        expect(found).not.toBeNull();
        expect(found!.isDeleted()).toBe(true);
        expect(found!.deletedAt).not.toBeNull();
      });
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // PrismaSubtareaEdiliciaRepository
  // ─────────────────────────────────────────────────────────────────────────

  describe('PrismaSubtareaEdiliciaRepository', () => {
    describe('save() + findById()', () => {
      it('persiste una subtarea y la recupera por id', async () => {
        const sub = SubtareaEdiliciaEntity.create({
          ticketEdiliciaId,
          descripcion: 'Revisar tuberías',
          orden: 1,
        });
        await withTenant(() => subtareaRepo.save(sub));

        const found = await withTenant(() => subtareaRepo.findById(sub.id));
        expect(found).not.toBeNull();
        expect(found!.id).toBe(sub.id);
        expect(found!.descripcion).toBe('Revisar tuberías');
        expect(found!.completada).toBe(false);
        expect(found!.completadaEn).toBeNull();
        expect(found!.completadaPorId).toBeNull();
        expect(found!.orden).toBe(1);
        expect(found!.ticketEdiliciaId).toBe(ticketEdiliciaId);
      });

      it('retorna null para id inexistente', async () => {
        const found = await withTenant(() =>
          subtareaRepo.findById('99999999-9999-4000-9999-999999999999'),
        );
        expect(found).toBeNull();
      });

      it('actualiza subtarea al completar (upsert)', async () => {
        const sub = SubtareaEdiliciaEntity.create({
          ticketEdiliciaId,
          descripcion: 'Pintar pared',
        });
        await withTenant(() => subtareaRepo.save(sub));

        const completadaEn = new Date('2026-06-23T10:00:00Z');
        sub.completar(DUMMY_USUARIO_ID, completadaEn);
        await withTenant(() => subtareaRepo.save(sub));

        const updated = await withTenant(() => subtareaRepo.findById(sub.id));
        expect(updated!.completada).toBe(true);
        expect(updated!.completadaPorId).toBe(DUMMY_USUARIO_ID);
        expect(updated!.completadaEn).not.toBeNull();
      });
    });

    describe('findActiveByTicketEdiliciaId() — excluye soft-deleted (5.C.1)', () => {
      it('retorna solo subtareas con deleted_at IS NULL', async () => {
        const activa = SubtareaEdiliciaEntity.create({
          ticketEdiliciaId,
          descripcion: 'Activa',
        });
        const eliminada = SubtareaEdiliciaEntity.create({
          ticketEdiliciaId,
          descripcion: 'Eliminada',
        });
        await withTenant(async () => {
          await subtareaRepo.save(activa);
          await subtareaRepo.save(eliminada);
          await subtareaRepo.delete(eliminada.id); // soft delete
        });

        const activas = await withTenant(() =>
          subtareaRepo.findActiveByTicketEdiliciaId(ticketEdiliciaId),
        );
        expect(activas).toHaveLength(1);
        expect(activas[0].descripcion).toBe('Activa');
      });

      it('retorna vacío cuando todas las subtareas están soft-deleted', async () => {
        const sub = SubtareaEdiliciaEntity.create({ ticketEdiliciaId, descripcion: 'Única' });
        await withTenant(async () => {
          await subtareaRepo.save(sub);
          await subtareaRepo.delete(sub.id);
        });

        const activas = await withTenant(() =>
          subtareaRepo.findActiveByTicketEdiliciaId(ticketEdiliciaId),
        );
        expect(activas).toHaveLength(0);
      });

      it('ordena por orden ASC, created_at ASC', async () => {
        const s1 = SubtareaEdiliciaEntity.create({
          ticketEdiliciaId,
          descripcion: 'Primero',
          orden: 1,
        });
        const s2 = SubtareaEdiliciaEntity.create({
          ticketEdiliciaId,
          descripcion: 'Tercero',
          orden: 3,
        });
        const s3 = SubtareaEdiliciaEntity.create({
          ticketEdiliciaId,
          descripcion: 'Segundo',
          orden: 2,
        });
        await withTenant(async () => {
          await subtareaRepo.save(s1);
          await subtareaRepo.save(s2);
          await subtareaRepo.save(s3);
        });

        const activas = await withTenant(() =>
          subtareaRepo.findActiveByTicketEdiliciaId(ticketEdiliciaId),
        );
        expect(activas[0].descripcion).toBe('Primero');
        expect(activas[1].descripcion).toBe('Segundo');
        expect(activas[2].descripcion).toBe('Tercero');
      });
    });

    describe('findAllByTicketEdiliciaId() — incluye soft-deleted', () => {
      it('retorna todas las subtareas incluidas las soft-deleted', async () => {
        const s1 = SubtareaEdiliciaEntity.create({ ticketEdiliciaId, descripcion: 'Paso 1' });
        const s2 = SubtareaEdiliciaEntity.create({ ticketEdiliciaId, descripcion: 'Paso 2' });
        await withTenant(async () => {
          await subtareaRepo.save(s1);
          await subtareaRepo.save(s2);
          await subtareaRepo.delete(s1.id); // soft delete
        });

        const all = await withTenant(() =>
          subtareaRepo.findAllByTicketEdiliciaId(ticketEdiliciaId),
        );
        expect(all).toHaveLength(2);
      });
    });

    describe('delete() — soft delete', () => {
      it('setea deleted_at sin eliminar la fila (5.C.1: exclusión en recálculo)', async () => {
        const sub = SubtareaEdiliciaEntity.create({ ticketEdiliciaId, descripcion: 'A eliminar' });
        await withTenant(() => subtareaRepo.save(sub));
        await withTenant(() => subtareaRepo.delete(sub.id));

        // findById sigue devolviendo la entidad (no eliminada físicamente)
        const found = await withTenant(() => subtareaRepo.findById(sub.id));
        expect(found).not.toBeNull();
        expect(found!.isDeleted()).toBe(true);
        expect(found!.deletedAt).not.toBeNull();

        // findActiveByTicketEdiliciaId excluye la soft-deleted
        const activas = await withTenant(() =>
          subtareaRepo.findActiveByTicketEdiliciaId(ticketEdiliciaId),
        );
        expect(activas.map((s) => s.id)).not.toContain(sub.id);
      });
    });
  });
});
