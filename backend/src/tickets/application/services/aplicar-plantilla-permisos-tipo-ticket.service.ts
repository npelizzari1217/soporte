import {
  filasDeTiposDesdePlantilla,
  PlantillaPorTipo,
  tiposAbiertosParaPlantilla,
} from '../../domain/permisos-tipo-ticket';
import { IPermisoTipoTicketRepository } from '../../domain/ports/i-permiso-tipo-ticket.repository';

/** Entrada de `AplicarPlantillaPermisosTipoTicket.ejecutar`. */
export interface AplicarPlantillaPermisosTipoTicketInput {
  /** Id del usuario en master. */
  usuarioId: string;
  /** Plantilla por tipo del rol (`PLANTILLAS_POR_TIPO_ROL`). */
  plantilla: PlantillaPorTipo;
  /**
   * `true` reemplaza todas las filas por tipo del usuario. `false` escribe solo si el usuario
   * todavía no tiene ninguna: nunca fusiona con filas ajustadas a mano.
   */
  sobrescribir: boolean;
}

/**
 * AplicarPlantillaPermisosTipoTicket — escribe en el tenant bindeado los permisos por tipo que
 * corresponden a la plantilla de un rol (odd/tasks/permisos-por-tipo-ticket.md, T4c, S7, D4).
 *
 * Cada tipo abierto del tenant, dados de baja incluidos (L24), recibe las acciones que la plantilla
 * del rol da sobre el módulo de ese tipo (T9a). Un tipo cerrado (nadie tiene Ver sobre él,
 * S4) no recibe filas: la regla está en `tiposAbiertosParaPlantilla` (W3). La plantilla de
 * ADMINISTRADOR es vacía, así que no produce filas. Requiere un `TenantContext` activo: quien lo
 * invoca elige el tenant.
 */
export class AplicarPlantillaPermisosTipoTicket {
  constructor(
    private readonly permisosRepo: Pick<
      IPermisoTipoTicketRepository,
      'listarPorUsuario' | 'reemplazarDeUsuario' | 'listarTipos' | 'listarUsuariosConAccion'
    >,
  ) {}

  /**
   * Aplica la plantilla al usuario en el tenant activo.
   *
   * @param input Usuario, plantilla por tipo del rol y si se pisan las filas existentes.
   * @returns `true` si escribió las filas; `false` si las omitió porque ya había filas y no se
   *   pidió sobrescribir.
   */
  async ejecutar(input: AplicarPlantillaPermisosTipoTicketInput): Promise<boolean> {
    if (!input.sobrescribir) {
      const actuales = await this.permisosRepo.listarPorUsuario(input.usuarioId);
      if (actuales.size > 0) return false;
    }

    const tipos = await this.permisosRepo.listarTipos();
    const conVer = await this.permisosRepo.listarUsuariosConAccion(
      tipos.map((tipo) => tipo.id),
      'LECTURA',
    );
    await this.permisosRepo.reemplazarDeUsuario(
      input.usuarioId,
      filasDeTiposDesdePlantilla(
        input.plantilla,
        tiposAbiertosParaPlantilla(tipos, new Set(conVer.keys())),
      ),
    );
    return true;
  }
}
