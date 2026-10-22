/**
 * Elegibilidad del responsable de una regla de asignación automática (R2).
 *
 * El universo es EXACTAMENTE el de `ElegibilidadAsignado.listarAgentesDeTipo(clienteId, tipoId)`
 * (TECNICO o COLABORADOR con `LECTURA` sobre el tipo de la regla, odd/permisos-por-tipo-ticket,
 * D5 g): coincide por construcción con lo que ofrece el selector y con lo que acepta el alta
 * (`esAgenteDeTipo`). Un ADMINISTRADOR o ROOT no está en esa lista, así que no es elegible como
 * responsable de regla (a diferencia de la asignación manual, que sigue aceptándolos).
 */

/** Función pura: el responsable es elegible si figura entre los candidatos. */
export function esResponsableElegible(
  responsableId: string,
  candidatos: readonly { id: string }[],
): boolean {
  return candidatos.some((candidato) => candidato.id === responsableId);
}
