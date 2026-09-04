/**
 * demo-seed.ts — seed de datos DEMO (Fase 5 "Beta", batch B6 — puesta en
 * marcha, sdd/beta-frontend). Provisiona un tenant demo completo con datos
 * de ejemplo, para que el equipo/QA pueda explorar el frontend sin tener
 * que armar datos a mano.
 *
 * Provisiona (TODO reusando use cases reales, mismo camino que producción):
 * 1. Un CLIENTE demo — `CrearClienteUseCase` (crea la DB física del tenant,
 *    migra, siembra catálogos base, e inserta el usuario ADMINISTRADOR +
 *    su membresía). Idempotente por `nombre` del cliente.
 * 2. Un usuario por rol restante (TECNICO/COLABORADOR/USUARIO) —
 *    `CrearUsuarioTenantUseCase`, con membresía activa en el tenant demo.
 *    Idempotente por email (ignora `MembresiaYaActivaError` en un re-run).
 * 3. Un ciclo del catálogo master, adoptado y activado en el tenant —
 *    `CrearCicloVigenteUseCase` + `ElegirCicloTenantUseCase` +
 *    `ActivarCicloUseCase`. Idempotente (reusa el ciclo master por nombre;
 *    no vuelve a adoptar si el tenant ya tiene un ciclo activo).
 * 4. Datos de ejemplo en el tenant (~8 tickets variados, 2 compras con
 *    ítems (`CrearCompraUseCase`/`AgregarItemCompraUseCase`, PR-14 de
 *    sdd/redisenio-modulo-compras — el modelo `presupuesto` fue reemplazado
 *    por `ItemCompra`/`OperacionCompra`), 1 ticket edilicio con subtareas,
 *    2 equipos con componentes + 1 ticket de soporte). La Ayuda NO se
 *    siembra: es única y global, y la mantiene el repositorio (`pnpm sync:ayuda`).
 *    Gateado por un único check (`ticket.count() === 0`) — si el tenant YA
 *    tiene tickets, se asume ya sembrado y se omite todo este bloque
 *    (idempotente).
 *
 * Diseño testable (mismo criterio que `root-bootstrap.seed.ts`): la lógica
 * vive en `runDemoSeed(app, config)`, que recibe un `INestApplicationContext`
 * YA construido (en producción, `NestFactory.createApplicationContext`; en
 * tests de integración, un `TestingModule` de Nest con `CrearClienteUseCase`
 * override para forzar un `dbName` con sufijo `_test`, mismo "Seam 1" que
 * `crear-cliente.e2e.spec.ts`). `runDemoSeed` NUNCA decide por sí mismo el
 * nombre/emails del cliente demo — los recibe en `config` con defaults de
 * producción, así los tests pueden usar identificadores propios y no
 * colisionar con una corrida real.
 *
 * Uso (post `migrate:master`, con la app apuntando a la DB real):
 *   pnpm run seed:demo
 *
 * Credenciales demo (todas con el mismo password, parametrizable por env
 * `DEMO_SEED_PASSWORD`, default `Demo1234$`):
 *   admin.demo@soporte-demo.local       ADMINISTRADOR
 *   tecnico.demo@soporte-demo.local     TECNICO
 *   colaborador.demo@soporte-demo.local COLABORADOR
 *   usuario.demo@soporte-demo.local     USUARIO
 *
 * Ref: sdd/beta-frontend/tasks T6.1.
 */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { INestApplicationContext } from '@nestjs/common';

import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/shared/infrastructure/persistence/prisma.service';
import { TenantContext } from '../../src/shared/tenancy/tenant-context';
import type { TenantPrismaClient } from '../../src/shared/infrastructure/persistence/prisma-clients';

import {
  CrearClienteUseCase,
  type CrearClienteDto,
} from '../../src/clientes/application/use-cases/crear-cliente.use-case';
import { ProvisionarTenantDatabaseUseCase } from '../../src/clientes/application/use-cases/provisionar-tenant-database.use-case';
import { CrearCicloVigenteUseCase } from '../../src/clientes/application/use-cases/crear-ciclo-vigente.use-case';
import { ElegirCicloTenantUseCase } from '../../src/clientes/application/use-cases/elegir-ciclo-tenant.use-case';
import { ActivarCicloUseCase } from '../../src/clientes/application/use-cases/activar-ciclo.use-case';
import {
  CICLO_VIGENTE_REPOSITORY,
  type ICicloVigenteRepository,
} from '../../src/clientes/domain/ports/i-ciclo-vigente.repository';
import {
  POSTGRES_ADMIN_PORT,
  type IPostgresAdminPort,
} from '../../src/clientes/domain/ports/i-postgres-admin.port';

import { CrearUsuarioTenantUseCase } from '../../src/auth/application/use-cases/crear-usuario-tenant.use-case';
import { AplicarPresetPermisosUseCase } from '../../src/auth/application/use-cases/aplicar-preset-permisos.use-case';
import { MembresiaYaActivaError } from '../../src/auth/domain/errors/auth.errors';
import { USUARIO_REPOSITORY, type IUsuarioRepository } from '../../src/auth/domain/ports/i-usuario.repository';
import {
  MEMBRESIA_REPOSITORY,
  type IMembresiaRepository,
} from '../../src/auth/domain/ports/i-membresia.repository';
import { ROLE_REPOSITORY, type IRoleRepository } from '../../src/auth/domain/ports/i-role.repository';
import { HASH_PROVIDER, type IHashProvider } from '../../src/auth/domain/ports/i-hash.provider';
import {
  CLIENTE_REPOSITORY,
  type IClienteRepository,
} from '../../src/clientes/domain/ports/i-cliente.repository';

import { CrearTicketUseCase, type CrearTicketDto } from '../../src/tickets/application/use-cases/crear-ticket.use-case';
import { TransicionarEstadoUseCase } from '../../src/tickets/application/use-cases/transicionar-estado.use-case';
import { AsignarTicketUseCase } from '../../src/tickets/application/use-cases/asignar-ticket.use-case';
import { ResolverCicloActivoParaCreacion } from '../../src/tickets/application/services/resolver-ciclo-activo.service';
import {
  CICLO_CLIENTE_REPOSITORY,
  type ICicloClienteRepository,
} from '../../src/tickets/domain/ports/i-ciclo-cliente.repository';
import {
  SECTOR_REPOSITORY,
  type ISectorRepository,
} from '../../src/sectores/domain/ports/i-sector.repository';

import {
  CrearCompraUseCase,
  type CrearCompraDto,
} from '../../src/compras/application/use-cases/crear-compra.use-case';
import {
  AgregarItemCompraUseCase,
  type AgregarItemCompraDto,
} from '../../src/compras/application/use-cases/agregar-item-compra.use-case';
import { RegistrarOperacionCompra } from '../../src/compras/application/services/registrar-operacion-compra';
import { NumeradorCompra } from '../../src/compras/domain/services/numerador-compra';
import { PrismaCompraRepository } from '../../src/compras/infrastructure/persistence/prisma/prisma-compra.repository';
import { PrismaOperacionCompraRepository } from '../../src/compras/infrastructure/persistence/prisma/prisma-operacion-compra.repository';
import {
  TENANT_TX_RUNNER,
  type ITenantTransactionRunner,
} from '../../src/shared/infrastructure/persistence/tenant-transaction-runner';

import { CrearTicketEdilicioUseCase } from '../../src/reparaciones/application/use-cases/crear-ticket-edilicio.use-case';
import { CrearSubtareaUseCase } from '../../src/reparaciones/application/use-cases/crear-subtarea.use-case';

import { CrearEquipoUseCase } from '../../src/equipos/application/use-cases/crear-equipo.use-case';
import { AgregarComponenteUseCase } from '../../src/equipos/application/use-cases/agregar-componente.use-case';
import { CrearTicketSoporteUseCase } from '../../src/equipos/application/use-cases/crear-ticket-soporte.use-case';


/** Password demo por defecto — parametrizable por env `DEMO_SEED_PASSWORD`. */
export const DEFAULT_DEMO_SEED_PASSWORD = 'Demo1234$';

/** Roles cubiertos por el seed demo — uno de cada uno, todos con membresía activa. */
export type DemoRol = 'administrador' | 'tecnico' | 'colaborador' | 'usuario';

/** Identificadores de producción del cliente/usuarios demo (defaults de `resolveConfig`). */
export const DEFAULT_DEMO_CLIENTE_NOMBRE = 'Demo Soporte';
export const DEFAULT_DEMO_EMAILS: Record<DemoRol, string> = {
  administrador: 'admin.demo@soporte-demo.local',
  tecnico: 'tecnico.demo@soporte-demo.local',
  colaborador: 'colaborador.demo@soporte-demo.local',
  usuario: 'usuario.demo@soporte-demo.local',
};

/** Config de entrada de `runDemoSeed` — todo opcional, con defaults de producción. */
export interface DemoSeedConfig {
  clienteNombre?: string;
  cicloNombre?: string;
  emails?: Partial<Record<DemoRol, string>>;
  password?: string;
  /**
   * SOLO PARA TESTS DE INTEGRACIÓN: fuerza el `dbName` físico del tenant
   * (mismo "Seam 1" que `crear-cliente.e2e.spec.ts`) — el formato real de
   * producción (`CrearClienteUseCase.deriveDbName`) NUNCA termina en
   * `_test`, así que este override es la única forma de correr el
   * provisioning REAL contra Postgres sin arriesgar tocar una DB física
   * fuera de `_test`. Cuando se provee, `runDemoSeed` arma su PROPIA
   * instancia de `CrearClienteUseCase` (mismas dependencias, resueltas del
   * `app` recibido) en vez de `app.get(CrearClienteUseCase)` — evita
   * depender de `TestingModule.overrideProvider` (que exige compilar TODO
   * el árbol de `AppModule`, incluidos los guards de cada controller, y
   * dispara un error de resolución de dependencias ajeno a este seed).
   */
  dbNameGenerator?: (clienteId: string) => string;
}

interface ResolvedDemoSeedConfig {
  clienteNombre: string;
  cicloNombre: string;
  emails: Record<DemoRol, string>;
  password: string;
  dbNameGenerator?: (clienteId: string) => string;
}

function resolveConfig(config: DemoSeedConfig): ResolvedDemoSeedConfig {
  return {
    clienteNombre: config.clienteNombre ?? DEFAULT_DEMO_CLIENTE_NOMBRE,
    cicloNombre: config.cicloNombre ?? `${DEFAULT_DEMO_CLIENTE_NOMBRE} ${new Date().getUTCFullYear()}`,
    emails: { ...DEFAULT_DEMO_EMAILS, ...config.emails },
    password: config.password ?? process.env.DEMO_SEED_PASSWORD?.trim() ?? DEFAULT_DEMO_SEED_PASSWORD,
    dbNameGenerator: config.dbNameGenerator,
  };
}

export interface DemoSeedResult {
  clienteId: string;
  dbName: string;
  clienteYaExistia: boolean;
  datosDeEjemploSembrados: boolean;
  usuarios: { administrador: string; tecnico: string; colaborador: string; usuario: string };
  credenciales: { rol: string; email: string; password: string }[];
}

// ─── 1. Cliente demo ────────────────────────────────────────────────────────

/** Ver JSDoc de `DemoSeedConfig.dbNameGenerator` — SOLO para tests de integración. */
function buildCrearClienteUseCase(
  app: INestApplicationContext,
  dbNameGenerator: (clienteId: string) => string,
): CrearClienteUseCase {
  return new CrearClienteUseCase(
    app.get<IClienteRepository>(CLIENTE_REPOSITORY),
    app.get<IUsuarioRepository>(USUARIO_REPOSITORY),
    app.get<IMembresiaRepository>(MEMBRESIA_REPOSITORY),
    app.get<IRoleRepository>(ROLE_REPOSITORY),
    app.get<IHashProvider>(HASH_PROVIDER),
    app.get<IPostgresAdminPort>(POSTGRES_ADMIN_PORT),
    app.get(ProvisionarTenantDatabaseUseCase),
    dbNameGenerator,
  );
}

async function provisionCliente(
  app: INestApplicationContext,
  cfg: ResolvedDemoSeedConfig,
): Promise<{ clienteId: string; dbName: string; yaExistia: boolean }> {
  const clienteRepo = app.get<IClienteRepository>(CLIENTE_REPOSITORY);
  const existentes = await clienteRepo.findAll();
  const existente = existentes.find((c) => c.nombre === cfg.clienteNombre && !c.isDeleted());
  if (existente) {
    return { clienteId: existente.id, dbName: existente.dbName, yaExistia: true };
  }

  const crearCliente = cfg.dbNameGenerator ? buildCrearClienteUseCase(app, cfg.dbNameGenerator) : app.get(CrearClienteUseCase);
  const dto: CrearClienteDto = {
    nombre: cfg.clienteNombre,
    adminEmail: cfg.emails.administrador,
    adminNombre: 'Admin',
    adminApellido: 'Demo',
    adminPassword: cfg.password,
  };
  const result = await crearCliente.execute(dto, { isGlobalAdmin: true });
  if (result.isFail()) {
    throw new Error(`[demo-seed] No se pudo crear el cliente demo: ${result.getError().message}`);
  }
  const cliente = result.getValue();
  return { clienteId: cliente.id, dbName: cliente.dbName, yaExistia: false };
}

// ─── 2. Usuarios demo (uno por rol) ─────────────────────────────────────────

/** Resuelve el id de un usuario por email — asume que ya fue provisionado. */
async function resolveUsuarioId(app: INestApplicationContext, email: string): Promise<string> {
  const usuarioRepo = app.get<IUsuarioRepository>(USUARIO_REPOSITORY);
  const usuario = await usuarioRepo.findByEmail(email);
  if (!usuario) {
    throw new Error(`[demo-seed] Usuario demo "${email}" no encontrado tras el provisioning.`);
  }
  return usuario.id;
}

/** Crea (o reutiliza, idempotente) un usuario del tenant con membresía activa. */
async function provisionUsuarioTenant(
  app: INestApplicationContext,
  clienteId: string,
  rolCodigo: string,
  email: string,
  nombre: string,
  apellido: string,
  password: string,
): Promise<string> {
  const crearUsuarioTenant = app.get(CrearUsuarioTenantUseCase);
  const result = await crearUsuarioTenant.execute({ clienteId, email, nombre, apellido, password, rolCodigo });
  if (result.isFail() && !(result.getError() instanceof MembresiaYaActivaError)) {
    throw new Error(
      `[demo-seed] No se pudo crear/asociar el usuario demo "${email}" (${rolCodigo}): ${result.getError().message}`,
    );
  }
  return resolveUsuarioId(app, email);
}

/**
 * Aplica el preset de permisos de TECNICO sobre la matriz nueva
 * (`usuario_cliente_permisos`) del técnico demo (WU-7.5, R9).
 *
 * Fix post-verify W4 (sdd/matriz-permisos-por-usuario): desde ese fix,
 * `CrearUsuarioTenantUseCase` YA siembra el preset como parte del alta
 * inicial — este call site queda como el paso EXPLÍCITO que garantiza
 * idempotencia en un RE-RUN del seed: en un re-run, `provisionUsuarioTenant`
 * encuentra la membresía YA activa (`MembresiaYaActivaError`) y retorna
 * ANTES de llegar al paso de sembrado del alta — sin este call site
 * adicional, un re-run no re-aplicaría el preset si alguien lo hubiera
 * tocado a mano entre corridas. `AplicarPresetPermisosUseCase.setPermisos`
 * es reemplazo atómico e idempotente (ADR-P3): un re-run no duplica ni
 * acumula.
 */
async function aplicarPresetPermisosTecnico(
  app: INestApplicationContext,
  clienteId: string,
  tecnicoId: string,
): Promise<void> {
  const aplicarPreset = app.get(AplicarPresetPermisosUseCase);
  const result = await aplicarPreset.execute({
    clienteId,
    usuarioId: tecnicoId,
    rolCodigo: 'TECNICO',
    // `sobrescribir: true` (W11): el seed quiere un estado CONOCIDO y
    // determinístico, no respetar lo que hubiera quedado de una corrida
    // anterior. Es idempotente a propósito.
    sobrescribir: true,
  });
  if (result.isFail()) {
    throw new Error(
      `[demo-seed] No se pudo aplicar el preset de permisos al técnico demo: ${result.getError().message}`,
    );
  }
}

// ─── 3. Ciclo demo (master → adoptado + activado en el tenant) ─────────────

async function provisionCiclo(
  app: INestApplicationContext,
  clienteId: string,
  dbName: string,
  prismaService: PrismaService,
  tenantContext: TenantContext,
  cfg: ResolvedDemoSeedConfig,
): Promise<void> {
  const cicloVigenteRepo = app.get<ICicloVigenteRepository>(CICLO_VIGENTE_REPOSITORY);
  const activos = await cicloVigenteRepo.findAllActivos();
  let cicloVigenteId = activos.find((c) => c.nombre === cfg.cicloNombre)?.id;

  if (!cicloVigenteId) {
    const crearCicloVigente = app.get(CrearCicloVigenteUseCase);
    const anio = new Date().getUTCFullYear();
    const result = await crearCicloVigente.execute({
      nombre: cfg.cicloNombre,
      fechaInicio: new Date(Date.UTC(anio, 0, 1)),
      fechaFin: new Date(Date.UTC(anio, 11, 31)),
    });
    if (result.isFail()) {
      throw new Error(`[demo-seed] No se pudo crear el ciclo vigente demo: ${result.getError().message}`);
    }
    cicloVigenteId = result.getValue().id;
  }

  const tenantClient = prismaService.getTenantClient(dbName);
  await tenantContext.run({ prismaClient: tenantClient, dbName, clienteId }, async () => {
    const activoDelTenant = await tenantClient.cicloCliente.findFirst({ where: { activo: true } });
    if (activoDelTenant) return; // ya hay un ciclo activo en el tenant — nada que hacer.

    const elegirCiclo = app.get(ElegirCicloTenantUseCase);
    const elegido = await elegirCiclo.execute({ cicloVigenteId: cicloVigenteId! });
    if (elegido.isFail()) {
      throw new Error(`[demo-seed] No se pudo adoptar el ciclo demo en el tenant: ${elegido.getError().message}`);
    }

    const activar = app.get(ActivarCicloUseCase);
    const activado = await activar.execute(elegido.getValue().id);
    if (activado.isFail()) {
      throw new Error(`[demo-seed] No se pudo activar el ciclo demo en el tenant: ${activado.getError().message}`);
    }
  });
}

// ─── 4. Datos de ejemplo del tenant ─────────────────────────────────────────

interface UsuariosDemo {
  administrador: string;
  tecnico: string;
  colaborador: string;
  usuario: string;
}

/** Resuelve por código los ids de los catálogos FIJOS sembrados por el provisioning. */
async function cargarCatalogos(tenantClient: TenantPrismaClient) {
  const [tipos, prioridades] = await Promise.all([
    tenantClient.tipoTicket.findMany(),
    tenantClient.prioridad.findMany(),
  ]);
  return {
    tipoIdPorCodigo: new Map(tipos.map((t) => [t.codigo, t.id])),
    prioridadIdPorCodigo: new Map(prioridades.map((p) => [p.codigo, p.id])),
  };
}

interface TicketDemoSpec {
  titulo: string;
  descripcion: string;
  tipoCodigo: string;
  prioridadCodigo: string;
  solicitanteId: string;
  asignarAId?: string;
  transiciones?: string[];
}

/** Crea un ticket genérico (SOPORTE/MANTENIMIENTO) y lo hace avanzar según el spec. */
async function crearTicketDemo(
  app: INestApplicationContext,
  clienteId: string,
  anio: number,
  spec: TicketDemoSpec,
  catalogos: Awaited<ReturnType<typeof cargarCatalogos>>,
): Promise<void> {
  const crearTicket = app.get(CrearTicketUseCase);
  const dto: CrearTicketDto = {
    titulo: spec.titulo,
    descripcion: spec.descripcion,
    tipoId: catalogos.tipoIdPorCodigo.get(spec.tipoCodigo)!,
    prioridadId: catalogos.prioridadIdPorCodigo.get(spec.prioridadCodigo)!,
    solicitanteId: spec.solicitanteId,
    clienteId,
    autorId: spec.solicitanteId,
    anio,
  };
  const result = await crearTicket.execute(dto);
  if (result.isFail()) {
    throw new Error(`[demo-seed] No se pudo crear el ticket demo "${spec.titulo}": ${result.getError().message}`);
  }
  const ticketId = result.getValue().id;

  if (spec.asignarAId) {
    const asignar = app.get(AsignarTicketUseCase);
    const r = await asignar.execute({
      ticketId,
      asignadoId: spec.asignarAId,
      clienteId,
      autorId: spec.asignarAId,
    });
    if (r.isFail()) {
      throw new Error(`[demo-seed] No se pudo asignar el ticket demo "${spec.titulo}": ${r.getError().message}`);
    }
  }

  if (spec.transiciones?.length) {
    const transicionar = app.get(TransicionarEstadoUseCase);
    for (const nuevoEstadoCodigo of spec.transiciones) {
      const r = await transicionar.execute({
        ticketId,
        nuevoEstadoCodigo,
        autorId: spec.asignarAId ?? spec.solicitanteId,
        actorEsCorrector: false,
      });
      if (r.isFail()) {
        throw new Error(
          `[demo-seed] No se pudo transicionar el ticket demo "${spec.titulo}" a ${nuevoEstadoCodigo}: ${r.getError().message}`,
        );
      }
    }
  }
}

/** Crea 1 ticket edilicio (ubicación como texto libre) con 2 subtareas de ejemplo. */
async function crearEdiliciaDemo(
  app: INestApplicationContext,
  clienteId: string,
  anio: number,
  catalogos: Awaited<ReturnType<typeof cargarCatalogos>>,
  usuarios: UsuariosDemo,
): Promise<void> {
  const crearTicketEdilicio = app.get(CrearTicketEdilicioUseCase);
  const result = await crearTicketEdilicio.execute({
    titulo: 'Reparar filtración de agua en sala de servidores',
    descripcion: 'Se detectó humedad en la pared cercana al rack principal.',
    prioridadId: catalogos.prioridadIdPorCodigo.get('CRITICA')!,
    ubicacion: 'Oficina Central — Planta Baja',
    solicitanteId: usuarios.usuario,
    clienteId,
    autorId: usuarios.usuario,
    anio,
  });
  if (result.isFail()) {
    throw new Error(`[demo-seed] No se pudo crear el ticket edilicio demo: ${result.getError().message}`);
  }
  const ticketEdiliciaId = result.getValue().ticketEdilicia.id;

  const crearSubtarea = app.get(CrearSubtareaUseCase);
  for (const descripcion of ['Contactar plomero de confianza', 'Revisar impermeabilización del techo']) {
    const r = await crearSubtarea.execute({ ticketEdiliciaId, descripcion, autorId: usuarios.tecnico });
    if (r.isFail()) {
      throw new Error(`[demo-seed] No se pudo crear la subtarea edilicia demo: ${r.getError().message}`);
    }
  }
}

/** Crea 2 equipos con componentes + 1 ticket de soporte vinculado a uno de ellos. */
async function crearEquiposDemo(
  app: INestApplicationContext,
  clienteId: string,
  anio: number,
  catalogos: Awaited<ReturnType<typeof cargarCatalogos>>,
  usuarios: UsuariosDemo,
): Promise<void> {
  const crearEquipo = app.get(CrearEquipoUseCase);
  const agregarComponente = app.get(AgregarComponenteUseCase);

  const notebook = await crearEquipo.execute({
    nombre: 'Notebook Dell Latitude 5420',
    numeroSerie: 'SN-DEMO-0001',
    marca: 'Dell',
    modelo: 'Latitude 5420',
    fechaAdquisicion: new Date(Date.UTC(anio - 1, 0, 15)),
  });
  if (notebook.isFail()) {
    throw new Error(`[demo-seed] No se pudo crear el equipo demo (notebook): ${notebook.getError().message}`);
  }
  const notebookId = notebook.getValue().id;

  for (const [codigo, capacidad] of [
    ['RAM', '16GB'],
    ['DISCO', '512GB SSD'],
  ] as const) {
    const r = await agregarComponente.execute({
      equipoId: notebookId,
      tipoComponenteCodigo: codigo,
      capacidad,
    });
    if (r.isFail()) {
      throw new Error(`[demo-seed] No se pudo agregar el componente demo (${codigo}): ${r.getError().message}`);
    }
  }

  const impresora = await crearEquipo.execute({
    nombre: 'Impresora HP LaserJet Pro',
    numeroSerie: 'SN-DEMO-0002',
    marca: 'HP',
    modelo: 'LaserJet Pro M404',
    fechaAdquisicion: new Date(Date.UTC(anio - 1, 5, 1)),
  });
  if (impresora.isFail()) {
    throw new Error(`[demo-seed] No se pudo crear el equipo demo (impresora): ${impresora.getError().message}`);
  }

  const crearTicketSoporte = app.get(CrearTicketSoporteUseCase);
  const soporte = await crearTicketSoporte.execute({
    titulo: 'La notebook no enciende',
    descripcion: 'Se apagó de golpe y no responde al botón de encendido.',
    prioridadId: catalogos.prioridadIdPorCodigo.get('ALTA')!,
    equipoId: notebookId,
    descripcionProblema: 'Posible falla de fuente o batería.',
    solicitanteId: usuarios.usuario,
    clienteId,
    autorId: usuarios.usuario,
    anio,
  });
  if (soporte.isFail()) {
    throw new Error(`[demo-seed] No se pudo crear el ticket de soporte demo: ${soporte.getError().message}`);
  }
}

// ─── Compras demo (sdd/redisenio-modulo-compras, PR-14) ────────────────────

/**
 * `ComprasModule` todavía es un placeholder (`@Module({})`, PR-1 —
 * `ComprasModule` real llega en PR-22) — sus casos de uso NO están
 * registrados como providers de Nest. Mismo criterio que
 * `buildCrearClienteUseCase` (arriba): se instancian a mano, resolviendo
 * cada colaborador desde el `app` ya construido (`TenantContext`,
 * `TENANT_TX_RUNNER`, `CICLO_CLIENTE_REPOSITORY` — todos providers
 * EXPORTADOS de `SharedModule`/`TicketsModule`, ya registrados en el árbol
 * de `AppModule`).
 */
function buildCrearCompraUseCase(app: INestApplicationContext): CrearCompraUseCase {
  const tenantContext = app.get(TenantContext);
  const compraRepo = new PrismaCompraRepository(tenantContext);
  const numerador = new NumeradorCompra(compraRepo);
  const cicloRepo = app.get<ICicloClienteRepository>(CICLO_CLIENTE_REPOSITORY);
  const resolverCicloActivo = new ResolverCicloActivoParaCreacion(cicloRepo);
  const operacionRepo = new PrismaOperacionCompraRepository(tenantContext);
  const registrarOperacion = new RegistrarOperacionCompra(operacionRepo);
  const txRunner = app.get<ITenantTransactionRunner>(TENANT_TX_RUNNER);
  // Fix post-verify W6: SECTOR_REPOSITORY (SectoresModule, ya registrado en
  // AppModule) valida `sectorId` antes del INSERT — mismo criterio que
  // `cicloRepo` arriba.
  const sectorRepo = app.get<ISectorRepository>(SECTOR_REPOSITORY);
  return new CrearCompraUseCase(
    compraRepo,
    numerador,
    resolverCicloActivo,
    sectorRepo,
    registrarOperacion,
    txRunner,
  );
}

/** Ver JSDoc de `buildCrearCompraUseCase` — mismo criterio de instanciación manual. */
function buildAgregarItemCompraUseCase(app: INestApplicationContext): AgregarItemCompraUseCase {
  const tenantContext = app.get(TenantContext);
  const compraRepo = new PrismaCompraRepository(tenantContext);
  const operacionRepo = new PrismaOperacionCompraRepository(tenantContext);
  const registrarOperacion = new RegistrarOperacionCompra(operacionRepo);
  const txRunner = app.get<ITenantTransactionRunner>(TENANT_TX_RUNNER);
  return new AgregarItemCompraUseCase(compraRepo, registrarOperacion, txRunner);
}

interface ItemCompraDemoSpec {
  descripcion: string;
  cantidad: number;
  proveedor: string;
  monto: number;
  moneda: string;
}

interface CompraDemoSpec {
  motivo: string;
  descripcion: string;
  solicitanteId: string;
  items: ItemCompraDemoSpec[];
}

/** Crea 1 compra demo con sus ítems, vía `CrearCompraUseCase` + `AgregarItemCompraUseCase` (mismos use cases reales de producción). */
async function crearCompraDemo(
  app: INestApplicationContext,
  anio: number,
  spec: CompraDemoSpec,
): Promise<void> {
  const crearCompra = buildCrearCompraUseCase(app);
  const dto: CrearCompraDto = {
    motivo: spec.motivo,
    descripcion: spec.descripcion,
    fechaSolicitud: new Date(),
    solicitanteId: spec.solicitanteId,
    anio,
  };
  const result = await crearCompra.execute(dto);
  if (result.isFail()) {
    throw new Error(
      `[demo-seed] No se pudo crear la compra demo "${spec.motivo}": ${result.getError().message}`,
    );
  }
  const compraId = result.getValue().id;

  const agregarItem = buildAgregarItemCompraUseCase(app);
  for (const item of spec.items) {
    const dtoItem: AgregarItemCompraDto = {
      compraId,
      usuarioId: spec.solicitanteId,
      descripcion: item.descripcion,
      cantidad: item.cantidad,
      proveedor: item.proveedor,
      monto: item.monto,
      moneda: item.moneda,
      fechaCotizacion: new Date(),
      observaciones: null,
    };
    const r = await agregarItem.execute(dtoItem);
    if (r.isFail()) {
      throw new Error(
        `[demo-seed] No se pudo agregar el ítem demo "${item.descripcion}" a la compra "${spec.motivo}": ${r.getError().message}`,
      );
    }
  }
}

/** Crea 2 compras demo (5 ítems en total) — una por COLABORADOR, otra por ADMINISTRADOR. */
async function crearComprasDemo(
  app: INestApplicationContext,
  anio: number,
  usuarios: UsuariosDemo,
): Promise<void> {
  await crearCompraDemo(app, anio, {
    motivo: 'Reposición de insumos de oficina',
    descripcion: 'Papel, tóner y artículos varios para el trimestre',
    solicitanteId: usuarios.colaborador,
    items: [
      {
        descripcion: 'Resma de papel A4 (x10)',
        cantidad: 20,
        proveedor: 'Papelera del Centro',
        monto: 4500,
        moneda: 'ARS',
      },
      {
        descripcion: 'Tóner HP LaserJet Pro',
        cantidad: 3,
        proveedor: 'Insumos SRL',
        monto: 18000,
        moneda: 'ARS',
      },
    ],
  });

  await crearCompraDemo(app, anio, {
    motivo: 'Licencias de software anuales',
    descripcion: 'Renovación de licencias Microsoft 365 y antivirus corporativo',
    solicitanteId: usuarios.administrador,
    items: [
      {
        descripcion: 'Licencia Microsoft 365 Business',
        cantidad: 10,
        proveedor: 'Microsoft Argentina',
        monto: 45,
        moneda: 'USD',
      },
      {
        descripcion: 'Renovación antivirus corporativo',
        cantidad: 25,
        proveedor: 'NOD32 Argentina',
        monto: 12,
        moneda: 'USD',
      },
      {
        descripcion: 'Backup en la nube (plan anual)',
        cantidad: 1,
        proveedor: 'CloudBackup SA',
        monto: 890,
        moneda: 'USD',
      },
    ],
  });
}

// La Ayuda YA NO se siembra acá. Los artículos dejaron de vivir en el tenant:
// son únicos y globales, en master, y los mantiene el repositorio
// (`backend/ayuda/*.md` + `pnpm sync:ayuda`). Sembrar dos artículos de demo
// contaminaría la Ayuda REAL que ven todos los clientes, no la de este tenant.

/**
 * Siembra los datos de ejemplo del tenant. Gateado por un único check
 * (`ticket.count() === 0`) — si el tenant YA tiene tickets, se asume ya
 * sembrado y se omite todo el bloque (idempotente).
 *
 * @returns `true` si sembró datos nuevos, `false` si los omitió (ya existían).
 */
async function seedDemoTenantData(
  app: INestApplicationContext,
  params: {
    clienteId: string;
    dbName: string;
    prismaService: PrismaService;
    tenantContext: TenantContext;
    usuarios: UsuariosDemo;
  },
): Promise<boolean> {
  const { clienteId, dbName, prismaService, tenantContext, usuarios } = params;
  const tenantClient = prismaService.getTenantClient(dbName);

  return tenantContext.run({ prismaClient: tenantClient, dbName, clienteId }, async () => {
    const yaSembrado = (await tenantClient.ticket.count()) > 0;
    if (yaSembrado) return false;

    const anio = new Date().getUTCFullYear();
    const catalogos = await cargarCatalogos(tenantClient);

    const ticketsDemo: TicketDemoSpec[] = [
      {
        titulo: 'No puedo acceder a mi correo corporativo',
        descripcion: 'Intento loguearme y me dice contraseña inválida.',
        tipoCodigo: 'SOPORTE',
        prioridadCodigo: 'ALTA',
        solicitanteId: usuarios.usuario,
      },
      {
        titulo: 'Pantalla azul al iniciar Windows',
        descripcion: 'Aparece BSOD intermitente desde ayer.',
        tipoCodigo: 'SOPORTE',
        prioridadCodigo: 'MEDIA',
        solicitanteId: usuarios.colaborador,
        asignarAId: usuarios.tecnico,
        transiciones: ['ASIGNADO'],
      },
      {
        titulo: 'Servidor de archivos caído',
        descripcion: 'Nadie puede acceder a la carpeta compartida //fileserver.',
        tipoCodigo: 'SOPORTE',
        prioridadCodigo: 'CRITICA',
        solicitanteId: usuarios.usuario,
        asignarAId: usuarios.tecnico,
        transiciones: ['ASIGNADO', 'EN_PROCESO'],
      },
      {
        titulo: 'Instalar impresora de red en oficina 2do piso',
        descripcion: 'Solicitud de instalación estándar.',
        tipoCodigo: 'SOPORTE',
        prioridadCodigo: 'BAJA',
        solicitanteId: usuarios.colaborador,
        asignarAId: usuarios.tecnico,
        transiciones: ['ASIGNADO', 'EN_PROCESO', 'RESUELTO', 'CERRADO'],
      },
      {
        titulo: 'Aire acondicionado de la sala de reuniones no enfría',
        descripcion: 'Requiere revisión técnica de mantenimiento.',
        tipoCodigo: 'MANTENIMIENTO',
        prioridadCodigo: 'MEDIA',
        solicitanteId: usuarios.usuario,
      },
      {
        titulo: 'Cambio de luminarias del pasillo principal',
        descripcion: 'Se decidió posponer para el próximo ciclo.',
        tipoCodigo: 'MANTENIMIENTO',
        prioridadCodigo: 'ALTA',
        solicitanteId: usuarios.colaborador,
        asignarAId: usuarios.tecnico,
        transiciones: ['ASIGNADO', 'CANCELADO'],
      },
      {
        titulo: 'Renovar licencia de Office 365',
        descripcion: 'Vence a fin de mes, coordinar renovación.',
        tipoCodigo: 'SOPORTE',
        prioridadCodigo: 'MEDIA',
        solicitanteId: usuarios.administrador,
      },
      {
        titulo: 'Configurar VPN para trabajo remoto',
        descripcion: 'Nuevo ingreso necesita acceso remoto.',
        tipoCodigo: 'SOPORTE',
        prioridadCodigo: 'BAJA',
        solicitanteId: usuarios.tecnico,
        asignarAId: usuarios.tecnico,
        transiciones: ['ASIGNADO'],
      },
    ];

    for (const spec of ticketsDemo) {
      await crearTicketDemo(app, clienteId, anio, spec, catalogos);
    }

    await crearEdiliciaDemo(app, clienteId, anio, catalogos, usuarios);
    await crearEquiposDemo(app, clienteId, anio, catalogos, usuarios);
    await crearComprasDemo(app, anio, usuarios);

    return true;
  });
}

// ─── Orquestación ────────────────────────────────────────────────────────────

/**
 * Corre el seed demo completo contra el `app` (Nest application context) ya
 * construido por el caller. No cierra `app` — es responsabilidad del caller
 * (producción: `main()` abajo; tests: el propio spec).
 */
export async function runDemoSeed(
  app: INestApplicationContext,
  config: DemoSeedConfig = {},
): Promise<DemoSeedResult> {
  const cfg = resolveConfig(config);

  const { clienteId, dbName, yaExistia } = await provisionCliente(app, cfg);

  const administradorId = await resolveUsuarioId(app, cfg.emails.administrador);
  const tecnicoId = await provisionUsuarioTenant(
    app,
    clienteId,
    'TECNICO',
    cfg.emails.tecnico,
    'Tomás',
    'Técnico',
    cfg.password,
  );
  const colaboradorId = await provisionUsuarioTenant(
    app,
    clienteId,
    'COLABORADOR',
    cfg.emails.colaborador,
    'Carla',
    'Colaboradora',
    cfg.password,
  );
  const usuarioId = await provisionUsuarioTenant(
    app,
    clienteId,
    'USUARIO',
    cfg.emails.usuario,
    'Uma',
    'Usuaria',
    cfg.password,
  );

  const prismaService = app.get(PrismaService);
  const tenantContext = app.get(TenantContext);

  await provisionCiclo(app, clienteId, dbName, prismaService, tenantContext, cfg);

  const usuarios: UsuariosDemo = {
    administrador: administradorId,
    tecnico: tecnicoId,
    colaborador: colaboradorId,
    usuario: usuarioId,
  };

  // El técnico debe tener sus permisos ANTES de sembrar los datos
  // (seedDemoTenantData asigna tickets al técnico y la elegibilidad de
  // asignado se evalúa ahí). WU-7.6: el ABM viejo de módulos se retiró —
  // la elegibilidad la da EXCLUSIVAMENTE la matriz nueva (R9).
  await aplicarPresetPermisosTecnico(app, clienteId, tecnicoId);

  const sembrado = await seedDemoTenantData(app, { clienteId, dbName, prismaService, tenantContext, usuarios });

  return {
    clienteId,
    dbName,
    clienteYaExistia: yaExistia,
    datosDeEjemploSembrados: sembrado,
    usuarios,
    credenciales: [
      { rol: 'ADMINISTRADOR', email: cfg.emails.administrador, password: cfg.password },
      { rol: 'TECNICO', email: cfg.emails.tecnico, password: cfg.password },
      { rol: 'COLABORADOR', email: cfg.emails.colaborador, password: cfg.password },
      { rol: 'USUARIO', email: cfg.emails.usuario, password: cfg.password },
    ],
  };
}

// ─── Ejecución directa (ts-node) ───────────────────────────────────────────────

if (require.main === module) {
  try {
    process.loadEnvFile();
  } catch {
    // .env ausente — se usan las variables del entorno.
  }

  void (async () => {
    const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
    try {
      const resultado = await runDemoSeed(app);
      console.log(
        `[demo-seed] Cliente demo ${resultado.clienteYaExistia ? 'ya existía' : 'creado'}: ` +
          `id=${resultado.clienteId} db=${resultado.dbName}`,
      );
      console.log(
        resultado.datosDeEjemploSembrados
          ? '[demo-seed] Datos de ejemplo sembrados en el tenant.'
          : '[demo-seed] El tenant ya tenía tickets — se omitió la siembra de datos de ejemplo (idempotente).',
      );
      console.log('\n=== Credenciales demo ===');
      for (const c of resultado.credenciales) {
        console.log(`${c.rol.padEnd(14)} ${c.email} / ${c.password}`);
      }
    } finally {
      await app.close();
    }
  })().catch((err) => {
    console.error('[demo-seed] Error durante el seed:', err);
    process.exitCode = 1;
  });
}
