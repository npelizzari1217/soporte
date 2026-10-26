---
slug: equipos-importes
titulo: Importe, valor residual y depreciación de un equipo
visibleParaSolicitante: true
---

# Importe, valor residual y depreciación de un equipo

Los montos de un equipo se cargan en el formulario **Nuevo equipo** y se cambian
con el botón **Editar** de la página del equipo. Son cuatro campos y una
calculadora de depreciación.

## Los campos

| Campo | Qué guarda |
|---|---|
| **Importe (valor del equipo)** | El valor del equipo. |
| **Fecha de valoración** | Cuándo se registró ese importe. |
| **Valor residual** | El valor del equipo una vez depreciado. |
| **Fecha del valor residual** | Cuándo se calculó ese valor residual. |

Los cuatro son opcionales: un equipo puede quedar sin ningún monto cargado.

## Dónde se ven los montos

Los montos **no se muestran en el listado de equipos**. Se ven en la página del
equipo, en la sección **Valor del equipo**:

- **Importe** y **Valor residual** vigentes, cada uno con su fecha (por ejemplo,
  *1.000,00 al 15/03/2026*). Si un monto no se cargó, se lee **Sin cargar**; si
  tiene monto pero no fecha, se lee *(sin fecha)*.
- Debajo, la tabla **Historial del valor** (vea más abajo).

El gráfico **Evolución del valor del equipo** está al **final de la página**,
después de los componentes. En pantallas anchas ocupa la mitad del ancho; en
pantallas angostas, el ancho completo. Si el equipo todavía no tiene historial, el
gráfico no aparece.

## La depreciación es una calculadora, no un dato

El porcentaje de depreciación **no se guarda en ningún lado**. Es una ayuda para no
hacer la cuenta a mano: en el recuadro **Depreciación** del formulario, escriba un
porcentaje en **% de depreciación** y presione **Aplicar**. Lo que se guarda es el
**valor residual** resultante, con su fecha.

**Aplicar** solo completa el formulario: nada queda guardado hasta presionar
**Guardar** (o **Crear**, en el alta).

La cuenta es simple:

> valor residual = base × (1 − porcentaje ÷ 100)

La **base** es lo que hay que mirar con atención:

- Si el equipo **todavía no tiene valor residual**, la base es el **importe**.
- Si **ya tiene un valor residual**, la base es **ese valor residual**, no el
  importe original.

Es decir, la depreciación se **encadena**. Aplicar 30 % dos veces sobre un importe
de 1.000,00 no da 400,00: da 700,00 y después 490,00. Debajo del campo de
porcentaje, el formulario indica sobre qué monto va a depreciar en ese momento.

Otras cosas que conviene saber:

- **Aplicar** también completa la **Fecha del valor residual** con la fecha de hoy.
  Usted puede cambiarla antes de guardar.
- El botón **Aplicar** se habilita cuando hay una base (importe o valor residual) y
  un porcentaje válido.
- El resultado se redondea a dos decimales y nunca baja de cero.
- El porcentaje admite hasta tres cifras enteras y dos decimales.
- El cálculo **no depende de fechas ni de años de vida útil**. No hay depreciación
  automática: nada se deprecia solo con el paso del tiempo.
- Después de aplicar, el importe y el valor residual siguen siendo editables a
  mano. La calculadora es una comodidad, no una regla.

## Historial del valor

La tabla **Historial del valor** tiene las columnas **Fecha**, **Importe**,
**Origen** y **Usuario**. Sirve para seguir la devaluación del equipo en el
tiempo.

Cuándo se agrega una fila:

- Al guardar el equipo con un **valor residual** y una **fecha del valor residual**
  cargados, si alguno de los dos cambió respecto de lo que tenía. Da igual si el
  monto salió del botón **Aplicar** o se escribió a mano.
- La fila toma como fecha la **Fecha del valor residual** y como importe el valor
  residual. Su origen es **Guardado en el equipo**, con el usuario que guardó.
- Hay **una fila por fecha**: si se guarda otro valor con la misma fecha del valor
  residual, queda el último.

Cuándo **no** se agrega nada:

- Al cerrar el formulario sin guardar.
- Al guardar sin cambiar el valor residual ni su fecha.
- Al cambiar solo el importe: el historial sigue el valor residual.
- Al vaciar el valor residual o su fecha. Vaciarlo tampoco borra el historial: los
  valores anteriores siguen ahí.

Los equipos que ya existían cuando se incorporó el historial arrancaron con su
importe y su valor residual, cada uno en su fecha, siempre que tuvieran monto y
fecha cargados. Esas filas figuran con el origen **Valor previo al historial** y
sin usuario.

Un equipo dado de baja conserva su historial y lo sigue mostrando.

## Cómo se escriben los montos

Los campos de dinero se comportan distinto según se esté escribiendo o no:

1. **Mientras el campo está seleccionado**, el número se muestra tal como se
   escribe, sin separadores.
2. **Al salir del campo**, el monto se muestra con **separador de miles** y
   **siempre dos decimales**: *1000* pasa a verse *1.000,00*.

El punto es el separador de miles y la coma, el decimal. Al escribir se aceptan las
dos formas: pegar *1.234.567,89* funciona igual que escribir *1234567.89*. La única
regla a recordar es que un punto se toma como separador de miles solo cuando en el
mismo número también hay una coma; si no la hay, *1234.5* se lee como decimal.

Si en un campo de monto queda un texto que no es un número, el formulario marca el
campo con un error y no deja guardar hasta que se corrija. Guardar con Enter
funciona igual que salir del campo primero: no hace falta ese paso para que un
monto con separador de miles se cargue bien. Si tiene dudas sobre lo que escribió,
salga del campo y verifique que se haya reformateado con separadores: si no se
reformateó, no es un número válido.

El importe y el valor residual admiten valores **entre 0 y 99.999.999**, con hasta
dos decimales. Un monto fuera de ese rango se rechaza con un aviso en el campo.

Los montos **no tienen moneda asociada**: se guarda solo el número.
