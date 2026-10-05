import { IClienteRepository } from '../../domain/ports/i-cliente.repository';

export interface LinkSoporteCliente {
  /** `${APP_BASE_URL}/c/<slug>/pedido`, o `null` si el cliente no tiene link vigente. */
  url: string | null;
}

/**
 * VerLinkSoporteClienteUseCase — link GENÉRICO del formulario público del cliente de la sesión
 * (sin equipo: el QR por equipo es otra cosa y lleva `?e=<token>`).
 *
 * Que no haya link es un estado normal, no un error: el cliente está inactivo, el formulario
 * está deshabilitado o todavía no tiene slug. En esos casos responde `{ url: null }`.
 * No exige permisos: el link es público por naturaleza.
 */
export class VerLinkSoporteClienteUseCase {
  constructor(
    private readonly clienteRepo: Pick<IClienteRepository, 'findById'>,
    /** `entorno.APP_BASE_URL`: `application/` no lee `process.env` y nunca se usa el header `Host`. */
    private readonly appBaseUrl: string,
  ) {}

  async execute(clienteId: string): Promise<LinkSoporteCliente> {
    const cliente = await this.clienteRepo.findById(clienteId);
    if (!cliente || !cliente.activo || !cliente.formularioPublicoHabilitado || !cliente.slug) {
      return { url: null };
    }
    const base = this.appBaseUrl.replace(/\/+$/, '');
    return { url: `${base}/c/${cliente.slug}/pedido` };
  }
}
