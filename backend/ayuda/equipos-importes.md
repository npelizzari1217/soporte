---
slug: equipos-importes
titulo: Importe, valor residual y depreciación de un equipo
visibleParaSolicitante: false
---

# Importe, valor residual y depreciación de un equipo

Los montos de un equipo se cargan desde el formulario de alta y desde **Editar**.
Son cuatro campos y una calculadora.

## Los campos

| Campo | Qué guarda |
|---|---|
| **Importe (valor del equipo)** | El valor del equipo. |
| **Fecha de valoración** | Cuándo se registró ese importe. |
| **Valor residual** | El valor del equipo una vez depreciado. |
| **Fecha del valor residual** | Cuándo se calculó ese valor residual. |

Los cuatro son opcionales: un equipo puede quedar sin ningún monto cargado.

Un detalle práctico: **los montos no se muestran en el listado ni en la ficha del
equipo**. Para consultarlos hay que abrir **Editar**.

## La depreciación es una calculadora, no un dato

El porcentaje de depreciación **no se guarda en ningún lado**. Es una ayuda para
no sacar la cuenta a mano: se escribe un porcentaje, se presiona **Aplicar**, y
lo único que queda registrado es el **valor residual** resultante.

La cuenta es simple:

> valor residual = base × (1 − porcentaje ÷ 100)

Y la **base** es la parte que hay que mirar con atención:

- Si el equipo **todavía no tiene valor residual**, la base es el **importe**.
- Si **ya tiene un valor residual**, la base es **ese valor residual**, no el
  importe original.

Es decir, la depreciación se **encadena**. Aplicar 30% dos veces sobre un importe
de 1.000,00 no da 400,00: da 700,00 y después 490,00. Debajo del campo de
porcentaje, el formulario aclara sobre qué monto va a depreciar en ese momento.

Otras cosas que conviene saber:

- **Aplicar** también completa la *Fecha del valor residual* con la fecha de hoy.
- El resultado se redondea a dos decimales y nunca baja de cero.
- El porcentaje admite hasta tres cifras enteras y dos decimales.
- El cálculo **no depende de fechas ni de años de vida útil**. No hay
  depreciación automática ni por antigüedad: nada se deprecia solo con el paso
  del tiempo.
- Después de aplicar, tanto el importe como el valor residual siguen siendo
  editables a mano. La calculadora es una comodidad, no una regla.

## Cómo se escriben los montos

Los campos de dinero se comportan distinto según se esté escribiendo o no:

1. **Mientras el campo está seleccionado**, el número se muestra crudo, tal como
   se tipea. No aparecen separadores que estorben.
2. **Al salir del campo**, el monto se vuelve a mostrar con **separador de miles**
   y **siempre dos decimales**: `1000` pasa a verse `1.000,00`.

El punto es el separador de miles y la coma el decimal. Al escribir se aceptan
las dos formas: pegar `1.234.567,89` funciona igual que escribir `1234567.89`.
La única regla a recordar es que un punto se interpreta como separador de miles
solo cuando en el mismo número hay también una coma; si no la hay, `1234.5` se
lee como decimal.

Una advertencia: si en un campo de monto queda texto que no es un número, el
formulario **marca el campo con un error** y no deja guardar hasta que se
corrija. Esto vale aunque no se haya salido del campo: **pegar un monto y
guardar directo con Enter funciona igual que salir del campo primero**, no
hace falta el paso extra para que un monto con separador de miles se cargue
bien. Si de todas formas hay dudas sobre lo que se tipeó, salir del campo y
ver que se haya reformateado con separadores es una forma opcional de
confirmarlo a simple vista: si no se reformateó, no es un número válido.

Además, el importe y el valor residual tienen un tope: no pueden superar los
**99.999.999**. Un monto mayor también se rechaza con un aviso en el campo.

Por último, los montos **no tienen moneda asociada**: se guarda solo el número.
