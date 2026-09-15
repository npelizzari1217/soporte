/**
 * TenantSeederAdapter — implementación de `ITenantSeeder`: siembra los
 * catálogos base (estados, prioridades, tipo_operacion, tipos_ticket,
 * familias_insumo de repuesto) de una DB tenant recién migrada.
 *
 * Catálogos sembrados (R19; `estados` reemplazado por decisión #2025, que
 * corrige la lista original de 8 códigos de R19 a los 6 finales; ampliado
 * por Fase 3 ADR-5/F3-S1 — GATED, aprobado por el dueño):
 * - `estados` (6, FIJO — NO editable por el admin del tenant): NUEVO,
 *   ASIGNADO, EN_PROCESO, RESUELTO, CERRADO, CANCELADO.
 * - `prioridades` (4, FIJO): BAJA, MEDIA, ALTA, CRITICA.
 * - `tipo_operacion` (5, FIJO): CAMBIO_ESTADO, COMENTARIO, ASIGNACION,
 *   ADJUNTO, AVANCE_EDILICIO.
 * - `tipos_ticket` (4, base EDITABLE por el admin del tenant — este seed
 *   solo garantiza el piso): SOPORTE, EDILICIA, MANTENIMIENTO (no-IT),
 *   PREVENTIVO (issue #135: código propio para que el barrido de
 *   preventivo deje de reusar MANTENIMIENTO y sus tickets queden afuera de
 *   `cumplimientoSla`).
 * - `familias_insumo` (11, base EDITABLE por el admin del tenant — WU-1,
 *   sdd/repuestos-familias): el piso universal de familias de REPUESTO
 *   (CPU, MOUSE, TECLADO, RAM, MONITOR, FUENTE, GPU, RED, SSD, HDD,
 *   IMPRESORA). Código y nombre salen VERBATIM del catálogo
 *   `master.tipos_componente` vigente en producción — ver el header de la
 *   migración de datos `20260910120100_seed_familias_insumo_repuesto`, que
 *   backfillea el mismo piso para los tenants que ya existen y documenta
 *   por qué CPU2/EST500W/DISCO quedan afuera.
 * - `unidades_medida` (4, base EDITABLE por el admin del tenant — issue
 *   #155): UNI (Unidad), PAR (Pares), CM (Centímetro), MM (Milímetro). Sin
 *   este piso ningún tenant nuevo puede dar de alta un insumo — el alta
 *   exige elegir una unidad y el catálogo nacía vacío. Códigos copiados de
 *   los que el negocio YA USA en producción (mismo criterio que
 *   `familias_insumo`) — ver el header de la migración de datos hermana
 *   `20260911120000_seed_unidades_medida`, que backfillea el mismo piso
 *   para los tenants que ya existen.
 *
 * `tipos_componente` (Fase 3 F3-Q3) se sembraba acá como catálogo tenant
 * FIJO — ELIMINADO en PR4b (sdd/tipos-componente-master): el catálogo pasó a
 * ser GLOBAL, sembrado una única vez en `master.tipos_componente` (PR1 de
 * `sdd/tipos-componente-master`), no por tenant.
 *
 * Idempotencia (R19): cada catálogo usa `createMany({ skipDuplicates: true
 * })`, equivalente a `INSERT ... ON CONFLICT (codigo) DO NOTHING` — correr
 * `seed()` dos veces sobre la misma DB no duplica filas ni lanza error
 * (`codigo` es `@unique` en los modelos sembrados, ver `prisma_tenant/schema.prisma`).
 *
 * `createClient` es inyectable (por defecto abre su propio `pg.Pool` +
 * `TenantPrismaClient`, independiente de `PrismaService`/`TenantContext` —
 * el provisioning corre FUERA de cualquier request HTTP, antes de que el
 * tenant tenga contexto) para poder mockearlo en unit tests sin Postgres
 * real.
 *
 * Contrato (R18): `seed` MUST cerrar el client (`$disconnect`) y el pool
 * (`pool.end`) en `finally`, incluso si una siembra falla — un rollback
 * posterior (`dropDatabase`) fallaría si quedan conexiones abiertas.
 *
 * Fase 3 (ADR-5): ampliación ADITIVA — sin tenants provisionados al momento
 * del cambio, por lo que NO se requiere migración de datos de backfill
 * (gate del dueño verificado; `tipos_componente` ya existe como tabla desde
 * la migración `20260805194710_init_tenant`, solo faltaba el seed de filas).
 *
 * Ref spec: sdd/auth-multitenancy/spec §R19; sdd/flujos-especializados/spec §F3-S1
 * Ref decisión: soporte/rewrite/db-authorization-y-ajustes (#2025)
 * Ref design: sdd/auth-multitenancy/design ADR-6; sdd/flujos-especializados/design ADR-5
 * Tarea: T7.4 (PR7 Fase 2 — Provisioning: ports + adapters) / T1.1-T1.2 (PR1 Fase 3)
 */
import { Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { ITenantSeeder } from '../domain/ports/i-tenant-seeder.port';
import { TenantPrismaClient } from '../../shared/infrastructure/persistence/prisma-clients';
import { conUtc } from '../../shared/infrastructure/persistence/utc-connection-string';
import { TIPO_CODIGO_PREVENTIVO } from '../../tickets/domain/tipos-ticket.constants';

type TenantClient = InstanceType<typeof TenantPrismaClient>;

/** Firma inyectable que abre un client+pool para la DB tenant `dbName`. */
export type CreateTenantClient = (dbName: string) => { client: TenantClient; pool: Pool };

/** Catálogo FIJO de estados — decisión #2025 (reemplaza los 8 originales de R19). */
const ESTADOS = [
  { codigo: 'NUEVO', nombre: 'Nuevo', orden: 10 },
  { codigo: 'ASIGNADO', nombre: 'Asignado', orden: 20 },
  { codigo: 'EN_PROCESO', nombre: 'En proceso', orden: 30 },
  { codigo: 'RESUELTO', nombre: 'Resuelto', orden: 40 },
  { codigo: 'CERRADO', nombre: 'Cerrado', orden: 50 },
  { codigo: 'CANCELADO', nombre: 'Cancelado', orden: 60 },
];

/**
 * Catálogo FIJO de prioridades (R19). `slaHoras`/`slaActivo` (Fase 4, S1,
 * GATE G1 — movidos de la tabla separada `sla_config`, eliminada, a
 * columnas propias de `prioridades`): defaults de horas objetivo de SLA,
 * editables luego por ADMINISTRADOR (`catalogo:gestionar`) vía
 * `EditarPrioridadUseCase`.
 */
const PRIORIDADES = [
  { codigo: 'BAJA', nombre: 'Baja', orden: 10, slaHoras: 48, slaActivo: true },
  { codigo: 'MEDIA', nombre: 'Media', orden: 20, slaHoras: 24, slaActivo: true },
  { codigo: 'ALTA', nombre: 'Alta', orden: 30, slaHoras: 8, slaActivo: true },
  { codigo: 'CRITICA', nombre: 'Crítica', orden: 40, slaHoras: 4, slaActivo: true },
];

/**
 * Catálogo FIJO de tipo_operacion (R19) — eventos del timeline de un ticket.
 *
 * APROBACION/RECHAZO salieron del seed en `sdd/redisenio-modulo-compras`
 * PR-1: los sembraba la Fase 3 para el timeline de compras y quedaron sin
 * ningún productor al demoler el módulo. El módulo nuevo NO los repone —
 * lleva su propia bitácora en `operaciones_compra`, tabla aparte.
 *
 * Sale del SEED, no de los tenants ya provisionados: sus filas de
 * `operaciones` históricas referencian estos códigos por FK, así que
 * borrarlos de una DB existente rompería integridad referencial. Un tenant
 * nuevo nace sin ellos; uno viejo los conserva como catálogo inerte.
 */
const TIPO_OPERACION = [
  { codigo: 'CAMBIO_ESTADO', nombre: 'Cambio de estado' },
  { codigo: 'COMENTARIO', nombre: 'Comentario' },
  { codigo: 'ASIGNACION', nombre: 'Asignación' },
  { codigo: 'ADJUNTO', nombre: 'Adjunto' },
  { codigo: 'AVANCE_EDILICIO', nombre: 'Avance edilicio' },
];

/**
 * Catálogo BASE (editable) de tipos_ticket (R19) — incluye MANTENIMIENTO (no-IT).
 *
 * `modulo` (B2): un tenant recién seedeado queda idéntico a uno migrado. Los
 * canónicos mapean a sí mismos; MANTENIMIENTO se clasifica en EDILICIA
 * (mantenimiento edilicio) — decisión de producto, coincide con la migración
 * correctiva `20260811130000_reclasificar_mantenimiento_a_edilicia`.
 */
const TIPOS_TICKET = [
  // WU-7.2 (sdd/matriz-permisos-por-usuario, R8): `codigo` sigue 'SOPORTE'
  // (numeración `SOP-...`, catálogo de tipos intacto). `modulo` es el eje de
  // autorización renombrado a 'TICKETS' — un tenant nuevo nace ya alineado
  // con el rename, sin esperar al backfill de un tenant migrado.
  { codigo: 'SOPORTE', nombre: 'Soporte', modulo: 'TICKETS' },
  { codigo: 'EDILICIA', nombre: 'Edilicia', modulo: 'EDILICIA' },
  { codigo: 'MANTENIMIENTO', nombre: 'Mantenimiento', modulo: 'EDILICIA' },
  // issue #135: el preventivo tiene su propio tipo. Mapea al mismo módulo
  // que MANTENIMIENTO (el que reusaba antes) para no cambiar routing ni
  // permisos.
  { codigo: TIPO_CODIGO_PREVENTIVO, nombre: 'Preventivo', modulo: 'EDILICIA' },
];

/**
 * Piso UNIVERSAL de familias de insumo marcadas como repuesto (WU-1,
 * sdd/repuestos-familias). Mismo criterio de procedencia y las mismas 3
 * exclusiones que la migración de datos hermana
 * `20260910120100_seed_familias_insumo_repuesto` (ver su header): código y
 * nombre VERBATIM del catálogo `master.tipos_componente` vigente en
 * producción, no del master local de desarrollo ni de la migración de seed
 * original de ese catálogo.
 */
const FAMILIAS_INSUMO_REPUESTO = [
  { codigo: 'CPU', nombre: 'CPU', esRepuesto: true },
  { codigo: 'MOUSE', nombre: 'Mouse', esRepuesto: true },
  { codigo: 'TECLADO', nombre: 'Teclado', esRepuesto: true },
  { codigo: 'RAM', nombre: 'Memoria RAM', esRepuesto: true },
  { codigo: 'MONITOR', nombre: 'Monitor', esRepuesto: true },
  { codigo: 'FUENTE', nombre: 'Fuente de alimentación', esRepuesto: true },
  { codigo: 'GPU', nombre: 'Placa de video', esRepuesto: true },
  { codigo: 'RED', nombre: 'Placa de red', esRepuesto: true },
  { codigo: 'SSD', nombre: 'Discos SSD', esRepuesto: true },
  { codigo: 'HDD', nombre: 'Disco HDD', esRepuesto: true },
  { codigo: 'IMPRESORA', nombre: 'Impresora', esRepuesto: true },
];

/**
 * Piso de unidades de medida (issue #155): sin esto, un tenant recién
 * provisionado no puede dar de alta NINGÚN insumo — el alta exige elegir una
 * unidad y `unidades_medida` nacía vacía. Mismo criterio de procedencia que
 * `FAMILIAS_INSUMO_REPUESTO`: código y nombre copiados de lo que el negocio
 * YA USA en producción (verificado contra el tenant "Santa Cruz", que las
 * tenía cargadas a mano), no una lista inventada. Ver el header de la
 * migración de datos hermana `20260911120000_seed_unidades_medida` para el
 * backfill de los tenants que ya existen.
 */
const UNIDADES_MEDIDA = [
  { codigo: 'UNI', nombre: 'Unidad' },
  { codigo: 'PAR', nombre: 'Pares' },
  { codigo: 'CM', nombre: 'Centímetro' },
  { codigo: 'MM', nombre: 'Milímetro' },
];

@Injectable()
export class TenantSeederAdapter implements ITenantSeeder {
  constructor(
    private readonly masterUrl: string,
    private readonly createClient: CreateTenantClient = (dbName) =>
      defaultCreateTenantClient(masterUrl, dbName),
  ) {}

  async seed(dbName: string): Promise<void> {
    const { client, pool } = this.createClient(dbName);
    try {
      await client.estado.createMany({ data: ESTADOS, skipDuplicates: true });
      await client.prioridad.createMany({ data: PRIORIDADES, skipDuplicates: true });
      await client.tipoOperacion.createMany({ data: TIPO_OPERACION, skipDuplicates: true });
      await client.tipoTicket.createMany({ data: TIPOS_TICKET, skipDuplicates: true });
      await client.familiaInsumo.createMany({
        data: FAMILIAS_INSUMO_REPUESTO,
        skipDuplicates: true,
      });
      await client.unidadMedida.createMany({ data: UNIDADES_MEDIDA, skipDuplicates: true });
    } finally {
      await client.$disconnect();
      await pool.end();
    }
  }
}

/**
 * Factory por defecto: abre un Pool + TenantPrismaClient propios contra
 * `dbName`, vía `conUtc()` (ADR-1, sdd/sesion-utc-y-backfill-de-fechas) —
 * único punto autorizado a construir `pg.Pool`.
 */
function defaultCreateTenantClient(
  masterUrl: string,
  dbName: string,
): { client: TenantClient; pool: Pool } {
  const url = new URL(masterUrl);
  url.pathname = `/${dbName}`;
  const pool = conUtc(url.toString());
  const adapter = new PrismaPg(pool);
  const client = new TenantPrismaClient({ adapter });
  return { client, pool };
}
