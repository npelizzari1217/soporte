/**
 * IUsuarioMasterChecker — puerto mínimo para validar que un usuario existe
 * en master.usuarios y pertenece (vía master.membresias) al tenant indicado.
 *
 * Se usa para validar soft refs cross-DB en CrearTicketUseCase (solicitante,
 * PR6) y AsignarTicketUseCase (asignado, PR8) — T14, T15.
 *
 * DECISIÓN DE ADAPTACIÓN AL SCHEMA REAL: soporte1 (referencia) modela
 * `usuarios.cliente_id` como columna directa (1 usuario = 1 tenant). El
 * schema real de Fase 1 (`prisma_master/schema.prisma`) es N:N vía
 * `Membresia` (un usuario puede pertenecer a varios clientes con un rol por
 * membresía) — NO existe `usuarios.cliente_id`. "Pertenece al tenant" se
 * traduce acá a "existe una fila `membresias` (usuarioId, clienteId) viva".
 *
 * Definición mínima con dos métodos para no acoplar el módulo de tickets a
 * `IMembresiaRepository`/`IUsuarioRepository` del módulo auth (que incluyen
 * métodos de escritura y resolución de permisos no relacionados con esta
 * validación de existencia/elegibilidad).
 *
 * Ref design: ADR-8 (prerrequisitos shared), Firmas TS. Ref spec: T14, T15.
 */
export interface IUsuarioMasterChecker {
  /**
   * Verifica que el usuario existe en `master.usuarios` con `deletedAt IS NULL`
   * y tiene una membresía viva (`deletedAt IS NULL`) en el cliente indicado.
   *
   * Usado para validar SOLICITANTES: el requerimiento es solo que el usuario
   * exista y no haya sido eliminado (soft delete). NI `usuarios.activo` NI
   * `membresias.activo` se chequean acá — un solicitante puede estar inactivo
   * (usuario suspendido) o con la membresía desactivada y aun así haber sido
   * el autor válido de un ticket histórico.
   *
   * @param usuarioId UUID del usuario a verificar (soft ref desde el tenant).
   * @param clienteId UUID del cliente activo (TenantContext.clienteId).
   * @returns true si el usuario existe (no soft-deleted) y tiene una
   *          membresía no soft-deleted en ese cliente. false en cualquier
   *          otro caso.
   */
  existeEnTenant(usuarioId: string, clienteId: string): Promise<boolean>;

  /**
   * Verifica que el usuario existe en `master.usuarios` con `activo = true`
   * y `deletedAt IS NULL`, y tiene una membresía ACTIVA (`activo = true`,
   * `deletedAt IS NULL`) en el cliente indicado.
   *
   * Usado para validar ASIGNADOS en AsignarTicketUseCase: un usuario
   * inactivo, o cuya membresía en el tenant fue desactivada, no puede
   * recibir nuevas asignaciones aunque exista en el sistema.
   *
   * @param usuarioId UUID del usuario a verificar.
   * @param clienteId UUID del cliente activo (TenantContext.clienteId).
   * @returns true si el usuario está activo, no soft-deleted, y su
   *          membresía en el cliente está activa y no soft-deleted.
   */
  estaActivoEnTenant(usuarioId: string, clienteId: string): Promise<boolean>;

  /**
   * Resuelve nombre/apellido de un lote de usuarios en una sola consulta
   * (batch — evita N+1 al enriquecer listados con nombres, ej.
   * `TicketResponseDto.solicitanteNombre`/`asignadoNombre`, sdd/beta-frontend
   * item 2). Sin filtro de `clienteId`: los ids de entrada ya provienen de
   * filas tenant-scoped (tickets del propio tenant) — el aislamiento lo
   * garantiza el caller, no este resolver de presentación. Usuarios
   * inexistentes/soft-deleted simplemente no aparecen en el Map resultante
   * (best-effort: el caller decide cómo mostrar un nombre ausente).
   *
   * @param usuarioIds Lote de UUIDs de `master.usuarios` a resolver. Array
   *                    vacío retorna un Map vacío sin consultar la DB.
   * @returns Map de `usuarioId` → `{ nombre, apellido }` (solo los encontrados).
   */
  resolverNombres(usuarioIds: string[]): Promise<Map<string, { nombre: string; apellido: string }>>;

  /**
   * Resuelve la autorización por MÓDULO de un usuario en un cliente, para la
   * elegibilidad de asignación (feature: elegibilidad por catálogo). Espeja el
   * criterio de `resolverScope`: ROOT (`is_global_admin`) y ADMINISTRADOR
   * (membresía activa con rol `ADMINISTRADOR` en el cliente) ven TODOS los
   * módulos (`esAdminTotal = true`); el resto, solo los módulos con AL MENOS
   * UNA acción otorgada en la matriz `usuario_cliente_permisos` (R9,
   * sdd/matriz-permisos-por-usuario — migrado de `usuario_cliente_modulos`,
   * mismo umbral que la derivación de `modulos` en el JWT del actor).
   *
   * @param usuarioId UUID del usuario (asignado).
   * @param clienteId UUID del cliente activo.
   * @returns `esAdminTotal` (ve todo) y `modulos` (códigos con al menos una
   *          acción otorgada; ignorado por el caller si `esAdminTotal`).
   */
  getAutorizacionModulos(
    usuarioId: string,
    clienteId: string,
  ): Promise<{ esAdminTotal: boolean; modulos: string[] }>;

  /**
   * Lista los AGENTES (rol `TECNICO` o `COLABORADOR` — ambos cumplen
   * funciones de técnico, decisión de negocio 2026-08-20) elegibles para
   * atender un ticket de un módulo dado, en un cliente. Un agente es elegible
   * si cumple TODAS estas condiciones:
   * - usuario `activo=true` y no soft-deleted en `master.usuarios`;
   * - tiene una membresía ACTIVA (`activo=true`, `deletedAt IS NULL`) con rol
   *   `codigo` `TECNICO` o `COLABORADOR` en el cliente indicado;
   * - tiene AL MENOS UNA acción otorgada en el `modulo` pedido, en la matriz
   *   `usuario_cliente_permisos` (usuarioId + clienteId + modulo, R9,
   *   sdd/matriz-permisos-por-usuario — migrado de `usuario_cliente_modulos`).
   *
   * Alimenta el combo del control unificado "Asignar y poner en proceso": a
   * diferencia de `getAutorizacionModulos` (que resuelve la elegibilidad de UN
   * asignado concreto y bypassa a ROOT/ADMINISTRADOR), este método devuelve
   * exclusivamente el universo de TÉCNICOS/COLABORADORES por módulo — el
   * criterio de armado de la lista, no el de validación de una asignación
   * puntual. Nombres de símbolos (`TecnicoAsignable`, `listarTecnicosAsignables`)
   * se mantienen sin renombrar: el alcance de un rename cruza back+front (5+
   * archivos, incluida una key de wire/hook), desproporcionado para una
   * ampliación de filtro; este JSDoc es la fuente de verdad del universo real.
   *
   * Este mismo universo define quién puede ser responsable de una regla de asignación
   * automática por tipo (`evaluarResponsableRegla`): ADMINISTRADOR y ROOT quedan fuera.
   *
   * @param clienteId UUID del cliente activo (TenantContext.clienteId).
   * @param modulo Código del módulo del tipo del ticket (ver `modulos.ts`), o
   *               `null` si el ticket es de un tipo custom sin módulo. Con
   *               `null` NO hay agentes elegibles por catálogo → `[]`.
   * @returns Lista de agentes `{ id, nombre, apellido }` (vacía si `modulo`
   *          es `null` o no hay técnicos/colaboradores con ese módulo en el
   *          cliente).
   */
  listarTecnicosAsignables(
    clienteId: string,
    modulo: string | null,
  ): Promise<{ id: string; nombre: string; apellido: string }[]>;
}

/** Token de inyección de dependencias para IUsuarioMasterChecker en NestJS. */
export const USUARIO_MASTER_CHECKER = Symbol('USUARIO_MASTER_CHECKER');
