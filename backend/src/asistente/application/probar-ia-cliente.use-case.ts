import { IClienteRepository } from '../../clientes/domain/ports/i-cliente.repository';
import { Result } from '../../shared/domain/result';
import { ClienteIaNoEncontradoError, IaNoConfiguradaError } from '../domain/asistente.errors';
import {
  IAsistenteIaConfigRepository,
  ResultadoVerificacionIa,
} from '../domain/asistente-ia-config-repository.port';
import { EstadoConfigIa, ESTADO_IA_SIN_CONFIGURAR, estadoConfigIa } from '../domain/config-ia';
import { IModeloIa } from '../domain/modelo-ia.port';
import { ClaveIaCifrada } from './clave-ia-cifrada';
import { verificarProveedorIa } from './verificar-proveedor-ia';

export type ProbarIaClienteError = ClienteIaNoEncontradoError | IaNoConfiguradaError;

/**
 * ProbarIaClienteUseCase — "Probar": hace una consulta mínima al proveedor con la configuración
 * guardada y registra el resultado, sin modificar la configuración (S4).
 *
 * Una clave que no descifra se registra como falla con su motivo, igual que un rechazo del
 * proveedor: para ROOT las dos se resuelven igual, volviendo a cargar la clave.
 */
export class ProbarIaClienteUseCase {
  constructor(
    private readonly clientes: Pick<IClienteRepository, 'findById'>,
    private readonly configs: Pick<
      IAsistenteIaConfigRepository,
      'buscarPorCliente' | 'guardarVerificacion'
    >,
    private readonly claves: Pick<ClaveIaCifrada, 'descifrar'>,
    private readonly modelo: IModeloIa,
  ) {}

  /**
   * @param clienteId cliente a probar
   * @returns el estado con el resultado de la prueba registrado
   */
  async execute(clienteId: string): Promise<Result<EstadoConfigIa, ProbarIaClienteError>> {
    if (!(await this.clientes.findById(clienteId))) {
      return Result.fail(new ClienteIaNoEncontradoError(clienteId));
    }
    const config = await this.configs.buscarPorCliente(clienteId);
    if (!config) return Result.fail(new IaNoConfiguradaError());

    let resultado: ResultadoVerificacionIa;
    const clave = this.claves.descifrar(clienteId, config.claveCifrada);
    if (clave.isFail()) {
      resultado = { ok: false, motivo: clave.getError().message };
    } else {
      resultado = await verificarProveedorIa(this.modelo, {
        url: config.url,
        modelo: config.modelo,
        clave: clave.getValue(),
      });
    }

    const actualizada = await this.configs.guardarVerificacion(clienteId, resultado);
    // `null`: la IA se quitó mientras se probaba; el estado vigente es "sin configurar".
    return Result.ok(actualizada ? estadoConfigIa(actualizada) : ESTADO_IA_SIN_CONFIGURAR);
  }
}
