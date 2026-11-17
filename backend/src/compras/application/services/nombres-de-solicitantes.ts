import { IUsuarioMasterChecker } from '../../../tickets/domain/ports/i-usuario-master.checker';

/**
 * ResolverNombresSolicitantes — nombre y apellido de quienes pidieron las
 * compras (odd/tasks/compra-export-secciones-y-pdf.md, S9). Los usuarios viven
 * en la base master, así que el nombre no llega con la compra: se resuelve en
 * una sola consulta por pedido, con los ids sin repetir.
 */
export class ResolverNombresSolicitantes {
  constructor(
    private readonly usuarioMasterChecker: Pick<IUsuarioMasterChecker, 'resolverNombres'>,
  ) {}

  /**
   * @param solicitanteIds ids de usuario, con repetidos.
   * @returns `id → "Nombre Apellido"`. Un usuario que no se encuentra no figura en el mapa.
   */
  async resolver(solicitanteIds: Iterable<string>): Promise<ReadonlyMap<string, string>> {
    const distintos = [...new Set(solicitanteIds)];
    if (distintos.length === 0) return new Map();
    const nombres = await this.usuarioMasterChecker.resolverNombres(distintos);
    const resultado = new Map<string, string>();
    for (const [id, { nombre, apellido }] of nombres) {
      const completo = `${nombre} ${apellido}`.trim();
      if (completo !== '') resultado.set(id, completo);
    }
    return resultado;
  }
}
