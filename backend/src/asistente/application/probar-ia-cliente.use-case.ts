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

export type ProbarIaClienteError = ClienteIaNoEncontradoError | IaNoConfiguradaError;

/** Pedido mínimo para probar el proveedor: pocas fichas, temperatura cero. */
const PEDIDO_DE_PRUEBA = {
  mensajes: [{ rol: 'user' as const, contenido: 'Responda solamente: OK' }],
  temperatura: 0,
  maxTokens: 5,
};

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
      const respuesta = await this.modelo.completar(
        { url: config.url, modelo: config.modelo, clave: clave.getValue() },
        PEDIDO_DE_PRUEBA,
      );
      resultado = respuesta.isOk()
        ? { ok: true, motivo: null }
        : { ok: false, motivo: respuesta.getError().message };
    }

    const actualizada = await this.configs.guardarVerificacion(clienteId, resultado);
    // `null`: la IA se quitó mientras se probaba; el estado vigente es "sin configurar".
    return Result.ok(actualizada ? estadoConfigIa(actualizada) : ESTADO_IA_SIN_CONFIGURAR);
  }
}
