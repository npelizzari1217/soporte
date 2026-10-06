/**
 * Constantes de estados compartidas por el dominio de tickets (reglas de
 * bloqueo por estado). Se agrupan acá para no duplicar los códigos entre la
 * entidad, los use cases (edición y transición) y las políticas.
 *
 * Fuente de verdad de los 7 estados fijos (ADR-1): NUEVO, ASIGNADO,
 * EN_PROCESO, ESPERANDO_CLIENTE, RESUELTO, CERRADO, CANCELADO.
 *
 * Sin imports de Prisma ni NestJS — dominio puro.
 */

/**
 * Estados PREVIOS a EN_PROCESO. Mientras el ticket esté en uno de estos, la
 * edición de datos (título/descripción/prioridad) sigue disponible para
 * TECNICO+ (`ticket:editar`). Una vez que el ticket entra EN_PROCESO (o
 * cualquier estado posterior), solo ROOT puede editar.
 */
export const ESTADOS_PRE_PROCESO: ReadonlySet<string> = new Set(['NUEVO', 'ASIGNADO']);

/**
 * Estados TERMINALES (sin arcos de salida — sin reapertura por el flujo
 * normal, T9/T11). El "salto correctivo" de ROOT/ADMINISTRADOR NUNCA lleva a
 * un estado terminal: para CERRAR/CANCELAR se usan los arcos normales.
 */
export const ESTADOS_TERMINALES: ReadonlySet<string> = new Set(['CERRADO', 'CANCELADO']);

/**
 * Estados en los que el reloj de SLA de resolución CORRE. Fuente única: la
 * consumen el pliegue del reloj, el barrido de vencidos y el estado derivado
 * del DTO. ESPERANDO_CLIENTE y RESUELTO detienen el reloj; CERRADO y CANCELADO
 * son terminales y tampoco corren.
 */
export const ESTADOS_RELOJ_CORRE: ReadonlySet<string> = new Set([
  'NUEVO',
  'ASIGNADO',
  'EN_PROCESO',
]);

/**
 * Estados a los que el "salto correctivo" de ROOT/ADMINISTRADOR NO puede
 * llevar. Al estado de espera solo se entra por el arco normal desde
 * EN_PROCESO: un salto lo dejaría sin que nadie haya pedido nada al cliente.
 * El salto SÍ puede sacar un ticket de ESPERANDO_CLIENTE.
 */
export const ESTADOS_NO_DESTINO_CORRECTIVO: ReadonlySet<string> = new Set(['ESPERANDO_CLIENTE']);

/**
 * Indica si la transición `anterior → nuevo` obliga a consolidar el reloj de
 * SLA: cambia la categoría corre/detenido, o el destino es RESUELTO (fija el
 * cumplimiento aunque el reloj ya estuviera detenido). Los arcos que no
 * cambian de categoría (NUEVO→ASIGNADO→EN_PROCESO) no lo afectan.
 */
export function afectaRelojSla(anterior: string, nuevo: string): boolean {
  return (
    ESTADOS_RELOJ_CORRE.has(anterior) !== ESTADOS_RELOJ_CORRE.has(nuevo) || nuevo === 'RESUELTO'
  );
}
