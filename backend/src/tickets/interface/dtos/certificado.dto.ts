import {
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';
import {
  CertificadoAvanceEntity,
  MOTIVO_ANULACION_MAX_LENGTH,
} from '../../domain/entities/certificado-avance.entity';
import { NombreUsuario } from './tarea-ticket.dto';

/**
 * DTOs de los certificados de avance (odd/edilicia-obra-externa, T3b). El `ValidationPipe` global
 * (`whitelist`, `transform`) los aplica.
 */

/** Body de `POST /tickets/:id/certificados`: al menos una tarea, sin repetir. */
export class EmitirCertificadoBodyDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  tareaIds!: string[];
}

/** Body de `POST /tickets/:id/certificados/:certificadoId/anular`: motivo visible, hasta 2000. */
export class AnularCertificadoBodyDto {
  @IsString()
  @Matches(/\S/, { message: 'motivo no puede estar vacío' })
  @MaxLength(MOTIVO_ANULACION_MAX_LENGTH)
  motivo!: string;
}

/** Una tarea del certificado, con el peso COPIADO al emitir (S8). */
export interface TareaDeCertificadoResponseDto {
  tareaId: string;
  /** Descripción vigente de la tarea, o `null` si no se pudo resolver. */
  descripcion: string | null;
  peso: number;
}

export interface CertificadoResponseDto {
  id: string;
  ticketId: string;
  numero: number;
  porcentaje: number;
  vigente: boolean;
  emitidoPorId: string;
  emitidoPorNombre: string | null;
  emitidoPorApellido: string | null;
  emitidoEn: string;
  anuladoEn: string | null;
  anuladoPorId: string | null;
  anuladoPorNombre: string | null;
  anuladoPorApellido: string | null;
  motivoAnulacion: string | null;
  tareas: TareaDeCertificadoResponseDto[];
}

/** Ids de usuario a resolver para mostrar los certificados. */
export function usuariosDeCertificados(certificados: readonly CertificadoAvanceEntity[]): string[] {
  const ids = new Set<string>();
  for (const c of certificados) {
    ids.add(c.emitidoPorId);
    if (c.anuladoPorId) ids.add(c.anuladoPorId);
  }
  return [...ids];
}

/**
 * @param certificado Certificado de dominio.
 * @param nombres Nombres de master por id de usuario.
 * @param descripciones Descripción de cada tarea por id.
 * @returns La respuesta HTTP del certificado.
 */
export function toCertificadoResponseDto(
  certificado: CertificadoAvanceEntity,
  nombres: ReadonlyMap<string, NombreUsuario>,
  descripciones: ReadonlyMap<string, string>,
): CertificadoResponseDto {
  const emisor = nombres.get(certificado.emitidoPorId);
  const anulador = certificado.anuladoPorId ? nombres.get(certificado.anuladoPorId) : undefined;
  return {
    id: certificado.id,
    ticketId: certificado.ticketId,
    numero: certificado.numero,
    porcentaje: certificado.porcentaje,
    vigente: certificado.vigente,
    emitidoPorId: certificado.emitidoPorId,
    emitidoPorNombre: emisor?.nombre ?? null,
    emitidoPorApellido: emisor?.apellido ?? null,
    emitidoEn: certificado.emitidoEn.toISOString(),
    anuladoEn: certificado.anuladoEn ? certificado.anuladoEn.toISOString() : null,
    anuladoPorId: certificado.anuladoPorId,
    anuladoPorNombre: anulador?.nombre ?? null,
    anuladoPorApellido: anulador?.apellido ?? null,
    motivoAnulacion: certificado.motivoAnulacion,
    tareas: certificado.tareas.map((t) => ({
      tareaId: t.tareaId,
      descripcion: descripciones.get(t.tareaId) ?? null,
      peso: t.peso,
    })),
  };
}
