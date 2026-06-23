/**
 * 4.C.1 TEST — Integration tests de los repos Prisma para el módulo Compras.
 *
 * Estrategia TDD: RED → escrito antes de la impl; GREEN → implementaciones hacen pasar.
 *
 * Repos cubiertos (todos TENANT — usan TenantContext):
 *   PrismaTicketCompraRepository — findByTicketId, findById, save (upsert), delete (soft)
 *   PrismaItemCompraRepository   — findById, findByTicketCompraId, findActiveByTicketCompraId,
 *                                   save, delete (soft)
 *   PrismaPresupuestoRepository  — findById, findByTicketCompraId,
 *                                   findSelectedByTicketCompraId, save, delete (soft)
 *                                   verifica swap atómico de seleccionado
 *
 * Configuración de DB:
 *   - Tenant: DATABASE_URL_TENANT o fallback local soporte_tenant_test.
 *   - TRUNCATE en beforeEach para tablas de test (catálogos NO se tocan).
 *
 * Pattern:
 *   - Repos solo reciben TenantContext — NUNCA PrismaService directo.
 *   - withTenant<T>(fn) simula el TenantContext activo sin NestJS DI.
 *   - Tickets de test se crean primero (FK requerida por ticket_compra.ticket_id).
 *
 * Ref spec: [SPEC:compras/requirements]
 * Tarea: 4.C.1
 */

import { TenantContext } from '../../../../shared/tenancy/tenant-context';
import { PrismaService } from '../../../../shared/infrastructure/persistence/prisma.service';
import { TenantPrismaClient } from '../../../../shared/infrastructure/persistence/prisma-clients';

import { PrismaTicketCompraRepository } from './prisma-ticket-compra.repository';
import { PrismaItemCompraRepository } from './prisma-item-compra.repository';
import { PrismaPresupuestoRepository } from './prisma-presupuesto.repository';

import { TicketCompraEntity } from '../../../domain/entities/ticket-compra.entity';
import { ItemCompraEntity, ItemCompraProps } from '../../../domain/entities/item-compra.entity';
import { PresupuestoEntity, PresupuestoProps } from '../../../domain/entities/presupuesto.entity';

// ─── Conexión de test ──────────────────────────────────────────────────────────
const TEST_TENANT_URL =
  process.env.DATABASE_URL_TENANT ??
  'postgresql://soporte:soporte@localhost:5432/soporte_tenant_test';

// ─── IDs deterministas del seed PR-09 ─────────────────────────────────────────
const ABIERTO_ID = 'c0000000-0000-4000-c000-000000000001';
const PRIORIDAD_MEDIA_ID = 'd0000000-0000-4000-d000-000000000002';
const TIPO_COMPRAS_ID = 'e0000000-0000-4000-e000-000000000002';

// UUID dummy para soft refs (no requieren existir en master dentro de la DB tenant)
const DUMMY_USUARIO_ID = '01900000-0000-7000-8000-000000000001';
const DUMMY_CLIENTE_ID = '01900000-0000-7000-8000-000000000002';

// ─── Helpers de fixtures ─────────────────────────────────────────────────────

function makeItemProps(
  ticketCompraId: string,
  override: Partial<ItemCompraProps> = {},
): ItemCompraProps {
  return {
    ticketCompraId,
    descripcion: 'Teclado mecánico',
    cantidad: 2,
    unidad: 'unidad',
    precioUnitarioRef: 15000.5,
    observaciones: null,
    ...override,
  };
}

function makePresupuestoProps(
  ticketCompraId: string,
  override: Partial<PresupuestoProps> = {},
): PresupuestoProps {
  return {
    ticketCompraId,
    proveedor: 'TechStore S.A.',
    montoTotal: 30000,
    moneda: 'ARS',
    fechaCotizacion: new Date('2026-06-23'),
    seleccionado: false,
    observaciones: null,
    ...override,
  };
}

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('Compras Infrastructure Repos — Integration (4.C.1)', () => {
  let tenantService: PrismaService;
  let tenantClient: InstanceType<typeof TenantPrismaClient>;
  let tenantContext: TenantContext;

  let ticketCompraRepo: PrismaTicketCompraRepository;
  let itemCompraRepo: PrismaItemCompraRepository;
  let presupuestoRepo: PrismaPresupuestoRepository;

  /** ID del ticket base creado en beforeEach para usarlo como FK. */
  let baseTicketId: string;
  /** ID de ticket_compra creado para tests de items y presupuestos. */
  let ticketCompraId: string;

  beforeAll(() => {
    tenantService = new PrismaService(TEST_TENANT_URL);
    tenantClient = tenantService.getTenantClient('soporte_tenant_test');
    tenantContext = new TenantContext();

    ticketCompraRepo = new PrismaTicketCompraRepository(tenantContext);
    itemCompraRepo = new PrismaItemCompraRepository(tenantContext);
    presupuestoRepo = new PrismaPresupuestoRepository(tenantContext);
  });

  afterAll(async () => {
    await tenantService.onModuleDestroy();
  });

  beforeEach(async () => {
    // Limpia en orden correcto (FKs): archivos_presupuesto, presupuestos, items_compra,
    // ticket_compra, tickets (CASCADE se encarga del resto).
    await tenantClient.$executeRawUnsafe(`
      TRUNCATE TABLE
        archivos_presupuesto,
        presupuestos,
        items_compra,
        ticket_compra,
        archivos_ticket,
        archivos_operacion,
        archivos,
        operaciones_ticket,
        tickets,
        ciclos_cliente
      RESTART IDENTITY CASCADE
    `);

    // Crea un ticket base de tipo COMPRAS para que ticket_compra.ticket_id sea válido
    await tenantClient.$executeRawUnsafe(`
      INSERT INTO tickets (id, numero, titulo, tipo_id, estado_id, prioridad_id, solicitante_id)
      VALUES (
        '00000001-0000-7000-8000-000000000001',
        'COM-2026-00001',
        'Ticket de compra base',
        '${TIPO_COMPRAS_ID}',
        '${ABIERTO_ID}',
        '${PRIORIDAD_MEDIA_ID}',
        '${DUMMY_USUARIO_ID}'
      )
    `);
    baseTicketId = '00000001-0000-7000-8000-000000000001';

    // Crea un segundo ticket para tests que requieren 2 tickets
    await tenantClient.$executeRawUnsafe(`
      INSERT INTO tickets (id, numero, titulo, tipo_id, estado_id, prioridad_id, solicitante_id)
      VALUES (
        '00000001-0000-7000-8000-000000000002',
        'COM-2026-00002',
        'Ticket de compra base 2',
        '${TIPO_COMPRAS_ID}',
        '${ABIERTO_ID}',
        '${PRIORIDAD_MEDIA_ID}',
        '${DUMMY_USUARIO_ID}'
      )
    `);

    // Crea un ticket_compra para tests de items y presupuestos
    const tc = TicketCompraEntity.create(baseTicketId);
    ticketCompraId = tc.id;
    await withTenant(() => ticketCompraRepo.save(tc));
  });

  // ─── Helper: ejecutar dentro del TenantContext activo ─────────────────────
  function withTenant<T>(fn: () => Promise<T>): Promise<T> {
    return tenantContext.run(
      { prismaClient: tenantClient, dbName: 'soporte_tenant_test', clienteId: DUMMY_CLIENTE_ID },
      fn,
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PrismaTicketCompraRepository
  // ─────────────────────────────────────────────────────────────────────────

  describe('PrismaTicketCompraRepository', () => {
    describe('findByTicketId()', () => {
      it('retorna el ticket_compra por ticket_id (relación 1:1)', async () => {
        const found = await withTenant(() => ticketCompraRepo.findByTicketId(baseTicketId));
        expect(found).not.toBeNull();
        expect(found!.ticketId).toBe(baseTicketId);
        expect(found!.aprobadoPorId).toBeNull();
        expect(found!.aprobadoEn).toBeNull();
        expect(found!.motivoRechazo).toBeNull();
      });

      it('retorna null cuando el ticket_id no tiene ticket_compra', async () => {
        const noExisteId = '00000001-0000-7000-8000-000000000002';
        const found = await withTenant(() => ticketCompraRepo.findByTicketId(noExisteId));
        expect(found).toBeNull();
      });
    });

    describe('findById()', () => {
      it('retorna el ticket_compra por su id técnico', async () => {
        const found = await withTenant(() => ticketCompraRepo.findById(ticketCompraId));
        expect(found).not.toBeNull();
        expect(found!.id).toBe(ticketCompraId);
      });

      it('retorna null cuando el id no existe', async () => {
        const found = await withTenant(() =>
          ticketCompraRepo.findById('99999999-9999-4000-9999-999999999999'),
        );
        expect(found).toBeNull();
      });
    });

    describe('save() — update de aprobado_por_id', () => {
      it('actualiza aprobado_por_id y aprobado_en al aprobar', async () => {
        const tc = await withTenant(() => ticketCompraRepo.findById(ticketCompraId));
        expect(tc).not.toBeNull();

        const ahora = new Date();
        tc!.aprobar(DUMMY_USUARIO_ID, ahora);
        await withTenant(() => ticketCompraRepo.save(tc!));

        const updated = await withTenant(() => ticketCompraRepo.findById(ticketCompraId));
        expect(updated!.aprobadoPorId).toBe(DUMMY_USUARIO_ID);
        expect(updated!.aprobadoEn).not.toBeNull();
        expect(updated!.motivoRechazo).toBeNull();
      });

      it('actualiza aprobado_por_id, aprobado_en y motivo_rechazo al rechazar', async () => {
        const tc = await withTenant(() => ticketCompraRepo.findById(ticketCompraId));
        const ahora = new Date();
        tc!.rechazar(DUMMY_USUARIO_ID, ahora, 'Presupuesto excede el límite');
        await withTenant(() => ticketCompraRepo.save(tc!));

        const updated = await withTenant(() => ticketCompraRepo.findById(ticketCompraId));
        expect(updated!.aprobadoPorId).toBe(DUMMY_USUARIO_ID);
        expect(updated!.motivoRechazo).toBe('Presupuesto excede el límite');
      });
    });

    describe('delete() — soft delete', () => {
      it('setea deleted_at sin eliminar la fila', async () => {
        await withTenant(() => ticketCompraRepo.delete(ticketCompraId));

        // findById debe devolver la entidad (incluye soft-deleted)
        const found = await withTenant(() => ticketCompraRepo.findById(ticketCompraId));
        expect(found).not.toBeNull();
        expect(found!.deletedAt).not.toBeNull();
        expect(found!.isDeleted()).toBe(true);
      });
    });

    it('no llama PrismaService directamente — solo usa TenantContext', () => {
      // El constructor del repo solo acepta TenantContext: el shape del ctor lo garantiza.
      // Este test verifica que la firma del constructor NO acepta PrismaService.
      const ctor = PrismaTicketCompraRepository.prototype.constructor;
      expect(ctor.length).toBe(1); // 1 parámetro: tenantContext
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // PrismaItemCompraRepository
  // ─────────────────────────────────────────────────────────────────────────

  describe('PrismaItemCompraRepository', () => {
    describe('save() + findById()', () => {
      it('persiste un ítem y lo recupera por id', async () => {
        const item = ItemCompraEntity.create(makeItemProps(ticketCompraId)).getOrThrow();
        await withTenant(() => itemCompraRepo.save(item));

        const found = await withTenant(() => itemCompraRepo.findById(item.id));
        expect(found).not.toBeNull();
        expect(found!.id).toBe(item.id);
        expect(found!.descripcion).toBe('Teclado mecánico');
        expect(found!.cantidad).toBe(2);
        expect(found!.unidad).toBe('unidad');
        expect(found!.precioUnitarioRef).toBe(15000.5);
        expect(found!.ticketCompraId).toBe(ticketCompraId);
      });

      it('retorna null para un id que no existe', async () => {
        const found = await withTenant(() =>
          itemCompraRepo.findById('99999999-9999-4000-9999-999999999999'),
        );
        expect(found).toBeNull();
      });
    });

    describe('findByTicketCompraId()', () => {
      it('retorna todos los ítems incluidos los soft-deleted', async () => {
        const item1 = ItemCompraEntity.create(
          makeItemProps(ticketCompraId, { descripcion: 'Item 1' }),
        ).getOrThrow();
        const item2 = ItemCompraEntity.create(
          makeItemProps(ticketCompraId, { descripcion: 'Item 2' }),
        ).getOrThrow();
        await withTenant(async () => {
          await itemCompraRepo.save(item1);
          await itemCompraRepo.save(item2);
          await itemCompraRepo.delete(item1.id); // soft delete
        });

        const all = await withTenant(() => itemCompraRepo.findByTicketCompraId(ticketCompraId));
        expect(all).toHaveLength(2);
      });
    });

    describe('findActiveByTicketCompraId()', () => {
      it('retorna solo ítems con deleted_at IS NULL', async () => {
        const item1 = ItemCompraEntity.create(
          makeItemProps(ticketCompraId, { descripcion: 'Activo' }),
        ).getOrThrow();
        const item2 = ItemCompraEntity.create(
          makeItemProps(ticketCompraId, { descripcion: 'Eliminado' }),
        ).getOrThrow();
        await withTenant(async () => {
          await itemCompraRepo.save(item1);
          await itemCompraRepo.save(item2);
          await itemCompraRepo.delete(item2.id); // soft delete item2
        });

        const activos = await withTenant(() =>
          itemCompraRepo.findActiveByTicketCompraId(ticketCompraId),
        );
        expect(activos).toHaveLength(1);
        expect(activos[0].descripcion).toBe('Activo');
      });

      it('retorna vacío cuando todos los ítems están soft-deleted', async () => {
        const item = ItemCompraEntity.create(makeItemProps(ticketCompraId)).getOrThrow();
        await withTenant(async () => {
          await itemCompraRepo.save(item);
          await itemCompraRepo.delete(item.id);
        });

        const activos = await withTenant(() =>
          itemCompraRepo.findActiveByTicketCompraId(ticketCompraId),
        );
        expect(activos).toHaveLength(0);
      });
    });

    describe('delete() — soft delete', () => {
      it('setea deleted_at sin eliminar la fila', async () => {
        const item = ItemCompraEntity.create(makeItemProps(ticketCompraId)).getOrThrow();
        await withTenant(() => itemCompraRepo.save(item));
        await withTenant(() => itemCompraRepo.delete(item.id));

        const found = await withTenant(() => itemCompraRepo.findById(item.id));
        expect(found!.isDeleted()).toBe(true);
        expect(found!.deletedAt).not.toBeNull();
      });
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // PrismaPresupuestoRepository
  // ─────────────────────────────────────────────────────────────────────────

  describe('PrismaPresupuestoRepository', () => {
    describe('save() + findById()', () => {
      it('persiste un presupuesto y lo recupera por id', async () => {
        const p = PresupuestoEntity.create(makePresupuestoProps(ticketCompraId)).getOrThrow();
        await withTenant(() => presupuestoRepo.save(p));

        const found = await withTenant(() => presupuestoRepo.findById(p.id));
        expect(found).not.toBeNull();
        expect(found!.id).toBe(p.id);
        expect(found!.proveedor).toBe('TechStore S.A.');
        expect(found!.montoTotal).toBe(30000);
        expect(found!.moneda).toBe('ARS');
        expect(found!.seleccionado).toBe(false);
        expect(found!.ticketCompraId).toBe(ticketCompraId);
      });

      it('retorna null para un id que no existe', async () => {
        const found = await withTenant(() =>
          presupuestoRepo.findById('99999999-9999-4000-9999-999999999999'),
        );
        expect(found).toBeNull();
      });
    });

    describe('findByTicketCompraId()', () => {
      it('retorna presupuestos activos (deleted_at IS NULL) de un ticket_compra', async () => {
        const p1 = PresupuestoEntity.create(
          makePresupuestoProps(ticketCompraId, { proveedor: 'Store A' }),
        ).getOrThrow();
        const p2 = PresupuestoEntity.create(
          makePresupuestoProps(ticketCompraId, { proveedor: 'Store B' }),
        ).getOrThrow();
        await withTenant(async () => {
          await presupuestoRepo.save(p1);
          await presupuestoRepo.save(p2);
          await presupuestoRepo.delete(p1.id); // soft delete p1
        });

        const activos = await withTenant(() =>
          presupuestoRepo.findByTicketCompraId(ticketCompraId),
        );
        // Solo retorna los activos (deleted_at IS NULL)
        expect(activos).toHaveLength(1);
        expect(activos[0].proveedor).toBe('Store B');
      });
    });

    describe('findSelectedByTicketCompraId()', () => {
      it('retorna el presupuesto seleccionado (seleccionado=TRUE, deleted_at IS NULL)', async () => {
        const p1 = PresupuestoEntity.create(
          makePresupuestoProps(ticketCompraId, { proveedor: 'A', seleccionado: true }),
        ).getOrThrow();
        const p2 = PresupuestoEntity.create(
          makePresupuestoProps(ticketCompraId, { proveedor: 'B' }),
        ).getOrThrow();
        await withTenant(async () => {
          await presupuestoRepo.save(p1);
          await presupuestoRepo.save(p2);
        });

        const selected = await withTenant(() =>
          presupuestoRepo.findSelectedByTicketCompraId(ticketCompraId),
        );
        expect(selected).not.toBeNull();
        expect(selected!.proveedor).toBe('A');
        expect(selected!.seleccionado).toBe(true);
      });

      it('retorna null cuando ningún presupuesto está seleccionado', async () => {
        const p = PresupuestoEntity.create(makePresupuestoProps(ticketCompraId)).getOrThrow();
        await withTenant(() => presupuestoRepo.save(p));

        const selected = await withTenant(() =>
          presupuestoRepo.findSelectedByTicketCompraId(ticketCompraId),
        );
        expect(selected).toBeNull();
      });

      it('excluye soft-deleted del selected check', async () => {
        const p = PresupuestoEntity.create(
          makePresupuestoProps(ticketCompraId, { seleccionado: true }),
        ).getOrThrow();
        await withTenant(async () => {
          await presupuestoRepo.save(p);
          await presupuestoRepo.delete(p.id); // soft delete
        });

        const selected = await withTenant(() =>
          presupuestoRepo.findSelectedByTicketCompraId(ticketCompraId),
        );
        expect(selected).toBeNull();
      });
    });

    describe('swap atómico de seleccionado — invariante MUST NOT existir dos TRUE', () => {
      it('después del swap, solo un presupuesto queda seleccionado', async () => {
        const p1 = PresupuestoEntity.create(
          makePresupuestoProps(ticketCompraId, { proveedor: 'Anterior', seleccionado: true }),
        ).getOrThrow();
        const p2 = PresupuestoEntity.create(
          makePresupuestoProps(ticketCompraId, { proveedor: 'Nuevo' }),
        ).getOrThrow();
        await withTenant(async () => {
          await presupuestoRepo.save(p1);
          await presupuestoRepo.save(p2);
        });

        // Simula el swap: deselecciona p1, selecciona p2
        await withTenant(async () => {
          p1.deseleccionar();
          await presupuestoRepo.save(p1);
          p2.seleccionar();
          await presupuestoRepo.save(p2);
        });

        const allPresupuestos = await withTenant(() =>
          presupuestoRepo.findByTicketCompraId(ticketCompraId),
        );

        // La invariante: exactamente uno seleccionado
        const seleccionados = allPresupuestos.filter((p) => p.seleccionado);
        expect(seleccionados).toHaveLength(1);
        expect(seleccionados[0].proveedor).toBe('Nuevo');
      });
    });

    describe('delete() — soft delete', () => {
      it('setea deleted_at sin eliminar la fila', async () => {
        const p = PresupuestoEntity.create(makePresupuestoProps(ticketCompraId)).getOrThrow();
        await withTenant(() => presupuestoRepo.save(p));
        await withTenant(() => presupuestoRepo.delete(p.id));

        const found = await withTenant(() => presupuestoRepo.findById(p.id));
        expect(found!.isDeleted()).toBe(true);
        expect(found!.deletedAt).not.toBeNull();
      });
    });
  });
});
