/**
 * TenantSeederAdapter — implementación de `ITenantSeeder`: siembra los
 * catálogos base (estados, prioridades, tipo_operacion, tipos_ticket) de una
 * DB tenant recién migrada.
 *
 * Catálogos sembrados (R19; `estados` reemplazado por decisión #2025, que
 * corrige la lista original de 8 códigos de R19 a los 6 finales; ampliado
 * por Fase 3 ADR-5/F3-S1 — GATED, aprobado por el dueño):
 * - `estados` (6, FIJO — NO editable por el admin del tenant): NUEVO,
 *   ASIGNADO, EN_PROCESO, RESUELTO, CERRADO, CANCELADO.
 * - `prioridades` (4, FIJO): BAJA, MEDIA, ALTA, CRITICA.
 * - `tipo_operacion` (7, FIJO): CAMBIO_ESTADO, COMENTARIO, ASIGNACION,
 *   ADJUNTO, AVANCE_EDILICIO (Fase 1/2) + APROBACION, RECHAZO (Fase 3,
 *   timeline de compras F3-C4/F3-C5).
 * - `tipos_ticket` (4, base EDITABLE por el admin del tenant — este seed
 *   solo garantiza el piso): SOPORTE, COMPRAS, EDILICIA, MANTENIMIENTO
 *   (no-IT).
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
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { ITenantSeeder } from '../domain/ports/i-tenant-seeder.port';
import { TenantPrismaClient } from '../../shared/infrastructure/persistence/prisma-clients';

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

/** Catálogo FIJO de prioridades (R19). */
const PRIORIDADES = [
  { codigo: 'BAJA', nombre: 'Baja', orden: 10 },
  { codigo: 'MEDIA', nombre: 'Media', orden: 20 },
  { codigo: 'ALTA', nombre: 'Alta', orden: 30 },
  { codigo: 'CRITICA', nombre: 'Crítica', orden: 40 },
];

/**
 * Catálogo FIJO de tipo_operacion (R19 + Fase 3 ADR-5/F3-S1) — eventos del
 * timeline de un ticket. APROBACION/RECHAZO se usan en el timeline de
 * compras (F3-C4/F3-C5); el estado de la decisión vive en el satélite
 * `ticket_compra`, no en el timeline (ADR-1 Fase 3).
 */
const TIPO_OPERACION = [
  { codigo: 'CAMBIO_ESTADO', nombre: 'Cambio de estado' },
  { codigo: 'COMENTARIO', nombre: 'Comentario' },
  { codigo: 'ASIGNACION', nombre: 'Asignación' },
  { codigo: 'ADJUNTO', nombre: 'Adjunto' },
  { codigo: 'AVANCE_EDILICIO', nombre: 'Avance edilicio' },
  { codigo: 'APROBACION', nombre: 'Aprobación' },
  { codigo: 'RECHAZO', nombre: 'Rechazo' },
];

/** Catálogo BASE (editable) de tipos_ticket (R19) — incluye MANTENIMIENTO (no-IT). */
const TIPOS_TICKET = [
  { codigo: 'SOPORTE', nombre: 'Soporte' },
  { codigo: 'COMPRAS', nombre: 'Compras' },
  { codigo: 'EDILICIA', nombre: 'Edilicia' },
  { codigo: 'MANTENIMIENTO', nombre: 'Mantenimiento' },
];

/**
 * Defaults de horas de SLA por código de prioridad (Fase 4, S1, GATE G1) —
 * sembrados 1:1 sobre el catálogo FIJO de prioridades, editables luego por
 * ADMINISTRADOR (`catalogo:gestionar`) vía `EditarSlaConfigUseCase`.
 */
const SLA_HORAS_POR_PRIORIDAD: Record<string, number> = {
  CRITICA: 4,
  ALTA: 8,
  MEDIA: 24,
  BAJA: 48,
};

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
      await this.seedSlaConfig(client);
    } finally {
      await client.$disconnect();
      await pool.end();
    }
  }

  /**
   * Siembra `sla_config` (Fase 4, S1, GATE G1) — una fila por prioridad
   * recién sembrada, con los defaults de `SLA_HORAS_POR_PRIORIDAD`. Corre
   * DESPUÉS de `prioridad.createMany` porque depende de los `id` (UUID)
   * generados por esa siembra (`prioridad.findMany` los relee por `codigo`).
   * Idempotente vía `skipDuplicates: true` (`prioridad_id` es UNIQUE).
   */
  private async seedSlaConfig(client: TenantClient): Promise<void> {
    const prioridades = await client.prioridad.findMany({
      where: { codigo: { in: Object.keys(SLA_HORAS_POR_PRIORIDAD) } },
      select: { id: true, codigo: true },
    });
    const data = prioridades.map((p: { id: string; codigo: string }) => ({
      prioridadId: p.id,
      horas: SLA_HORAS_POR_PRIORIDAD[p.codigo],
      activo: true,
    }));
    await client.slaConfig.createMany({ data, skipDuplicates: true });
  }
}

/** Factory por defecto: abre un Pool + TenantPrismaClient propios contra `dbName`. */
function defaultCreateTenantClient(
  masterUrl: string,
  dbName: string,
): { client: TenantClient; pool: Pool } {
  const url = new URL(masterUrl);
  url.pathname = `/${dbName}`;
  const pool = new Pool({ connectionString: url.toString() });
  const adapter = new PrismaPg(pool);
  const client = new TenantPrismaClient({ adapter });
  return { client, pool };
}
