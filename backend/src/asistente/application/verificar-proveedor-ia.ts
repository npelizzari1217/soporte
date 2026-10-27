import { ResultadoVerificacionIa } from '../domain/asistente-ia-config-repository.port';
import { DestinoIa } from '../domain/config-ia';
import { IModeloIa } from '../domain/modelo-ia.port';

/** Pedido mínimo para probar el proveedor: pocas fichas, temperatura cero. */
const PEDIDO_DE_PRUEBA = {
  mensajes: [{ rol: 'user' as const, contenido: 'Responda solamente: OK' }],
  temperatura: 0,
  maxTokens: 5,
};

/**
 * Prueba un destino con una consulta mínima y devuelve el resultado con su motivo saneado. La usan
 * "Probar" y "Guardar": así un modelo retirado o una clave rechazada se ven en el acto, y no recién
 * cuando el asistente cae al respaldo sin que nadie lo note.
 *
 * @param modelo cliente del proveedor
 * @param destino URL, modelo y clave en claro
 * @returns `ok` con `motivo: null`, o la falla con el motivo del adaptador
 */
export async function verificarProveedorIa(
  modelo: IModeloIa,
  destino: DestinoIa,
): Promise<ResultadoVerificacionIa> {
  const respuesta = await modelo.completar(destino, PEDIDO_DE_PRUEBA);
  return respuesta.isOk()
    ? { ok: true, motivo: null }
    : { ok: false, motivo: respuesta.getError().message };
}
