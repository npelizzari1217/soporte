import type { TipoTicketConModulo } from '../../tickets/domain/permisos-tipo-ticket';
import type { PermisoTipoTicketFila } from '../../tickets/domain/ports/i-permiso-tipo-ticket.repository';
import { AplicarPlantillaPermisosTipoTicket } from '../../tickets/application/services/aplicar-plantilla-permisos-tipo-ticket.service';
import { PermisosTipoTicketEnMemoria } from '../../tickets/test-helpers/permisos-tipo-ticket-en-memoria';
import type {
  AplicarPlantillaPorTipoInput,
  IPermisosPorTipoDeCliente,
} from '../domain/ports/i-permisos-por-tipo-de-cliente.port';

/** Tipos de un tenant de prueba: uno de TICKETS y uno de EDILICIA. */
export const TIPOS_DE_PRUEBA: readonly TipoTicketConModulo[] = [
  { id: 'tipo-soporte', modulo: 'TICKETS' },
  { id: 'tipo-mantenimiento', modulo: 'EDILICIA' },
];

/**
 * Puerto `IPermisosPorTipoDeCliente` respaldado por el servicio real de la plantilla y un
 * repositorio en memoria: los tests del lado de auth afirman sobre las filas por tipo que quedan,
 * con la plantilla por tipo real del rol. Registra los `clienteId` recibidos para verificar el aislamiento.
 *
 * @param tipos Tipos del tenant simulado.
 * @param iniciales Filas por tipo existentes antes del test.
 * @returns El puerto, el repositorio para leer las filas y los clientes recibidos.
 */
export function permisosPorTipoEnMemoria(
  tipos: readonly TipoTicketConModulo[] = TIPOS_DE_PRUEBA,
  iniciales: readonly PermisoTipoTicketFila[] = [],
): {
  puerto: IPermisosPorTipoDeCliente;
  repo: PermisosTipoTicketEnMemoria;
  clientes: string[];
} {
  const repo = new PermisosTipoTicketEnMemoria(tipos, iniciales);
  const servicio = new AplicarPlantillaPermisosTipoTicket(repo);
  const clientes: string[] = [];
  const puerto: IPermisosPorTipoDeCliente = {
    async aplicarPlantilla({ clienteId, ...resto }: AplicarPlantillaPorTipoInput): Promise<void> {
      clientes.push(clienteId);
      await servicio.ejecutar(resto);
    },
  };
  return { puerto, repo, clientes };
}
