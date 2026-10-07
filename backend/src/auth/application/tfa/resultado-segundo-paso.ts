import { Result } from '../../../shared/domain/result';
import { SegundoPasoRechazadoError } from '../../domain/errors/tfa.errors';

/** Resultado comun de verificar o confirmar un segundo paso: exito sin valor o rechazo generico. */
export type ResultadoSegundoPaso = Result<void, SegundoPasoRechazadoError>;
