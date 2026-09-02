/**
 * generar-preventivos-wiring.integration.spec.ts — cierre del Hallazgo W2 del
 * verify de `preventivo-edicion-y-permisos` (2026-08-31).
 *
 * `generar-preventivos.integration.spec.ts` y el unitario de
 * `GenerarPreventivosUseCase` construyen el use case A MANO (`new
 * GenerarPreventivosUseCase(...)`), así que ninguno de los dos ejercita el
 * array `inject` de `PreventivoModule`. Este spec es el único que resuelve
 * `GenerarPreventivosUseCase` DESDE EL CONTENEDOR DE NEST real (mismo
 * harness que `test/preventivo.e2e.spec.ts`: `SharedModule` + `AuthModule` +
 * `PreventivoModule`), y ejercita un plan con `equipoId` para probar que el
 * noveno parámetro (`EQUIPO_INFORMATICO_REPOSITORY`) efectivamente llega
 * cableado.
 *
 * Sin esta cobertura, borrar `EQUIPO_INFORMATICO_REPOSITORY` del `inject` de
 * `preventivo.module.ts` deja el `equipoRepo` en `undefined`: en producción
 * TODO plan con `equipoId` generaría su ticket con `Equipo: no se pudo
 * consultar (id …)` para siempre, sin ningún fallo visible (ADR-2).
 *
 * Provisiona su PROPIA DB tenant efímera (no comparte la de
 * `test/preventivo.e2e.spec.ts`): evita que los planes ya vencidos de otros
 * tests de ese archivo se reprocesen al llamar `execute()`.
 *
 * Ref verify-report: Hallazgo W2. Ref design: ADR-2. Ref tasks: WU-5 (cierre
 * de hallazgos del verify).
 */
import { randomBytes } from 'node:crypto';
import { Module } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { SharedModule } from '../shared/shared.module';
import { AuthModule } from '../auth/auth.module';
import { PreventivoModule } from './preventivo.module';

import { PrismaService } from '../shared/infrastructure/persistence/prisma.service';
import { TenantContext } from '../shared/tenancy/tenant-context';
import { TenantPrismaClient } from '../shared/infrastructure/persistence/prisma-clients';

import { PostgresAdminService } from '../clientes/infrastructure/postgres-admin.service';
import { TenantMigrationRunnerAdapter } from '../clientes/infrastructure/tenant-migration-runner.adapter';
import { TenantSeederAdapter } from '../clientes/infrastructure/tenant-seeder.adapter';
import { PrismaClienteRepository } from '../clientes/infrastructure/persistence/prisma/prisma-cliente.repository';
import { PrismaUsuarioRepository } from '../auth/infrastructure/persistence/prisma/prisma-usuario.repository';
import { ClienteEntity } from '../clientes/domain/entities/cliente.entity';
import { ZonaHoraria } from '../shared/domain/zona-horaria';
import { UsuarioEntity } from '../auth/domain/entities/usuario.entity';
import { usarLockMasterTest } from '../testing/lock-master-test';

import {
  EQUIPO_INFORMATICO_REPOSITORY,
  IEquipoInformaticoRepository,
} from '../equipos/domain/ports/i-equipo-informatico.repository';
import { EquipoInformaticoEntity } from '../equipos/domain/entities/equipo-informatico.entity';

import {
  PLAN_PREVENTIVO_REPOSITORY,
  IPlanPreventivoRepository,
} from './domain/ports/i-plan-preventivo.repository';
import { PlanPreventivoEntity } from './domain/entities/plan-preventivo.entity';
import { GenerarPreventivosUseCase } from './application/use-cases/generar-preventivos.use-case';

const MASTER_TEST_URL =
  process.env.DATABASE_URL_MASTER ??
  'postgresql://soporte:soporte@localhost:5432/soporte_master_test';

const TENANT_DB_NAME = `soporte_prov_prevGenDI_${randomBytes(4).toString('hex')}_test`;

// Harness mínimo: los mismos tres módulos que `test/preventivo.e2e.spec.ts`.
// Sin HTTP ni middleware — acá solo importa que `GenerarPreventivosUseCase`
// salga resuelto por el contenedor, no construido a mano.
@Module({ imports: [SharedModule, AuthModule, PreventivoModule] })
class TestHarnessModule {}

// Turno exclusivo sobre la master de test compartida — ver src/testing/lock-master-test.ts.
usarLockMasterTest();

describe('[W2] GenerarPreventivosUseCase resuelto desde el contenedor de Nest, con equipoId', () => {
  const admin = new PostgresAdminService(MASTER_TEST_URL);

  let moduleRef: TestingModule;
  let prismaService: PrismaService;
  let tenantContext: TenantContext;
  let tenantClient: InstanceType<typeof TenantPrismaClient>;

  let equipoRepo: IEquipoInformaticoRepository;
  let planRepo: IPlanPreventivoRepository;
  let generarPreventivosUseCase: GenerarPreventivosUseCase;

  let clienteId: string;
  let responsableId: string;
  let prioridadId: string;

  function withTenant<T>(fn: () => Promise<T>): Promise<T> {
    return tenantContext.run({ prismaClient: tenantClient, dbName: TENANT_DB_NAME, clienteId }, fn);
  }

  beforeAll(async () => {
    if (!process.env.DATABASE_URL_MASTER) {
      process.env.DATABASE_URL_MASTER = MASTER_TEST_URL;
    }

    await admin.createDatabase(TENANT_DB_NAME);
    await new TenantMigrationRunnerAdapter(MASTER_TEST_URL).run(TENANT_DB_NAME);
    await new TenantSeederAdapter(MASTER_TEST_URL).seed(TENANT_DB_NAME);

    moduleRef = await Test.createTestingModule({ imports: [TestHarnessModule] }).compile();

    prismaService = moduleRef.get(PrismaService);
    tenantContext = moduleRef.get(TenantContext);
    tenantClient = prismaService.getTenantClient(TENANT_DB_NAME);

    equipoRepo = moduleRef.get(EQUIPO_INFORMATICO_REPOSITORY);
    planRepo = moduleRef.get(PLAN_PREVENTIVO_REPOSITORY);
    // Resolución REAL desde el contenedor — el punto entero de este spec.
    generarPreventivosUseCase = moduleRef.get(GenerarPreventivosUseCase);

    // Fixtures de MASTER: un cliente real apuntando a la DB tenant efímera,
    // y un usuario con membresía viva en ese cliente — lo exige
    // `UsuarioMasterChecker.existeEnTenant` (real, no mockeado, porque acá
    // TODO sale del contenedor) para aceptar `responsableId` como
    // solicitante del ticket.
    const clienteRepo = new PrismaClienteRepository(prismaService);
    const usuarioRepo = new PrismaUsuarioRepository(prismaService);
    const masterClient = prismaService.getMasterClient();

    const cliente = ClienteEntity.create({
      nombre: `Preventivo GEN DI ${randomBytes(3).toString('hex')}`,
      razonSocial: null,
      cuit: null,
      dbName: TENANT_DB_NAME,
      activo: true,
      zonaHoraria: ZonaHoraria.crear('America/Argentina/Buenos_Aires'),
    });
    await clienteRepo.save(cliente);
    clienteId = cliente.id;

    const responsable = UsuarioEntity.create({
      email: `prev-gen-di-${randomBytes(3).toString('hex')}@integration.test`,
      nombre: 'Responsable',
      apellido: 'PreventivoDI',
      passwordHash: '$argon2id$v=19$m=19456,t=2,p=1$test$hash',
      activo: true,
      isGlobalAdmin: false,
    });
    await usuarioRepo.save(responsable);
    responsableId = responsable.id;

    const codigoRol = `ROL_PREV_GEN_DI_${randomBytes(4).toString('hex')}`;
    const rol = await masterClient.role.create({
      data: { codigo: codigoRol, nombre: codigoRol },
    });
    await masterClient.membresia.create({
      data: { usuarioId: responsableId, clienteId, rolId: rol.id, activo: true },
    });

    const prioridad = await tenantClient.prioridad.findUniqueOrThrow({
      where: { codigo: 'MEDIA' },
    });
    prioridadId = prioridad.id;

    // Ciclo activo — lo exige `CrearTicketUseCase` para numerar el ticket.
    await tenantClient.cicloCliente.create({
      data: {
        cicloVigenteId: '01900000-0000-7000-8000-000000000001',
        nombre: 'Preventivo GEN DI Ciclo Activo',
        fechaInicio: new Date('2020-01-01'),
        fechaFin: new Date('2099-12-31'),
        activo: true,
      },
    });
  }, 90_000);

  afterAll(async () => {
    await prismaService.onModuleDestroy();
    await admin.dropDatabase(TENANT_DB_NAME);
    await moduleRef.close();
  }, 30_000);

  it('plan con equipoId (equipo vigente) genera el ticket con "Equipo: <nombre>", nunca EQUIPO_NO_CONSULTABLE', async () => {
    // Equipo real en el inventario del tenant — el `findById` del noveno
    // parámetro tiene que resolverlo de verdad.
    const equipo = EquipoInformaticoEntity.create({
      nombre: 'Notebook Dell 5420 (WU-5 DI)',
      numeroSerie: null,
      marca: null,
      modelo: null,
      fechaAdquisicion: null,
      ubicacion: null,
      importe: null,
      fechaValoracion: null,
      observaciones: null,
      valorResidual: null,
      fechaValorResidual: null,
    });
    await withTenant(() => equipoRepo.save(equipo));

    const mediaNoche = new Date(Date.UTC(2020, 0, 1));
    const plan = PlanPreventivoEntity.create({
      titulo: `PLAN_PREV_GEN_DI_${randomBytes(3).toString('hex')}`,
      instrucciones: null,
      equipoId: equipo.id,
      ubicacion: null,
      prioridadId,
      responsableId,
      intervaloValor: 7,
      intervaloUnidad: 'DIAS',
      fechaInicio: mediaNoche,
      proximaEjecucionEn: mediaNoche,
      activo: true,
    }).getValue();
    await withTenant(() => planRepo.guardar(plan));

    await withTenant(() => generarPreventivosUseCase.execute(clienteId));

    const tickets = await tenantClient.ticket.findMany({ where: { titulo: plan.titulo } });
    expect(tickets).toHaveLength(1);
    expect(tickets[0].descripcion).toBe(`Equipo: ${equipo.nombre}`);
    expect(tickets[0].descripcion).not.toContain('no se pudo consultar');
    expect(tickets[0].descripcion).not.toContain('no encontrado');
  });

  it('sanity: la DB tenant efímera es propia de este spec (nombre *_test)', () => {
    expect(TENANT_DB_NAME).toMatch(/^soporte_prov_prevGenDI_.*_test$/);
  });
});
