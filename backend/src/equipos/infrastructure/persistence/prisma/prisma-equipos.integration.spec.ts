/**
 * 6.C.1 TEST — Integration tests de los repos Prisma para el módulo Equipos.
 *
 * Estrategia TDD: RED → escrito antes de la impl; GREEN → implementaciones hacen pasar.
 *
 * Repos cubiertos (todos TENANT — usan TenantContext):
 *   PrismaEquipoInformaticoRepository — findById, findByNumeroSerie, findAllActive,
 *                                        findByAsignadoAId, save, delete (soft)
 *   PrismaComponenteEquipoRepository  — findById, findByEquipoId, save, delete (soft)
 *   PrismaTiposComponenteRepository   — findById, findByCodigo, findAllActive, save
 *   PrismaTicketSoporteRepository     — findByTicketId, findById, findByEquipoId, save, delete (soft)
 *
 * Casos específicos del spec (6.C.1):
 *   - UNIQUE parcial de numero_serie: dos equipos con null coexisten OK;
 *     dos con la misma serie non-null → conflicto DB (PrismaClientKnownRequestError P2002).
 *   - Soft delete: excluido de queries activas (findAllActive, findByEquipoId).
 *   - Relación 1:1 ticket_soporte ↔ tickets: UNIQUE en ticket_id.
 *
 * DB de test: soporte_tenant_test (PostgreSQL real — no mocks).
 * La migración 20260623150000_add_equipos_schema debe estar aplicada.
 *
 * Ref spec: [SPEC:equipos/requirements]
 * Tarea: 6.C.1
 */

import { PrismaService } from '../../../../shared/infrastructure/persistence/prisma.service';
import { TenantContext } from '../../../../shared/tenancy/tenant-context';
import { TenantPrismaClient } from '../../../../shared/infrastructure/persistence/prisma-clients';

import { PrismaEquipoInformaticoRepository } from './prisma-equipo-informatico.repository';
import { PrismaComponenteEquipoRepository } from './prisma-componente-equipo.repository';
import { PrismaTiposComponenteRepository } from './prisma-tipos-componente.repository';
import { PrismaTicketSoporteRepository } from './prisma-ticket-soporte.repository';

import { EquipoInformaticoEntity } from '../../../domain/entities/equipo-informatico.entity';
import { ComponenteEquipoEntity } from '../../../domain/entities/componente-equipo.entity';
import { TipoComponenteEntity } from '../../../domain/entities/tipos-componente.entity';
import { TicketSoporteEntity } from '../../../domain/entities/ticket-soporte.entity';

// ─── Conexión de test ──────────────────────────────────────────────────────────
const TEST_TENANT_URL =
  process.env.DATABASE_URL_TENANT ??
  'postgresql://soporte:soporte@localhost:5432/soporte_tenant_test';

// ─── IDs deterministas del seed ───────────────────────────────────────────────
const ABIERTO_ID = 'c0000000-0000-4000-c000-000000000001';
const PRIORIDAD_MEDIA_ID = 'd0000000-0000-4000-d000-000000000002';
const TIPO_SOPORTE_ID = 'e0000000-0000-4000-e000-000000000001';
const CPU_ID = 'a0000000-0000-4000-a000-000000000001';
const RAM_ID = 'a0000000-0000-4000-a000-000000000002';

// UUID dummy para soft refs (no requieren existir en master)
const DUMMY_USUARIO_ID = '01900000-0000-7000-8000-000000000001';
const DUMMY_CLIENTE_ID = '01900000-0000-7000-8000-000000000002';

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('Equipos Infrastructure Repos — Integration (6.C.1)', () => {
  let tenantService: PrismaService;
  let tenantClient: InstanceType<typeof TenantPrismaClient>;
  let tenantContext: TenantContext;

  let equipoRepo: PrismaEquipoInformaticoRepository;
  let componenteRepo: PrismaComponenteEquipoRepository;
  let tipoRepo: PrismaTiposComponenteRepository;
  let ticketSoporteRepo: PrismaTicketSoporteRepository;

  beforeAll(() => {
    tenantService = new PrismaService(TEST_TENANT_URL);
    tenantClient = tenantService.getTenantClient('soporte_tenant_test');
    tenantContext = new TenantContext();

    equipoRepo = new PrismaEquipoInformaticoRepository(tenantContext);
    componenteRepo = new PrismaComponenteEquipoRepository(tenantContext);
    tipoRepo = new PrismaTiposComponenteRepository(tenantContext);
    ticketSoporteRepo = new PrismaTicketSoporteRepository(tenantContext);
  });

  afterAll(async () => {
    await tenantService.onModuleDestroy();
  });

  beforeEach(async () => {
    // Limpia en orden correcto (FKs): ticket_soporte → componentes_equipo → equipos_informaticos
    // tipos_componente se incluye aquí para aislar los tests que crean entradas custom,
    // y se re-siembran los 10 tipos base inmediatamente después del TRUNCATE.
    await tenantClient.$executeRawUnsafe(`
      TRUNCATE TABLE
        ticket_soporte,
        componentes_equipo,
        archivos_equipo,
        equipos_informaticos,
        tipos_componente,
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

    // Re-sembrar los 10 tipos base después del truncate para que los tests de
    // findById, findByCodigo, findAllActive (y los de componentes que usan CPU_ID, RAM_ID)
    // encuentren los registros del seed.
    await tenantClient.$executeRawUnsafe(`
      INSERT INTO tipos_componente (id, codigo, nombre) VALUES
        ('a0000000-0000-4000-a000-000000000001', 'CPU',       'Procesador'),
        ('a0000000-0000-4000-a000-000000000002', 'RAM',       'Memoria RAM'),
        ('a0000000-0000-4000-a000-000000000003', 'DISCO',     'Disco de almacenamiento'),
        ('a0000000-0000-4000-a000-000000000004', 'MONITOR',   'Monitor'),
        ('a0000000-0000-4000-a000-000000000005', 'TECLADO',   'Teclado'),
        ('a0000000-0000-4000-a000-000000000006', 'MOUSE',     'Mouse'),
        ('a0000000-0000-4000-a000-000000000007', 'GPU',       'Placa de video'),
        ('a0000000-0000-4000-a000-000000000008', 'FUENTE',    'Fuente de alimentación'),
        ('a0000000-0000-4000-a000-000000000009', 'IMPRESORA', 'Impresora'),
        ('a0000000-0000-4000-a000-000000000010', 'RED',       'Adaptador de red')
      ON CONFLICT (codigo) DO NOTHING
    `);
  });

  // ─── Helper: ejecutar dentro del TenantContext activo ─────────────────────
  function withTenant<T>(fn: () => Promise<T>): Promise<T> {
    return tenantContext.run(
      { prismaClient: tenantClient, dbName: 'soporte_tenant_test', clienteId: DUMMY_CLIENTE_ID },
      fn,
    );
  }

  /** Crea un ticket base de tipo SOPORTE en la DB (raw SQL, sin pasar por repo). */
  async function insertBaseTicket(ticketId: string, numero: string): Promise<void> {
    await tenantClient.$executeRawUnsafe(`
      INSERT INTO tickets (id, numero, titulo, tipo_id, estado_id, prioridad_id, solicitante_id)
      VALUES (
        '${ticketId}',
        '${numero}',
        'Ticket soporte base',
        '${TIPO_SOPORTE_ID}',
        '${ABIERTO_ID}',
        '${PRIORIDAD_MEDIA_ID}',
        '${DUMMY_USUARIO_ID}'
      )
    `);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PrismaEquipoInformaticoRepository
  // ═══════════════════════════════════════════════════════════════════════════

  describe('PrismaEquipoInformaticoRepository', () => {
    describe('save() + findById()', () => {
      it('persiste un equipo y lo recupera por id', async () => {
        const equipo = EquipoInformaticoEntity.create({
          nombre: 'PC Contabilidad 01',
          numeroSerie: 'SN-001',
          marca: 'Dell',
          modelo: 'OptiPlex 3090',
          fechaAdquisicion: new Date('2024-01-15'),
          ubicacionId: null,
          asignadoAId: DUMMY_USUARIO_ID,
          activo: true,
        });

        await withTenant(() => equipoRepo.save(equipo));

        const found = await withTenant(() => equipoRepo.findById(equipo.id));
        expect(found).not.toBeNull();
        expect(found!.id).toBe(equipo.id);
        expect(found!.nombre).toBe('PC Contabilidad 01');
        expect(found!.numeroSerie).toBe('SN-001');
        expect(found!.marca).toBe('Dell');
        expect(found!.modelo).toBe('OptiPlex 3090');
        expect(found!.asignadoAId).toBe(DUMMY_USUARIO_ID);
        expect(found!.activo).toBe(true);
      });

      it('retorna null para id inexistente', async () => {
        const found = await withTenant(() =>
          equipoRepo.findById('99999999-9999-4000-9999-999999999999'),
        );
        expect(found).toBeNull();
      });

      it('actualiza el equipo al llamar save() nuevamente (upsert)', async () => {
        const equipo = EquipoInformaticoEntity.create({
          nombre: 'PC Vieja',
          numeroSerie: null,
          marca: null,
          modelo: null,
          fechaAdquisicion: null,
          ubicacionId: null,
          asignadoAId: null,
          activo: true,
        });
        await withTenant(() => equipoRepo.save(equipo));

        equipo.actualizar({ nombre: 'PC Renovada', marca: 'HP' });
        await withTenant(() => equipoRepo.save(equipo));

        const updated = await withTenant(() => equipoRepo.findById(equipo.id));
        expect(updated!.nombre).toBe('PC Renovada');
        expect(updated!.marca).toBe('HP');
      });
    });

    describe('findByNumeroSerie()', () => {
      it('retorna el equipo si existe con ese numero_serie', async () => {
        const equipo = EquipoInformaticoEntity.create({
          nombre: 'PC Serie 42',
          numeroSerie: 'SERIE-42',
          marca: null,
          modelo: null,
          fechaAdquisicion: null,
          ubicacionId: null,
          asignadoAId: null,
          activo: true,
        });
        await withTenant(() => equipoRepo.save(equipo));

        const found = await withTenant(() => equipoRepo.findByNumeroSerie('SERIE-42'));
        expect(found).not.toBeNull();
        expect(found!.id).toBe(equipo.id);
      });

      it('retorna null si no existe', async () => {
        const found = await withTenant(() => equipoRepo.findByNumeroSerie('NO-EXISTE'));
        expect(found).toBeNull();
      });

      it('retorna null si el equipo con esa serie está soft-deleted', async () => {
        const equipo = EquipoInformaticoEntity.create({
          nombre: 'PC Eliminada',
          numeroSerie: 'SN-DELETED',
          marca: null,
          modelo: null,
          fechaAdquisicion: null,
          ubicacionId: null,
          asignadoAId: null,
          activo: true,
        });
        await withTenant(() => equipoRepo.save(equipo));
        await withTenant(() => equipoRepo.delete(equipo.id));

        const found = await withTenant(() => equipoRepo.findByNumeroSerie('SN-DELETED'));
        expect(found).toBeNull();
      });
    });

    describe('UNIQUE parcial de numero_serie (6.C.1 — spec)', () => {
      it('dos equipos con numero_serie = null coexisten (UNIQUE parcial WHERE NOT NULL)', async () => {
        const e1 = EquipoInformaticoEntity.create({
          nombre: 'Equipo Sin Serie 1',
          numeroSerie: null,
          marca: null,
          modelo: null,
          fechaAdquisicion: null,
          ubicacionId: null,
          asignadoAId: null,
          activo: true,
        });
        const e2 = EquipoInformaticoEntity.create({
          nombre: 'Equipo Sin Serie 2',
          numeroSerie: null,
          marca: null,
          modelo: null,
          fechaAdquisicion: null,
          ubicacionId: null,
          asignadoAId: null,
          activo: true,
        });

        // Ambos deben persistir sin conflicto
        await withTenant(() => equipoRepo.save(e1));
        await withTenant(() => equipoRepo.save(e2));

        const found1 = await withTenant(() => equipoRepo.findById(e1.id));
        const found2 = await withTenant(() => equipoRepo.findById(e2.id));
        expect(found1).not.toBeNull();
        expect(found2).not.toBeNull();
        expect(found1!.numeroSerie).toBeNull();
        expect(found2!.numeroSerie).toBeNull();
      });

      it('dos equipos con el mismo numero_serie non-null generan conflicto DB (P2002)', async () => {
        const e1 = EquipoInformaticoEntity.create({
          nombre: 'Equipo Serie Duplicada A',
          numeroSerie: 'SERIE-DUP',
          marca: null,
          modelo: null,
          fechaAdquisicion: null,
          ubicacionId: null,
          asignadoAId: null,
          activo: true,
        });
        const e2 = EquipoInformaticoEntity.create({
          nombre: 'Equipo Serie Duplicada B',
          numeroSerie: 'SERIE-DUP',
          marca: null,
          modelo: null,
          fechaAdquisicion: null,
          ubicacionId: null,
          asignadoAId: null,
          activo: true,
        });

        await withTenant(() => equipoRepo.save(e1));

        // El segundo debe fallar por violación del UNIQUE parcial
        await expect(withTenant(() => equipoRepo.save(e2))).rejects.toThrow();
      });
    });

    describe('findAllActive()', () => {
      it('retorna solo equipos activos y no soft-deleted', async () => {
        const activo = EquipoInformaticoEntity.create({
          nombre: 'Activo',
          numeroSerie: null,
          marca: null,
          modelo: null,
          fechaAdquisicion: null,
          ubicacionId: null,
          asignadoAId: null,
          activo: true,
        });
        const inactivo = EquipoInformaticoEntity.create({
          nombre: 'Inactivo',
          numeroSerie: null,
          marca: null,
          modelo: null,
          fechaAdquisicion: null,
          ubicacionId: null,
          asignadoAId: null,
          activo: false,
        });
        const eliminado = EquipoInformaticoEntity.create({
          nombre: 'Eliminado',
          numeroSerie: null,
          marca: null,
          modelo: null,
          fechaAdquisicion: null,
          ubicacionId: null,
          asignadoAId: null,
          activo: true,
        });

        await withTenant(async () => {
          await equipoRepo.save(activo);
          await equipoRepo.save(inactivo);
          await equipoRepo.save(eliminado);
          await equipoRepo.delete(eliminado.id);
        });

        const activos = await withTenant(() => equipoRepo.findAllActive());
        const ids = activos.map((e) => e.id);
        expect(ids).toContain(activo.id);
        expect(ids).not.toContain(inactivo.id);
        expect(ids).not.toContain(eliminado.id);
      });
    });

    describe('findByAsignadoAId()', () => {
      it('retorna equipos asignados al usuario (no soft-deleted)', async () => {
        const e1 = EquipoInformaticoEntity.create({
          nombre: 'Equipo Asignado',
          numeroSerie: null,
          marca: null,
          modelo: null,
          fechaAdquisicion: null,
          ubicacionId: null,
          asignadoAId: DUMMY_USUARIO_ID,
          activo: true,
        });
        const e2 = EquipoInformaticoEntity.create({
          nombre: 'Equipo Otro Usuario',
          numeroSerie: null,
          marca: null,
          modelo: null,
          fechaAdquisicion: null,
          ubicacionId: null,
          asignadoAId: null,
          activo: true,
        });

        await withTenant(async () => {
          await equipoRepo.save(e1);
          await equipoRepo.save(e2);
        });

        const asignados = await withTenant(() => equipoRepo.findByAsignadoAId(DUMMY_USUARIO_ID));
        const ids = asignados.map((e) => e.id);
        expect(ids).toContain(e1.id);
        expect(ids).not.toContain(e2.id);
      });
    });

    describe('delete() — soft delete', () => {
      it('setea deleted_at sin eliminar la fila', async () => {
        const equipo = EquipoInformaticoEntity.create({
          nombre: 'A eliminar',
          numeroSerie: null,
          marca: null,
          modelo: null,
          fechaAdquisicion: null,
          ubicacionId: null,
          asignadoAId: null,
          activo: true,
        });
        await withTenant(() => equipoRepo.save(equipo));
        await withTenant(() => equipoRepo.delete(equipo.id));

        const found = await withTenant(() => equipoRepo.findById(equipo.id));
        expect(found).not.toBeNull();
        expect(found!.isDeleted()).toBe(true);
        expect(found!.deletedAt).not.toBeNull();
      });

      it('no incluye el equipo soft-deleted en findAllActive()', async () => {
        const equipo = EquipoInformaticoEntity.create({
          nombre: 'Soft deleted',
          numeroSerie: null,
          marca: null,
          modelo: null,
          fechaAdquisicion: null,
          ubicacionId: null,
          asignadoAId: null,
          activo: true,
        });
        await withTenant(() => equipoRepo.save(equipo));
        await withTenant(() => equipoRepo.delete(equipo.id));

        const activos = await withTenant(() => equipoRepo.findAllActive());
        expect(activos.map((e) => e.id)).not.toContain(equipo.id);
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // PrismaComponenteEquipoRepository
  // ═══════════════════════════════════════════════════════════════════════════

  describe('PrismaComponenteEquipoRepository', () => {
    let equipoId: string;

    beforeEach(async () => {
      const equipo = EquipoInformaticoEntity.create({
        nombre: 'PC Base para componentes',
        numeroSerie: null,
        marca: null,
        modelo: null,
        fechaAdquisicion: null,
        ubicacionId: null,
        asignadoAId: null,
        activo: true,
      });
      equipoId = equipo.id;
      await withTenant(() => equipoRepo.save(equipo));
    });

    describe('save() + findById()', () => {
      it('persiste un componente y lo recupera por id', async () => {
        const componente = ComponenteEquipoEntity.create({
          equipoId,
          tipoComponenteId: CPU_ID,
          descripcion: 'Intel Core i7-12700',
          numeroSerie: 'CPU-SN-001',
          capacidad: '8 cores',
        });

        await withTenant(() => componenteRepo.save(componente));

        const found = await withTenant(() => componenteRepo.findById(componente.id));
        expect(found).not.toBeNull();
        expect(found!.id).toBe(componente.id);
        expect(found!.equipoId).toBe(equipoId);
        expect(found!.tipoComponenteId).toBe(CPU_ID);
        expect(found!.descripcion).toBe('Intel Core i7-12700');
        expect(found!.numeroSerie).toBe('CPU-SN-001');
        expect(found!.capacidad).toBe('8 cores');
      });

      it('retorna null para id inexistente', async () => {
        const found = await withTenant(() =>
          componenteRepo.findById('99999999-9999-4000-9999-999999999999'),
        );
        expect(found).toBeNull();
      });
    });

    describe('findByEquipoId() — excluye soft-deleted', () => {
      it('retorna componentes activos del equipo', async () => {
        const c1 = ComponenteEquipoEntity.create({
          equipoId,
          tipoComponenteId: CPU_ID,
          descripcion: null,
          numeroSerie: null,
          capacidad: null,
        });
        const c2 = ComponenteEquipoEntity.create({
          equipoId,
          tipoComponenteId: RAM_ID,
          descripcion: '16GB DDR4',
          numeroSerie: null,
          capacidad: '16GB',
        });
        const cEliminado = ComponenteEquipoEntity.create({
          equipoId,
          tipoComponenteId: RAM_ID,
          descripcion: 'Eliminado',
          numeroSerie: null,
          capacidad: null,
        });

        await withTenant(async () => {
          await componenteRepo.save(c1);
          await componenteRepo.save(c2);
          await componenteRepo.save(cEliminado);
          await componenteRepo.delete(cEliminado.id);
        });

        const componentes = await withTenant(() => componenteRepo.findByEquipoId(equipoId));
        const ids = componentes.map((c) => c.id);
        expect(ids).toContain(c1.id);
        expect(ids).toContain(c2.id);
        expect(ids).not.toContain(cEliminado.id);
      });

      it('permite múltiples componentes del mismo tipo en un equipo', async () => {
        const ram1 = ComponenteEquipoEntity.create({
          equipoId,
          tipoComponenteId: RAM_ID,
          descripcion: 'Módulo 1',
          numeroSerie: null,
          capacidad: '8GB',
        });
        const ram2 = ComponenteEquipoEntity.create({
          equipoId,
          tipoComponenteId: RAM_ID,
          descripcion: 'Módulo 2',
          numeroSerie: null,
          capacidad: '8GB',
        });

        await withTenant(async () => {
          await componenteRepo.save(ram1);
          await componenteRepo.save(ram2);
        });

        const componentes = await withTenant(() => componenteRepo.findByEquipoId(equipoId));
        const ramModulos = componentes.filter((c) => c.tipoComponenteId === RAM_ID);
        expect(ramModulos).toHaveLength(2);
      });
    });

    describe('delete() — soft delete', () => {
      it('setea deleted_at y lo excluye de findByEquipoId()', async () => {
        const c = ComponenteEquipoEntity.create({
          equipoId,
          tipoComponenteId: CPU_ID,
          descripcion: null,
          numeroSerie: null,
          capacidad: null,
        });
        await withTenant(() => componenteRepo.save(c));
        await withTenant(() => componenteRepo.delete(c.id));

        const found = await withTenant(() => componenteRepo.findById(c.id));
        expect(found!.isDeleted()).toBe(true);

        const activos = await withTenant(() => componenteRepo.findByEquipoId(equipoId));
        expect(activos.map((x) => x.id)).not.toContain(c.id);
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // PrismaTiposComponenteRepository
  // ═══════════════════════════════════════════════════════════════════════════

  describe('PrismaTiposComponenteRepository', () => {
    describe('findById()', () => {
      it('retorna el tipo de componente CPU por su id de seed', async () => {
        const found = await withTenant(() => tipoRepo.findById(CPU_ID));
        expect(found).not.toBeNull();
        expect(found!.id).toBe(CPU_ID);
        expect(found!.codigo).toBe('CPU');
        expect(found!.activo).toBe(true);
      });

      it('retorna null para id inexistente', async () => {
        const found = await withTenant(() =>
          tipoRepo.findById('99999999-9999-4000-9999-999999999999'),
        );
        expect(found).toBeNull();
      });
    });

    describe('findByCodigo()', () => {
      it('retorna el tipo por código', async () => {
        const found = await withTenant(() => tipoRepo.findByCodigo('RAM'));
        expect(found).not.toBeNull();
        expect(found!.id).toBe(RAM_ID);
        expect(found!.nombre).toBe('Memoria RAM');
      });

      it('retorna null para código inexistente', async () => {
        const found = await withTenant(() => tipoRepo.findByCodigo('NO_EXISTE'));
        expect(found).toBeNull();
      });
    });

    describe('findAllActive()', () => {
      it('retorna los 10 tipos sembrados (todos activos)', async () => {
        const todos = await withTenant(() => tipoRepo.findAllActive());
        expect(todos.length).toBeGreaterThanOrEqual(10);
        const codigos = todos.map((t) => t.codigo);
        expect(codigos).toContain('CPU');
        expect(codigos).toContain('RAM');
        expect(codigos).toContain('DISCO');
        expect(codigos).toContain('MONITOR');
        expect(codigos).toContain('RED');
      });

      it('excluye tipos soft-deleted', async () => {
        // Crea un tipo custom y lo soft-deleta
        const tipoCustom = TipoComponenteEntity.create({
          codigo: 'CUSTOM_TST',
          nombre: 'Custom Test',
        });
        await withTenant(() => tipoRepo.save(tipoCustom));

        // Simular soft-delete via SQL (el puerto no expone delete)
        await tenantClient.$executeRawUnsafe(
          `UPDATE tipos_componente SET deleted_at = NOW() WHERE id = '${tipoCustom.id}'`,
        );

        const activos = await withTenant(() => tipoRepo.findAllActive());
        expect(activos.map((t) => t.id)).not.toContain(tipoCustom.id);
      });
    });

    describe('save() — upsert', () => {
      it('persiste un nuevo tipo de componente', async () => {
        const tipo = TipoComponenteEntity.create({ codigo: 'UPS_TEST', nombre: 'UPS de prueba' });
        await withTenant(() => tipoRepo.save(tipo));

        const found = await withTenant(() => tipoRepo.findById(tipo.id));
        expect(found).not.toBeNull();
        expect(found!.codigo).toBe('UPS_TEST');
        expect(found!.nombre).toBe('UPS de prueba');
        expect(found!.activo).toBe(true);
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // PrismaTicketSoporteRepository — relación 1:1 con tickets
  // ═══════════════════════════════════════════════════════════════════════════

  describe('PrismaTicketSoporteRepository', () => {
    const BASE_TICKET_ID = '00000003-0000-7000-8000-000000000001';

    beforeEach(async () => {
      await insertBaseTicket(BASE_TICKET_ID, 'SOP-2026-00001');
    });

    describe('save() + findByTicketId() — relación 1:1', () => {
      it('persiste un ticket_soporte sin equipo y lo recupera por ticketId', async () => {
        const ts = TicketSoporteEntity.create(BASE_TICKET_ID, null);
        await withTenant(() => ticketSoporteRepo.save(ts));

        const found = await withTenant(() => ticketSoporteRepo.findByTicketId(BASE_TICKET_ID));
        expect(found).not.toBeNull();
        expect(found!.ticketId).toBe(BASE_TICKET_ID);
        expect(found!.equipoId).toBeNull();
        expect(found!.descripcionProblema).toBeNull();
        expect(found!.solucionAplicada).toBeNull();
      });

      it('retorna null cuando el ticket_id no tiene ticket_soporte', async () => {
        const found = await withTenant(() => ticketSoporteRepo.findByTicketId(BASE_TICKET_ID));
        expect(found).toBeNull();
      });

      it('UNIQUE en ticket_id garantiza 1:1 — segundo save() es upsert, no duplicado', async () => {
        const ts = TicketSoporteEntity.create(BASE_TICKET_ID, null);
        await withTenant(() => ticketSoporteRepo.save(ts));

        // save() del mismo id debe actualizar, no insertar un segundo registro
        ts.registrarSolucion('Problema resuelto');
        await withTenant(() => ticketSoporteRepo.save(ts));

        const found = await withTenant(() => ticketSoporteRepo.findByTicketId(BASE_TICKET_ID));
        expect(found!.solucionAplicada).toBe('Problema resuelto');

        // Solo debe haber un registro
        const count = await tenantClient.$queryRawUnsafe<Array<{ cnt: bigint }>>(
          `SELECT COUNT(*) AS cnt FROM ticket_soporte WHERE ticket_id = '${BASE_TICKET_ID}'`,
        );
        expect(Number(count[0].cnt)).toBe(1);
      });
    });

    describe('findById()', () => {
      it('retorna el ticket_soporte por su id técnico', async () => {
        const ts = TicketSoporteEntity.create(BASE_TICKET_ID, null);
        await withTenant(() => ticketSoporteRepo.save(ts));

        const found = await withTenant(() => ticketSoporteRepo.findById(ts.id));
        expect(found).not.toBeNull();
        expect(found!.id).toBe(ts.id);
      });

      it('retorna null para id inexistente', async () => {
        const found = await withTenant(() =>
          ticketSoporteRepo.findById('99999999-9999-4000-9999-999999999999'),
        );
        expect(found).toBeNull();
      });
    });

    describe('findByEquipoId()', () => {
      it('retorna los ticket_soporte que referencian el equipo', async () => {
        const equipo = EquipoInformaticoEntity.create({
          nombre: 'PC con tickets',
          numeroSerie: null,
          marca: null,
          modelo: null,
          fechaAdquisicion: null,
          ubicacionId: null,
          asignadoAId: null,
          activo: true,
        });
        await withTenant(() => equipoRepo.save(equipo));

        const ts = TicketSoporteEntity.create(BASE_TICKET_ID, equipo.id);
        await withTenant(() => ticketSoporteRepo.save(ts));

        const tickets = await withTenant(() => ticketSoporteRepo.findByEquipoId(equipo.id));
        expect(tickets).toHaveLength(1);
        expect(tickets[0].ticketId).toBe(BASE_TICKET_ID);
      });

      it('excluye ticket_soporte soft-deleted de findByEquipoId()', async () => {
        const equipo = EquipoInformaticoEntity.create({
          nombre: 'PC tickets soft-delete',
          numeroSerie: null,
          marca: null,
          modelo: null,
          fechaAdquisicion: null,
          ubicacionId: null,
          asignadoAId: null,
          activo: true,
        });
        await withTenant(() => equipoRepo.save(equipo));

        const ts = TicketSoporteEntity.create(BASE_TICKET_ID, equipo.id);
        await withTenant(() => ticketSoporteRepo.save(ts));
        await withTenant(() => ticketSoporteRepo.delete(ts.id));

        const tickets = await withTenant(() => ticketSoporteRepo.findByEquipoId(equipo.id));
        expect(tickets).toHaveLength(0);
      });
    });

    describe('delete() — soft delete', () => {
      it('setea deleted_at sin eliminar la fila', async () => {
        const ts = TicketSoporteEntity.create(BASE_TICKET_ID, null);
        await withTenant(() => ticketSoporteRepo.save(ts));
        await withTenant(() => ticketSoporteRepo.delete(ts.id));

        const found = await withTenant(() => ticketSoporteRepo.findById(ts.id));
        expect(found).not.toBeNull();
        expect(found!.isDeleted()).toBe(true);
        expect(found!.deletedAt).not.toBeNull();
      });
    });
  });
});
