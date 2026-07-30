/**
 * ConfigResponseDto — shape del response de `GET`/`PUT /configuracion`.
 *
 * `valor` YA viene enmascarado (`'********'`) si `esSecreto`, resuelto por
 * `LeerConfigUseCase`/`ActualizarConfigUseCase` (`ConfigLecturaRow`, R3) —
 * este DTO es un mapeo directo, NUNCA descifra ni expone el valor real de un
 * secreto. Mismo patrón `fromEntity`/`fromRow` que `ClienteResponseDto`.
 *
 * Ref design: §10. Ref spec: R3. Tarea: 5.1 (PR5).
 */
import { ConfigLecturaRow } from '../../application/use-cases/leer-config.use-case';

export class ConfigResponseDto {
  categoria!: string;
  clave!: string;
  /** Enmascarado (`'********'`) si `esSecreto` — NUNCA el valor real. */
  valor!: string;
  tipo!: string;
  esSecreto!: boolean;

  static fromRow(row: ConfigLecturaRow): ConfigResponseDto {
    const dto = new ConfigResponseDto();
    dto.categoria = row.categoria;
    dto.clave = row.clave;
    dto.valor = row.valor;
    dto.tipo = row.tipo;
    dto.esSecreto = row.esSecreto;
    return dto;
  }
}
