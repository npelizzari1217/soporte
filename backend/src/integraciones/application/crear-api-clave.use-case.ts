import { Result } from '../../shared/domain/result';
import { IUsuarioRepository } from '../../auth/domain/ports/i-usuario.repository';
import { IClienteRepository } from '../../clientes/domain/ports/i-cliente.repository';
import { esPermisoApi, PermisoApi } from '../domain/api-clave';
import { ApiClaveDuplicadaError, IApiClaveRepository } from '../domain/api-clave-repository.port';
import { generarClaveApi } from '../domain/generar-clave-api';
import {
  ApiNoHabilitadaError,
  NombreClaveInvalidoError,
  PermisosApiInvalidosError,
  UsuarioIntegracionNoEncontradoError,
} from '../domain/integraciones.errors';
import { emailIntegracion } from './configurar-api-cliente.use-case';

export const LARGO_MAXIMO_NOMBRE_CLAVE = 100;
/** Una colision de hash o prefijo es practicamente imposible; se reintenta unas pocas veces. */
const INTENTOS_GENERACION = 3;

export interface CrearApiClaveCommand {
  clienteId: string;
  creadaPorId: string;
  nombre: string;
  permisos: string[];
}

export interface CrearApiClaveOutput {
  id: string;
  nombre: string;
  prefijo: string;
  permisos: PermisoApi[];
  creadaAt: Date;
  /** Clave en claro: esta es la UNICA vez que se devuelve (CA9). */
  clave: string;
}

export type CrearApiClaveError =
  | NombreClaveInvalidoError
  | PermisosApiInvalidosError
  | ApiNoHabilitadaError
  | UsuarioIntegracionNoEncontradoError
  | ApiClaveDuplicadaError;

/**
 * CrearApiClaveUseCase — emite una clave de la API para el cliente del actor (sdd/api-publica,
 * CA3, CA4 y CA9). La clave queda atada al usuario de integracion del cliente; solo se guardan
 * su sha256 y su prefijo, y el texto en claro viaja unicamente en esta respuesta.
 */
export class CrearApiClaveUseCase {
  constructor(
    private readonly clienteRepo: Pick<IClienteRepository, 'findById'>,
    private readonly usuarioRepo: Pick<IUsuarioRepository, 'findByEmail'>,
    private readonly claveRepo: Pick<IApiClaveRepository, 'crear'>,
  ) {}

  async execute(
    command: CrearApiClaveCommand,
  ): Promise<Result<CrearApiClaveOutput, CrearApiClaveError>> {
    const nombre = command.nombre.trim();
    if (nombre.length === 0 || nombre.length > LARGO_MAXIMO_NOMBRE_CLAVE) {
      return Result.fail(new NombreClaveInvalidoError(LARGO_MAXIMO_NOMBRE_CLAVE));
    }
    const permisos = [...new Set(command.permisos)].filter(esPermisoApi);
    const todosValidos = command.permisos.every(esPermisoApi);
    if (permisos.length === 0 || !todosValidos) return Result.fail(new PermisosApiInvalidosError());

    const cliente = await this.clienteRepo.findById(command.clienteId);
    if (!cliente?.apiHabilitada) return Result.fail(new ApiNoHabilitadaError());

    const usuario = await this.usuarioRepo.findByEmail(emailIntegracion(command.clienteId));
    if (!usuario?.esIntegracion) return Result.fail(new UsuarioIntegracionNoEncontradoError());

    for (let intento = 0; intento < INTENTOS_GENERACION; intento++) {
      const generada = generarClaveApi();
      const creada = await this.claveRepo.crear({
        clienteId: command.clienteId,
        usuarioId: usuario.id,
        nombre,
        prefijo: generada.prefijo,
        hash: generada.hash,
        permisos,
        creadaPorId: command.creadaPorId,
      });
      if (creada.isOk()) {
        const clave = creada.getValue();
        return Result.ok({
          id: clave.id,
          nombre: clave.nombre,
          prefijo: clave.prefijo,
          permisos: clave.permisos,
          creadaAt: clave.creadaAt,
          clave: generada.clave,
        });
      }
    }
    return Result.fail(new ApiClaveDuplicadaError());
  }
}
