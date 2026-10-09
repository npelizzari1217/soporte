import { UsuarioEntity } from '../domain/entities/usuario.entity';
import { IDesafioLoginRepository } from '../domain/ports/desafio-login-repository.port';
import { IDispositivoConfiableRepository } from '../domain/ports/dispositivo-confiable-repository.port';
import { MembresiaResuelta } from '../domain/ports/i-membresia.repository';
import { ITfaRepository } from '../domain/ports/tfa-repository.port';
import { esObligado2fa } from '../domain/tfa/es-obligado-2fa';
import { DISPOSITIVO_CONFIABLE_DURACION_MS } from '../domain/tfa/tfa.constants';
import { hashTokenDispositivo } from './tfa/token-dispositivo';

/**
 * Decision del segundo paso (L1, L3, L4, L5):
 * - `needs2fa` / `needsEnrolamiento2fa`: falta el segundo paso; el `desafio` no es un token de sesion.
 * - `continuar`: se puede seguir. `dispositivoRenovado` trae el token del dispositivo confiable que
 *   omitio el desafio y fue renovado (ventana deslizante), para que el BFF re-fije su cookie.
 */
export type DecisionSegundoPaso =
  | { kind: 'needs2fa'; desafio: string }
  | { kind: 'needsEnrolamiento2fa'; desafio: string }
  | { kind: 'continuar'; dispositivoRenovado?: string };

/**
 * EvaluarSegundoPasoService — paso 3b del login, extraido sin cambio de conducta
 * (sdd/login-sso ADR-6): lo comparten el login con contrasena y el login SSO, para que la regla
 * de obligacion de 2FA viva en un solo lugar.
 */
export class EvaluarSegundoPasoService {
  constructor(
    private readonly tfaRepo: ITfaRepository,
    private readonly desafios: IDesafioLoginRepository,
    private readonly dispositivos: IDispositivoConfiableRepository,
  ) {}

  async evaluar(
    usuario: UsuarioEntity,
    membresiasActivas: MembresiaResuelta[],
    dispositivoConfiable?: string,
  ): Promise<DecisionSegundoPaso> {
    const estadoTfa = await this.tfaRepo.obtener(usuario.id);
    let dispositivoRenovado: string | undefined;
    if (estadoTfa?.secretoCifrado != null) {
      // Un dispositivo confiable valido omite el desafio, nunca la contrasena (D3). ROOT no
      // lo tiene aunque lo envie, ni siquiera si lo emitieron antes de que fuera ROOT (D4).
      // Ventana deslizante: omitir el desafio gracias a un dispositivo vigente lo renueva 30 dias.
      if (!usuario.isGlobalAdmin && dispositivoConfiable !== undefined) {
        const ahora = new Date();
        const renovado = await this.dispositivos.renovar(
          usuario.id,
          hashTokenDispositivo(dispositivoConfiable),
          new Date(ahora.getTime() + DISPOSITIVO_CONFIABLE_DURACION_MS),
          ahora,
        );
        if (renovado) dispositivoRenovado = dispositivoConfiable;
      }
      if (dispositivoRenovado === undefined) {
        return { kind: 'needs2fa', desafio: await this.desafios.crear(usuario.id, 'VERIFICAR') };
      }
    } else if (esObligado2fa(usuario.isGlobalAdmin, membresiasActivas)) {
      return {
        kind: 'needsEnrolamiento2fa',
        desafio: await this.desafios.crear(usuario.id, 'ENROLAR'),
      };
    }
    return dispositivoRenovado !== undefined
      ? { kind: 'continuar', dispositivoRenovado }
      : { kind: 'continuar' };
  }
}
