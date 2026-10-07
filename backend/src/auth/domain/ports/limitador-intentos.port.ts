/**
 * ILimitadorIntentos — puerto del limitador de intentos fallidos persistido.
 * WU-3 (sdd/verificacion-dos-pasos, ADR-6). La reserva ES el fallo provisional.
 */
export interface ReservaIntento {
  clave: string;
  /** Inicio de la ventana en la que se reservo: guard de `devolver`. */
  ventanaInicio: Date;
}

export interface ILimitadorIntentos {
  /** Reserva atomica de un intento. `null` = bloqueado (no incrementa, I7). */
  reservar(clave: string): Promise<ReservaIntento | null>;
  /** Exito: pone el contador en cero (I2). */
  liberar(clave: string): Promise<void>;
  /** Ni exito ni fallo: deshace solo esa reserva, y solo si la ventana sigue siendo la misma. */
  devolver(reserva: ReservaIntento): Promise<void>;
}

export const LIMITADOR_INTENTOS = Symbol('ILimitadorIntentos');
