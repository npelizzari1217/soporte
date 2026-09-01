/**
 * zona-horaria.ts — Value Object `ZonaHoraria` y sus primitivas de conversión
 * (D1, D2, D6 de `openspec/changes/zona-horaria-por-tenant/design.md`).
 *
 * `domain/` puro: solo depende de `Intl`, que es una API de la plataforma, no
 * de infraestructura ni de un framework. No importa `AsyncLocalStorage` ni
 * `TenantContext` — el dominio recibe la zona ya resuelta, nunca la consulta
 * (D6).
 *
 * ## Validación: por construcción, nunca por catálogo
 *
 * `esZonaValida` intenta construir un `Intl.DateTimeFormat` con la zona
 * candidata y captura el `RangeError`. NUNCA valida contra
 * `Intl.supportedValuesOf('timeZone')`: ese catálogo tiene 418 zonas en
 * Node v24.20.0 y **no incluye `America/Argentina/Buenos_Aires`** — la zona
 * por defecto del propio proyecto —, aunque sí construye un formateador
 * válido para ella. Un validador sobre el catálogo rechazaría la zona por
 * defecto de este sistema.
 *
 * El schema Zod que valide la zona en `frontend/src/features/clientes/schemas.ts`
 * DEBE aplicar exactamente esta misma regla (verificado 2026-09-01 con
 * `rg -i "zona|timeZone" frontend/src/features/clientes/schemas.ts`: sin
 * coincidencias — ese archivo existe pero ningún schema valida zona
 * horaria todavía; ver `openspec/changes/zona-horaria-por-tenant/tasks.md`
 * para qué work unit lo agrega). El mecanismo anti-divergencia entre las
 * dos puntas es el mismo fixture que usa este spec
 * (`shared-fixtures/formato-fecha-paridad.json`), leído también por
 * `frontend/src/shared/lib/fixture-paridad.test.ts` (verificado 2026-09-01
 * con `rg -i "esZonaValida|valida" frontend/src/shared/lib/fixture-paridad.test.ts`:
 * ese test hoy solo confirma que el fixture trae los bloques esperados, no
 * llama a ningún validador de zonas).
 */

/**
 * Tope de largo del VO. Está pensado para espejar una futura columna
 * `clientes.zona_horaria VARCHAR(64)` (ver `openspec/changes/zona-horaria-por-tenant/tasks.md`
 * para qué work unit la agrega) con margen sobre el ID IANA más largo
 * (`America/Argentina/ComodRivadavia`, 32 caracteres — contado con
 * `node -e 'console.log("America/Argentina/ComodRivadavia".length)'`). El
 * DTO de `clientes` y el frontend deberán importar esta constante en vez de
 * repetir el número — mismo criterio que `CLIENTE_CUIT_MAX_LENGTH`
 * (`clientes/domain/entities/cliente.entity.ts`; verificado 2026-09-01 con
 * `rg -rn "ZONA_HORARIA_MAX_LENGTH" backend/src frontend/src --glob '!*zona-horaria*'`:
 * sin resultados — ningún caller la importa todavía).
 */
export const ZONA_HORARIA_MAX_LENGTH = 64;

/**
 * Valida un candidato de zona horaria intentando construir un
 * `Intl.DateTimeFormat` con ese valor. Es la ÚNICA regla, idéntica en
 * backend y frontend — ver la nota a nivel de módulo sobre por qué nunca se
 * valida contra `Intl.supportedValuesOf('timeZone')`.
 *
 * ADVERTENCIA para quien copie esta función al frontend (WU-2c): "por
 * construcción" acepta más que nombres `Región/Ciudad` del catálogo tz —
 * también offsets numéricos (`"+05:00"`) y alias como `"UTC"` o
 * `"Etc/GMT+5"`, porque `Intl.DateTimeFormat` los admite igual. Si la otra
 * punta valida con un regex de forma `Región/Ciudad` en vez de copiar este
 * mismo mecanismo, las dos puntas divergen sobre esos candidatos —
 * `shared-fixtures/formato-fecha-paridad.json` incluye esos casos en
 * `zonasValidas` justamente para que ese regex, si alguien lo escribe, se
 * note en el fixture compartido antes que en producción.
 */
export function esZonaValida(candidata: string): boolean {
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: candidata });
    return true;
  } catch {
    return false;
  }
}

function validar(raw: string, clienteId?: string): void {
  const sufijo = clienteId ? ` (cliente ${clienteId})` : '';
  if (raw.length > ZONA_HORARIA_MAX_LENGTH) {
    throw new Error(`ZonaHoraria: "${raw}" excede ${ZONA_HORARIA_MAX_LENGTH} caracteres${sufijo}.`);
  }
  if (!esZonaValida(raw)) {
    // No dice "IANA": esZonaValida también acepta offsets numéricos y alias
    // (ver la advertencia de esZonaValida), así que "válida" es la palabra
    // exacta de lo que se comprobó, ni más ni menos.
    throw new Error(`ZonaHoraria: "${raw}" no es una zona horaria válida${sufijo}.`);
  }
}

/**
 * VO de la zona operativa de un tenant. Inmutable y autovalidado: no existe
 * forma de construir una instancia con un valor inválido.
 */
export class ZonaHoraria {
  private constructor(private readonly _valor: string) {}

  /**
   * Construye el VO desde un candidato nuevo (alta o edición). Lanza si el
   * candidato no pasa `esZonaValida` o excede el tope de largo — es
   * precondición del caller, no un `Result`: todo candidato externo pasa
   * antes por el borde (DTO/Zod), así que llegar acá inválido es un error de
   * contrato, no una desviación de negocio.
   */
  static crear(raw: string): ZonaHoraria {
    validar(raw);
    return new ZonaHoraria(raw);
  }

  /**
   * Reconstruye el VO desde una fila persistida. A diferencia de
   * `validarLargos` (`cliente.entity.ts`), que exime a `reconstitute()`, ACÁ
   * sí se valida: la columna nace con backfill válido (D8) y todo escritor
   * pasa por este mismo VO, así que ninguna fila legítima puede tener una
   * zona inválida. Fallar acá, nombrando el tenant, es preferible a un error
   * opaco de `Intl` en cada render.
   *
   * @param clienteId  Se incluye en el mensaje de error para ubicar la fila
   *   ofensora sin tener que reproducir el fallo con un debugger.
   */
  static desdePersistencia(raw: string, clienteId?: string): ZonaHoraria {
    validar(raw, clienteId);
    return new ZonaHoraria(raw);
  }

  /** Valor crudo, tal como se construyó — ver la advertencia de `equals()` sobre por qué no se normaliza. */
  get valor(): string {
    return this._valor;
  }

  /**
   * Comparación por valor, no por referencia — pero por STRING crudo, no por
   * zona semánticamente equivalente: `crear('UTC').equals(crear('utc'))` y
   * `crear('Asia/Kolkata').equals(crear('Asia/Calcutta'))` dan `false`,
   * aunque `Intl` resuelva las dos formas al mismo instante real.
   *
   * DELIBERADAMENTE no se normaliza vía
   * `Intl.DateTimeFormat(...).resolvedOptions().timeZone`: medido en Node
   * v24.20.0, esa normalización resuelve **la propia zona por defecto del
   * proyecto** a un alias distinto —
   * `resolvedOptions().timeZone` de `'America/Argentina/Buenos_Aires'` da
   * `'America/Buenos_Aires'` — así que normalizar (o, peor, rechazar la
   * forma no canónica en `validar()`) reintroduciría exactamente la trampa
   * que el centinela anti-catálogo de este módulo existe para evitar: la
   * zona que el propio backfill de D8 escribe dejaría de pasar por su forma
   * tal cual está escrita.
   *
   * Sin ningún escritor real de candidatos con case distinto o alias
   * (verificado 2026-09-01 con `rg -rn "ZonaHoraria\.(crear|desdePersistencia)"
   * backend/src --glob '!*zona-horaria*'`: sin resultados — el único caller
   * hoy es este mismo spec), es una limitación documentada, no un bug con
   * síntoma. Si un futuro work unit necesita comparar zonas por
   * equivalencia semántica en vez de por string, es una decisión de diseño
   * nueva — no algo para resolver acá sin abrir esa discusión.
   */
  equals(otra: ZonaHoraria): boolean {
    return this._valor === otra._valor;
  }
}

/** Claves que `partesEnZona` garantiza en el resultado — ver sus opciones de `Intl.DateTimeFormat`. */
type ClavePartesEnZona = 'year' | 'month' | 'day' | 'hour' | 'minute' | 'second';

/**
 * Lee los componentes de un instante en una zona horaria, usando
 * `formatToParts` — nunca `format()`, para no depender de la puntuación del
 * locale (mismo criterio que `frontend/src/shared/lib/formato-fecha.ts`).
 *
 * El tipo de retorno declara exactamente las claves que las opciones del
 * formateador piden (`year`/`month`/`day`/`hour`/`minute`/`second`), no un
 * `Record<string, string>` genérico: se arma explícitamente en vez de un
 * `Object.fromEntries` sobre todas las partes, y si `Intl` alguna vez no
 * devolviera una de esas partes, lanza acá — nombrando qué clave faltó y
 * para qué zona — en vez de dejar que un `NaN` silencioso llegue a
 * `Date.UTC` río abajo (verificado 2026-09-01 con `rg -n "partesEnZona"
 * backend/src`: el único consumidor de producción es `hoyEnZona`, en este
 * mismo archivo).
 */
export function partesEnZona(zona: ZonaHoraria, instante: Date): Record<ClavePartesEnZona, string> {
  const formateador = new Intl.DateTimeFormat('en-CA', {
    timeZone: zona.valor,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const partes = formateador.formatToParts(instante);
  const obtener = (clave: ClavePartesEnZona): string => {
    const parte = partes.find((p) => p.type === clave);
    if (!parte) {
      throw new Error(
        `partesEnZona: Intl.DateTimeFormat no devolvió la parte "${clave}" para la zona "${zona.valor}".`,
      );
    }
    return parte.value;
  };
  return {
    year: obtener('year'),
    month: obtener('month'),
    day: obtener('day'),
    hour: obtener('hour'),
    minute: obtener('minute'),
    second: obtener('second'),
  };
}

/**
 * Día calendario de `zona` a las `ahora`, truncado a medianoche UTC — mismo
 * criterio que `soloFecha()` (`compras/domain/services/fecha-argentina.ts`):
 * el resultado solo importa año/mes/día, nunca la hora. Es la primitiva que
 * reemplaza a `hoyArgentina()` (D6, mismo archivo): el dominio de compras
 * recibe este valor ya calculado, nunca la zona ni el reloj — ver
 * `openspec/changes/zona-horaria-por-tenant/tasks.md` para qué work unit
 * hace el reemplazo.
 */
export function hoyEnZona(zona: ZonaHoraria, ahora: Date): Date {
  const partes = partesEnZona(zona, ahora);
  return new Date(Date.UTC(Number(partes.year), Number(partes.month) - 1, Number(partes.day)));
}
