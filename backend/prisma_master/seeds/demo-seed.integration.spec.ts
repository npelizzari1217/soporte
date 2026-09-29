/**
 * demo-seed.integration.spec.ts — integración REAL de `runDemoSeed`
 * (T6.1, sdd/beta-frontend, batch B6).
 *
 * Bootstrapea `AppModule` completo vía `NestFactory.createApplicationContext`
 * (mismo mecanismo que usará la ejecución real de `pnpm seed:demo` — NO
 * `Test.createTestingModule`, que fuerza una compilación estricta de TODO
 * el árbol de módulos —incluidos los guards de cada controller— y rompe con
 * un error de DI ajeno a este seed) y corre `runDemoSeed` DOS veces seguidas:
 * la primera corrida provisiona todo desde cero, la segunda debe ser un
 * no-op idempotente (mismo cliente, mismos usuarios, SIN duplicar tickets/
 * compras/KB). Un solo test agrupa ambas corridas para no pagar dos veces
 * el costo de `createDatabase`+migrate+seed real.
 *
 * ── SEGURIDAD (mismo criterio que crear-cliente.e2e.spec.ts) ───────────────
 * Este spec SOLO crea/borra una base de datos física cuyo nombre termina en
 * `_test` (Seam 1: `DemoSeedConfig.dbNameGenerator`, ver JSDoc en
 * `demo-seed.ts`). NUNCA toca `soporte_master`/`soporte_master_test` reales
 * fuera de las filas explícitamente scopeadas por el nombre/emails ÚNICOS
 * de este test (sufijo `-demo-seed-it`), y NUNCA toca
 * `soporte_tenant`/`soporte_tenant_test`.
 *
 * Ref: sdd/beta-frontend/tasks T6.1.
 */
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';

import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/shared/infrastructure/persistence/prisma.service';
import { MasterPrismaClient, TenantPrismaClient } from '../../src/shared/infrastructure/persistence/prisma-clients';
import { POSTGRES_ADMIN_PORT, IPostgresAdminPort } from '../../src/clientes/domain/ports/i-postgres-admin.port';

import { PRESETS_ROL } from '../../src/auth/domain/presets-rol';

import { runDemoSeed, DEFAULT_DEMO_SEED_PASSWORD } from './demo-seed';

const MASTER_URL =
  process.env.DATABASE_URL_MASTER ?? 'postgresql://soporte:soporte@localhost:5432/soporte_master_test';

/** Prefijo + sufijo `_test` OBLIGATORIO (ver nota de seguridad de cabecera). */
function ephemeralDbNameFor(clienteId: string): string {
  return `soporte_demo_seed_it_${clienteId.replace(/-/g, '').slice(0, 16)}_test`;
}

const CLIENTE_NOMBRE = 'Demo Soporte (integration-test, no borrar a mano)';
const EMAILS = {
  administrador: 'admin.demo-seed-it@soporte-demo.test',
  tecnico: 'tecnico.demo-seed-it@soporte-demo.test',
  colaborador: 'colaborador.demo-seed-it@soporte-demo.test',
  usuario: 'usuario.demo-seed-it@soporte-demo.test',
};
const CICLO_NOMBRE = 'Demo Soporte (integration-test) 2026';

describe('runDemoSeed — integración real (T6.1, sdd/beta-frontend)', () => {
  let app: INestApplication;
  let prismaService: PrismaService;
  let masterClient: InstanceType<typeof MasterPrismaClient>;
  let postgresAdmin: IPostgresAdminPort;
  let dbNameCreada: string | undefined;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL_MASTER) {
      process.env.DATABASE_URL_MASTER = MASTER_URL;
    }

    // `NestFactory.create` (no `createApplicationContext`) — AppModule tiene
    // un middleware global (`TenantScopeMiddleware`, R15) que requiere el
    // adapter HTTP; `.init()` sin `.listen()` alcanza (nunca se hace una
    // request real, solo se resuelven providers vía `app.get()`).
    app = await NestFactory.create(AppModule, { logger: false });
    await app.init();

    prismaService = app.get(PrismaService);
    masterClient = prismaService.getMasterClient();
    postgresAdmin = app.get(POSTGRES_ADMIN_PORT);

    // Defensivo: otros specs de integración (ej. crear-cliente.e2e.spec.ts)
    // truncan `roles` en su propio `beforeEach` y solo re-siembran
    // ADMINISTRADOR — si ese spec corrió antes en la misma DB de test
    // (orden de archivos, `fileParallelism: false`), TECNICO/COLABORADOR/
    // USUARIO podrían faltar acá. `runDemoSeed` los necesita los 4 —
    // `upsert` por `codigo` (UNIQUE) es idempotente y aditivo, no pisa nada
    // si ya existen.
    for (const rol of [
      { codigo: 'ADMINISTRADOR', nombre: 'Administrador' },
      { codigo: 'TECNICO', nombre: 'Técnico' },
      { codigo: 'COLABORADOR', nombre: 'Colaborador' },
      { codigo: 'USUARIO', nombre: 'Usuario' },
    ]) {
      await masterClient.role.upsert({
        where: { codigo: rol.codigo },
        update: {},
        create: rol,
      });
    }

    // Limpieza defensiva de una corrida previa fallida (mismos identificadores únicos).
    await masterClient.membresia.deleteMany({
      where: { usuario: { email: { in: Object.values(EMAILS) } } },
    });
    await masterClient.usuario.deleteMany({ where: { email: { in: Object.values(EMAILS) } } });
    await masterClient.cliente.deleteMany({ where: { nombre: CLIENTE_NOMBRE } });
    await masterClient.cicloVigente.deleteMany({ where: { nombre: CICLO_NOMBRE } });
  }, 60_000);

  afterAll(async () => {
    await masterClient.membresia.deleteMany({
      where: { usuario: { email: { in: Object.values(EMAILS) } } },
    });
    await masterClient.usuario.deleteMany({ where: { email: { in: Object.values(EMAILS) } } });
    await masterClient.cliente.deleteMany({ where: { nombre: CLIENTE_NOMBRE } });
    await masterClient.cicloVigente.deleteMany({ where: { nombre: CICLO_NOMBRE } });

    // Cierra `app` (dispara `PrismaService.onModuleDestroy` vía el ciclo de
    // vida de Nest, liberando el pool cacheado del tenant demo — abierto por
    // `runDemoSeed`/`crearComprasDemo` vía `PrismaService.getTenantClient`)
    // ANTES de dropear la DB física. `DROP DATABASE` rechaza el drop si
    // quedan conexiones abiertas ("database is being accessed by other
    // users"), y `dropDatabase` traga ese error en silencio
    // (`.catch(() => undefined)`) — con el orden anterior (drop ANTES de
    // cerrar `app`), la DB física del tenant demo quedaba SIEMPRE huérfana.
    // Bug pre-existente (no introducido por sdd/redisenio-modulo-compras
    // PR-14): confirmado con ~30 DBs `soporte_demo_seed_it_*_test`
    // residuales en la instancia de test, con timestamps (UUIDv7 embebido en
    // el nombre) que datan de antes de este PR.
    await app?.close();
    await prismaService?.onModuleDestroy();

    if (dbNameCreada) {
      await postgresAdmin.dropDatabase(dbNameCreada).catch(() => undefined);
    }
  }, 60_000);

  it(
    '[CRITICAL] primera corrida provisiona cliente+4 usuarios+ciclo+datos de ejemplo; ' +
      'segunda corrida es idempotente (no duplica nada)',
    async () => {
      // ── Primera corrida ──────────────────────────────────────────────
      const primera = await runDemoSeed(app, {
        clienteNombre: CLIENTE_NOMBRE,
        cicloNombre: CICLO_NOMBRE,
        emails: EMAILS,
        dbNameGenerator: ephemeralDbNameFor,
      });
      dbNameCreada = primera.dbName;

      expect(primera.clienteYaExistia).toBe(false);
      expect(primera.datosDeEjemploSembrados).toBe(true);
      expect(primera.dbName).toMatch(/_test$/);
      expect(primera.credenciales).toHaveLength(4);
      expect(primera.credenciales.every((c) => c.password === DEFAULT_DEMO_SEED_PASSWORD)).toBe(true);

      // master.clientes + 4 usuarios con membresía activa.
      const clienteRow = await masterClient.cliente.findUnique({ where: { id: primera.clienteId } });
      expect(clienteRow?.nombre).toBe(CLIENTE_NOMBRE);

      const membresias = await masterClient.membresia.findMany({
        where: { clienteId: primera.clienteId, activo: true },
        include: { rol: true },
      });
      expect(membresias.map((m) => m.rol.codigo).sort()).toEqual(
        ['ADMINISTRADOR', 'COLABORADOR', 'TECNICO', 'USUARIO'].sort(),
      );

      // Datos de ejemplo reales en el tenant.
      let ticketCountTrasPrimera: number;
      {
        const { client: tenantClient, pool } = await openTenantClient(primera.dbName);
        try {
          ticketCountTrasPrimera = await tenantClient.ticket.count();
          expect(ticketCountTrasPrimera).toBeGreaterThanOrEqual(8);
          expect(await tenantClient.ticketEdilicia.count()).toBe(1);
          expect(await tenantClient.subtareaEdilicia.count()).toBe(2);
          expect(await tenantClient.equipoInformatico.count()).toBe(2);
          expect(await tenantClient.componenteEquipo.count()).toBe(2);
          expect(await tenantClient.ticketSoporte.count()).toBe(1);
          // sdd/redisenio-modulo-compras PR-14 [H2]: modelo nuevo
          // (compra/itemCompra/operacionCompra) — 2 compras demo (5 ítems
          // en total), cada `AgregarItemCompraUseCase` exitoso registra 1
          // `OperacionCompra{ITEM_AGREGADO}` (S35) además de la
          // `OperacionCompra{CREACION}` de cada `CrearCompraUseCase`.
          expect(await tenantClient.compra.count()).toBe(2);
          expect(await tenantClient.itemCompra.count()).toBe(5);
          expect(await tenantClient.operacionCompra.count()).toBe(7);
          // La Ayuda ya no se siembra en el tenant: es única y global (master) y
          // la mantiene el repositorio vía `pnpm sync:ayuda`.

          const cicloActivo = await tenantClient.cicloCliente.findFirst({ where: { activo: true } });
          expect(cicloActivo).not.toBeNull();
        } finally {
          await tenantClient.$disconnect();
          await pool.end();
        }
      }

      // Cada rol con preset queda con exactamente su preset tras la primera
      // corrida: es el caso de "regenerar desde cero" del que cuelga la
      // politica de datos descartables.
      const idsConPreset = {
        TECNICO: primera.usuarios.tecnico,
        COLABORADOR: primera.usuarios.colaborador,
        USUARIO: primera.usuarios.usuario,
      } as const;
      for (const [rol, usuarioId] of Object.entries(idsConPreset)) {
        expect(await permisosDe(usuarioId, primera.clienteId), rol).toEqual([...PRESETS_ROL[rol]].sort());
      }

      // Alguien toca la matriz a mano entre corridas: la segunda corrida
      // tiene que devolver a CADA rol a su preset (estado conocido y
      // deterministico), no solo al tecnico.
      await masterClient.usuarioClientePermiso.deleteMany({
        where: { clienteId: primera.clienteId, usuarioId: { in: Object.values(idsConPreset) } },
      });

      // ── Segunda corrida (idempotente) ────────────────────────────────
      const segunda = await runDemoSeed(app, {
        clienteNombre: CLIENTE_NOMBRE,
        cicloNombre: CICLO_NOMBRE,
        emails: EMAILS,
        dbNameGenerator: ephemeralDbNameFor,
      });

      expect(segunda.clienteYaExistia).toBe(true);
      expect(segunda.datosDeEjemploSembrados).toBe(false);
      expect(segunda.clienteId).toBe(primera.clienteId);
      expect(segunda.dbName).toBe(primera.dbName);

      const clientesConEseNombre = await masterClient.cliente.count({ where: { nombre: CLIENTE_NOMBRE } });
      expect(clientesConEseNombre).toBe(1);

      for (const [rol, usuarioId] of Object.entries(idsConPreset)) {
        expect(await permisosDe(usuarioId, primera.clienteId), `${rol} tras re-correr el seed`).toEqual(
          [...PRESETS_ROL[rol]].sort(),
        );
      }

      const { client: tenantClient2, pool: pool2 } = await openTenantClient(primera.dbName);
      try {
        // Sin duplicados: el conteo de tickets NO creció tras la segunda corrida.
        expect(await tenantClient2.ticket.count()).toBe(ticketCountTrasPrimera);
      } finally {
        await tenantClient2.$disconnect();
        await pool2.end();
      }
    },
    120_000,
  );

  /** Permisos del usuario en ese cliente, como `MODULO:ACCION` ordenados. */
  async function permisosDe(usuarioId: string, clienteId: string): Promise<string[]> {
    const filas = await masterClient.usuarioClientePermiso.findMany({ where: { usuarioId, clienteId } });
    return filas.map((f) => `${f.modulo}:${f.accion}`).sort();
  }
});

async function openTenantClient(
  dbName: string,
): Promise<{ client: InstanceType<typeof TenantPrismaClient>; pool: Pool }> {
  const url = new URL(MASTER_URL);
  url.pathname = `/${dbName}`;
  const pool = new Pool({ connectionString: url.toString() });
  const client = new TenantPrismaClient({ adapter: new PrismaPg(pool) });
  return { client, pool };
}
