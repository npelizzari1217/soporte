/**
 * IOperacionCompraRepository — puerto de persistencia de la bitácora de una
 * `Compra` (§4.10, ADR-C4).
 *
 * **S37 — append-only garantizado por la FIRMA del puerto**: expone
 * ÚNICAMENTE `crear()` y `listarPorCompra()`. Deliberadamente NO hay
 * `update`/`delete`/`remove`/`borrar`/`actualizar` — no es una convención de
 * nombres a respetar, es que el método físicamente no existe en esta
 * interfaz. `RegistrarOperacionCompra` (aplicación, PR-13) es el único
 * caller de `crear()`, siempre dentro de la misma transacción
 * (`ITenantTransactionRunner.run(...)`) que la mutación que registra — si
 * `crear()` falla, la mutación completa hace rollback (S36).
 *
 * **`OperacionCompra` NO es una entidad de dominio con comportamiento** (a
 * diferencia de `OperacionTicketEntity` en `tickets/`) — es un tipo de datos
 * plano. Dos razones, ambas deliberadas: (1) el `id` de la fila lo genera la
 * DB (`dbgenerated("gen_random_uuid()")`, ver schema), no la app — no hay
 * `BaseEntity.constructor` generando un UUIDv7 de antemano como en el resto
 * de las entidades del proyecto; (2) el design (ADR-C4) no le asigna ningún
 * invariante ni método propio: la única lógica de aplicación sobre estos
 * datos es `RegistrarOperacionCompra.registrar()`, que solo persiste. Un
 * tipo plano en el archivo del puerto es el reflejo correcto de "sin
 * comportamiento" — crear una clase en `domain/entities/` para envolver un
 * dato sin invariantes sería ceremonia sin beneficio, y además ese
 * directorio está fuera de alcance de este PR (Fase B cerrada).
 *
 * Definido en la capa de dominio: sin imports de Prisma ni NestJS. La
 * implementación concreta (`PrismaOperacionCompraRepository`, PR-12) obtiene
 * su cliente vía `TenantContext.getClient()`.
 *
 * Ref spec: sdd/redisenio-modulo-compras/spec §1 (modelo `OperacionCompra`),
 * §4.10 (S35-S37). Ref design: ADR-C4. Tarea: PR-10.
 */

/**
 * Catálogo CERRADO de tipos de operación (CHECK `operaciones_compra_tipo_check`
 * en DB, fijado en PR-2 — ver migración `20260813130000_compras_schema_checks`
 * y `sdd/redisenio-modulo-compras/apply-progress-pr2`). Contrato vinculante
 * consumido por `RegistrarOperacionCompra` (PR-13) y los 10 casos de uso
 * mutadores (PR-14..PR-18) — un `tipo` fuera de este catálogo es rechazado
 * por el CHECK de DB, aunque el dominio ya lo tipa acá para atraparlo en
 * compilación, antes de llegar a la DB.
 *
 * **Es un array y no solo una unión, y es la ÚNICA fuente de verdad**: el tipo
 * se deriva de acá, no al revés. Una unión de TypeScript se borra al compilar,
 * así que sin esta constante no hay nada que un test pueda comparar contra la
 * base. Agregar un tipo acá SIN su migración hace que el INSERT lo rechace el
 * CHECK y, como no hay filtro global de excepciones, salga como 500. Esa
 * deriva la ataja `prisma_tenant/compras-checks.integration.spec.ts`.
 */
export const TIPOS_OPERACION_COMPRA = [
  'CREACION',
  'ITEM_AGREGADO',
  'ITEM_EDITADO',
  'ITEM_ELIMINADO',
  'ITEM_APROBADO',
  'ITEM_RECHAZADO',
  'COMPRA_REGISTRADA',
  'ENTREGA_REGISTRADA',
  'ITEM_CERRADO_CON_FALTANTE',
  'CANCELACION',
] as const;

export type TipoOperacionCompra = (typeof TIPOS_OPERACION_COMPRA)[number];

/**
 * Vista de dominio de una operación ya persistida — retornada por
 * `listarPorCompra()`. `itemCompraId=null` significa operación de cabecera
 * (ej. `CREACION`, `CANCELACION`); no-null significa operación sobre un
 * ítem puntual.
 */
export interface OperacionCompra {
  readonly id: string;
  readonly compraId: string;
  readonly itemCompraId: string | null;
  readonly tipo: TipoOperacionCompra;
  readonly usuarioId: string;
  readonly detalle: string;
  readonly datos: Record<string, unknown> | null;
  readonly createdAt: Date;
}

/**
 * Datos de entrada de `crear()` — sin `id` ni `createdAt`: ambos los genera
 * la DB (`dbgenerated`/`@default(now())`, ver schema). Esto es una
 * asimetría deliberada respecto del resto de los puertos del proyecto
 * (`ICompraRepository.guardar` sí recibe un `id` ya generado en la entidad)
 * — coherente con que `OperacionCompra` no es una `BaseEntity`.
 */
export interface CrearOperacionCompraProps {
  compraId: string;
  itemCompraId: string | null;
  tipo: TipoOperacionCompra;
  usuarioId: string;
  detalle: string;
  datos: Record<string, unknown> | null;
}

export interface IOperacionCompraRepository {
  /**
   * Inserta una operación nueva en la bitácora (S35: exactamente 1 por
   * mutación exitosa). Solo INSERT — nunca hay UPDATE de una fila ya
   * escrita.
   */
  crear(props: CrearOperacionCompraProps): Promise<void>;

  /**
   * Retorna la bitácora completa de una compra (cabecera + ítems),
   * ordenada por `created_at ASC` — consumida por `ListarOperacionesCompra`
   * (PR-19).
   */
  listarPorCompra(compraId: string): Promise<OperacionCompra[]>;
}

/** Token de inyección de dependencias para IOperacionCompraRepository en NestJS. */
export const OPERACION_COMPRA_REPOSITORY = Symbol('OPERACION_COMPRA_REPOSITORY');
