import { randomBytes } from 'node:crypto';
import { DomainError, Result } from '../../shared/domain/result';
import { UsuarioEntity } from '../../auth/domain/entities/usuario.entity';
import { MembresiaEntity } from '../../auth/domain/entities/membresia.entity';
import { IUsuarioRepository } from '../../auth/domain/ports/i-usuario.repository';
import { IMembresiaRepository } from '../../auth/domain/ports/i-membresia.repository';
import { IRoleRepository } from '../../auth/domain/ports/i-role.repository';
import { IHashProvider } from '../../auth/domain/ports/i-hash.provider';
import { IClienteRepository } from '../../clientes/domain/ports/i-cliente.repository';
import { IApiHabilitadaRepository } from '../domain/api-habilitada-repository.port';
import {
  ClienteApiNoEncontradoError,
  EmailIntegracionOcupadoError,
  OnlyRootCanConfigurarApiError,
  RolIntegracionNoEncontradoError,
} from '../domain/integraciones.errors';

/** Rol de menor privilegio del catalogo: los permisos reales de la API los fija cada clave. */
export const ROL_INTEGRACION = 'USUARIO';

/** Dominio `.invalid` (RFC 2606): no enruta nunca, asi que el email no recibe correo. */
export function emailIntegracion(clienteId: string): string {
  return `integracion+${clienteId.toLowerCase()}@integraciones.invalid`;
}

export interface ConfigurarApiClienteCommand {
  clienteId: string;
  habilitada: boolean;
}

export interface ConfigurarApiClienteActor {
  isGlobalAdmin: boolean;
}

export interface ConfigurarApiClienteOutput {
  clienteId: string;
  apiHabilitada: boolean;
}

export type ConfigurarApiClienteError =
  | OnlyRootCanConfigurarApiError
  | ClienteApiNoEncontradoError
  | RolIntegracionNoEncontradoError
  | EmailIntegracionOcupadoError;

/**
 * ConfigurarApiClienteUseCase — habilita o deshabilita la API publica de un cliente
 * (sdd/api-publica, CA2 y CA4). Solo ROOT.
 *
 * Habilitar asegura, de forma idempotente, UN usuario de integracion del cliente y su membresia
 * activa, y recien al final prende el flag: si algo falla a mitad de camino la API sigue apagada
 * y reintentar completa lo que falto. Deshabilitar solo apaga el flag: el usuario y las claves se
 * conservan (T4 rechaza toda clave mientras el flag este en false).
 *
 * El flag se escribe con `apiHabilitadaRepo.fijar`, nunca con el `save()` general de clientes, que
 * lo omite (JD-5): asi una entidad vieja guardada por otro caso de uso no lo pisa.
 */
export class ConfigurarApiClienteUseCase {
  constructor(
    private readonly clienteRepo: Pick<IClienteRepository, 'findById'>,
    private readonly apiHabilitadaRepo: IApiHabilitadaRepository,
    private readonly usuarioRepo: Pick<IUsuarioRepository, 'findByEmail' | 'create'>,
    private readonly membresiaRepo: Pick<
      IMembresiaRepository,
      'findByUsuarioYCliente' | 'create' | 'save'
    >,
    private readonly roleRepo: Pick<IRoleRepository, 'findByCodigo'>,
    private readonly hashProvider: Pick<IHashProvider, 'hash'>,
  ) {}

  async execute(
    command: ConfigurarApiClienteCommand,
    actor: ConfigurarApiClienteActor,
  ): Promise<Result<ConfigurarApiClienteOutput, ConfigurarApiClienteError>> {
    if (!actor.isGlobalAdmin) return Result.fail(new OnlyRootCanConfigurarApiError());

    const cliente = await this.clienteRepo.findById(command.clienteId);
    if (!cliente) return Result.fail(new ClienteApiNoEncontradoError(command.clienteId));

    if (command.habilitada) {
      const asegurado = await this.asegurarUsuarioIntegracion(cliente.id);
      if (asegurado.isFail()) return Result.fail(asegurado.getError());
      cliente.habilitarApi();
    } else {
      cliente.deshabilitarApi();
    }
    const fijado = await this.apiHabilitadaRepo.fijar(cliente.id, cliente.apiHabilitada);
    if (!fijado) return Result.fail(new ClienteApiNoEncontradoError(command.clienteId));

    return Result.ok({ clienteId: cliente.id, apiHabilitada: cliente.apiHabilitada });
  }

  private async asegurarUsuarioIntegracion(
    clienteId: string,
  ): Promise<Result<void, DomainError & ConfigurarApiClienteError>> {
    const rol = await this.roleRepo.findByCodigo(ROL_INTEGRACION);
    if (!rol) return Result.fail(new RolIntegracionNoEncontradoError(ROL_INTEGRACION));

    const email = emailIntegracion(clienteId);
    let usuario = await this.usuarioRepo.findByEmail(email);
    if (usuario && !usuario.esIntegracion) return Result.fail(new EmailIntegracionOcupadoError());
    if (!usuario) {
      usuario = UsuarioEntity.create({
        email,
        nombre: 'Integracion',
        apellido: 'API',
        // Secreto aleatorio que nadie conoce: el usuario no tiene contrasena utilizable.
        passwordHash: await this.hashProvider.hash(randomBytes(32).toString('hex')),
        activo: true,
        esIntegracion: true,
      });
      await this.usuarioRepo.create(usuario);
    }

    const membresia = await this.membresiaRepo.findByUsuarioYCliente(usuario.id, clienteId);
    if (!membresia) {
      await this.membresiaRepo.create(
        MembresiaEntity.create({ usuarioId: usuario.id, clienteId, rolId: rol.id, activo: true }),
      );
    } else if (!membresia.activo) {
      membresia.activar();
      await this.membresiaRepo.save(membresia);
    }
    return Result.ok(undefined);
  }
}
