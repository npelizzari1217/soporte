/**
 * Catálogo de zonas horarias — solo la AYUDA VISUAL del combobox de zona
 * operativa del tenant, NUNCA la fuente de validez. La validez la define
 * únicamente `esZonaValida` (`shared/lib/formato-fecha.ts`), que nunca se
 * valida contra este catálogo. Ver ahí el porqué completo.
 *
 * `Intl.supportedValuesOf('timeZone')` da 418 zonas en Node 24.20.0 (medido)
 * y usa el conjunto CANÓNICO de ICU, que para varias regiones difiere del
 * nombre IANA que la app necesita mostrar/buscar — el mismo defecto de clase
 * en más de un lugar, no un caso especial de `America/Argentina/Buenos_Aires`:
 *
 * | Candidato (válido para `esZonaValida`) | ¿Está en `Intl.supportedValuesOf`? |
 * |---|---|
 * | `America/Argentina/Buenos_Aires` (zona por defecto del producto, D8) | NO — ICU devuelve `America/Buenos_Aires` |
 * | `UTC` | NO |
 * | `Asia/Kolkata` | NO — ICU devuelve `Asia/Calcutta` |
 * | `Etc/GMT+5` | NO |
 *
 * Medido corriendo el fixture compartido `shared-fixtures/formato-fecha-paridad.json`
 * (`zonasValidas`) contra `Intl.supportedValuesOf('timeZone')` en Node 24.20.0.
 * El catálogo es ese conjunto nativo UNION estas zonas faltantes, agregadas
 * por NOMBRE fijo — nunca derivadas de `Intl` — porque derivarlas escondería
 * una futura desaparición del catálogo nativo detrás de una lista que se
 * seguiría viendo completa.
 *
 * Excepción declarada: `+05:00` (offset ISO) también es válido para
 * `esZonaValida` pero NO se agrega acá — no es un nombre de zona IANA, es un
 * formato distinto que un catálogo de nombres para buscar/elegir no puede
 * representar razonablemente. `crear-cliente-dialog.test.tsx` documenta y
 * fija con un centinela que ese es el ÚNICO candidato del fixture que queda
 * fuera de este catálogo.
 */
const ZONAS_FALTANTES_EN_INTL: readonly string[] = [
  "America/Argentina/Buenos_Aires",
  "UTC",
  "Asia/Kolkata",
  "Etc/GMT+5",
];

/**
 * Arma el catálogo de zonas horarias para el combobox: `Intl.supportedValuesOf`
 * más las zonas que ese catálogo nativo no trae, sin duplicados y ordenado
 * alfabéticamente para que la búsqueda por texto tenga un orden estable.
 */
export function obtenerCatalogoZonasHorarias(): string[] {
  const zonasIntl = Intl.supportedValuesOf("timeZone");
  const todas = new Set([...zonasIntl, ...ZONAS_FALTANTES_EN_INTL]);
  return Array.from(todas).sort((a, b) => a.localeCompare(b));
}
