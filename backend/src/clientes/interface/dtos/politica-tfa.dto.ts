import { IsBoolean } from 'class-validator';

/** Body de `PUT /politica-2fa`. El cliente sale del JWT del actor, nunca del body. */
export class PoliticaTfaDto {
  @IsBoolean()
  requiere2fa!: boolean;
}
