/**
 * 1.C.1 TEST — Integration tests de PrismaClienteRepository +
 *              PrismaCicloVigenteRepository contra Postgres real (RED → GREEN con 1.C.2)
 *
 * Configuración de DB:
 * - Usa DATABASE_URL_MASTER del entorno o el fallback local de test.
 * - NUNCA usa la DB de desarrollo (soporte_master).
 * - TRUNCATE en beforeEach para determinismo/idempotencia entre runs.
 *
 * Cubre PrismaClienteRepository:
 * - findByDbName: encuentra/no encuentra por db_name
 * - save: upsert (insert nuevo + update existente)
 * - findById: recupera por id
 * - findAll: lista todos incluyendo soft-deleted
 * - soft delete vía save(cliente.suspend())
 *
 * Cubre PrismaCicloVigenteRepository:
 * - save: persiste ciclo nuevo
 * - findAllNonDeleted: excluye soft-deleted
 * - findAll: incluye soft-deleted
 *
 * Nota: los imports de Prisma SÍ son válidos aquí porque estamos en infrastructure/.
 */
import { MasterPrismaClient } from '../../../../shared/infrastructure/persistence/prisma-clients';
import { PrismaService } from '../../../../shared/infrastructure/persistence/prisma.service';
import { PrismaClienteRepository } from './prisma-cliente.repository';
import { PrismaCicloVigenteRepository } from './prisma-ciclo-vigente.repository';
import { ClienteEntity } from '../../../domain/entities/cliente.entity';
import { CicloVigenteEntity } from '../../../domain/entities/ciclo-vigente.entity';

// ─── Configuración de conexión ────────────────────────────────────────────────
// Se usan credenciales locales de test — throwaway, safe to commit.
// Nunca apunta a soporte_master (dev DB).
const TEST_DB_URL =
  process.env.DATABASE_URL_MASTER ??
  'postgresql://soporte:soporte@localhost:5432/soporte_master_test';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeClienteProps(suffix: string) {
  return {
    nombre: `Cliente ${suffix}`,
    razonSocial: `Razón ${suffix} S.A.`,
    cuit: null,
    dbName: `soporte_test_${suffix}`,
    activo: true,
  };
}

function makeCicloProps(year: number) {
  return {
    nombre: `Ejercicio ${year}`,
    fechaInicio: new Date(`${year}-01-01`),
    fechaFin: new Date(`${year}-12-31`),
    activo: true,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Suite
// ─────────────────────────────────────────────────────────────────────────────

describe('PrismaClienteRepository + PrismaCicloVigenteRepository (integration)', () => {
  let prismaService: PrismaService;
  let clienteRepo: PrismaClienteRepository;
  let cicloRepo: PrismaCicloVigenteRepository;
  let masterClient: InstanceType<typeof MasterPrismaClient>;

  beforeAll(() => {
    prismaService = new PrismaService(TEST_DB_URL);
    masterClient = prismaService.getMasterClient();
    clienteRepo = new PrismaClienteRepository(prismaService);
    cicloRepo = new PrismaCicloVigenteRepository(prismaService);
  });

  afterAll(async () => {
    await prismaService.onModuleDestroy();
  });

  beforeEach(async () => {
    // Limpiar tablas antes de cada test para determinismo
    // CASCADE maneja las FKs (ciclos_vigentes no tiene FK a clientes)
    await masterClient.$executeRawUnsafe('TRUNCATE TABLE ciclos_vigentes RESTART IDENTITY CASCADE');
    await masterClient.$executeRawUnsafe('TRUNCATE TABLE clientes RESTART IDENTITY CASCADE');
  });

  // ─── PrismaClienteRepository ─────────────────────────────────────────────

  describe('PrismaClienteRepository', () => {
    describe('save (insert)', () => {
      it('persiste un cliente nuevo y se puede recuperar por id', async () => {
        const cliente = ClienteEntity.create(makeClienteProps('alpha'));
        await clienteRepo.save(cliente);

        const found = await clienteRepo.findById(cliente.id);
        expect(found).not.toBeNull();
        expect(found!.id).toBe(cliente.id);
        expect(found!.nombre).toBe('Cliente alpha');
        expect(found!.dbName).toBe('soporte_test_alpha');
        expect(found!.activo).toBe(true);
        expect(found!.deletedAt).toBeNull();
      });

      it('el id en DB coincide con el UUIDv7 generado por el dominio', async () => {
        const cliente = ClienteEntity.create(makeClienteProps('uuid-check'));
        await clienteRepo.save(cliente);

        const found = await clienteRepo.findById(cliente.id);
        expect(found!.id).toBe(cliente.id);
        // Verificar formato UUIDv7
        expect(cliente.id).toMatch(
          /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
        );
      });
    });

    describe('findByDbName', () => {
      it('encuentra un cliente por db_name', async () => {
        const cliente = ClienteEntity.create(makeClienteProps('beta'));
        await clienteRepo.save(cliente);

        const found = await clienteRepo.findByDbName('soporte_test_beta');
        expect(found).not.toBeNull();
        expect(found!.dbName).toBe('soporte_test_beta');
      });

      it('retorna null cuando no existe el db_name', async () => {
        const found = await clienteRepo.findByDbName('no_existe');
        expect(found).toBeNull();
      });
    });

    describe('findById', () => {
      it('retorna null cuando el id no existe', async () => {
        const found = await clienteRepo.findById('01966a6a-0000-7000-8000-000000000099');
        expect(found).toBeNull();
      });
    });

    describe('findAll', () => {
      it('retorna todos los clientes (incluyendo soft-deleted)', async () => {
        const c1 = ClienteEntity.create(makeClienteProps('list1'));
        const c2 = ClienteEntity.create(makeClienteProps('list2'));
        await clienteRepo.save(c1);
        await clienteRepo.save(c2);
        c2.suspend(); // soft delete
        await clienteRepo.save(c2);

        const all = await clienteRepo.findAll();
        expect(all.length).toBeGreaterThanOrEqual(2);
        const ids = all.map((c: ClienteEntity) => c.id);
        expect(ids).toContain(c1.id);
        expect(ids).toContain(c2.id);
      });
    });

    describe('save (upsert — update)', () => {
      it('actualiza un cliente existente', async () => {
        const cliente = ClienteEntity.create(makeClienteProps('update-me'));
        await clienteRepo.save(cliente);

        // Modificar props (simulando cambio de nombre)
        // Note: en dominio real, se necesitaría un método update en la entidad
        // Para el test, accedemos directamente a props via cast
        (cliente as any).props.nombre = 'Cliente Actualizado';
        await clienteRepo.save(cliente);

        const found = await clienteRepo.findById(cliente.id);
        expect(found!.nombre).toBe('Cliente Actualizado');
      });
    });

    describe('soft delete vía suspend()', () => {
      it('setea activo=false y deleted_at en DB', async () => {
        const cliente = ClienteEntity.create(makeClienteProps('to-suspend'));
        await clienteRepo.save(cliente);

        cliente.suspend();
        await clienteRepo.save(cliente);

        const found = await clienteRepo.findById(cliente.id);
        expect(found).not.toBeNull();
        expect(found!.activo).toBe(false);
        expect(found!.deletedAt).not.toBeNull();
        expect(found!.isDeleted()).toBe(true);
      });
    });
  });

  // ─── PrismaCicloVigenteRepository ────────────────────────────────────────

  describe('PrismaCicloVigenteRepository', () => {
    describe('save + findAllNonDeleted', () => {
      it('persiste un ciclo y lo incluye en findAllNonDeleted', async () => {
        const ciclo = CicloVigenteEntity.create(makeCicloProps(2026));
        await cicloRepo.save(ciclo);

        const nonDeleted = await cicloRepo.findAllNonDeleted();
        expect(nonDeleted.length).toBe(1);
        expect(nonDeleted[0].id).toBe(ciclo.id);
        expect(nonDeleted[0].nombre).toBe('Ejercicio 2026');
        expect(nonDeleted[0].activo).toBe(true);
      });

      it('findAllNonDeleted excluye los ciclos soft-deleted', async () => {
        const cicloActivo = CicloVigenteEntity.create(makeCicloProps(2026));
        const cicloEliminado = CicloVigenteEntity.create(makeCicloProps(2025));
        await cicloRepo.save(cicloActivo);
        await cicloRepo.save(cicloEliminado);

        // Soft-delete del ciclo 2025
        cicloEliminado.softDelete();
        await cicloRepo.save(cicloEliminado);

        const nonDeleted = await cicloRepo.findAllNonDeleted();
        const ids = nonDeleted.map((c: CicloVigenteEntity) => c.id);
        expect(ids).toContain(cicloActivo.id);
        expect(ids).not.toContain(cicloEliminado.id);
      });
    });

    describe('findAll', () => {
      it('findAll incluye ciclos soft-deleted', async () => {
        const ciclo1 = CicloVigenteEntity.create(makeCicloProps(2026));
        const ciclo2 = CicloVigenteEntity.create(makeCicloProps(2025));
        await cicloRepo.save(ciclo1);
        await cicloRepo.save(ciclo2);
        ciclo2.softDelete();
        await cicloRepo.save(ciclo2);

        const all = await cicloRepo.findAll();
        expect(all.length).toBe(2);
      });
    });

    describe('findById', () => {
      it('encuentra un ciclo por id', async () => {
        const ciclo = CicloVigenteEntity.create(makeCicloProps(2026));
        await cicloRepo.save(ciclo);

        const found = await cicloRepo.findById(ciclo.id);
        expect(found).not.toBeNull();
        expect(found!.id).toBe(ciclo.id);
      });

      it('retorna null cuando el id no existe', async () => {
        const found = await cicloRepo.findById('01966a6a-0000-7000-8000-000000000099');
        expect(found).toBeNull();
      });
    });
  });
});
