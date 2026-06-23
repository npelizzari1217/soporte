/**
 * ITipoOperacionRepository — puerto mínimo para acceso al catálogo de
 * tipos de operación del tenant.
 *
 * Se usa en los use cases de application para obtener el UUID del tipo de
 * operación (CAMBIO_ESTADO, ASIGNACION, ADJUNTO, etc.) antes de crear
 * OperacionTicketEntity.
 *
 * La implementación concreta vive en tickets/infrastructure/persistence/prisma/.
 *
 * Ref spec: [SPEC:tickets-core/Tabla tipo_operacion]
 * Tarea: 3.C.2, 3.C.6
 */
export interface ITipoOperacionRepository {
  /**
   * Retorna el UUID de un tipo de operación dado su código semántico.
   * Retorna null si el tipo no existe en el catálogo del tenant.
   *
   * Códigos válidos (seeded en provisioning):
   *   CAMBIO_ESTADO | COMENTARIO | ASIGNACION | ADJUNTO | AVANCE_EDILICIO
   */
  findIdByCodigo(codigo: string): Promise<string | null>;
}

/** Token de inyección de dependencias para ITipoOperacionRepository en NestJS. */
export const TIPO_OPERACION_REPOSITORY = Symbol('TIPO_OPERACION_REPOSITORY');
