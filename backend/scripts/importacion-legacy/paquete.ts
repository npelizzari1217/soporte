/**
 * paquete.ts — formato `soporte-importacion-legacy/v1` y su validación.
 *
 * El paquete lo produce un extractor externo (fuera de este repo) a partir del
 * sistema legacy, un paquete por cliente. Este módulo es PURO: no toca la base
 * ni el filesystem. Valida la forma y las referencias internas (usuarios,
 * ciclos, autores) ANTES de que el cargador lea o escriba nada.
 */
import { DomainError, Result } from '../../src/shared/domain/result';

export const FORMATO_PAQUETE = 'soporte-importacion-legacy/v1';

export const ROLES_PAQUETE = ['USUARIO', 'COLABORADOR', 'TECNICO', 'ADMINISTRADOR'] as const;
export const TIPOS_PAQUETE = ['SOPORTE', 'EDILICIA', 'MANTENIMIENTO'] as const;
export const ESTADOS_PAQUETE = ['NUEVO', 'ASIGNADO', 'EN_PROCESO', 'CERRADO'] as const;

/** El extractor emite enteros; se acepta también string y se compara por `String(id)`. */
export type LegacyId = number | string;

export interface CicloPaquete {
  legacyId: LegacyId;
  nombre: string;
  fechaInicio: string;
  fechaFin: string;
}

export interface UsuarioPaquete {
  legacyId: LegacyId;
  email: string;
  emailOriginalValido: boolean;
  nombre: string;
  /** Opcional: los paquetes anteriores traian el nombre completo en `nombre`. */
  apellido?: string;
  rol: (typeof ROLES_PAQUETE)[number];
}

export interface ComentarioPaquete {
  legacyId: LegacyId;
  autorLegacyId: LegacyId;
  fecha: string;
  texto: string;
}

export interface TicketPaquete {
  legacyId: LegacyId;
  numero: string;
  titulo: string;
  descripcion: string | null;
  tipoCodigo: (typeof TIPOS_PAQUETE)[number];
  estadoCodigo: (typeof ESTADOS_PAQUETE)[number];
  estadoLegacy: string;
  solicitanteLegacyId: LegacyId;
  asignadoLegacyId: LegacyId | null;
  cicloLegacyId: LegacyId | null;
  prioridadNombre: string;
  fechaAlta: string;
  fechaCierre: string | null;
  comentarioAdicional: string | null;
  comentarios: ComentarioPaquete[];
}

export interface PaqueteLegacy {
  formato: typeof FORMATO_PAQUETE;
  clienteLegacyId: LegacyId;
  alertas: string[];
  ciclos: CicloPaquete[];
  usuarios: UsuarioPaquete[];
  tickets: TicketPaquete[];
}

/** El paquete no cumple el formato; `errores` lista cada problema con su ruta. */
export class PaqueteInvalidoError extends DomainError {
  readonly code = 'PAQUETE_INVALIDO';
  constructor(readonly errores: string[]) {
    super(`El paquete no es valido (${errores.length} problema(s)).`);
  }
}

const FECHA_DIA = /^\d{4}-\d{2}-\d{2}$/;
/** ISO con offset explícito: sin offset la hora sería ambigua según el huso de la máquina. */
const FECHA_HORA_ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;
const NUMERO_ANT = /^ANT-\d+$/;
/** Largo de `tickets.numero` (VarChar(20)) y `tickets.titulo` (VarChar(255)). */
const LARGO_NUMERO = 20;
const LARGO_TITULO = 255;

type Obj = Record<string, unknown>;

const esObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const esId = (v: unknown): v is LegacyId =>
  (typeof v === 'number' && Number.isInteger(v)) || (typeof v === 'string' && v.length > 0);
const esTexto = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;
const esFechaHora = (v: unknown): v is string =>
  typeof v === 'string' && FECHA_HORA_ISO.test(v) && !Number.isNaN(Date.parse(v));

/** Convierte `YYYY-MM-DD` al `Date` que Prisma espera para una columna `@db.Date` (medianoche UTC). */
export function fechaDia(valor: string): Date {
  return new Date(`${valor}T00:00:00.000Z`);
}

function esFechaDia(v: unknown): v is string {
  return typeof v === 'string' && FECHA_DIA.test(v) && fechaDia(v).toISOString().startsWith(v);
}

/**
 * Valida la forma completa del paquete y sus referencias internas. Acumula
 * TODOS los problemas en vez de cortar en el primero: el operador corrige el
 * extractor una sola vez.
 */
export function validarPaquete(crudo: unknown): Result<PaqueteLegacy, PaqueteInvalidoError> {
  const errores: string[] = [];
  const exigir = (ok: boolean, mensaje: string) => {
    if (!ok) errores.push(mensaje);
  };

  if (!esObj(crudo)) {
    return Result.fail(new PaqueteInvalidoError(['el paquete no es un objeto JSON']));
  }
  if (crudo.formato !== FORMATO_PAQUETE) {
    return Result.fail(
      new PaqueteInvalidoError([`formato desconocido: ${JSON.stringify(crudo.formato)}`]),
    );
  }
  exigir(esId(crudo.clienteLegacyId), 'clienteLegacyId: falta o no es un id');
  exigir(
    Array.isArray(crudo.alertas) && crudo.alertas.every((a) => typeof a === 'string'),
    'alertas: debe ser una lista de textos',
  );
  for (const campo of ['ciclos', 'usuarios', 'tickets'] as const) {
    exigir(Array.isArray(crudo[campo]), `${campo}: debe ser una lista`);
  }
  if (errores.length > 0) return Result.fail(new PaqueteInvalidoError(errores));

  const ciclos = crudo.ciclos as unknown[];
  const usuarios = crudo.usuarios as unknown[];
  const tickets = crudo.tickets as unknown[];
  const idsCiclo = new Set<string>();
  const idsUsuario = new Set<string>();
  const emails = new Set<string>();
  const numeros = new Set<string>();

  const unico = (vistos: Set<string>, valor: string, ruta: string) => {
    exigir(!vistos.has(valor), `${ruta}: repetido`);
    vistos.add(valor);
  };
  const nuloOTexto = (v: unknown, ruta: string) =>
    exigir(v === null || typeof v === 'string', `${ruta}: tipo invalido`);
  const exigirUsuario = (id: unknown, ruta: string) =>
    exigir(
      esId(id) && idsUsuario.has(String(id)),
      `${ruta}: no referencia a un usuario del paquete`,
    );

  ciclos.forEach((c, i) => {
    const r = `ciclos[${i}]`;
    if (!esObj(c)) return errores.push(`${r}: no es un objeto`);
    exigir(esId(c.legacyId), `${r}.legacyId: falta o no es un id`);
    exigir(esTexto(c.nombre), `${r}.nombre: vacio`);
    exigir(esFechaDia(c.fechaInicio), `${r}.fechaInicio: se espera YYYY-MM-DD`);
    exigir(esFechaDia(c.fechaFin), `${r}.fechaFin: se espera YYYY-MM-DD`);
    if (esFechaDia(c.fechaInicio) && esFechaDia(c.fechaFin)) {
      exigir(c.fechaFin > c.fechaInicio, `${r}: fechaFin debe ser posterior a fechaInicio`);
    }
    if (esId(c.legacyId)) unico(idsCiclo, String(c.legacyId), `${r}.legacyId`);
  });

  usuarios.forEach((u, i) => {
    const r = `usuarios[${i}]`;
    if (!esObj(u)) return errores.push(`${r}: no es un objeto`);
    exigir(esId(u.legacyId), `${r}.legacyId: falta o no es un id`);
    exigir(esTexto(u.email) && u.email.includes('@'), `${r}.email: invalido`);
    exigir(typeof u.emailOriginalValido === 'boolean', `${r}.emailOriginalValido: no es booleano`);
    exigir(esTexto(u.nombre), `${r}.nombre: vacio`);
    exigir(
      u.apellido === undefined || typeof u.apellido === 'string',
      `${r}.apellido: no es texto`,
    );
    exigir(ROLES_PAQUETE.includes(u.rol as never), `${r}.rol: desconocido`);
    if (esId(u.legacyId)) unico(idsUsuario, String(u.legacyId), `${r}.legacyId`);
    if (esTexto(u.email)) unico(emails, u.email.trim().toLowerCase(), `${r}.email`);
  });

  tickets.forEach((t, i) => {
    const r = `tickets[${i}]`;
    if (!esObj(t)) return errores.push(`${r}: no es un objeto`);
    exigir(esId(t.legacyId), `${r}.legacyId: falta o no es un id`);
    const numeroOk =
      typeof t.numero === 'string' && NUMERO_ANT.test(t.numero) && t.numero.length <= LARGO_NUMERO;
    exigir(numeroOk, `${r}.numero: se espera ANT-<n> de hasta ${LARGO_NUMERO} caracteres`);
    if (numeroOk) unico(numeros, t.numero as string, `${r}.numero`);
    exigir(
      esTexto(t.titulo) && t.titulo.length <= LARGO_TITULO,
      `${r}.titulo: vacio o de mas de ${LARGO_TITULO} caracteres`,
    );
    nuloOTexto(t.descripcion, `${r}.descripcion`);
    exigir(TIPOS_PAQUETE.includes(t.tipoCodigo as never), `${r}.tipoCodigo: desconocido`);
    exigir(ESTADOS_PAQUETE.includes(t.estadoCodigo as never), `${r}.estadoCodigo: desconocido`);
    exigir(typeof t.estadoLegacy === 'string', `${r}.estadoLegacy: tipo invalido`);
    exigirUsuario(t.solicitanteLegacyId, `${r}.solicitanteLegacyId`);
    if (t.asignadoLegacyId !== null) exigirUsuario(t.asignadoLegacyId, `${r}.asignadoLegacyId`);
    if (t.cicloLegacyId !== null) {
      exigir(
        esId(t.cicloLegacyId) && idsCiclo.has(String(t.cicloLegacyId)),
        `${r}.cicloLegacyId: no referencia a un ciclo del paquete`,
      );
    }
    exigir(esTexto(t.prioridadNombre), `${r}.prioridadNombre: vacio`);
    exigir(esFechaHora(t.fechaAlta), `${r}.fechaAlta: se espera ISO con offset`);
    exigir(
      t.fechaCierre === null || esFechaHora(t.fechaCierre),
      `${r}.fechaCierre: se espera ISO con offset o null`,
    );
    nuloOTexto(t.comentarioAdicional, `${r}.comentarioAdicional`);
    if (!Array.isArray(t.comentarios)) return errores.push(`${r}.comentarios: debe ser una lista`);
    t.comentarios.forEach((c, j) => {
      const rc = `${r}.comentarios[${j}]`;
      if (!esObj(c)) return errores.push(`${rc}: no es un objeto`);
      exigir(esId(c.legacyId), `${rc}.legacyId: falta o no es un id`);
      exigirUsuario(c.autorLegacyId, `${rc}.autorLegacyId`);
      exigir(esFechaHora(c.fecha), `${rc}.fecha: se espera ISO con offset`);
      exigir(esTexto(c.texto), `${rc}.texto: vacio`);
    });
  });

  if (errores.length > 0) return Result.fail(new PaqueteInvalidoError(errores));
  return Result.ok(crudo as unknown as PaqueteLegacy);
}
