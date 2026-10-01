import { DomainError } from '../../../shared/domain/result';

/**
 * Errores de dominio de las unidades por número de serie
 * (sdd/repuestos-numero-de-serie, ADR-8). Cada uno extiende `DomainError`,
 * expone un `code` estable y se modela con `Result.fail()`. Todos son 422 en la
 * capa de presentación salvo indicación en contrario; el mapeo HTTP de cada uno
 * lo declara su controller (llega con los work units de interfaz).
 */

/**
 * SerialDuplicadoError — el serial ya lo tiene otra unidad del mismo insumo.
 * La comparación es sobre la forma normalizada y abarca todos los estados,
 * incluida `DESCARTADA`: un serial ocupado sigue ocupado aunque la pieza esté
 * dada de baja.
 * → HTTP 409 en la capa de presentación.
 */
export class SerialDuplicadoError extends DomainError {
  readonly code = 'SERIAL_DUPLICADO';

  constructor(serial: string) {
    super(
      `El número de serie "${serial}" ya está registrado para este insumo (en cualquier estado, incluso descartado).`,
    );
  }
}

/**
 * UnidadNoDisponibleError — la unidad no está en el estado que la operación
 * exige (por ejemplo, salida de una unidad que no está en el depósito, o carga
 * de serial sobre una unidad que no está en el depósito).
 * → HTTP 422 en la capa de presentación.
 */
export class UnidadNoDisponibleError extends DomainError {
  readonly code = 'UNIDAD_NO_DISPONIBLE';

  constructor(unidadId: string, motivo: string) {
    super(`La unidad "${unidadId}" no está disponible para la operación: ${motivo}`);
  }
}

/**
 * UnidadRequeridaError — un insumo con seguimiento por serie exige indicar la
 * unidad sobre la que opera el movimiento.
 * → HTTP 422 en la capa de presentación.
 */
export class UnidadRequeridaError extends DomainError {
  readonly code = 'UNIDAD_REQUERIDA';

  constructor(insumoId: string) {
    super(`El insumo "${insumoId}" se sigue por número de serie: hay que indicar la unidad.`);
  }
}

/**
 * UnidadNoAdmitidaError — se indicó una unidad sobre un insumo sin seguimiento
 * por serie, o una unidad que pertenece a otro insumo.
 * → HTTP 422 en la capa de presentación.
 */
export class UnidadNoAdmitidaError extends DomainError {
  readonly code = 'UNIDAD_NO_ADMITIDA';

  constructor(insumoId: string) {
    super(
      `El insumo "${insumoId}" no admite esa unidad: no se sigue por número de serie o la unidad es de otro insumo.`,
    );
  }
}

/**
 * SerialesNoCoincidenError — la cantidad de seriales recibidos no coincide con
 * la cantidad de piezas de la operación.
 * → HTTP 422 en la capa de presentación.
 */
export class SerialesNoCoincidenError extends DomainError {
  readonly code = 'SERIALES_NO_COINCIDEN';

  constructor(esperados: number, recibidos: number) {
    super(
      `La operación es de ${esperados} pieza(s) pero se recibieron ${recibidos} número(s) de serie.`,
    );
  }
}

/**
 * SerialRequeridoError — falta un número de serie con contenido donde la
 * operación lo exige (cargar, corregir, instalar una unidad). Un serial que
 * queda vacío tras normalizarlo cuenta como ausente.
 * → HTTP 422 en la capa de presentación.
 */
export class SerialRequeridoError extends DomainError {
  readonly code = 'SERIAL_REQUERIDO';

  constructor(detalle: string) {
    super(`Hace falta un número de serie: ${detalle}`);
  }
}

/**
 * CantidadNoEnteraError — un insumo con seguimiento por serie solo admite
 * cantidades enteras de piezas, una unidad por pieza.
 * → HTTP 422 en la capa de presentación.
 */
export class CantidadNoEnteraError extends DomainError {
  readonly code = 'CANTIDAD_NO_ENTERA';

  constructor(cantidad: number) {
    super(
      `La cantidad ${cantidad} no es válida: un insumo con número de serie admite solo enteros.`,
    );
  }
}

/**
 * SeguimientoNoModificableError — el cambio de `seguimiento` (o la operación
 * que lo presupone) no se puede hacer en el estado actual del insumo. El
 * `motivo` dice cuál de las reglas lo impide.
 * → HTTP 422 en la capa de presentación.
 */
export class SeguimientoNoModificableError extends DomainError {
  readonly code = 'SEGUIMIENTO_NO_MODIFICABLE';

  constructor(motivo: string) {
    super(`No se puede cambiar el seguimiento del insumo: ${motivo}`);
  }
}

/**
 * MotivoRecuperacionRequeridoError — recuperar una pieza descartada exige un
 * motivo con contenido, igual que el ajuste que la dio de baja.
 * → HTTP 422 en la capa de presentación.
 */
export class MotivoRecuperacionRequeridoError extends DomainError {
  readonly code = 'MOTIVO_RECUPERACION_REQUERIDO';

  constructor(unidadId: string) {
    super(`Recuperar la unidad "${unidadId}" exige un motivo.`);
  }
}

/**
 * MotivoCorreccionSerialInvalidoError — corregir el serial de una unidad exige un
 * motivo con contenido y de hasta 500 caracteres: el evento auditado es el único
 * registro de por qué cambió.
 * → HTTP 422 en la capa de presentación.
 */
export class MotivoCorreccionSerialInvalidoError extends DomainError {
  readonly code = 'MOTIVO_CORRECCION_SERIAL_INVALIDO';

  constructor(unidadId: string, detalle: string) {
    super(`Corregir el serial de la unidad "${unidadId}" ${detalle}`);
  }
}

/**
 * UnidadNoEncontradaError — el `id` de unidad no existe o no pertenece al
 * insumo de la URL.
 * → HTTP 404 en la capa de presentación.
 */
export class UnidadNoEncontradaError extends DomainError {
  readonly code = 'UNIDAD_NO_ENCONTRADA';

  constructor(id: string) {
    super(`Unidad con id "${id}" no encontrada para este insumo.`);
  }
}

/**
 * UnidadDelComponenteNoDisponibleError — al reactivar un componente, su unidad
 * ya no está descartada por ese componente (la recuperaron o la movieron), así
 * que `reinstalar` no puede devolverla al equipo.
 *
 * Comparte NOMBRE y `code` con el error homónimo de
 * `src/equipos/domain/errors/equipos.errors.ts`, y eso es DELIBERADO: es la misma
 * condición de negocio y el cliente debe ver el mismo código. Está DUPLICADO y no
 * importado porque `equipos` ya importa puertos de `insumos`: importar en sentido
 * inverso cerraría un ciclo entre los dos módulos (mismo criterio que
 * `ModeloEquipoInexistenteError`). El caso de uso de reactivar, en `equipos`, la
 * traduce por `code`.
 * → HTTP 422 en la capa de presentación.
 */
export class UnidadDelComponenteNoDisponibleError extends DomainError {
  readonly code = 'UNIDAD_DEL_COMPONENTE_NO_DISPONIBLE';

  constructor(componenteId: string) {
    super(
      `La unidad del componente "${componenteId}" ya no está disponible para reinstalarla: su último movimiento no fue el descarte de este componente.`,
    );
  }
}
