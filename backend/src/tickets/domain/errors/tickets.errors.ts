import { DomainError } from '../../../shared/domain/result';

/**
 * TicketNoEncontradoError — el ticket con el id indicado no existe en el
 * tenant activo (o pertenece a otro tenant — TenantContext ya garantiza
 * que solo se consulta el PrismaClient del tenant bindeado).
 * → HTTP 404 en la capa de presentación.
 *
 * Ref spec: sdd/tickets-core/spec T6 (404 cross-tenant/ajeno), T8, T23.
 */
export class TicketNoEncontradoError extends DomainError {
  readonly code = 'TICKET_NO_ENCONTRADO';

  constructor(ticketId: string) {
    super(`Ticket con id "${ticketId}" no encontrado.`);
  }
}

/**
 * TicketBloqueadoParaEdicionError — el ticket ya entró EN_PROCESO (o un
 * estado posterior: RESUELTO/CERRADO/CANCELADO) y el actor NO es ROOT
 * (`is_global_admin`). Una vez fuera de NUEVO/ASIGNADO, la edición de datos
 * (título/descripción/prioridad) queda reservada a ROOT — el resto ya no
 * puede tocar los datos aunque tenga `ticket:editar`.
 * → HTTP 403 en la capa de presentación.
 */
export class TicketBloqueadoParaEdicionError extends DomainError {
  readonly code = 'TICKET_BLOQUEADO_PARA_EDICION';

  constructor(estadoCodigo: string) {
    super(
      `El ticket está en estado "${estadoCodigo}": solo ROOT puede editar ` +
        `título/descripción/prioridad una vez que entró EN_PROCESO.`,
    );
  }
}

/**
 * TipoTicketNoEncontradoError — el `tipoId` enviado al crear un ticket no
 * existe en el catálogo `tipos_ticket` del tenant.
 * → HTTP 422 en la capa de presentación.
 *
 * Ref spec: T4 ("si tipoId/prioridadId no existen en el catálogo → 422").
 */
export class TipoTicketNoEncontradoError extends DomainError {
  readonly code = 'TIPO_TICKET_NO_ENCONTRADO';

  constructor(tipoId: string) {
    super(`Tipo de ticket con id "${tipoId}" no encontrado en el catálogo del tenant.`);
  }
}

/**
 * EstadoDestinoInvalidoError — el `nuevoEstadoCodigo` recibido en una
 * transición no existe en el catálogo de estados del tenant (6 códigos
 * fijos, ADR-1).
 * → HTTP 422 en la capa de presentación.
 *
 * Ref spec: T9, T10.
 */
export class EstadoDestinoInvalidoError extends DomainError {
  readonly code = 'ESTADO_DESTINO_INVALIDO';

  constructor(codigoDestino: string) {
    super(
      `El código de estado destino "${codigoDestino}" no existe en el catálogo de estados del tenant.`,
    );
  }
}

/**
 * TransicionInvalidaError — la transición solicitada no es un arco válido
 * del grafo de 6 estados (ADR-3), o viola una invariante de la entidad
 * (soft-deleted, o el estado actual es terminal: CERRADO/CANCELADO).
 * El ticket NO se muta ni se registra operación.
 * → HTTP 422 en la capa de presentación.
 *
 * Ref spec: T9 ("cualquier otro arco → 422 TransicionInvalida, sin mutar").
 */
export class TransicionInvalidaError extends DomainError {
  readonly code = 'TRANSICION_INVALIDA';

  constructor(desde: string, hacia: string, razon?: string) {
    const base = `Transición de estado inválida: "${desde}" → "${hacia}".`;
    super(razon ? `${base} ${razon}` : base);
  }
}

/**
 * FechaCierreRequeridaError — reservado para flujos que exijan
 * `fechaCierre` explícita del caller al transicionar a un estado terminal
 * que la requiera. En Fase 2 `fecha_cierre` se setea automáticamente con
 * now() al pasar a RESUELTO/CERRADO (T12); este error cubre validación
 * defensiva de use cases futuros que acepten una fecha explícita.
 *
 * Ref spec: T12.
 */
export class FechaCierreRequeridaError extends DomainError {
  readonly code = 'FECHA_CIERRE_REQUERIDA';

  constructor() {
    super('fechaCierre es requerida para transicionar a un estado que la exige.');
  }
}

/**
 * AsignadoInvalidoError — el `asignadoId` no existe en `master.usuarios`
 * con `activo=true`, o no pertenece (vía membresía) al tenant activo
 * (validado con `IUsuarioMasterChecker.estaActivoEnTenant`).
 * → HTTP 422 en la capa de presentación.
 *
 * Ref spec: T14.
 */
export class AsignadoInvalidoError extends DomainError {
  readonly code = 'ASIGNADO_INVALIDO';

  constructor(asignadoId: string) {
    super(
      `El asignado "${asignadoId}" no existe en master.usuarios con activo=true, ` +
        `está eliminado, o no pertenece al tenant activo.`,
    );
  }
}

/**
 * AsignadoNoElegibleError — el `asignadoId` no es elegible para atender el
 * `tipoId` del ticket: la elegibilidad se resuelve por el módulo del catálogo
 * del `TipoTicket`. La elegibilidad es ortogonal al permiso RBAC
 * `ticket:asignar`.
 * → HTTP 422 en la capa de presentación.
 *
 * Ref spec: T14, T15.
 */
export class AsignadoNoElegibleError extends DomainError {
  readonly code = 'ASIGNADO_NO_ELEGIBLE';

  constructor(asignadoId: string, tipoTicketId: string) {
    super(
      `El usuario "${asignadoId}" no está habilitado para atender tickets de tipo ` +
        `"${tipoTicketId}". Verificar el módulo del tipo de ticket.`,
    );
  }
}

/**
 * SolicitanteInvalidoError — el `solicitanteId` (autor del JWT) no existe
 * en `master.usuarios` (no soft-deleted) o no tiene membresía viva en el
 * tenant activo (validado con `IUsuarioMasterChecker.existeEnTenant`).
 * → HTTP 422 en la capa de presentación.
 *
 * Ref spec: T4 (solicitante_id = autor JWT.sub).
 */
export class SolicitanteInvalidoError extends DomainError {
  readonly code = 'SOLICITANTE_INVALIDO';

  constructor(solicitanteId: string) {
    super(
      `El solicitante "${solicitanteId}" no existe en master.usuarios, ` +
        `está eliminado, o no pertenece al tenant activo.`,
    );
  }
}

/**
 * ComentarioNoPermitidoError — el ticket está en un estado terminal
 * (RESUELTO/CERRADO/CANCELADO) y no acepta nuevos comentarios públicos.
 * → HTTP 422 en la capa de presentación.
 *
 * Ref spec: T16 ("rechazarse (422) si el ticket está en estado terminal").
 */
export class ComentarioNoPermitidoError extends DomainError {
  readonly code = 'COMENTARIO_NO_PERMITIDO';

  constructor(estadoCodigo: string) {
    super(`El ticket está en estado terminal "${estadoCodigo}" y no acepta nuevos comentarios.`);
  }
}

/**
 * ArchivoTamanoCeroError — `tamano_bytes` del adjunto es `<= 0`.
 * Validado en `ArchivoEntity.create()` (invariante de dominio) y
 * revalidado defensivamente en la capa de interfaz (pipe, T21).
 * → HTTP 422 en la capa de presentación.
 *
 * Ref spec: T21 (tamano_bytes > 10MB o = 0 → 422). Tarea: T3.6.
 */
export class ArchivoTamanoCeroError extends DomainError {
  readonly code = 'ARCHIVO_TAMANO_CERO';

  constructor(tamanoBytes: bigint) {
    super(`tamano_bytes debe ser mayor a 0, se recibió: ${tamanoBytes.toString()}`);
  }
}

/**
 * TipoArchivoNoPermitidoError — el `mimeType` del adjunto no está en la
 * whitelist (imágenes, PDF, Office, ZIP).
 * → HTTP 422 en la capa de presentación.
 *
 * Ref spec: T21.
 */
export class TipoArchivoNoPermitidoError extends DomainError {
  readonly code = 'TIPO_ARCHIVO_NO_PERMITIDO';

  constructor(mimeType: string) {
    super(`Tipo de archivo no permitido: "${mimeType}".`);
  }
}

/**
 * SecuenciaAgotadaError — la secuencia anual LOCAL (tenant+tipo+año)
 * superaría los 5 dígitos (> 99999) al generar el próximo `numero`.
 * → HTTP 409 en la capa de presentación.
 *
 * Ref spec: T5 ("secuencia > 99999 → 409 SecuenciaAgotada"). Tarea: T3.2.
 */
export class SecuenciaAgotadaError extends DomainError {
  readonly code = 'SECUENCIA_AGOTADA';

  constructor(tipoCodigo: string, anio: number) {
    super(
      `NumeradorTicket: la secuencia de "${tipoCodigo}" para el año ${anio} ` +
        `superó el máximo de 99999. No se pueden generar más números en este ciclo.`,
    );
  }
}

/**
 * TipoTicketDesconocidoError — `NumeradorTicket.derivarPrefijo` no pudo
 * derivar un prefijo usable del `codigo` del tipo (string vacío o sin
 * caracteres alfanuméricos tras sanitizar). Con el mapa base + fallback de
 * 3 letras (ADR-4) este es un caso degenerado, no el flujo normal de tipos
 * custom (que sí producen un prefijo válido).
 * → HTTP 422 en la capa de presentación.
 *
 * Ref spec: T5 (ADR-4 — derivación de prefijo). Tarea: T3.1/T3.2.
 */
export class TipoTicketDesconocidoError extends DomainError {
  readonly code = 'TIPO_TICKET_DESCONOCIDO';

  constructor(tipoCodigo: string) {
    super(
      `NumeradorTicket: no se pudo derivar un prefijo válido del código de tipo "${tipoCodigo}".`,
    );
  }
}

/**
 * SinCicloActivoError — no hay un `CicloCliente` con `activo=true` en el
 * tenant al intentar crear un ticket. El servidor resuelve el ciclo, nunca
 * el cliente; sin ciclo activo, no se crea el ticket.
 * → HTTP 409 en la capa de presentación.
 *
 * Ref spec: T4 ("si NO hay ciclo activo → MUST fallar 409 SinCicloActivo").
 */
export class SinCicloActivoError extends DomainError {
  readonly code = 'SIN_CICLO_ACTIVO';

  constructor() {
    super('No hay un ciclo activo en este tenant. No se puede crear el ticket.');
  }
}

/**
 * PrioridadNoEncontradaError — el `prioridadId` enviado (al crear o editar
 * un ticket) no existe en el catálogo `prioridades` del tenant.
 * → HTTP 422 en la capa de presentación.
 *
 * Extensión de PR6 sobre la lista de errores original de PR3: la spec T4
 * ("si tipoId/prioridadId no existen en el catálogo → 422") exige validar
 * AMBOS catálogos; `TipoTicketNoEncontradoError` ya cubría tipoId.
 *
 * Ref spec: sdd/tickets-core/spec T4, T8. Tarea: T6.1, T6.5.
 */
export class PrioridadNoEncontradaError extends DomainError {
  readonly code = 'PRIORIDAD_NO_ENCONTRADA';

  constructor(prioridadId: string) {
    super(`Prioridad con id "${prioridadId}" no encontrada en el catálogo del tenant.`);
  }
}

/**
 * TicketReferenciaInvalidaError — `ticketReferenciaId` fue provisto (el
 * nuevo ticket "continúa de #X") pero el ticket referenciado no existe en
 * el mismo tenant.
 * → HTTP 422 en la capa de presentación.
 *
 * Ref spec: T11 ("el referenciado MUST existir en el mismo tenant, si no → 422").
 */
export class TicketReferenciaInvalidaError extends DomainError {
  readonly code = 'TICKET_REFERENCIA_INVALIDA';

  constructor(ticketReferenciaId: string) {
    super(`El ticket de referencia "${ticketReferenciaId}" no existe en el tenant activo.`);
  }
}

/**
 * TipoTicketCodigoDuplicadoError — el `codigo` provisto al crear/editar un
 * `TipoTicket` ya existe en el tenant (incluso si el registro existente
 * está soft-deleted: `tipos_ticket.codigo` es UNIQUE a nivel de schema SIN
 * índice parcial por `deleted_at`, así que un `codigo` dado de baja NO se
 * puede reutilizar).
 * → HTTP 422 en la capa de presentación.
 *
 * Ref spec: sdd/tickets-core/spec T2 ("preservando codigo UNIQUE"). Tarea: T11.1.
 */
export class TipoTicketCodigoDuplicadoError extends DomainError {
  readonly code = 'TIPO_TICKET_CODIGO_DUPLICADO';

  constructor(codigo: string) {
    super(
      `Ya existe un tipo de ticket con codigo "${codigo}" en este tenant (activo o dado de baja).`,
    );
  }
}

/**
 * PrefijoTipoTicketColisionError — el prefijo de numeración derivado
 * (`NumeradorTicket.derivarPrefijo`, ADR-4) del `codigo` de un tipo de
 * ticket nuevo/editado colisiona con el prefijo derivado de OTRO tipo de
 * ticket ACTIVO del mismo tenant. Sin esta validación, dos tipos con el
 * mismo prefijo derivado colisionarían en el UNIQUE de `tickets.numero`
 * bajo uso real (riesgo documentado en design ADR-4, "aceptado" en la
 * decisión original — PR11 lo cierra explícitamente en el CRUD editable).
 * → HTTP 422 en la capa de presentación.
 *
 * Ref spec: sdd/tickets-core/spec T2, T5. Ref design: ADR-4. Tarea: T11.1.
 */
export class PrefijoTipoTicketColisionError extends DomainError {
  readonly code = 'PREFIJO_TIPO_TICKET_COLISION';

  constructor(codigoNuevo: string, codigoExistente: string, prefijo: string) {
    super(
      `El prefijo de numeración "${prefijo}" derivado del codigo "${codigoNuevo}" ya está en uso ` +
        `por el tipo de ticket activo "${codigoExistente}". Elegí un codigo que derive un prefijo distinto.`,
    );
  }
}

/**
 * PrioridadCodigoDuplicadaError — el `codigo` provisto al crear/editar una
 * `Prioridad` ya existe en el tenant (mismo criterio que
 * `TipoTicketCodigoDuplicadoError`: UNIQUE sin índice parcial por soft
 * delete).
 * → HTTP 422 en la capa de presentación.
 *
 * Ref spec: sdd/tickets-core/spec T2. Tarea: T11.2.
 */
export class PrioridadCodigoDuplicadaError extends DomainError {
  readonly code = 'PRIORIDAD_CODIGO_DUPLICADA';

  constructor(codigo: string) {
    super(`Ya existe una prioridad con codigo "${codigo}" en este tenant (activa o dada de baja).`);
  }
}
