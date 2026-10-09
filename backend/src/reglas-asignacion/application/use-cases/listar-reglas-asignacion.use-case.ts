import { ITipoTicketRepository } from '../../../tickets/domain/ports/i-tipo-ticket.repository';
import { IReglaAsignacionRepository } from '../../../tickets/domain/ports/i-regla-asignacion.repository';
import { IUsuarioMasterChecker } from '../../../tickets/domain/ports/i-usuario-master.checker';
import { esResponsableElegible } from '../../../tickets/application/services/elegibilidad-responsable-regla';
import { CandidatoRegla, ReglaAsignacionFila } from '../../domain/estado-regla-asignacion';

export interface ReglasAsignacionVista {
  reglas: ReglaAsignacionFila[];
  candidatosPorModulo: Record<string, CandidatoRegla[]>;
}

/**
 * ListarReglasAsignacionUseCase — una fila por tipo activo con el estado de su regla, calculado
 * en cada lectura con el mismo criterio de elegibilidad del alta (R4), más los candidatos por
 * módulo. Los errores de master se propagan: es una lectura de configuración, no una degradación.
 *
 * Ref spec: reglas-asignacion R2, R4. Ref design: ADR-9.
 */
export class ListarReglasAsignacionUseCase {
  constructor(
    private readonly tipoTicketRepo: Pick<ITipoTicketRepository, 'findAllActive'>,
    private readonly reglaRepo: Pick<IReglaAsignacionRepository, 'listar'>,
    private readonly usuarioMasterChecker: Pick<
      IUsuarioMasterChecker,
      'listarTecnicosAsignables' | 'resolverNombres'
    >,
  ) {}

  async execute(clienteId: string): Promise<ReglasAsignacionVista> {
    const tipos = (await this.tipoTicketRepo.findAllActive()).filter(
      (tipo) => tipo.activo && !tipo.isDeleted(),
    );
    const reglas = await this.reglaRepo.listar();
    const reglaPorTipo = new Map(reglas.map((regla) => [regla.tipoId, regla]));

    // Una consulta al maestro por módulo distinto, no por fila.
    const candidatosPorModulo: Record<string, CandidatoRegla[]> = {};
    for (const modulo of new Set(tipos.map((tipo) => tipo.modulo))) {
      candidatosPorModulo[modulo] = await this.usuarioMasterChecker.listarTecnicosAsignables(
        clienteId,
        modulo,
      );
    }

    const filas = tipos.map((tipo): ReglaAsignacionFila => {
      const base = {
        tipoId: tipo.id,
        codigo: tipo.codigo,
        nombre: tipo.nombre,
        modulo: tipo.modulo,
      };
      const regla = reglaPorTipo.get(tipo.id);
      if (!regla) {
        return { ...base, responsableId: null, responsableNombre: null, estado: 'SIN_REGLA' };
      }
      const candidatos = candidatosPorModulo[tipo.modulo] ?? [];
      const candidato = candidatos.find((c) => c.id === regla.responsableId);
      if (candidato && esResponsableElegible(regla.responsableId, candidatos)) {
        return {
          ...base,
          responsableId: regla.responsableId,
          responsableNombre: nombreCompleto(candidato),
          estado: 'VALIDA',
        };
      }
      return {
        ...base,
        responsableId: regla.responsableId,
        responsableNombre: null,
        estado: 'ROTA',
      };
    });

    // El nombre de una regla rota sale del maestro en un solo lote; null si el usuario ya no existe.
    const rotas = filas.filter((fila) => fila.estado === 'ROTA');
    if (rotas.length > 0) {
      const ids = [...new Set(rotas.map((fila) => fila.responsableId ?? ''))];
      const nombres = await this.usuarioMasterChecker.resolverNombres(ids);
      for (const fila of rotas) {
        const usuario = nombres.get(fila.responsableId ?? '');
        fila.responsableNombre = usuario ? nombreCompleto(usuario) : null;
      }
    }

    return { reglas: filas, candidatosPorModulo };
  }
}

function nombreCompleto(persona: { nombre: string; apellido: string }): string {
  return `${persona.nombre} ${persona.apellido}`.trim();
}
