/**
 * Códigos de `tipo_operacion` del historial de los certificados de avance
 * (odd/edilicia-obra-externa, S8). Los siembra la migración `20261106130000_certificaciones_avance`.
 */
export const TIPO_OPERACION_CERTIFICADO = {
  EMITIDO: 'CERTIFICADO_EMITIDO',
  ANULADO: 'CERTIFICADO_ANULADO',
} as const;

/** Código de un tipo de operación de certificados. */
export type CodigoOperacionCertificado =
  (typeof TIPO_OPERACION_CERTIFICADO)[keyof typeof TIPO_OPERACION_CERTIFICADO];
