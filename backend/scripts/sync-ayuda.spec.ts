/**
 * Parseo del frontmatter de los artículos de Ayuda.
 *
 * Un frontmatter inválido no puede pasar en silencio: el artículo terminaría sin
 * sincronizarse a ningún tenant sin que nadie se entere, o peor, sincronizado
 * con una identidad equivocada.
 */
/* eslint-disable @typescript-eslint/no-require-imports */

type Articulo = {
  slug: string;
  titulo: string;
  tipoTicket: string | null;
  visibleParaSolicitante: boolean;
  contenido: string;
};

const { parsearArticulo } = require('./sync-ayuda.js') as {
  parsearArticulo: (texto: string, origen: string) => Articulo;
};

describe('parsearArticulo()', () => {
  const VALIDO = [
    '---',
    'slug: permisos-y-roles',
    'titulo: Cómo funcionan los permisos',
    'tipoTicket: null',
    'visibleParaSolicitante: false',
    '---',
    '',
    '# Título',
    '',
    'Cuerpo del artículo.',
  ].join('\n');

  it('extrae frontmatter y cuerpo, y aplica los defaults', () => {
    const articulo = parsearArticulo(VALIDO, 'ejemplo.md');

    expect(articulo.slug).toBe('permisos-y-roles');
    expect(articulo.titulo).toBe('Cómo funcionan los permisos');
    expect(articulo.tipoTicket).toBeNull();
    expect(articulo.visibleParaSolicitante).toBe(false);
    expect(articulo.contenido).toBe('# Título\n\nCuerpo del artículo.');
  });

  it('acepta comentarios al final de una línea del frontmatter', () => {
    const texto = VALIDO.replace('tipoTicket: null', 'tipoTicket: null        # o un código');

    expect(parsearArticulo(texto, 'ejemplo.md').tipoTicket).toBeNull();
  });

  // Un frontmatter inválido NO puede pasar en silencio: el artículo terminaría
  // sin sincronizarse, o peor, sincronizado con una identidad equivocada.
  it.each([
    ['sin slug', VALIDO.replace('slug: permisos-y-roles\n', ''), /falta "slug" en el frontmatter/],
    [
      'sin titulo',
      VALIDO.replace('titulo: Cómo funcionan los permisos\n', ''),
      /falta "titulo" en el frontmatter/,
    ],
    ['sin frontmatter', '# Solo cuerpo\n', /debe empezar con una línea "---"/],
    [
      'frontmatter sin cerrar',
      '---\nslug: x\ntitulo: X\n\n# Cuerpo\n',
      /frontmatter quedó sin cerrar/,
    ],
    [
      'slug con mayúsculas',
      VALIDO.replace('permisos-y-roles', 'Permisos-Y-Roles'),
      /slug "Permisos-Y-Roles" inválido/,
    ],
    ['cuerpo vacío', '---\nslug: x\ntitulo: X\n---\n\n', /no tiene cuerpo/],
    [
      'clave desconocida',
      VALIDO.replace('tipoTicket: null', 'tipoTiket: null'),
      /clave desconocida "tipoTiket"/,
    ],
  ])('rechaza un archivo %s con un mensaje que nombra el archivo', (_caso, texto, patron) => {
    expect(() => parsearArticulo(texto as string, 'roto.md')).toThrow(patron as RegExp);
    expect(() => parsearArticulo(texto as string, 'roto.md')).toThrow(/\[roto\.md\]/);
  });
});
