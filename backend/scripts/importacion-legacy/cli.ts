/**
 * cli.ts — argumentos de `pnpm importar:legacy` y el freno de producción.
 * Puro: recibe `argv` y el mapa de entorno ya leídos.
 */
import { DomainError, Result } from '../../src/shared/domain/result';

export const USO =
  'Uso: pnpm importar:legacy --paquete <ruta.json> --cliente <nombre exacto> [--aplicar] [--confirmar-produccion]';

export interface OpcionesCli {
  paquete: string;
  cliente: string;
  /** Sin `--aplicar` la corrida es una simulación de solo lectura. */
  aplicar: boolean;
  confirmarProduccion: boolean;
}

export class ArgumentosInvalidosError extends DomainError {
  readonly code = 'ARGUMENTOS_INVALIDOS';
}

const CON_VALOR = new Set(['--paquete', '--cliente']);
const BANDERAS = new Set(['--aplicar', '--confirmar-produccion']);

export function parsearArgs(argv: string[]): Result<OpcionesCli, ArgumentosInvalidosError> {
  const valores = new Map<string, string>();
  const banderas = new Set<string>();
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (BANDERAS.has(arg)) {
      banderas.add(arg);
    } else if (CON_VALOR.has(arg)) {
      const valor = argv[i + 1];
      if (valor === undefined || valor.startsWith('--')) {
        return Result.fail(new ArgumentosInvalidosError(`${arg} requiere un valor. ${USO}`));
      }
      valores.set(arg, valor);
      i += 1;
    } else if (arg !== '--') {
      return Result.fail(new ArgumentosInvalidosError(`Argumento desconocido: ${arg}. ${USO}`));
    }
  }
  const paquete = valores.get('--paquete');
  const cliente = valores.get('--cliente');
  if (paquete === undefined || cliente === undefined) {
    return Result.fail(new ArgumentosInvalidosError(`Faltan --paquete o --cliente. ${USO}`));
  }
  return Result.ok({
    paquete,
    cliente,
    aplicar: banderas.has('--aplicar'),
    confirmarProduccion: banderas.has('--confirmar-produccion'),
  });
}

const HOSTS_LOCALES = new Set(['localhost', '127.0.0.1', '::1']);

/**
 * Claves `DATABASE_URL*` cuyo host no es local. Una URL que no se puede
 * interpretar cuenta como no local: ante la duda, se frena.
 */
export function urlsNoLocales(env: Record<string, string | undefined>): string[] {
  return Object.entries(env)
    .filter(
      ([clave, valor]) =>
        /^DATABASE_URL/i.test(clave) && typeof valor === 'string' && valor.length > 0,
    )
    .filter(([, valor]) => {
      try {
        return !HOSTS_LOCALES.has(new URL(valor as string).hostname.replace(/^\[|\]$/g, ''));
      } catch {
        return true;
      }
    })
    .map(([clave]) => clave);
}

/**
 * Escribir con alguna base fuera de localhost exige `--confirmar-produccion`
 * explícito: producción nunca se escribe por accidente. Simular no escribe
 * nada, así que no lo exige.
 */
export function frenoDeProduccion(
  opciones: OpcionesCli,
  env: Record<string, string | undefined>,
): Result<void, ArgumentosInvalidosError> {
  const remotas = urlsNoLocales(env);
  if (!opciones.aplicar || remotas.length === 0 || opciones.confirmarProduccion) {
    return Result.ok(undefined);
  }
  return Result.fail(
    new ArgumentosInvalidosError(
      `${remotas.join(', ')} apunta(n) fuera de localhost: para escribir ahi agregue --confirmar-produccion.`,
    ),
  );
}
