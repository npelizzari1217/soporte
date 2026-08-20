/**
 * IClienteEmailConfigRepository — puerto de persistencia para la
 * configuración SMTP de un cliente (sdd/configuracion-correo-por-cliente).
 *
 * Vive separado de `IClienteRepository`: la config de correo tiene garantías
 * propias (todo-o-nada, cifrado en el borde de persistencia, el secreto
 * nunca sale del adaptador) que no tiene sentido mezclar con el CRUD
 * comercial del cliente (nombre, cuit, razón social) — mezclarlos hubiera
 * hecho fácil que una edición comercial arrastrara o pisara la config SMTP.
 *
 * Definido en la capa de dominio: sin imports de Prisma ni NestJS. La
 * implementación concreta vive en
 * `clientes/infrastructure/persistence/prisma/prisma-cliente-email-config.repository.ts`.
 *
 * El cifrado/descifrado de la contraseña vive DENTRO del adaptador (borde de
 * persistencia): quien llama a `save()` pasa la contraseña en texto plano y
 * quien llama a `findForSend()` la recibe ya descifrada. Ningún caso de uso
 * ni controller maneja el ciphertext ni el `ISecretCipher` directamente —
 * así el texto plano circula lo mínimo imprescindible.
 *
 * Ref design: sdd/configuracion-correo-por-cliente D1, D3, D6, D7.
 * Ref tasks: WU3 (3.2, 3.3).
 */

/** Config completa y ya DESCIFRADA, lista para armar un transporter SMTP. */
export interface ClienteEmailConfigForSend {
  host: string;
  port: number;
  user: string;
  /** Contraseña en texto plano — recién descifrada por el adaptador. */
  password: string;
  secure: boolean;
  from: string;
  /**
   * `smtp_config_updated_at` en epoch ms — clave de caché del transporter
   * (D3): cuando la config cambia, esta revisión cambia y una entrada de
   * caché vieja queda inalcanzable por construcción.
   */
  configRevision: number;
}

/**
 * Estado expuesto vía API/UI. NUNCA incluye la contraseña bajo ninguna
 * forma (ni siquiera enmascarada, ni con puntos, ni su longitud) — ver D7:
 * un campo que no existe en el tipo no se puede filtrar por accidente.
 */
export interface ClienteEmailConfigState {
  configurado: boolean;
  host: string | null;
  port: number | null;
  user: string | null;
  secure: boolean | null;
  from: string | null;
  verificadoAt: Date | null;
  verificacionError: string | null;
}

/** Entrada de escritura: config todo-o-nada, contraseña en texto plano. */
export interface ClienteEmailConfigInput {
  host: string;
  port: number;
  user: string;
  /** Texto plano — el adaptador la cifra (AAD = clienteId) antes de persistir. */
  password: string;
  secure: boolean;
  from: string;
}

/** Resultado de un handshake SMTP (`transporter.verify()`), ya saneado (D6). */
export interface VerificacionOutcome {
  ok: boolean;
  /** Motivo saneado del allowlist de D6 — `null` cuando `ok` es `true`. */
  motivo: string | null;
}

export interface IClienteEmailConfigRepository {
  /**
   * Config completa y descifrada para enviar. `null` si el cliente no tiene
   * configuración de correo (todo-o-nada: nunca "parcialmente configurado").
   */
  findForSend(clienteId: string): Promise<ClienteEmailConfigForSend | null>;

  /** Estado para exponer en API/UI — nunca incluye la contraseña. */
  findState(clienteId: string): Promise<ClienteEmailConfigState>;

  /**
   * Escribe la config completa (todo-o-nada): cifra `password` con
   * `clienteId` como AAD antes de persistir, y actualiza
   * `smtp_config_updated_at` — nunca `updated_at` del cliente (esa columna
   * es la revisión que usa el caché de transporters de WU5: si tocáramos
   * `updated_at`, cualquier edición comercial invalidaría un transporter
   * que seguía siendo válido).
   */
  save(clienteId: string, config: ClienteEmailConfigInput): Promise<void>;

  /**
   * Persiste el resultado de un handshake SMTP sin tocar el resto de la
   * config ni `smtp_config_updated_at` — verificar no es reconfigurar, así
   * que no debe invalidar el caché de transporters.
   */
  saveVerificationOutcome(clienteId: string, outcome: VerificacionOutcome): Promise<void>;

  /** Limpia las 9 columnas SMTP, incluida la metadata de verificación. */
  clear(clienteId: string): Promise<void>;
}

/** Token de inyección de dependencias para IClienteEmailConfigRepository en NestJS. */
export const CLIENTE_EMAIL_CONFIG_REPOSITORY = Symbol('CLIENTE_EMAIL_CONFIG_REPOSITORY');
