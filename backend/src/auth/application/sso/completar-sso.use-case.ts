import { Inject, Injectable } from '@nestjs/common';
import { LOGGER, ILogger } from '../../../shared/domain/ports/i-logger.port';
import { UsuarioEntity } from '../../domain/entities/usuario.entity';
import { MotivoSsoRechazado, SsoRechazadoError } from '../../domain/errors/sso.errors';
import {
  IIdentidadSsoRepository,
  IDENTIDAD_SSO_REPOSITORY,
} from '../../domain/ports/identidad-sso-repository.port';
import {
  IMembresiaRepository,
  MEMBRESIA_REPOSITORY,
  MembresiaResuelta,
} from '../../domain/ports/i-membresia.repository';
import { IProveedorOidc, PROVEEDOR_OIDC } from '../../domain/ports/proveedor-oidc.port';
import {
  ISsoEstadoRepository,
  SSO_ESTADO_REPOSITORY,
} from '../../domain/ports/sso-estado-repository.port';
import { IUsuarioRepository, USUARIO_REPOSITORY } from '../../domain/ports/i-usuario.repository';
import { IdentidadSsoVerificada } from '../../domain/sso/identidad-sso-verificada';
import { ProveedorSso } from '../../domain/sso/proveedores-sso';
import { sha256Hex } from './pkce';

export interface CompletarSsoInput {
  proveedor: ProveedorSso;
  code: string;
  /** `state` crudo que volvio en el callback; solo su hash toca la base. */
  state: string;
  /** Valor crudo de la cookie `sso_st`; solo su hash toca la base. */
  bindingToken: string;
}

/**
 * Usuario ya resuelto y habilitado (pasos 1 a 7 de ADR-7). La unidad siguiente agrega el
 * vinculo (`resueltoPorEmail`), el segundo paso y el ticket.
 */
export interface CompletarSsoResolucion {
  usuario: UsuarioEntity;
  membresias: MembresiaResuelta[];
  identidad: IdentidadSsoVerificada;
  /** `true` si no habia vinculo y el usuario salio de `findManyByEmailInsensitive`. */
  resueltoPorEmail: boolean;
  siguiente: string | null;
}

/**
 * CompletarSsoUseCase — pasos 1, 2 y 4 a 7 de ADR-7 (sdd/login-sso). Inerte: nada lo cablea
 * hasta la WU-5a. Ningun camino crea usuario, membresia ni cliente (SV2). Todo rechazo lanza
 * `SsoRechazadoError`; un fallo de red o un 5xx del proveedor se propaga sin convertirse en
 * rechazo.
 */
@Injectable()
export class CompletarSsoUseCase {
  constructor(
    @Inject(SSO_ESTADO_REPOSITORY) private readonly estados: ISsoEstadoRepository,
    @Inject(PROVEEDOR_OIDC) private readonly oidc: IProveedorOidc,
    @Inject(IDENTIDAD_SSO_REPOSITORY) private readonly vinculos: IIdentidadSsoRepository,
    @Inject(USUARIO_REPOSITORY) private readonly usuarios: IUsuarioRepository,
    @Inject(MEMBRESIA_REPOSITORY) private readonly membresias: IMembresiaRepository,
    @Inject(LOGGER) private readonly logger: ILogger,
  ) {}

  async execute(input: CompletarSsoInput): Promise<CompletarSsoResolucion> {
    const { proveedor } = input;

    // Paso 1: CAS del estado. Cero filas = rechazo sin llamar al proveedor.
    const estado = await this.estados.consumir({
      stateHash: sha256Hex(input.state),
      proveedor,
      navegadorHash: sha256Hex(input.bindingToken),
    });
    if (estado === null) this.rechazar(proveedor, 'ESTADO_INVALIDO');

    // Paso 2: canje + validacion. Solo `SsoRechazadoError` es un rechazo; lo demas se propaga.
    let identidad: IdentidadSsoVerificada;
    try {
      identidad = await this.oidc.verificarCodigo(proveedor, {
        code: input.code,
        codeVerifier: estado.codeVerifier,
        nonce: estado.nonce,
      });
    } catch (e) {
      if (e instanceof SsoRechazadoError) this.rechazar(proveedor, e.motivo);
      throw e;
    }

    // Paso 3 (WU-4c, unidad 8): aca va `limitador.reservar('sso:<PROVEEDOR>:<sha256(subject)>:<ip>')`,
    // antes de resolver al usuario; los pasos 4 a 8 que fallan dejan la reserva como falla.

    // Paso 4: primero por vinculo (un cambio de email igual entra), despues por email.
    let usuario: UsuarioEntity | null;
    let resueltoPorEmail = false;
    const usuarioId = await this.vinculos.buscarUsuarioPorSujeto(proveedor, identidad.subject);
    if (usuarioId !== null) {
      usuario = await this.usuarios.findById(usuarioId);
    } else {
      const candidatos = await this.usuarios.findManyByEmailInsensitive(identidad.email);
      if (candidatos.length === 0) this.rechazar(proveedor, 'SIN_USUARIO');
      if (candidatos.length > 1) this.rechazar(proveedor, 'AMBIGUO');
      usuario = candidatos[0];
      resueltoPorEmail = true;
    }

    // Paso 5: usuario ausente, suspendido o borrado.
    if (!usuario || !usuario.activo || usuario.isDeleted()) {
      this.rechazar(proveedor, 'INACTIVO', usuario?.id);
    }
    // Paso 6: ROOT se rechaza en cada login, tambien si ya estaba vinculado.
    if (usuario.isGlobalAdmin) this.rechazar(proveedor, 'ROOT', usuario.id);

    // Paso 7: sin membresias activas no hay a donde entrar.
    const membresias = await this.membresias.findActivasByUsuario(usuario.id);
    if (membresias.length === 0) this.rechazar(proveedor, 'SIN_MEMBRESIA', usuario.id);

    return { usuario, membresias, identidad, resueltoPorEmail, siguiente: estado.siguiente };
  }

  /** Deja la causa en el log (nunca email, sujeto ni token) y lanza el rechazo generico. */
  private rechazar(proveedor: ProveedorSso, motivo: MotivoSsoRechazado, usuarioId?: string): never {
    const partes = [`SSO_RECHAZADO`, `proveedor=${proveedor}`, `motivo=${motivo}`];
    if (usuarioId) partes.push(`usuarioId=${usuarioId}`);
    this.logger.log(partes.join(' | '));
    throw new SsoRechazadoError(motivo);
  }
}
