import { ITipoTicketRepository } from '../../../tickets/domain/ports/i-tipo-ticket.repository';
import { IReglaAsignacionRepository } from '../../../tickets/domain/ports/i-regla-asignacion.repository';
import { IUsuarioMasterChecker } from '../../../tickets/domain/ports/i-usuario-master.checker';
import { ElegibilidadAsignado } from '../../../tickets/application/services/elegibilidad-asignado';
import { esResponsableElegible } from '../../../tickets/application/services/elegibilidad-responsable-regla';
import { CandidatoRegla, ReglaAsignacionFila } from '../../domain/estado-regla-asignacion';

export interface ReglasAsignacionVista {
  reglas: ReglaAsignacionFila[];
  /** Candidatos de cada tipo activo, por id de tipo: el universo con el que se decide su regla. */
  candidatosPorTipo: Record<string, CandidatoRegla[]>;
  /**
   * Unión de los candidatos de los tipos activos de cada módulo, ordenada por apellido y nombre.
   * Se mantiene para el selector actual del front, que agrupa por módulo, hasta que pase a
   * `candidatosPorTipo` (odd/permisos-por-tipo-ticket, T6): puede ofrecer a alguien que no atiende
   * un tipo del módulo, y ese PUT responde 422. Un responsable VALIDA siempre figura en la unión.
   */
  candidatosPorModulo: Record<string, CandidatoRegla[]>;
}

/**
 * ListarReglasAsignacionUseCase — una fila por tipo activo con el estado de su regla, calculado
 * en cada lectura con el mismo criterio de elegibilidad del alta (R4): TECNICO o COLABORADOR con
 * `LECTURA` sobre el tipo (`ElegibilidadAsignado`, odd/permisos-por-tipo-ticket, D5 g), más los
 * candidatos por tipo y por módulo. Los errores de master y del tenant se propagan: es una lectura
 * de configuración, no una degradación.
 *
 * Ref spec: reglas-asignacion R2, R4. Ref design: ADR-9.
 */
export class ListarReglasAsignacionUseCase {
  constructor(
    private readonly tipoTicketRepo: Pick<ITipoTicketRepository, 'findAllActive'>,
    private readonly reglaRepo: Pick<IReglaAsignacionRepository, 'listar'>,
    private readonly elegibilidad: Pick<ElegibilidadAsignado, 'listarAgentesPorTipo'>,
    private readonly usuarioMasterChecker: Pick<IUsuarioMasterChecker, 'resolverNombres'>,
  ) {}

  async execute(clienteId: string): Promise<ReglasAsignacionVista> {
    const tipos = (await this.tipoTicketRepo.findAllActive()).filter(
      (tipo) => tipo.activo && !tipo.isDeleted(),
    );
    const reglas = await this.reglaRepo.listar();
    const reglaPorTipo = new Map(reglas.map((regla) => [regla.tipoId, regla]));

    // Un lote para todos los tipos: una consulta al tenant y otra a master, no una por fila.
    const porTipo = await this.elegibilidad.listarAgentesPorTipo(
      clienteId,
      tipos.map((tipo) => tipo.id),
    );
    const candidatosPorTipo: Record<string, CandidatoRegla[]> = Object.fromEntries(porTipo);
    const candidatosPorModulo: Record<string, CandidatoRegla[]> = {};
    for (const modulo of new Set(tipos.map((tipo) => tipo.modulo))) {
      const delModulo = tipos
        .filter((tipo) => tipo.modulo === modulo)
        .flatMap((tipo) => candidatosPorTipo[tipo.id] ?? []);
      candidatosPorModulo[modulo] = [
        ...new Map(delModulo.map((candidato) => [candidato.id, candidato])).values(),
      ].sort((a, b) => a.apellido.localeCompare(b.apellido) || a.nombre.localeCompare(b.nombre));
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
      const candidatos = candidatosPorTipo[tipo.id] ?? [];
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

    return { reglas: filas, candidatosPorTipo, candidatosPorModulo };
  }
}

function nombreCompleto(persona: { nombre: string; apellido: string }): string {
  return `${persona.nombre} ${persona.apellido}`.trim();
}
