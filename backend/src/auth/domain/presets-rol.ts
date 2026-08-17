/**
 * Presets de rol: el set de celdas de la matriz de permisos que se aplica
 * cuando un ADMINISTRADOR pide "copiar la plantilla del rol X" sobre un
 * usuario (`AplicarPresetPermisosUseCase`, `POST /usuarios/:id/permisos/aplicar-preset`,
 * WU-7.4), o durante `PATCH /usuarios/:id/rol` con `reaplicarPreset: true`
 * (R6).
 *
 * Constante de dominio, NO tabla: los 4 roles del sistema son fijos,
 * sembrados por migración, y no hay ABM de roles (`RolesController` solo
 * expone `GET /roles`). Una tabla `roles_acciones` exigiría migración, seed,
 * modelo Prisma, repositorio y tests para un dato que nadie edita — la
 * constante queda versionada en git, la mejor auditoría posible.
 *
 * SEÑAL PARA REVISAR ESTA DECISIÓN: el día que se pueda crear un rol desde
 * la UI, el preset debe mudarse a tabla.
 *
 * Cada valor DEBE coincidir exactamente con lo que
 * `backfill-matriz-permisos.integration.spec.ts` verifica contra la DB real
 * para ese rol (riesgo G7: preset en TypeScript y backfill en SQL expresan
 * el mismo mapeo dos veces — si divergen, uno de los dos rompe).
 *
 * Ref spec: sdd/matriz-permisos-por-usuario/spec R6, R7, S15.
 * Ref design: ADR-P9.
 */
import { CodigoAccion } from '../../shared/domain/acciones';
import { Result } from '../../shared/domain/result';
import { PresetRolNoDefinidoError } from './errors/auth.errors';

export const PRESETS_ROL: Readonly<Record<string, readonly CodigoAccion[]>> = {
  USUARIO: [
    'TICKETS:ALTAS',
    'TICKETS:COMENTAR',
    'TICKETS:LECTURA',
    'EDILICIA:ALTAS',
    'EDILICIA:LECTURA',
    'COMPRAS:LECTURA',
    'EQUIPOS:LECTURA',
    'KB:LECTURA',
  ],
  COLABORADOR: [
    'TICKETS:ALTAS',
    'TICKETS:COMENTAR',
    'TICKETS:VER_TODOS',
    'TICKETS:LECTURA',
    'EDILICIA:ALTAS',
    'EDILICIA:LECTURA',
    'COMPRAS:ALTAS',
    'COMPRAS:MODIFICACION',
    'COMPRAS:BORRADO',
    'COMPRAS:APROBACION',
    'COMPRAS:LECTURA',
    'EQUIPOS:LECTURA',
    'KB:VER_TODOS',
    'KB:LECTURA',
    'DASHBOARD:LECTURA',
  ],
  TECNICO: [
    'TICKETS:ALTAS',
    'TICKETS:COMENTAR',
    'TICKETS:MODIFICACION',
    'TICKETS:TRANSICIONAR',
    'TICKETS:ASIGNAR',
    'TICKETS:OBSERVAR',
    'TICKETS:VER_TODOS',
    'TICKETS:LECTURA',
    'EDILICIA:ALTAS',
    'EDILICIA:MODIFICACION',
    'EDILICIA:BORRADO',
    'EDILICIA:LECTURA',
    'EQUIPOS:ALTAS',
    'EQUIPOS:MODIFICACION',
    'EQUIPOS:BORRADO',
    'EQUIPOS:LECTURA',
    'KB:ALTAS',
    'KB:MODIFICACION',
    'KB:BORRADO',
    'KB:PUBLICAR',
    'KB:VER_TODOS',
    'KB:LECTURA',
    'DASHBOARD:LECTURA',
    // Desvío documentado (ver backfill-matriz-permisos.integration.spec.ts):
    // el TECNICO retiene el módulo COMPRAS aunque perdió compra:gestionar/
    // aprobar — hoy puede seguir LEYENDO compras (GET solo exige el módulo,
    // no RBAC). "Expandir, no interpretar" preserva ese acceso.
    'COMPRAS:LECTURA',
  ],
  // ADMINISTRADOR bypassea vía resolverScope (R2) — no necesita celdas.
  ADMINISTRADOR: [],
};

/**
 * Resuelve el preset de un rol con fail EXPLÍCITO: si `rolCodigo` no tiene
 * entrada en `PRESETS_ROL` (rol sembrado por migración sin que el código se
 * haya actualizado), NUNCA devuelve un preset vacío en silencio — eso
 * borraría la matriz de cualquiera al que se le aplicara por error. Devuelve
 * `PresetRolNoDefinidoError` (422 en la capa de presentación).
 */
export function obtenerPresetDeRol(
  rolCodigo: string,
): Result<readonly CodigoAccion[], PresetRolNoDefinidoError> {
  const preset = PRESETS_ROL[rolCodigo];
  if (preset === undefined) {
    return Result.fail(new PresetRolNoDefinidoError(rolCodigo));
  }
  return Result.ok(preset);
}
