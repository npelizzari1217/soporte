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
 *
 * El acceso a tickets NO sale de estas celdas (odd/tasks/permisos-por-tipo-ticket.md, T9a, L50.4):
 * lo da la plantilla por tipo de `PLANTILLAS_POR_TIPO_ROL`. Por eso ningún preset trae las celdas
 * que reemplazan los permisos por tipo (`TICKETS:*` y `EDILICIA:LECTURA|ALTAS|MODIFICACION`), que
 * desde T9b ni siquiera están en el catálogo; `EDILICIA:BORRADO` (desvincular compra) sigue siendo
 * permiso del módulo (L50.2).
 */
import { CodigoAccion } from '../../shared/domain/acciones';
import { Result } from '../../shared/domain/result';
import { AccionTipoTicket, PlantillaPorTipo } from '../../tickets/domain/permisos-tipo-ticket';
import { PresetRolNoDefinidoError } from './errors/auth.errors';

export const PRESETS_ROL: Readonly<Record<string, readonly CodigoAccion[]>> = {
  USUARIO: ['COMPRAS:LECTURA', 'EQUIPOS:LECTURA', 'KB:LECTURA'],
  COLABORADOR: [
    'COMPRAS:ALTAS',
    'COMPRAS:MODIFICACION',
    'COMPRAS:BORRADO',
    'COMPRAS:APROBACION',
    'COMPRAS:LECTURA',
    'EQUIPOS:LECTURA',
    'KB:VER_TODOS',
    'KB:LECTURA',
    'DASHBOARD:LECTURA',
    'CSAT:LECTURA',
    // preventivo-edicion-y-permisos WU-1 (ADR-3,
    // openspec/changes/preventivo-edicion-y-permisos/design.md): COLABORADOR
    // administra el módulo de mantenimiento preventivo (ve, crea, edita y da
    // de baja planes). Swap de permisos: antes las llevaba TECNICO.
    'PREVENTIVO:LECTURA',
    'PREVENTIVO:ALTAS',
    'PREVENTIVO:MODIFICACION',
    'PREVENTIVO:BORRADO',
  ],
  TECNICO: [
    // Desvincular una compra de una reparación: permiso del módulo, no por tipo (L21, L50.2).
    'EDILICIA:BORRADO',
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
    'CSAT:LECTURA',
    // Desvío documentado (ver backfill-matriz-permisos.integration.spec.ts):
    // el TECNICO retiene el módulo COMPRAS aunque perdió compra:gestionar/
    // aprobar — hoy puede seguir LEYENDO compras (GET solo exige el módulo,
    // no RBAC). "Expandir, no interpretar" preserva ese acceso.
    'COMPRAS:LECTURA',
  ],
  // ADMINISTRADOR bypassea vía resolverScope (R2) — no necesita celdas.
  ADMINISTRADOR: [],
};

/** USUARIO sobre un tipo de ticket: ver, crear y comentar los suyos, con impresión. */
const USUARIO_EN_TIPO: readonly AccionTipoTicket[] = ['LECTURA', 'ALTAS', 'COMENTAR', 'IMPRESION'];

/** Lo del USUARIO más Ver todos: COLABORADOR supervisa sin operar los tickets. */
const COLABORADOR_EN_TIPO: readonly AccionTipoTicket[] = [
  'LECTURA',
  'VER_TODOS',
  'ALTAS',
  'COMENTAR',
  'IMPRESION',
];

/** TECNICO opera los tickets: todo salvo Borrar, que solo se concede desde la grilla (S8). */
const TECNICO_EN_TIPO: readonly AccionTipoTicket[] = [
  'LECTURA',
  'VER_TODOS',
  'ALTAS',
  'MODIFICACION',
  'TRANSICIONAR',
  'ASIGNAR',
  'COMENTAR',
  'OBSERVAR',
  'IMPRESION',
];

/**
 * Plantillas por tipo de ticket de cada rol (odd/tasks/permisos-por-tipo-ticket.md, T9a, L50.4):
 * las acciones que el alta de usuario, el cambio de rol con reaplicar y "Aplicar plantilla del rol"
 * escriben sobre cada tipo abierto del tenant, según el módulo del tipo. Un tipo cerrado no recibe
 * filas (`tiposAbiertosParaPlantilla`, S4).
 *
 * Reemplazan a la traducción de L11 de las celdas del preset y dan exactamente lo mismo que daba
 * (S7): `presets-rol.spec.ts` lo compara contra las celdas anteriores a T9a. Por eso cada rol da
 * hoy lo mismo en todos los módulos; se declaran por módulo para poder separarlos.
 *
 * ADMINISTRADOR opera todos los tipos sin filas (`permisosPorTipo = null`): su plantilla es vacía.
 */
export const PLANTILLAS_POR_TIPO_ROL: Readonly<Record<string, PlantillaPorTipo>> = {
  USUARIO: {
    TICKETS: USUARIO_EN_TIPO,
    COMPRAS: USUARIO_EN_TIPO,
    EDILICIA: USUARIO_EN_TIPO,
    EQUIPOS: USUARIO_EN_TIPO,
  },
  COLABORADOR: {
    TICKETS: COLABORADOR_EN_TIPO,
    COMPRAS: COLABORADOR_EN_TIPO,
    EDILICIA: COLABORADOR_EN_TIPO,
    EQUIPOS: COLABORADOR_EN_TIPO,
  },
  TECNICO: {
    TICKETS: TECNICO_EN_TIPO,
    COMPRAS: TECNICO_EN_TIPO,
    EDILICIA: TECNICO_EN_TIPO,
    EQUIPOS: TECNICO_EN_TIPO,
  },
  ADMINISTRADOR: { TICKETS: [], COMPRAS: [], EDILICIA: [], EQUIPOS: [] },
};

/** Plantilla completa de un rol: las celdas de la matriz master y las acciones por tipo. */
export interface PresetDeRol {
  celdas: readonly CodigoAccion[];
  porTipo: PlantillaPorTipo;
}

/**
 * Resuelve el preset de un rol con fail EXPLÍCITO: si `rolCodigo` no tiene
 * entrada en `PRESETS_ROL` o en `PLANTILLAS_POR_TIPO_ROL` (rol sembrado por
 * migración sin que el código se haya actualizado), NUNCA devuelve un preset
 * vacío en silencio — eso borraría la matriz de cualquiera al que se le
 * aplicara por error. Devuelve `PresetRolNoDefinidoError` (422 en la capa de
 * presentación).
 *
 * @param rolCodigo Código del rol.
 * @returns Las celdas y la plantilla por tipo del rol, o el error si no están definidas.
 */
export function obtenerPresetDeRol(
  rolCodigo: string,
): Result<PresetDeRol, PresetRolNoDefinidoError> {
  const celdas = PRESETS_ROL[rolCodigo];
  const porTipo = PLANTILLAS_POR_TIPO_ROL[rolCodigo];
  if (celdas === undefined || porTipo === undefined) {
    return Result.fail(new PresetRolNoDefinidoError(rolCodigo));
  }
  return Result.ok({ celdas, porTipo });
}
