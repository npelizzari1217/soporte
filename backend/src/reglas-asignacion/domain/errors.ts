import { DomainError } from '../../shared/domain/result';

/** El tipo no existe o está dado de baja: no se le puede configurar una regla (404). */
export class TipoTicketNoConfigurableError extends DomainError {
  readonly code = 'TIPO_TICKET_NO_CONFIGURABLE';

  constructor(tipoId: string) {
    super(`El tipo de ticket "${tipoId}" no existe o está dado de baja.`);
  }
}

/** El responsable propuesto no es TECNICO/COLABORADOR activo con el módulo del tipo (422). */
export class ResponsableReglaNoElegibleError extends DomainError {
  readonly code = 'RESPONSABLE_REGLA_NO_ELEGIBLE';

  constructor(responsableId: string, tipoId: string) {
    super(
      `El usuario "${responsableId}" no puede ser responsable de la regla del tipo "${tipoId}": ` +
        'debe ser un técnico o colaborador activo con el módulo del tipo.',
    );
  }
}
