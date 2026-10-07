/**
 * IDesafioLoginRepository — puerto de los desafios opacos de login (WU-5a, ADR-1 de
 * sdd/verificacion-dos-pasos). El texto del desafio o del ticket solo existe en el llamador: el
 * repositorio guarda su SHA-256. Toda transicion es un CAS y devuelve `null`/`false` si el
 * desafio no es vigente, ya se uso o es de otro usuario.
 */
export type PropositoDesafio = 'VERIFICAR' | 'ENROLAR' | 'SELECCIONAR';

export interface DesafioVigente {
  usuarioId: string;
}

export interface IDesafioLoginRepository {
  /** Crea un desafio y devuelve su texto opaco. `SELECCIONAR` nace verificado (es un ticket). */
  crear(usuarioId: string, proposito: PropositoDesafio): Promise<string>;
  /** Lectura sin consumir: sirve para validar un desafio antes de gastar cupo del limitador. */
  buscarSinVerificar(token: string, proposito: PropositoDesafio): Promise<DesafioVigente | null>;
  /**
   * CAS: exige `verificado_at IS NULL`; reemplaza el token por el de un ticket nuevo que vale
   * 5 min. Devuelve el ticket; el texto del desafio deja de servir (L2).
   */
  verificar(token: string, proposito: PropositoDesafio, usuarioId: string): Promise<string | null>;
  /** Lectura sin consumir de un ticket vigente (`verificado_at` fijado): dueno de la continuacion. */
  buscarTicket(ticket: string): Promise<DesafioVigente | null>;
  /** CAS de uso unico sobre un ticket (`verificado_at` fijado). */
  consumir(ticket: string, usuarioId: string): Promise<boolean>;
}

export const DESAFIO_LOGIN_REPOSITORY = Symbol('IDesafioLoginRepository');
