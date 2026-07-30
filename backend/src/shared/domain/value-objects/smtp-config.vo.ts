import { Result } from '../result';
import { ConfigIncompletaError } from '../errors/config-incompleta.error';

/** Ver `Email` VO (`tickets/domain/value-objects/email.vo.ts`) — mismo símbolo bien-conocido. */
const NODE_INSPECT_CUSTOM = Symbol.for('nodejs.util.inspect.custom');

/** Enmascarado usado por `toSafeLog()`. Literal local: `configuracion/domain/mask-secret.ts`
 * (que centralizará `SECRET_MASK`, design §5.1) todavía no existe — es tarea 3.1 (PR3). */
const SECRET_MASK = '********';

export interface SmtpConfigProps {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  from: string;
}

/** Campos requeridos para una `SmtpConfig` válida — reusado por el resolver
 * cross-DB (`PrismaConfigResolver`) para iterar el merge por campo (Dz4)
 * sin duplicar la lista. */
export const SMTP_CONFIG_CAMPOS_REQUERIDOS: readonly (keyof SmtpConfigProps)[] = [
  'host',
  'port',
  'secure',
  'user',
  'pass',
  'from',
];

/**
 * SmtpConfig — Value Object self-validating para la configuración SMTP
 * resuelta (tenant→global, ya descifrada).
 *
 * Dz1 (design): vive en `shared/domain/value-objects` porque la produce
 * `configuracion/` (vía `IConfigResolver.resolveSmtp()`) y la consume
 * `tickets/` (vía `EmailSenderPort.send(email, config)`) — cross-dominio.
 *
 * `pass` (el secreto en claro) vive SOLO en memoria dentro de `#props` — un
 * private field REAL de ECMAScript, no solo `private` de TS (mismo
 * razonamiento que `Email#value`, ver `email.vo.ts`): no aparece en
 * `Object.keys()` ni en un spread (`{...config}`). `toSafeLog()`,
 * `toJSON()` (usado por `JSON.stringify`) y `[inspect.custom]` (usado por
 * `console.log`/`util.inspect`) enmascaran `pass` SIEMPRE — spec R2 "el
 * secreto en claro nunca aparece fuera de memoria".
 *
 * Ref design: §5 Dz5 (self-validating VO), §5.1 (masking). Ref spec:
 * Requirement 1 (config incompleta), Requirement 2 (secreto nunca fuera de
 * memoria). Tarea: 2.1/2.2 (PR2).
 */
export class SmtpConfig {
  readonly #props: SmtpConfigProps;

  private constructor(props: SmtpConfigProps) {
    this.#props = props;
  }

  /**
   * Valida completitud + tipos. Acepta valores crudos `unknown` porque el
   * resolver arma el objeto a partir de `ConfiguracionRuntime.valor`
   * (siempre `string` en la DB) — `port`/`secure` se parsean desde string.
   * Falta de campo requerido / `port` no numérico / `secure` no reconocible
   * ⇒ `Result.fail(ConfigIncompletaError)`. NUNCA lanza.
   */
  static create(
    raw: Partial<Record<keyof SmtpConfigProps, unknown>>,
  ): Result<SmtpConfig, ConfigIncompletaError> {
    const faltantes: string[] = [];

    const host = SmtpConfig.readNonEmptyString(raw.host);
    if (host === undefined) faltantes.push('host');

    const user = SmtpConfig.readNonEmptyString(raw.user);
    if (user === undefined) faltantes.push('user');

    const pass = SmtpConfig.readNonEmptyString(raw.pass);
    if (pass === undefined) faltantes.push('pass');

    const from = SmtpConfig.readNonEmptyString(raw.from);
    if (from === undefined) faltantes.push('from');

    const port = SmtpConfig.readPort(raw.port);
    if (port === undefined) faltantes.push('port');

    const secure = SmtpConfig.readBoolean(raw.secure);
    if (secure === undefined) faltantes.push('secure');

    if (faltantes.length > 0) {
      return Result.fail(
        new ConfigIncompletaError(
          `Config SMTP incompleta o inválida: falta/es inválido: ${faltantes.join(', ')}`,
        ),
      );
    }

    return Result.ok(
      new SmtpConfig({
        host: host as string,
        port: port as number,
        secure: secure as boolean,
        user: user as string,
        pass: pass as string,
        from: from as string,
      }),
    );
  }

  private static readNonEmptyString(value: unknown): string | undefined {
    if (typeof value !== 'string') return undefined;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }

  private static readPort(value: unknown): number | undefined {
    if (typeof value === 'number') {
      return Number.isFinite(value) ? value : undefined;
    }
    if (typeof value === 'string' && value.trim().length > 0) {
      const parsed = Number(value.trim());
      return Number.isFinite(parsed) ? parsed : undefined;
    }
    return undefined;
  }

  private static readBoolean(value: unknown): boolean | undefined {
    if (typeof value === 'boolean') return value;
    if (value === 'true') return true;
    if (value === 'false') return false;
    return undefined;
  }

  get host(): string {
    return this.#props.host;
  }

  get port(): number {
    return this.#props.port;
  }

  get secure(): boolean {
    return this.#props.secure;
  }

  get user(): string {
    return this.#props.user;
  }

  /** Cleartext — SOLO en memoria. Nunca pasar a un logger; usar `toSafeLog()`. */
  get pass(): string {
    return this.#props.pass;
  }

  get from(): string {
    return this.#props.from;
  }

  /** Serialización segura: `pass` SIEMPRE enmascarado. */
  toSafeLog(): Record<string, unknown> {
    return {
      host: this.#props.host,
      port: this.#props.port,
      secure: this.#props.secure,
      user: this.#props.user,
      pass: SECRET_MASK,
      from: this.#props.from,
    };
  }

  /** Usado por `JSON.stringify(config)` — delega en `toSafeLog()` (defensa en profundidad). */
  toJSON(): Record<string, unknown> {
    return this.toSafeLog();
  }

  /** Usado por `util.inspect()`/`console.log(config)` — delega en `toSafeLog()`. */
  [NODE_INSPECT_CUSTOM](): Record<string, unknown> {
    return this.toSafeLog();
  }
}
