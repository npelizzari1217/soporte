import {
  ArticuloAyuda,
  buscarFragmentos,
  fragmentarArticulo,
  LARGO_MAXIMO_FRAGMENTO,
  normalizarTexto,
  raiz,
  terminos,
} from './busqueda-ayuda';

const tickets: ArticuloAyuda = {
  id: 'a-tickets',
  titulo: 'Tickets',
  contenido: [
    'Los tickets registran cada pedido de soporte.',
    '',
    '## Crear un ticket',
    'Desde Tickets > Nuevo, complete el asunto y la descripción y presione Guardar.',
    '',
    '## Cerrar un ticket',
    'Un ticket resuelto se cierra desde su detalle con la acción Cerrar.',
  ].join('\n'),
};

const contrasena: ArticuloAyuda = {
  id: 'a-pass',
  titulo: 'Mi cuenta y contraseña',
  contenido: [
    '# Cambiar la contraseña',
    'Desde Mi cuenta, ingrese la contraseña actual y la nueva dos veces.',
    '',
    '### Olvidé mi contraseña',
    'En el ingreso, use "¿Olvidó su contraseña?" y siga el enlace del correo.',
  ].join('\n'),
};

describe('normalizarTexto y terminos', () => {
  it('quita acentos, signos y mayúsculas', () => {
    expect(normalizarTexto('¿Cómo CAMBIO la Contraseña?')).toBe('como cambio la contrasena');
  });

  it('descarta palabras vacías y cortas, y reduce cada una a su raíz', () => {
    expect(terminos('¿Cómo puedo crear un ticket?')).toEqual([raiz('crear'), raiz('ticket')]);
  });

  it.each([
    ['conjugaciones', ['creo', 'crea', 'crear']],
    ['plural', ['ticket', 'tickets']],
    ['plural y género', ['equipo', 'equipos']],
    ['diptongo ue', ['apruebo', 'aprobar', 'aprobada']],
    ['diptongo ie', ['cierro', 'cerrar', 'cerrado']],
    ['sufijo -ción', ['exportacion', 'exportar', 'exporto']],
  ])('da la misma raíz a una familia de palabras (%s)', (_caso, palabras) => {
    expect(new Set(palabras.map(raiz)).size).toBe(1);
  });

  it('no deja raíces de menos de 3 letras', () => {
    expect(raiz('usar').length).toBeGreaterThanOrEqual(3);
    expect(raiz('ver').length).toBeGreaterThanOrEqual(3);
  });
});

describe('fragmentarArticulo', () => {
  it('divide por encabezados y usa el título del artículo para el texto inicial', () => {
    expect(fragmentarArticulo(tickets).map((f) => [f.seccion, f.texto])).toEqual([
      ['Tickets', 'Los tickets registran cada pedido de soporte.'],
      [
        'Crear un ticket',
        'Desde Tickets > Nuevo, complete el asunto y la descripción y presione Guardar.',
      ],
      ['Cerrar un ticket', 'Un ticket resuelto se cierra desde su detalle con la acción Cerrar.'],
    ]);
  });

  it('descarta las secciones vacías', () => {
    const fragmentos = fragmentarArticulo(contrasena);
    expect(fragmentos.map((f) => f.seccion)).toEqual([
      'Cambiar la contraseña',
      'Olvidé mi contraseña',
    ]);
  });

  it('parte una sección larga por párrafos sin superar el tope', () => {
    const parrafo = 'palabra '.repeat(100).trim();
    const largo: ArticuloAyuda = {
      id: 'a-largo',
      titulo: 'Largo',
      contenido: `## Sección\n${Array.from({ length: 6 }, () => parrafo).join('\n\n')}`,
    };
    const fragmentos = fragmentarArticulo(largo);
    expect(fragmentos.length).toBeGreaterThan(1);
    for (const f of fragmentos) {
      expect(f.seccion).toBe('Sección');
      expect(f.texto.length).toBeLessThanOrEqual(LARGO_MAXIMO_FRAGMENTO);
    }
    expect(fragmentos.map((f) => f.texto).join('\n\n')).toBe(
      Array.from({ length: 6 }, () => parrafo).join('\n\n'),
    );
  });
});

describe('buscarFragmentos', () => {
  it('una palabra presente en todos los artículos no decide el resultado (rareza)', () => {
    const r = buscarFragmentos([tickets, contrasena], 'cerrar un ticket');
    expect(r[0]).toMatchObject({ articuloId: 'a-tickets', seccion: 'Cerrar un ticket' });
  });

  it('devuelve primero la sección que trata el tema consultado', () => {
    const r = buscarFragmentos([tickets, contrasena], '¿Cómo creo un ticket nuevo?');
    expect(r[0]).toMatchObject({ articuloId: 'a-tickets', seccion: 'Crear un ticket' });
  });

  it('encuentra la contraseña aunque la consulta no lleve acentos ni la misma forma', () => {
    const r = buscarFragmentos([tickets, contrasena], 'olvide la contrasena');
    expect(r[0]).toMatchObject({ articuloId: 'a-pass', seccion: 'Olvidé mi contraseña' });
    expect(r.every((f) => f.articuloId === 'a-pass')).toBe(true);
  });

  it('devuelve como mucho la cantidad pedida, de mayor a menor puntaje', () => {
    const r = buscarFragmentos([tickets, contrasena], 'ticket', 2);
    expect(r).toHaveLength(2);
    expect(r[0].puntaje).toBeGreaterThanOrEqual(r[1].puntaje);
  });

  it('sin términos en común, o con solo palabras vacías, no devuelve nada', () => {
    expect(buscarFragmentos([tickets, contrasena], 'factura electrónica AFIP')).toEqual([]);
    expect(buscarFragmentos([tickets, contrasena], '¿cómo puedo hacer eso?')).toEqual([]);
  });
});
