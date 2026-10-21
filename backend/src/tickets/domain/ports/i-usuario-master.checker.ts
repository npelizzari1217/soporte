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
   * Indica si el usuario ve todo en el cliente: ROOT (`is_global_admin`) o una membresía activa
   * con rol `ADMINISTRADOR`. Es el mismo criterio de `resolverScope` para el actor, aplicado a OTRO
   * usuario (el destinatario de una asignación). No lee ninguna tabla de permisos: la elegibilidad
   * por tipo vive en el tenant (odd/permisos-por-tipo-ticket, D5 g).
   *
   * @param usuarioId UUID del usuario (asignado).
   * @param clienteId UUID del cliente activo.
   * @returns `true` si es ROOT o ADMINISTRADOR del cliente.
   */
  esAdminTotalEnTenant(usuarioId: string, clienteId: string): Promise<boolean>;

  /**
   * De entre `usuarioIds`, los AGENTES del cliente (rol `TECNICO` o `COLABORADOR`: ambos cumplen
   * funciones de técnico, decisión de negocio 2026-08-20). Un agente cumple TODAS estas
   * condiciones:
   * - usuario `activo=true` y no soft-deleted en `master.usuarios`;
   * - no es el usuario de integración de la API pública;
   * - tiene una membresía ACTIVA (`activo=true`, `deletedAt IS NULL`) con rol `codigo` `TECNICO` o
   *   `COLABORADOR` en el cliente indicado.
   *
   * Solo identidad, rol y membresía: qué tipos atiende cada uno lo decide la tabla
   * `permisos_tipo_ticket` del tenant, que arma `usuarioIds` (`ElegibilidadAsignado`,
   * odd/permisos-por-tipo-ticket, D5 g). ADMINISTRADOR y ROOT quedan fuera: no son técnicos de una
   * tarea ni responsables de una regla de asignación automática.
   *
   * @param clienteId UUID del cliente activo (TenantContext.clienteId).
   * @param usuarioIds Candidatos; sin candidatos no consulta la base.
   * @returns Los agentes `{ id, nombre, apellido }`, ordenados por apellido y nombre.
   */
  listarAgentes(
    clienteId: string,
    usuarioIds: readonly string[],
  ): Promise<{ id: string; nombre: string; apellido: string }[]>;
}

/** Token de inyección de dependencias para IUsuarioMasterChecker en NestJS. */
export const USUARIO_MASTER_CHECKER = Symbol('USUARIO_MASTER_CHECKER');
