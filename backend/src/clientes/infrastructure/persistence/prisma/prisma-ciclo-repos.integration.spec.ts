/**
 * prisma-ciclo-repos.integration.spec.ts — TDD RED→GREEN (T9.2 + T9.6, PR9).
 *
 * Integration tests contra Postgres REAL:
 * - `soporte_master_test`: PrismaCicloVigenteRepository (findById/save) +
 *   CHECK `fecha_fin > fecha_inicio` de la migración `20260805105221_init_master`
 *   (T9.2 — el constraint ya existía desde PR5; este test lo verifica
 *   explícitamente por primera vez).
 * - `soporte_tenant_test`: PrismaCicloClienteRepository (findById/findActivos/
 *   save/activarCiclo transaccional) vía `TenantContext.bind()` — primer
 *   consumidor real de `TenantContext.getClient()` fuera de un mock (R15).
 *   Migración inicial `20260805194710_init_tenant` (creada en este mismo PR,
 *   ver apply-progress — prisma_tenant no tenía migraciones hasta ahora).
 */
import { Client } from 'pg';
import {
  MasterPrismaClient,
  TenantPrismaClient,
} from '../../../../shared/infrastructure/persistence/prisma-clients';
import { PrismaService } from '../../../../shared/infrastructure/persistence/prisma.service';
import { TenantContext } from '../../../../shared/tenancy/tenant-context';
import { PrismaCicloVigenteRepository } from './prisma-ciclo-vigente.repository';
import { PrismaCicloClienteRepository } from './prisma-ciclo-cliente.repository';
import { CicloVigenteEntity } from '../../../domain/entities/ciclo-vigente.entity';
import { CicloClienteEntity } from '../../../domain/entities/ciclo-cliente.entity';
import { usarLockMasterTest } from '../../../../testing/lock-master-test';

const MASTER_TEST_URL =
  process.env.DATABASE_URL_MASTER ??
  'postgresql://soporte:soporte@localhost:5432/soporte_master_test';

/** Nombre de la DB tenant de test — PrismaService.getTenantClient() reemplaza
 * el pathname de MASTER_TEST_URL por este nombre (mismo host/credenciales en
 * dev/test, ver PrismaService.buildTenantUrl). */
const TENANT_TEST_DB_NAME = 'soporte_tenant_test';

// Turno exclusivo sobre la master de test compartida — ver src/testing/lock-master-test.ts.
usarLockMasterTest();

describe('Ciclos Prisma Repositories — Integration (T9.2 + T9.6)', () => {
  let prismaService: PrismaService;
  let masterClient: InstanceType<typeof MasterPrismaClient>;
  let cicloVigenteRepo: PrismaCicloVigenteRepository;

  let rawClient: Client;
  let tenantContext: TenantContext;
  let tenantClient: InstanceType<typeof TenantPrismaClient>;
  let cicloClienteRepo: PrismaCicloClienteRepository;

  beforeAll(async () => {
    prismaService = new PrismaService(MASTER_TEST_URL);
    masterClient = prismaService.getMasterClient();
    cicloVigenteRepo = new PrismaCicloVigenteRepository(prismaService);

    // PrismaService.getTenantClient() reemplaza el pathname de MASTER_TEST_URL
    // por TENANT_TEST_DB_NAME (mismo host/credenciales en dev/test) — evita
    // instanciar un segundo PrismaService solo para obtener el cliente tenant.
    tenantClient = prismaService.getTenantClient(TENANT_TEST_DB_NAME);
    tenantContext = new TenantContext();
    tenantContext.bind({
      prismaClient: tenantClient,
      dbName: TENANT_TEST_DB_NAME,
      clienteId: 'test-cliente',
    });
    cicloClienteRepo = new PrismaCicloClienteRepository(tenantContext);

    // Cliente pg crudo para el test de CHECK constraint (T9.2) — no pasa por
    // la validación de la entidad de dominio, ejerce el constraint de DB.
    rawClient = new Client({ connectionString: MASTER_TEST_URL });
    await rawClient.connect();
  });

  afterAll(async () => {
    // Limpieza final tras el ÚLTIMO test del archivo: `beforeEach` solo
    // limpia AL INICIO de cada test — sin esto, las filas que crea el test
    // que corre último (ej. `findAll()`) quedan residentes en
    // `soporte_tenant_test` (DB compartida por otras suites, ej.
    // `prisma-tickets.integration.spec.ts`) y pueden romper `findFirst()`
    // sin `orderBy` en otra suite (ej. `findActive()`) por tener >1 fila
    // `activo=true`. Encontrado en sdd/beta-frontend/apply-progress.
    await tenantClient.cicloCliente.deleteMany({});
    await prismaService.onModuleDestroy();
    await rawClient.end();
  });

  beforeEach(async () => {
    await masterClient.$executeRawUnsafe('TRUNCATE TABLE ciclos_vigentes RESTART IDENTITY CASCADE');
    await tenantClient.cicloCliente.deleteMany({});
  });

  // ─── T9.2 — CHECK constraint fecha_fin > fecha_inicio (master) ───────────

  describe('CHECK ciclos_vigentes_fecha_fin_check (T9.2)', () => {
    it('rechaza un INSERT raw con fecha_fin === fecha_inicio', async () => {
      await expect(
        rawClient.query(
          `INSERT INTO ciclos_vigentes (id, nombre, fecha_inicio, fecha_fin, updated_at)
           VALUES (gen_random_uuid(), 'Ciclo inválido', '2026-01-01', '2026-01-01', now())`,
        ),
      ).rejects.toThrow(/ciclos_vigentes_fecha_fin_check|check constraint/i);
    });

    it('rechaza un INSERT raw con fecha_fin < fecha_inicio', async () => {
      await expect(
        rawClient.query(
          `INSERT INTO ciclos_vigentes (id, nombre, fecha_inicio, fecha_fin, updated_at)
           VALUES (gen_random_uuid(), 'Ciclo inválido', '2026-12-31', '2026-01-01', now())`,
        ),
      ).rejects.toThrow(/ciclos_vigentes_fecha_fin_check|check constraint/i);
    });

    it('acepta un INSERT raw con fecha_fin > fecha_inicio', async () => {
      const result = await rawClient.query(
        `INSERT INTO ciclos_vigentes (id, nombre, fecha_inicio, fecha_fin, updated_at)
         VALUES (gen_random_uuid(), 'Ciclo válido', '2026-01-01', '2026-12-31', now())
         RETURNING id`,
      );
      expect(result.rowCount).toBe(1);
    });
  });

  // ─── T9.6 — PrismaCicloVigenteRepository (master) ─────────────────────────

  describe('PrismaCicloVigenteRepository', () => {
    it('save() + findById() hacen round-trip completo', async () => {
      const ciclo = CicloVigenteEntity.create({
        nombre: 'Ciclo 2026',
        fechaInicio: new Date('2026-01-01'),
        fechaFin: new Date('2026-12-31'),
        activo: true,
      });

      await cicloVigenteRepo.save(ciclo);
      const found = await cicloVigenteRepo.findById(ciclo.id);

      expect(found).not.toBeNull();
      expect(found!.nombre).toBe('Ciclo 2026');
      expect(found!.activo).toBe(true);
    });

    it('findById() retorna null para un id inexistente', async () => {
      const found = await cicloVigenteRepo.findById('00000000-0000-4000-8000-000000000000');
      expect(found).toBeNull();
    });

    it('rename()/reschedule() + save() persisten la edición (sdd/ciclos-abm-root)', async () => {
      const ciclo = CicloVigenteEntity.create({
        nombre: 'Ciclo 2026',
        fechaInicio: new Date('2026-01-01'),
        fechaFin: new Date('2026-12-31'),
        activo: true,
      });
      await cicloVigenteRepo.save(ciclo);

      ciclo.rename('Ciclo 2026 renombrado');
      ciclo.reschedule(new Date('2026-02-01'), new Date('2026-11-30'));
      await cicloVigenteRepo.save(ciclo);

      const found = await cicloVigenteRepo.findById(ciclo.id);
      expect(found!.nombre).toBe('Ciclo 2026 renombrado');
      expect(found!.fechaInicio).toEqual(new Date('2026-02-01'));
      expect(found!.fechaFin).toEqual(new Date('2026-11-30'));
    });

    it('softDelete() + save() persisten la baja lógica (sdd/ciclos-abm-root)', async () => {
      const ciclo = CicloVigenteEntity.create({
        nombre: 'Ciclo a eliminar',
        fechaInicio: new Date('2026-01-01'),
        fechaFin: new Date('2026-12-31'),
        activo: true,
      });
      await cicloVigenteRepo.save(ciclo);

      ciclo.softDelete();
      await cicloVigenteRepo.save(ciclo);

      const found = await cicloVigenteRepo.findById(ciclo.id);
      expect(found!.isDeleted()).toBe(true);
      const activos = await cicloVigenteRepo.findAllActivos();
      expect(activos.find((c) => c.id === ciclo.id)).toBeUndefined();
    });

    it('findAll() retorna TODOS los ciclos, incluyendo soft-deleted (sdd/ciclos-abm-root)', async () => {
      const activo = CicloVigenteEntity.create({
        nombre: 'Ciclo activo findAll',
        fechaInicio: new Date('2026-01-01'),
        fechaFin: new Date('2026-06-30'),
        activo: true,
      });
      const eliminado = CicloVigenteEntity.create({
        nombre: 'Ciclo eliminado findAll',
        fechaInicio: new Date('2025-01-01'),
        fechaFin: new Date('2025-06-30'),
        activo: true,
      });
      eliminado.softDelete();
      await cicloVigenteRepo.save(activo);
      await cicloVigenteRepo.save(eliminado);

      const todos = await cicloVigenteRepo.findAll();

      expect(todos).toHaveLength(2);
      const nombres = todos.map((c) => c.nombre).sort();
      expect(nombres).toEqual(['Ciclo activo findAll', 'Ciclo eliminado findAll']);
    });
  });

  // ─── T9.6 — PrismaCicloClienteRepository (tenant, activarCiclo transaccional) ──

  describe('PrismaCicloClienteRepository', () => {
    it('save() + findById() hacen round-trip completo', async () => {
      const ciclo = CicloClienteEntity.create({
        nombre: 'Ciclo 2026',
        fechaInicio: new Date('2026-01-01'),
        fechaFin: new Date('2026-12-31'),
        activo: false,
        cicloVigenteId: '00000000-0000-4000-8000-000000000001',
      });

      await cicloClienteRepo.save(ciclo);
      const found = await cicloClienteRepo.findById(ciclo.id);

      expect(found).not.toBeNull();
      expect(found!.nombre).toBe('Ciclo 2026');
      expect(found!.activo).toBe(false);
      expect(found!.cicloVigenteId).toBe('00000000-0000-4000-8000-000000000001');
    });

    it('findActivos() retorna solo los ciclos activos y no soft-deleted', async () => {
      const activo = CicloClienteEntity.create({
        nombre: 'Activo',
        fechaInicio: new Date('2026-01-01'),
        fechaFin: new Date('2026-06-30'),
        activo: true,
        cicloVigenteId: '00000000-0000-4000-8000-000000000002',
      });
      const inactivo = CicloClienteEntity.create({
        nombre: 'Inactivo',
        fechaInicio: new Date('2026-07-01'),
        fechaFin: new Date('2026-12-31'),
        activo: false,
        cicloVigenteId: '00000000-0000-4000-8000-000000000003',
      });
      await cicloClienteRepo.save(activo);
      await cicloClienteRepo.save(inactivo);

      const activos = await cicloClienteRepo.findActivos();

      expect(activos).toHaveLength(1);
      expect(activos[0]!.nombre).toBe('Activo');
    });

    it('activarCiclo() desactiva el resto y activa el objetivo en una transacción', async () => {
      const cicloA = CicloClienteEntity.create({
        nombre: 'Ciclo A',
        fechaInicio: new Date('2026-01-01'),
        fechaFin: new Date('2026-06-30'),
        activo: true,
        cicloVigenteId: '00000000-0000-4000-8000-000000000004',
      });
      const cicloB = CicloClienteEntity.create({
        nombre: 'Ciclo B',
        fechaInicio: new Date('2027-01-01'),
        fechaFin: new Date('2027-06-30'),
        activo: false,
        cicloVigenteId: '00000000-0000-4000-8000-000000000005',
      });
      await cicloClienteRepo.save(cicloA);
      await cicloClienteRepo.save(cicloB);

      const activated = await cicloClienteRepo.activarCiclo(cicloB.id);

      expect(activated).toBe(true);
      const foundA = await cicloClienteRepo.findById(cicloA.id);
      const foundB = await cicloClienteRepo.findById(cicloB.id);
      expect(foundA!.activo).toBe(false);
      expect(foundB!.activo).toBe(true);
    });

    it('activarCiclo() retorna false para un id inexistente', async () => {
      const activated = await cicloClienteRepo.activarCiclo('00000000-0000-4000-8000-000000000099');
      expect(activated).toBe(false);
    });

    it('findAll() retorna todos los ciclos del tenant, incluyendo inactivos (G4, sdd/beta-frontend)', async () => {
      const activo = CicloClienteEntity.create({
        nombre: 'Ciclo Activo findAll',
        fechaInicio: new Date('2026-01-01'),
        fechaFin: new Date('2026-06-30'),
        activo: true,
        cicloVigenteId: '00000000-0000-4000-8000-000000000006',
      });
      const inactivo = CicloClienteEntity.create({
        nombre: 'Ciclo Inactivo findAll',
        fechaInicio: new Date('2025-01-01'),
        fechaFin: new Date('2025-06-30'),
        activo: false,
        cicloVigenteId: '00000000-0000-4000-8000-000000000007',
      });
      await cicloClienteRepo.save(activo);
      await cicloClienteRepo.save(inactivo);

      const todos = await cicloClienteRepo.findAll();

      expect(todos).toHaveLength(2);
      const nombres = todos.map((c) => c.nombre).sort();
      expect(nombres).toEqual(['Ciclo Activo findAll', 'Ciclo Inactivo findAll']);
    });
  });
});
