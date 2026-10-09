import { Inject, Injectable } from '@nestjs/common';
import { LOGGER, ILogger } from '../../../shared/domain/ports/i-logger.port';
import { UsuarioEntity } from '../../domain/entities/usuario.entity';
import { MotivoSsoRechazado, SsoRechazadoError } from '../../domain/errors/sso.errors';
import {
  DESAFIO_LOGIN_REPOSITORY,
  IDesafioLoginRepository,
} from '../../domain/ports/desafio-login-repository.port';
import {
  IIdentidadSsoRepository,
  IDENTIDAD_SSO_REPOSITORY,
} from '../../domain/ports/identidad-sso-repository.port';
import {
  IMembresiaRepository,
  MEMBRESIA_REPOSITORY,
} from '../../domain/ports/i-membresia.repository';
import { ILimitadorIntentos, LIMITADOR_INTENTOS } from '../../domain/ports/limitador-intentos.port';
import { IProveedorOidc, PROVEEDOR_OIDC } from '../../domain/ports/proveedor-oidc.port';
import {
  ISsoEstadoRepository,
  SSO_ESTADO_REPOSITORY,
} from '../../domain/ports/sso-estado-repository.port';
import { IUsuarioRepository, USUARIO_REPOSITORY } from '../../domain/ports/i-usuario.repository';
import { IdentidadSsoVerificada } from '../../domain/sso/identidad-sso-verificada';
import { ProveedorSso } from '../../domain/sso/proveedores-sso';
import { EvaluarSegundoPasoService } from '../evaluar-segundo-paso.service';
import { sha256Hex } from './pkce';

export interface CompletarSsoInput {
  proveedor: ProveedorSso;
  code: string;
  /** `state` crudo que volvio en el callback; solo su hash toca la base. */
  state: string;
  /** Valor crudo de la cookie `sso_st`; solo su hash toca la base. */
  bindingToken: string;
  /** IP del navegador para el limitador (I9). Ausente = `sin-ip`, igual que `pwd:`. */
  ip?: string;
  /** Token crudo del dispositivo confiable (cookie `td`); solo lo lee el segundo paso. */
  dispositivoConfiable?: string;
}

/**
 * Resultado del paso 10 de ADR-7. Nunca trae tokens de sesion: el desafio o el ticket los
 * canjea `ContinuarLoginUseCase` / `SeleccionarClienteLoginUseCase` (SL11, SL12, L7).
 */
export type CompletarSsoResultado = (
  | { kind: 'needs2fa'; desafio: string }
  | { kind: 'needsEnrolamiento2fa'; desafio: string }
  | { kind: 'ticket'; ticket: string; dispositivoConfiable?: string }
) & { siguiente: string | null };

/**
 * CompletarSsoUseCase — los diez pasos de ADR-7 (sdd/login-sso). Inerte: nada lo cablea
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
    @Inject(LIMITADOR_INTENTOS) private readonly limitador: ILimitadorIntentos,
    @Inject(EvaluarSegundoPasoService) private readonly segundoPaso: EvaluarSegundoPasoService,
    @Inject(DESAFIO_LOGIN_REPOSITORY) private readonly desafios: IDesafioLoginRepository,
    @Inject(LOGGER) private readonly logger: ILogger,
  ) {}

  async execute(input: CompletarSsoInput): Promise<CompletarSsoResultado> {
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

    // Paso 3: la reserva es el fallo provisional (I9). Los pasos 4 a 8 que fallan o lanzan la
    // dejan contada; `liberar` solo corre tras el paso 8. Bloqueado = el rechazo generico.
    const claveLimite = `sso:${proveedor}:${sha256Hex(identidad.subject)}:${input.ip ?? 'sin-ip'}`;
    const reserva = await this.limitador.reservar(claveLimite);
    if (reserva === null) this.rechazar(proveedor, 'BLOQUEADO');

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

    // Paso 8: solo si se resolvio por email. Un vinculo previo ya es la identidad.
    if (resueltoPorEmail) {
      const vinculo = await this.vinculos.vincular(usuario.id, proveedor, identidad.subject);
      if (vinculo === 'OTRA_CUENTA') this.rechazar(proveedor, 'OTRA_CUENTA', usuario.id);
    }

    // Paso 9: exito del primer factor; el contador vuelve a cero (I2).
    await this.limitador.liberar(claveLimite);

    // Paso 10: el 2FA propio manda; el SSO no cuenta como segundo paso (SL11).
    const decision = await this.segundoPaso.evaluar(
      usuario,
      membresias,
      input.dispositivoConfiable,
    );
    if (decision.kind !== 'continuar') {
      return { ...decision, siguiente: estado.siguiente };
    }
    return {
      kind: 'ticket',
      ticket: await this.desafios.crear(usuario.id, 'SELECCIONAR'),
      ...(decision.dispositivoRenovado !== undefined
        ? { dispositivoConfiable: decision.dispositivoRenovado }
        : {}),
      siguiente: estado.siguiente,
    };
  }

  /** Deja la causa en el log (nunca email, sujeto ni token) y lanza el rechazo generico. */
  private rechazar(proveedor: ProveedorSso, motivo: MotivoSsoRechazado, usuarioId?: string): never {
    const partes = [`SSO_RECHAZADO`, `proveedor=${proveedor}`, `motivo=${motivo}`];
    if (usuarioId) partes.push(`usuarioId=${usuarioId}`);
    this.logger.log(partes.join(' | '));
    throw new SsoRechazadoError(motivo);
  }
}
