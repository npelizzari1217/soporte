/**
 * T3.7 [UNIT] — RED→GREEN: errores de dominio de tickets (`tickets.errors.ts`).
 *
 * Verifica `code` + herencia de `DomainError`/`Error` para cada error.
 * Mensajes específicos solo se testean cuando encierran una decisión de
 * dominio no trivial (ej. no revelar información sensible, o texto que
 * documenta un ADR).
 *
 * Ref spec: sdd/tickets-core/spec (T4-T22). Ref design: "Firmas TS clave"
 * (lista de errores de tickets.errors.ts). Tarea: T3.7 (+T3.1/T3.2/T3.6
 * agregan TipoTicketDesconocido/SecuenciaAgotada/ArchivoTamanoCero antes).
 */
import { DomainError } from '../../../shared/domain/result';
import {
  TicketNoEncontradoError,
  TipoTicketNoEncontradoError,
  EstadoDestinoInvalidoError,
  TransicionInvalidaError,
  FechaCierreRequeridaError,
  AsignadoInvalidoError,
  AsignadoNoElegibleError,
  SolicitanteInvalidoError,
  ComentarioNoPermitidoError,
  ArchivoTamanoCeroError,
  TipoArchivoNoPermitidoError,
  SecuenciaAgotadaError,
  TipoTicketDesconocidoError,
  SinCicloActivoError,
  TicketReferenciaInvalidaError,
  PrioridadNoEncontradaError,
  TipoTicketCodigoDuplicadoError,
  PrefijoTipoTicketColisionError,
  PrioridadCodigoDuplicadaError,
} from './tickets.errors';

describe('TipoTicketCodigoDuplicadoError (T11.1, PR11)', () => {
  it('expone code TIPO_TICKET_CODIGO_DUPLICADO y es DomainError', () => {
    const error = new TipoTicketCodigoDuplicadoError('SOPORTE');
    expect(error.code).toBe('TIPO_TICKET_CODIGO_DUPLICADO');
    expect(error).toBeInstanceOf(DomainError);
    expect(error.message).toContain('SOPORTE');
  });
});

describe('PrefijoTipoTicketColisionError (T11.1, ADR-4, PR11)', () => {
  it('expone code PREFIJO_TIPO_TICKET_COLISION y menciona ambos códigos + el prefijo', () => {
    const error = new PrefijoTipoTicketColisionError('COMPRAS', 'COMISION', 'COM');
    expect(error.code).toBe('PREFIJO_TIPO_TICKET_COLISION');
    expect(error).toBeInstanceOf(DomainError);
    expect(error.message).toContain('COMPRAS');
    expect(error.message).toContain('COMISION');
    expect(error.message).toContain('COM');
  });
});

describe('PrioridadCodigoDuplicadaError (T11.2, PR11)', () => {
  it('expone code PRIORIDAD_CODIGO_DUPLICADA y es DomainError', () => {
    const error = new PrioridadCodigoDuplicadaError('ALTA');
    expect(error.code).toBe('PRIORIDAD_CODIGO_DUPLICADA');
    expect(error).toBeInstanceOf(DomainError);
    expect(error.message).toContain('ALTA');
  });
});

describe('PrioridadNoEncontradaError', () => {
  it('expone code PRIORIDAD_NO_ENCONTRADA y es DomainError', () => {
    const error = new PrioridadNoEncontradaError('prioridad-1');
    expect(error.code).toBe('PRIORIDAD_NO_ENCONTRADA');
    expect(error).toBeInstanceOf(DomainError);
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toContain('prioridad-1');
  });
});

describe('TicketNoEncontradoError', () => {
  it('expone code TICKET_NO_ENCONTRADO y es DomainError', () => {
    const error = new TicketNoEncontradoError('ticket-1');
    expect(error.code).toBe('TICKET_NO_ENCONTRADO');
    expect(error).toBeInstanceOf(DomainError);
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toContain('ticket-1');
  });
});

describe('TipoTicketNoEncontradoError', () => {
  it('expone code TIPO_TICKET_NO_ENCONTRADO', () => {
    const error = new TipoTicketNoEncontradoError('tipo-1');
    expect(error.code).toBe('TIPO_TICKET_NO_ENCONTRADO');
    expect(error).toBeInstanceOf(DomainError);
  });
});

describe('EstadoDestinoInvalidoError', () => {
  it('expone code ESTADO_DESTINO_INVALIDO', () => {
    const error = new EstadoDestinoInvalidoError('NO_EXISTE');
    expect(error.code).toBe('ESTADO_DESTINO_INVALIDO');
    expect(error.message).toContain('NO_EXISTE');
  });
});

describe('TransicionInvalidaError', () => {
  it('expone code TRANSICION_INVALIDA con desde/hacia en el mensaje', () => {
    const error = new TransicionInvalidaError('CERRADO', 'NUEVO');
    expect(error.code).toBe('TRANSICION_INVALIDA');
    expect(error.message).toContain('CERRADO');
    expect(error.message).toContain('NUEVO');
  });

  it('acepta una razón opcional que se agrega al mensaje', () => {
    const error = new TransicionInvalidaError('CERRADO', 'NUEVO', 'estado terminal');
    expect(error.message).toContain('estado terminal');
  });
});

describe('FechaCierreRequeridaError', () => {
  it('expone code FECHA_CIERRE_REQUERIDA', () => {
    const error = new FechaCierreRequeridaError();
    expect(error.code).toBe('FECHA_CIERRE_REQUERIDA');
    expect(error).toBeInstanceOf(DomainError);
  });
});

describe('AsignadoInvalidoError', () => {
  it('expone code ASIGNADO_INVALIDO', () => {
    const error = new AsignadoInvalidoError('user-1');
    expect(error.code).toBe('ASIGNADO_INVALIDO');
  });
});

describe('AsignadoNoElegibleError', () => {
  it('expone code ASIGNADO_NO_ELEGIBLE', () => {
    const error = new AsignadoNoElegibleError('user-1', 'tipo-1');
    expect(error.code).toBe('ASIGNADO_NO_ELEGIBLE');
  });
});

describe('SolicitanteInvalidoError', () => {
  it('expone code SOLICITANTE_INVALIDO', () => {
    const error = new SolicitanteInvalidoError('user-1');
    expect(error.code).toBe('SOLICITANTE_INVALIDO');
  });
});

describe('ComentarioNoPermitidoError', () => {
  it('expone code COMENTARIO_NO_PERMITIDO', () => {
    const error = new ComentarioNoPermitidoError('CERRADO');
    expect(error.code).toBe('COMENTARIO_NO_PERMITIDO');
    expect(error.message).toContain('CERRADO');
  });
});

describe('ArchivoTamanoCeroError', () => {
  it('expone code ARCHIVO_TAMANO_CERO', () => {
    const error = new ArchivoTamanoCeroError(BigInt(0));
    expect(error.code).toBe('ARCHIVO_TAMANO_CERO');
  });
});

describe('TipoArchivoNoPermitidoError', () => {
  it('expone code TIPO_ARCHIVO_NO_PERMITIDO', () => {
    const error = new TipoArchivoNoPermitidoError('application/x-msdownload');
    expect(error.code).toBe('TIPO_ARCHIVO_NO_PERMITIDO');
    expect(error.message).toContain('application/x-msdownload');
  });
});

describe('SecuenciaAgotadaError', () => {
  it('expone code SECUENCIA_AGOTADA', () => {
    const error = new SecuenciaAgotadaError('SOPORTE', 2026);
    expect(error.code).toBe('SECUENCIA_AGOTADA');
  });
});

describe('TipoTicketDesconocidoError', () => {
  it('expone code TIPO_TICKET_DESCONOCIDO', () => {
    const error = new TipoTicketDesconocidoError('');
    expect(error.code).toBe('TIPO_TICKET_DESCONOCIDO');
  });
});

describe('SinCicloActivoError', () => {
  it('expone code SIN_CICLO_ACTIVO', () => {
    const error = new SinCicloActivoError();
    expect(error.code).toBe('SIN_CICLO_ACTIVO');
  });
});

describe('TicketReferenciaInvalidaError', () => {
  it('expone code TICKET_REFERENCIA_INVALIDA', () => {
    const error = new TicketReferenciaInvalidaError('ticket-x');
    expect(error.code).toBe('TICKET_REFERENCIA_INVALIDA');
    expect(error.message).toContain('ticket-x');
  });
});
