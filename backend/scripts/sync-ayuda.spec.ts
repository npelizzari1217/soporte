/**
 * Parseo del frontmatter de los artículos de Ayuda, y test de deriva del
 * directorio real (`backend/ayuda/`).
 *
 * Un frontmatter inválido no puede pasar en silencio: el artículo terminaría sin
 * sincronizarse sin que nadie se entere, o peor, sincronizado con una identidad
 * equivocada.
 *
 * El test de deriva es el que importa a futuro: cada `.md` que se agregue al
 * repositorio pasa por acá, así que un frontmatter roto o un slug repetido se
 * detecta en la suite y no en la corrida contra producción.
 */
/* eslint-disable @typescript-eslint/no-require-imports */
import { existsSync } from 'node:fs';
import {
  KB_SLUG_MAX_LENGTH,
  KB_TITULO_MAX_LENGTH,
} from '../src/kb/domain/entities/kb-articulo.entity';

type Articulo = {
  slug: string;
  titulo: string;
  visibleParaSolicitante: boolean;
  contenido: string;
  origen: string;
};

const { parsearArticulo, cargarArticulos, DIRECTORIO_ARTICULOS } = require('./sync-ayuda.js') as {
  parsearArticulo: (texto: string, origen: string) => Articulo;
  cargarArticulos: (directorio?: string) => Articulo[];
  DIRECTORIO_ARTICULOS: string;
};

describe('parsearArticulo()', () => {
  const VALIDO = [
    '---',
    'slug: permisos-y-roles',
    'titulo: Cómo funcionan los permisos',
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
    expect(articulo.visibleParaSolicitante).toBe(false);
    expect(articulo.contenido).toBe('# Título\n\nCuerpo del artículo.');
  });

  it('acepta comentarios al final de una línea del frontmatter', () => {
    const texto = VALIDO.replace(
      'visibleParaSolicitante: false',
      'visibleParaSolicitante: false   # arranca interno',
    );

    expect(parsearArticulo(texto, 'ejemplo.md').visibleParaSolicitante).toBe(false);
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
      VALIDO.replace('visibleParaSolicitante:', 'visibleParaSolicitant:'),
      /clave desconocida "visibleParaSolicitant"/,
    ],
    // `tipoTicket` era una clave válida hasta que la Ayuda pasó a master: la FK
    // apuntaba al catálogo del TENANT y no sobrevivió al cruce. Un .md viejo que
    // la traiga tiene que fallar fuerte, no ignorarse en silencio.
    [
      'con el tipoTicket retirado',
      VALIDO.replace('slug: permisos-y-roles', 'slug: permisos-y-roles\ntipoTicket: null'),
      /clave desconocida "tipoTicket"/,
    ],
  ])('rechaza un archivo %s con un mensaje que nombra el archivo', (_caso, texto, patron) => {
    expect(() => parsearArticulo(texto as string, 'roto.md')).toThrow(patron as RegExp);
    expect(() => parsearArticulo(texto as string, 'roto.md')).toThrow(/\[roto\.md\]/);
  });
});

describe('cargarArticulos() — deriva del directorio real', () => {
  it('todos los .md de backend/ayuda tienen frontmatter válido y slugs únicos', () => {
    expect(existsSync(DIRECTORIO_ARTICULOS)).toBe(true);

    const articulos = cargarArticulos();

    expect(articulos.length).toBeGreaterThan(0);
    const slugs = articulos.map((a) => a.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });
});

/**
 * `sync-ayuda.js` es CommonJS y corre con `node` pelado (`pnpm run sync:ayuda`),
 * así que NO puede importar las constantes de TypeScript del dominio: sus topes
 * son literales escritos a mano. Este bloque es lo que impide que diverjan.
 *
 * Es la tercera escritura a `kb_articulos` que no pasa por `KbArticuloEntity`
 * —las otras dos son el alta y la edición por HTTP, que sí van por el DTO—, y
 * sin este guard un cambio de columna dejaría el script validando contra el
 * número viejo, abortando artículos válidos o dejando pasar los que no entran.
 */
describe('los topes del script no pueden divergir del dominio', () => {
  const { LIMITES } = require('./sync-ayuda.js') as {
    LIMITES: { titulo: number; slug: number };
  };

  it('el tope de titulo es el del dominio', () => {
    expect(LIMITES.titulo).toBe(KB_TITULO_MAX_LENGTH);
  });

  it('el tope de slug es el del dominio', () => {
    expect(LIMITES.slug).toBe(KB_SLUG_MAX_LENGTH);
  });
});

/**
 * El frontmatter trata ` #` como comentario, igual que YAML. La salida
 * documentada de YAML para un valor que contiene `#` es COMILLARLO — y acá no
 * funcionaba: el recorte del comentario corría ANTES de mirar las comillas, así
 * que el valor salía truncado Y con la comilla de apertura pegada.
 *
 * Medido antes de arreglar: `"Como usar el # de ticket"` daba
 * `'"Como usar el'`. El operador hacía lo correcto y el título se guardaba roto,
 * en silencio, en la Ayuda que lee el usuario final.
 */
describe('valores con # en el frontmatter', () => {
  const conTitulo = (titulo: string) =>
    parsearArticulo(
      [
        '---',
        'slug: guia',
        `titulo: ${titulo}`,
        'visibleParaSolicitante: false',
        '---',
        '',
        'Cuerpo.',
      ].join('\n'),
      'ejemplo.md',
    );

  it.each([
    ['comillas dobles', '"Como usar el # de ticket"'],
    ['comillas simples', "'Como usar el # de ticket'"],
  ])('con %s, el # es parte del título y no se recorta', (_caso, valor) => {
    expect(conTitulo(valor).titulo).toBe('Como usar el # de ticket');
  });

  it('sin espacio antes del #, no hay comentario que recortar', () => {
    expect(conTitulo('Ticket#123 y su estado').titulo).toBe('Ticket#123 y su estado');
  });

  /** El comentario SIGUE funcionando en un valor sin comillas: es semántica YAML. */
  it('sin comillas, " #" sigue abriendo un comentario', () => {
    expect(conTitulo('Guía de estados   # nota para el que edita').titulo).toBe('Guía de estados');
  });

  /** Y las comillas siguen recortándose cuando no hay ningún #. */
  it('un valor comillado sin # se desenvuelve igual', () => {
    expect(conTitulo('"Guía de estados"').titulo).toBe('Guía de estados');
  });

  /**
   * El comentario puede tener comillas adentro. Con un `.*` goloso el motor
   * cierra contra la ÚLTIMA comilla —la del comentario— y se traga el comentario
   * entero como parte del título. Por eso el grupo es perezoso.
   */
  it('un comentario que contiene comillas no se cuela en el título', () => {
    expect(conTitulo('"Estados"   # ojo, no confundir con "prioridad"').titulo).toBe('Estados');
  });

  /**
   * Un valor que es SOLO comentario deja la clave vacía, y una clave obligatoria
   * vacía tiene que FALLAR, no guardarse. Recortar el comentario sobre el valor
   * ya trimmeado rompía esto: sin espacio delante del `#` no había nada que
   * recortar y el comentario se convertía en el título.
   */
  it('un valor que es solo comentario deja la clave vacía y falla', () => {
    expect(() => conTitulo('   # falta definirlo')).toThrow(/titulo/);
  });

  /** Comentario DESPUÉS del cierre de comillas: se recorta, el valor queda intacto. */
  it('con comillas, el comentario posterior al cierre se recorta', () => {
    expect(conTitulo('"Guía # completa"   # nota').titulo).toBe('Guía # completa');
  });
});
