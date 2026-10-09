import { IUsuarioMasterChecker } from '../../domain/ports/i-usuario-master.checker';

/**
 * Elegibilidad del responsable de una regla de asignación automática (R2).
 *
 * El universo es EXACTAMENTE el de `listarTecnicosAsignables(clienteId, modulo)` (TECNICO o
 * COLABORADOR con el módulo del tipo): coincide por construcción con lo que ofrece el selector.
 * Un ADMINISTRADOR o ROOT no está en esa lista, así que no es elegible como responsable de regla
 * (a diferencia de la asignación manual, que sigue aceptándolos).
 */

/** Función pura: el responsable es elegible si figura entre los candidatos. */
export function esResponsableElegible(
  responsableId: string,
  candidatos: readonly { id: string }[],
): boolean {
  return candidatos.some((candidato) => candidato.id === responsableId);
}

/**
 * Pide el universo al checker de master y aplica la función pura. Propaga el rechazo del checker:
 * decidir qué hacer ante un master caído es responsabilidad de quien llama.
 */
export async function evaluarResponsableRegla(
  responsableId: string,
  clienteId: string,
  modulo: string | null,
  checker: Pick<IUsuarioMasterChecker, 'listarTecnicosAsignables'>,
): Promise<boolean> {
  const candidatos = await checker.listarTecnicosAsignables(clienteId, modulo);
  return esResponsableElegible(responsableId, candidatos);
}
