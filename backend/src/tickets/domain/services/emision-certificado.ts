import { DomainError, Result } from '../../../shared/domain/result';
import { TareaTicketEntity } from '../entities/tarea-ticket.entity';
import { PESO_TAREAS_MAX } from '../entities/tarea-ticket.entity';
import { TareaDeCertificado } from '../entities/certificado-avance.entity';
import {
  PesosIncompletosParaCertificarError,
  TareaNoCertificableError,
} from '../errors/certificados.errors';

/**
 * Reglas de emisión de un certificado sobre las tareas de un ticket EXTERNA, leídas con el lock
 * del ticket tomado (odd/edilicia-obra-externa, S4, S5, S8). Función pura.
 *
 * - Los pesos de las tareas activas suman exactamente 100 (S4).
 * - Cada tarea pedida es una tarea activa del ticket, está completada y no está en otro
 *   certificado vigente (S5).
 *
 * @param tareasActivas Tareas activas del ticket.
 * @param pedidas Ids de las tareas pedidas, sin repetir (lo valida el DTO).
 * @param certificadas Ids de las tareas del ticket que ya están en un certificado vigente.
 * @returns Las tareas del certificado con la COPIA de su peso (S8), o el primer error.
 */
export function tareasParaCertificar(
  tareasActivas: readonly TareaTicketEntity[],
  pedidas: readonly string[],
  certificadas: ReadonlySet<string>,
): Result<TareaDeCertificado[], DomainError> {
  const suma = tareasActivas.reduce((total, tarea) => total + tarea.peso, 0);
  if (suma !== PESO_TAREAS_MAX) return Result.fail(new PesosIncompletosParaCertificarError(suma));

  const porId = new Map(tareasActivas.map((tarea) => [tarea.id, tarea]));
  const resultado: TareaDeCertificado[] = [];
  for (const id of pedidas) {
    const tarea = porId.get(id);
    if (!tarea) return Result.fail(new TareaNoCertificableError(id, 'inexistente'));
    if (!tarea.completada) {
      return Result.fail(new TareaNoCertificableError(tarea.descripcion, 'no-completada'));
    }
    if (certificadas.has(id)) {
      return Result.fail(new TareaNoCertificableError(tarea.descripcion, 'ya-certificada'));
    }
    resultado.push({ tareaId: id, peso: tarea.peso });
  }
  return Result.ok(resultado);
}
