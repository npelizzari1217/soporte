import { DomainError, Result } from '../../../shared/domain/result';
import { SinMembresiaActivaError } from '../../domain/errors/auth.errors';
import { SegundoPasoRechazadoError } from '../../domain/errors/tfa.errors';
import { IDesafioLoginRepository } from '../../domain/ports/desafio-login-repository.port';
import { IMembresiaRepository } from '../../domain/ports/i-membresia.repository';
import { IUsuarioRepository } from '../../domain/ports/i-usuario.repository';
import { EmitirSesionService } from '../emitir-sesion.service';
import { MembresiaView } from '../use-cases/login.use-case';

export type ContinuarLoginResult =
  | { kind: 'tokens'; accessToken: string; refreshToken: string }
  | { kind: 'selection'; membresias: MembresiaView[]; ticket: string };

const rechazo = (): Result<never, SegundoPasoRechazadoError> =>
  Result.fail(new SegundoPasoRechazadoError());

/**
 * `POST /auth/login/continuar`: unico lugar donde el flujo de 2FA emite sesion (L5). Exige un
 * ticket verificado (un `ENROLAR` sin verificar no lo es). Con ROOT o una membresia consume el
 * ticket y emite; con mas de una devuelve las membresias y el mismo ticket SIN consumirlo (L7).
 */
export class ContinuarLoginUseCase {
  constructor(
    private readonly desafios: IDesafioLoginRepository,
    private readonly usuarioRepo: IUsuarioRepository,
    private readonly membresiaRepo: IMembresiaRepository,
    private readonly emitirSesion: EmitirSesionService,
  ) {}

  async execute(ticket: string): Promise<Result<ContinuarLoginResult, DomainError>> {
    const vigente = await this.desafios.buscarTicket(ticket);
    if (!vigente) return rechazo();
    const usuario = await this.usuarioRepo.findById(vigente.usuarioId);
    if (!usuario || !usuario.activo || usuario.isDeleted()) return rechazo();

    const membresias = await this.membresiaRepo.findActivasByUsuario(usuario.id);
    if (!usuario.isGlobalAdmin) {
      if (membresias.length === 0) return Result.fail(new SinMembresiaActivaError());
      if (membresias.length > 1) {
        return Result.ok({
          kind: 'selection',
          ticket,
          membresias: membresias.map((m) => ({
            cliente_id: m.clienteId,
            nombre: m.clienteNombre,
            rol: m.rolCodigo,
          })),
        });
      }
    }
    if (!(await this.desafios.consumir(ticket, usuario.id))) return rechazo();
    const clienteId = usuario.isGlobalAdmin ? null : membresias[0].clienteId;
    const sesion = await this.emitirSesion.emitir(usuario, membresias, clienteId);
    if (sesion.isFail()) return Result.fail(sesion.getError());
    return Result.ok({ kind: 'tokens', ...sesion.getValue() });
  }
}

/**
 * `POST /auth/login/seleccionar`: la membresia activa se valida ANTES de consumir; si no existe
 * da el mismo rechazo que un ticket invalido y el ticket sigue vigente. No pide contrasena ni
 * codigo (L7).
 */
export class SeleccionarClienteLoginUseCase {
  constructor(
    private readonly desafios: IDesafioLoginRepository,
    private readonly usuarioRepo: IUsuarioRepository,
    private readonly membresiaRepo: IMembresiaRepository,
    private readonly emitirSesion: EmitirSesionService,
  ) {}

  async execute(
    ticket: string,
    clienteId: string,
  ): Promise<Result<{ accessToken: string; refreshToken: string }, DomainError>> {
    const vigente = await this.desafios.buscarTicket(ticket);
    if (!vigente) return rechazo();
    const usuario = await this.usuarioRepo.findById(vigente.usuarioId);
    if (!usuario || !usuario.activo || usuario.isDeleted()) return rechazo();
    const elegida = await this.membresiaRepo.findActivaByUsuarioYCliente(usuario.id, clienteId);
    if (!elegida) return rechazo();

    if (!(await this.desafios.consumir(ticket, usuario.id))) return rechazo();
    const membresias = await this.membresiaRepo.findActivasByUsuario(usuario.id);
    return this.emitirSesion.emitir(usuario, membresias, clienteId);
  }
}
