/**
 * payloadDeTest — factory de un `JwtPayload` completo y válido para fixtures
 * de test (G6, WU-7.1, sdd/matriz-permisos-por-usuario).
 *
 * Por qué existe: cada spec que arma un `JwtPayload` a mano se desactualiza
 * cada vez que el payload gana un campo nuevo — agregar `v` (ADR-P7) rompió
 * la forma de más de veinte fixtures de golpe. Un solo punto de verdad evita
 * que el próximo campo nuevo repita el problema, y separa el "ruido" de
 * fixture del diff de lógica real (WU-7.1, sub-commit propio).
 *
 * `overrides` pisa cualquier campo default. Los valores por default
 * representan el caso más neutro (ROOT sin cliente activo, sin celdas) —
 * cada test ajusta lo que le importa vía `overrides`, igual que con los
 * `buildPayload(overrides)` locales que reemplaza.
 */
import { JwtPayload, VERSION_PAYLOAD_JWT } from '../domain/ports/i-token.service';

export function payloadDeTest(overrides: Partial<JwtPayload> = {}): JwtPayload {
  return {
    v: VERSION_PAYLOAD_JWT,
    sub: 'usuario-test',
    cliente_id: null,
    rol: null,
    permisos: [],
    is_global_admin: false,
    cliente_nombre: null,
    membresias: [],
    modulos: [],
    nombre: 'Test',
    apellido: 'Usuario',
    ...overrides,
  };
}
