import { IMembresiaRepository } from '../domain/ports/i-membresia.repository';
import { IUsuarioRepository } from '../domain/ports/i-usuario.repository';

export interface PoliticaReseteoInput {
  /** Del JWT del actor, nunca de la request. */
  actorEsRoot: boolean;
  clienteId: string;
  usuarioId: string;
}

export interface PoliticaReseteoDeps {
  usuarios: Pick<IUsuarioRepository, 'findById'>;
  membresias: Pick<
    IMembresiaRepository,
    'findActivaByUsuarioYCliente' | 'findClientesDeTodasByUsuario'
  >;
}

/**
 * Quien puede resetear a un usuario (sdd/login-sso ADR-8). Compartida por el reseteo de 2FA y el
 * del vinculo SSO. ROOT resetea a cualquiera; un ADMINISTRADOR solo a un NO ROOT con membresia
 * activa en su cliente cuyas membresias, TODAS, son de ese cliente.
 */
export async function puedeResetearAUsuario(
  input: PoliticaReseteoInput,
  { usuarios, membresias }: PoliticaReseteoDeps,
): Promise<boolean> {
  const destino = await usuarios.findById(input.usuarioId);
  if (!destino) return false;
  if (input.actorEsRoot) return true;
  if (destino.isGlobalAdmin) return false;
  const activa = await membresias.findActivaByUsuarioYCliente(input.usuarioId, input.clienteId);
  if (!activa) return false;
  const clientes = await membresias.findClientesDeTodasByUsuario(input.usuarioId);
  return clientes.every((id) => id === input.clienteId);
}
