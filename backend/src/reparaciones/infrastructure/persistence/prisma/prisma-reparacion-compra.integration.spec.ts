/**
 * WU2.1 [INTEGRATION][RED→GREEN] — PrismaReparacionCompraRepository contra
 * Postgres REAL, en una DB de TENANT EFÍMERA propia de esta suite (creada y
 * migrada en `beforeAll`, dropeada en `afterAll`).
 *
 * Desde odd/ticket-unificado (S1) el vínculo vive en `ticket_compra` y se
 * pide por id de TICKET, de cualquier tipo y sin satélite de Edilicia; la tabla
 * vieja `reparacion_compra` quedó congelada y este repositorio no la escribe.
 *
 * Precedente exacto seguido:
 * `compras/infrastructure/persistence/prisma/prisma-compra-repository.aislamiento.integration.spec.ts`
 * — DB física efímera (`soporte_prov_<slug>_<hex>_test`) vía
 * `PostgresAdminService`/`TenantMigrationRunnerAdapter` (subproceso real de
 * `prisma migrate deploy`). Se usa tenant PROPIO (y no el `soporte_tenant_test`
 * compartido de otras suites de reparaciones) porque el caso (c) necesita
 * ejercitar la FK RESTRICT insertando un `compra_id` inexistente — más
 * simple con una base descartable entera que con fixtures acotados en una
 * base compartida.
 *
 * Los cinco casos de la tarea WU2.1:
 * (a) vincular dos veces el mismo par → una sola fila, sin error (UNIQUE +
 *     `ON CONFLICT DO NOTHING` vía `createMany({ skipDuplicates: true })`).
 * (b) `desvincular` hace hard delete real de la fila.
 * (c) vincular con `compra_id` inexistente → la FK RESTRICT lo rechaza.
 * (d) una compra vinculada con `deleted_at IS NOT NULL` NO vuelve en
 *     `findComprasVinculadasByTicketIds` (D6) — el test crea la
 *     compra, la vincula, confirma que SÍ vuelve, recién después la
 *     soft-deletea y confirma que DEJA de volver. Afirma el comportamiento
 *     explícitamente, no lo prueba por omisión.
 * (e) `ids=[]` no dispara ninguna consulta a la base.
 *
 * Higiene: limpiar filas → `prismaService.onModuleDestroy()` (cierra el
 * pool) → `admin.dropDatabase()`, en ese orden — con el pool vivo Postgres
 * rechaza el DROP en silencio.
 *
 * Esta suite NO toca `soporte_master_test`: no llama a `usarLockMasterTest()`.
 *
 * Ref spec: sdd/reparacion-bloqueada-por-compra/spec, capability "Vínculo
 * Reparación–Compra". Ref design: D4, D5, D6, tabla de testing. Tarea: WU2.1.
 */
import { randomBytes, randomUUID } from 'node:crypto';
import { PrismaService } from '../../../../shared/infrastructure/persistence/prisma.service';
import { TenantContext } from '../../../../shared/tenancy/tenant-context';
import { TenantPrismaClient } from '../../../../shared/infrastructure/persistence/prisma-clients';
import { PostgresAdminService } from '../../../../clientes/infrastructure/postgres-admin.service';
import { TenantMigrationRunnerAdapter } from '../../../../clientes/infrastructure/tenant-migration-runner.adapter';
import { PrismaReparacionCompraRepository } from './prisma-reparacion-compra.repository';

const MASTER_TEST_URL =
  process.env.DATABASE_URL_MASTER ??
  'postgresql://soporte:soporte@localhost:5432/soporte_master_test';

const TENANT_DB_NAME = `soporte_prov_repcompra_${randomBytes(4).toString('hex')}_test`;
const DUMMY_USUARIO_ID = '01900000-0000-7000-8000-000000000301';

describe('PrismaReparacionCompraRepository — Integration (WU2)', () => {
  const admin = new PostgresAdminService(MASTER_TEST_URL);
  const migrationRunner = new TenantMigrationRunnerAdapter(MASTER_TEST_URL);

  let prismaService: PrismaService;
  let tenantClient: InstanceType<typeof TenantPrismaClient>;
  let tenantContext: TenantContext;
  let repo: PrismaReparacionCompraRepository;

  let tipoSoporteId: string;
  let estadoNuevoId: string;
  let prioridadMediaId: string;
  let cicloId: string;

  let numeroCounter = 0;
  function nextNumeroCompra(): string {
    numeroCounter += 1;
    return `COM-2026-W2${String(numeroCounter).padStart(4, '0')}`;
  }

  function withTenant<T>(fn: () => Promise<T>): Promise<T> {
    return tenantContext.run(
      { prismaClient: tenantClient, dbName: TENANT_DB_NAME, clienteId: 'test-cliente-wu2' },
      fn,
    );
  }

  /** Crea un ticket de un tipo de TICKETS, SIN satélite de Edilicia: el vínculo ya no lo pide. */
  async function crearTicketId(): Promise<string> {
    const ticket = await tenantClient.ticket.create({
      data: {
        numero: `WU2-${randomBytes(5).toString('hex')}`,
        titulo: 'Ticket de test WU2',
        tipoId: tipoSoporteId,
        estadoId: estadoNuevoId,
        prioridadId: prioridadMediaId,
        solicitanteId: DUMMY_USUARIO_ID,
      },
    });
    return ticket.id;
  }

  /** Crea una compra mínima (sin ítems, no bloquea la vinculación en sí). */
  async function crearCompraId(): Promise<string> {
    const compra = await tenantClient.compra.create({
      data: {
        numero: nextNumeroCompra(),
        fechaSolicitud: new Date('2026-01-01'),
        motivo: 'Compra de test WU2',
        solicitanteId: DUMMY_USUARIO_ID,
        cicloId,
      },
    });
    return compra.id;
  }

  beforeAll(async () => {
    // DB física efímera, real, migrada — NUNCA soporte_master*.
    await admin.createDatabase(TENANT_DB_NAME);
    await migrationRunner.run(TENANT_DB_NAME);

    prismaService = new PrismaService(MASTER_TEST_URL);
    tenantClient = prismaService.getTenantClient(TENANT_DB_NAME);
    tenantContext = new TenantContext();
    repo = new PrismaReparacionCompraRepository(tenantContext);

    const tipo = await tenantClient.tipoTicket.create({
      data: {
        codigo: 'WU2_TEST_SOPORTE',
        nombre: 'Soporte Test WU2',
        activo: true,
        modulo: 'TICKETS',
      },
    });
    tipoSoporteId = tipo.id;

    const estado = await tenantClient.estado.create({
      data: { codigo: 'WU2_TEST_NUEVO', nombre: 'Nuevo Test WU2', orden: 1, activo: true },
    });
    estadoNuevoId = estado.id;

    const prioridad = await tenantClient.prioridad.create({
      data: { codigo: 'WU2_TEST_MEDIA', nombre: 'Media Test WU2', orden: 1, activo: true },
    });
    prioridadMediaId = prioridad.id;

    const ciclo = await tenantClient.cicloCliente.create({
      data: {
        cicloVigenteId: DUMMY_USUARIO_ID,
        nombre: 'WU2 Ciclo Test',
        fechaInicio: new Date('2026-01-01'),
        fechaFin: new Date('2026-12-31'),
        // activo: false — higiene, esta DB es entera efímera pero sin motivo
        // para dejar un ciclo "vigente" en un tenant que nadie más consulta.
        activo: false,
      },
    });
    cicloId = ciclo.id;
  }, 60_000);

  afterAll(async () => {
    // Tenant PROPIO, efímero: se destruye entero — no hace falta limpiar
    // filas antes (a diferencia de una suite contra la DB compartida).
    await prismaService.onModuleDestroy();
    await admin.dropDatabase(TENANT_DB_NAME);
  }, 60_000);

  it('(a) vincular dos veces el mismo par crea una sola fila, sin error', async () => {
    const ticketId = await crearTicketId();
    const compraId = await crearCompraId();

    await withTenant(async () => {
      await repo.vincular(ticketId, compraId);
      await repo.vincular(ticketId, compraId);
    });

    const filas = await tenantClient.ticketCompra.findMany({
      where: { ticketId, compraId },
    });
    expect(filas).toHaveLength(1);
    // La tabla congelada no se escribe más (odd/ticket-unificado).
    expect(await tenantClient.reparacionCompra.count({ where: { compraId } })).toBe(0);
  });

  it('(b) desvincular() hace hard delete real de la fila', async () => {
    const ticketId = await crearTicketId();
    const compraId = await crearCompraId();

    await withTenant(async () => {
      await repo.vincular(ticketId, compraId);
      await repo.desvincular(ticketId, compraId);
    });

    const filas = await tenantClient.ticketCompra.findMany({
      where: { ticketId, compraId },
    });
    expect(filas).toHaveLength(0);
  });

  it('(c) vincular con compra_id inexistente es rechazado por la FK RESTRICT', async () => {
    const ticketId = await crearTicketId();
    const compraIdInexistente = randomUUID();

    await withTenant(async () => {
      await expect(repo.vincular(ticketId, compraIdInexistente)).rejects.toThrow();
    });
  });

  it('(d) una compra vinculada con deleted_at IS NOT NULL NO vuelve en el lote (D6)', async () => {
    const ticketId = await crearTicketId();
    const compraId = await crearCompraId();

    await withTenant(async () => {
      await repo.vincular(ticketId, compraId);

      // Primero, ACTIVA: tiene que volver. Sin esta afirmación, el test de
      // abajo no distinguiría "la filtré" de "nunca la inserté".
      const antes = await repo.findComprasVinculadasByTicketIds([ticketId]);
      expect(antes.get(ticketId)?.map((c) => c.compraId)).toEqual([compraId]);

      // Ahora, soft-delete de la compra (no del vínculo).
      await tenantClient.compra.update({
        where: { id: compraId },
        data: { deletedAt: new Date() },
      });

      const despues = await repo.findComprasVinculadasByTicketIds([ticketId]);
      expect(despues.has(ticketId)).toBe(false);
    });
  });

  it('(e) ids=[] no dispara ninguna consulta a la base', async () => {
    const spy = vi.spyOn(tenantClient.ticketCompra, 'findMany');

    await withTenant(async () => {
      const resultado = await repo.findComprasVinculadasByTicketIds([]);
      expect(resultado).toEqual(new Map());
    });

    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('el lote agrupa por ticket y ordena cada lista por número de compra', async () => {
    const ticketA = await crearTicketId();
    const ticketB = await crearTicketId();
    const [primera, segunda, tercera] = [
      await crearCompraId(),
      await crearCompraId(),
      await crearCompraId(),
    ];

    await withTenant(async () => {
      // Se vinculan fuera de orden: el orden del resultado es el del número, no el de alta.
      await repo.vincular(ticketA, tercera);
      await repo.vincular(ticketA, primera);
      await repo.vincular(ticketB, segunda);

      const lote = await repo.findComprasVinculadasByTicketIds([ticketA, ticketB]);

      expect(lote.get(ticketA)?.map((c) => c.compraId)).toEqual([primera, tercera]);
      expect(lote.get(ticketB)?.map((c) => c.compraId)).toEqual([segunda]);
    });
  });

  it('el mapper arma la vista estructural completa: numero, ítems no eliminados con comprado/entregado derivados', async () => {
    const ticketId = await crearTicketId();
    const compraId = await crearCompraId();

    await tenantClient.itemCompra.create({
      data: {
        compraId,
        descripcion: 'Repuesto de test WU2',
        cantidad: 10,
        proveedor: 'Proveedor Test',
        monto: 100,
        fechaCotizacion: new Date('2026-01-01'),
        estadoAprobacion: 'APROBADO',
        decididoPorId: DUMMY_USUARIO_ID,
        decididoEn: new Date('2026-01-02'),
        cantidadOrdenada: 10,
        cantidadRecibida: 10,
        cantidadEntregada: 4,
      },
    });
    // Ítem soft-deleted: no debe llegar a la vista estructural.
    const itemBorrado = await tenantClient.itemCompra.create({
      data: {
        compraId,
        descripcion: 'Repuesto borrado de test WU2',
        cantidad: 5,
        proveedor: 'Proveedor Test',
        monto: 50,
        fechaCotizacion: new Date('2026-01-01'),
        estadoAprobacion: 'PENDIENTE',
      },
    });
    await tenantClient.itemCompra.update({
      where: { id: itemBorrado.id },
      data: { deletedAt: new Date() },
    });

    await withTenant(async () => {
      await repo.vincular(ticketId, compraId);
      const vinculadas = await repo.findComprasVinculadasByTicketIds([ticketId]);
      const [compra] = vinculadas.get(ticketId) ?? [];

      expect(compra?.compraId).toBe(compraId);
      expect(compra?.cancelada).toBe(false);
      expect(compra?.items).toHaveLength(1);
      expect(compra?.items[0]).toEqual({
        estadoAprobacion: 'APROBADO',
        comprado: true, // cantidadRecibida(10) >= cantidad(10)
        entregado: false, // cantidadEntregada(4) < cantidad(10)
      });
    });
  });
});
