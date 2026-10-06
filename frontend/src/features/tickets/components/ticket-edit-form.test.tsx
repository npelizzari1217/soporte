import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TicketEditForm } from "./ticket-edit-form";
import type { EditarTicketFormValues } from "../schemas";
import type { Prioridad } from "../types";

/**
 * `editarTicketSchema.prioridadId` es `z.string().uuid()`: los ids de este
 * archivo TIENEN que ser UUID válidos, o el resolver bloquea el submit y los
 * tests fallan por la razón equivocada (no copiar el `"p-alta"` de otros
 * fixtures de tickets, que no ejercen el submit real).
 */
const PRIORIDAD_BAJA_ID = "11111111-1111-1111-1111-111111111111";
const PRIORIDAD_ALTA_ID = "22222222-2222-2222-2222-222222222222";
const PRIORIDAD_MEDIA_ID = "33333333-3333-3333-3333-333333333333";

function buildPrioridad(overrides: Partial<Prioridad> = {}): Prioridad {
  return {
    id: PRIORIDAD_ALTA_ID,
    codigo: "ALTA",
    nombre: "Alta",
    color: null,
    orden: 1,
    activo: true,
    slaHoras: null,
    slaActivo: false,
    slaPrimeraRespuestaHoras: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

/** Catálogo ACTIVO real (2+), sin ninguna traza de la prioridad de baja. */
const PRIORIDADES_ACTIVAS: Prioridad[] = [
  buildPrioridad({
    id: PRIORIDAD_ALTA_ID,
    codigo: "ALTA",
    nombre: "Alta",
    orden: 1,
  }),
  buildPrioridad({
    id: PRIORIDAD_MEDIA_ID,
    codigo: "MEDIA",
    nombre: "Media",
    orden: 2,
  }),
];

function buildDefaultValues(overrides: Partial<EditarTicketFormValues> = {}): EditarTicketFormValues {
  return {
    titulo: "Impresora rota",
    descripcion: "",
    prioridadId: PRIORIDAD_BAJA_ID,
    ...overrides,
  };
}

function renderForm(
  overrides: {
    defaultValues?: EditarTicketFormValues;
    prioridades?: Prioridad[];
    /** `true` simula el catálogo TODAVÍA SIN RESOLVER (cargando o con error): pisa `prioridades`. */
    catalogoNoResuelto?: boolean;
  } = {},
) {
  const onSubmit = vi.fn();
  const onCancel = vi.fn();
  const prioridades = overrides.catalogoNoResuelto ? undefined : (overrides.prioridades ?? PRIORIDADES_ACTIVAS);
  render(
    <TicketEditForm
      defaultValues={overrides.defaultValues ?? buildDefaultValues()}
      prioridades={prioridades}
      onSubmit={onSubmit}
      onCancel={onCancel}
      isSubmitting={false}
    />,
  );
  return { onSubmit, onCancel };
}

/**
 * Segundo camino, distinto del "dado de baja": la `<option>` EXISTE, pero el
 * catálogo resuelve DESPUÉS de que el formulario montó. El `<select>` no
 * controlado de RHF fija su valor una sola vez; sin reaplicarlo, el navegador se
 * queda con la primera opción que llegue.
 */
describe("TicketEditForm — el catálogo resuelve después del montaje", () => {
  it("reaplica la prioridad del ticket cuando la lista llega tarde, en vez de quedarse con la primera", async () => {
    const props = {
      defaultValues: buildDefaultValues({ prioridadId: PRIORIDAD_MEDIA_ID }),
      onSubmit: vi.fn(),
      onCancel: vi.fn(),
      isSubmitting: false,
    };
    // Monta SIN catálogo (cargando). MEDIA va segunda a propósito: si nadie
    // reaplica el valor, el select se queda en ALTA y el test lo detecta.
    const { rerender } = render(<TicketEditForm {...props} prioridades={undefined} />);

    rerender(<TicketEditForm {...props} prioridades={PRIORIDADES_ACTIVAS} />);

    await waitFor(() => expect(screen.getByLabelText(/prioridad/i)).toHaveValue(PRIORIDAD_MEDIA_ID));
  });

  // Hermano del anterior, y la razón por la que esto NO puede ser un `useEffect`
  // suelto: reaplicar en CADA cambio de `prioridades` haría que un refetch pise
  // lo que el usuario acaba de elegir. `refetchOnWindowFocus` viene en `true` por
  // defecto y `QueryProvider` no lo desactiva, así que alcanza con cambiar de
  // ventana y volver para reproducirlo.
  it("un refetch del catálogo NO pisa la prioridad que el usuario acaba de elegir", async () => {
    const user = userEvent.setup();
    const props = {
      defaultValues: buildDefaultValues({ prioridadId: PRIORIDAD_MEDIA_ID }),
      onSubmit: vi.fn(),
      onCancel: vi.fn(),
      isSubmitting: false,
    };
    const { rerender } = render(<TicketEditForm {...props} prioridades={PRIORIDADES_ACTIVAS} />);

    await user.selectOptions(screen.getByLabelText(/prioridad/i), PRIORIDAD_ALTA_ID);
    expect(screen.getByLabelText(/prioridad/i)).toHaveValue(PRIORIDAD_ALTA_ID);

    // Refetch: MISMO contenido útil, referencia NUEVA (lo que entrega React
    // Query cuando el catálogo cambió de verdad).
    rerender(<TicketEditForm {...props} prioridades={[...PRIORIDADES_ACTIVAS]} />);

    // Aserción DIRECTA, no `waitFor`: `rerender` ya viene envuelto en `act`, así
    // que los efectos del re-render terminaron. Con `waitFor` este test no servía
    // — cortaba en el primer chequeo exitoso, viendo ALTA antes de que un efecto
    // sin guard lo pisara (verificado: la mutación no lo hacía fallar).
    expect(screen.getByLabelText(/prioridad/i)).toHaveValue(PRIORIDAD_ALTA_ID);
  });
});

describe("TicketEditForm — prioridad dada de baja", () => {
  it("el select muestra seleccionada la prioridad de baja, no la primera del catálogo activo", () => {
    renderForm();

    expect(screen.getByLabelText(/prioridad/i)).toHaveValue(PRIORIDAD_BAJA_ID);
  });

  it("montar el formulario no cambia la prioridad por sí solo", async () => {
    renderForm();

    // Sin ninguna interacción del usuario: el valor tiene que seguir siendo
    // el de baja una vez que el formulario terminó de montarse.
    await waitFor(() => {
      expect(screen.getByLabelText(/prioridad/i)).toHaveValue(PRIORIDAD_BAJA_ID);
    });
  });

  it("una prioridad ACTIVA no agrega la opción sintética 'dada de baja'", () => {
    renderForm({
      defaultValues: buildDefaultValues({ prioridadId: PRIORIDAD_ALTA_ID }),
    });

    expect(screen.queryByRole("option", { name: /dada de baja/i })).not.toBeInTheDocument();
    expect(screen.getAllByRole("option")).toHaveLength(PRIORIDADES_ACTIVAS.length);
  });

  it("el catálogo YA resolvió y está genuinamente vacío: la prioridad ausente sigue etiquetándose como dada de baja", () => {
    // `prioridades: []` acá significa "resolvió con éxito, cero prioridades
    // activas" — NO "todavía está cargando". Ver el test siguiente para esa
    // otra rama, que es la que corrige el defecto que encontró revisión.
    renderForm({ prioridades: [] });

    expect(screen.getByLabelText(/prioridad/i)).toHaveValue(PRIORIDAD_BAJA_ID);
    expect(screen.getByRole("option", { name: /prioridad dada de baja/i })).toBeInTheDocument();
  });

  it("mientras el catálogo de prioridades NO resolvió (cargando o con error), no etiqueta el valor vigente como dado de baja", () => {
    // `TicketEditForm` es presentacional: no distingue "cargando" de "con
    // error", recibe `undefined` en los dos casos (mismo significado que
    // `usePrioridades().data`). Es exactamente la misma señal para ambos, así
    // que un solo test cubre las dos causas — la ausencia de `<option>` acá
    // NO prueba que la prioridad esté dada de baja, prueba que el catálogo
    // todavía no se sabe (defecto real encontrado en revisión: antes `?? []`
    // colapsaba esto con "catálogo vacío" y etiquetaba una prioridad ACTIVA
    // como dada de baja mientras cargaba, o para siempre si la query fallaba).
    renderForm({
      catalogoNoResuelto: true,
      defaultValues: buildDefaultValues({ prioridadId: PRIORIDAD_ALTA_ID }),
    });

    expect(screen.queryByRole("option", { name: /dada de baja/i })).not.toBeInTheDocument();
  });

  it("guardar sin tocar el select conserva la prioridad de baja (post-fix: _formValues ya la conservaba antes del fix, ver design §4)", async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderForm();

    await user.click(screen.getByRole("button", { name: /guardar/i }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0]).toMatchObject({
      prioridadId: PRIORIDAD_BAJA_ID,
    });
  });
});
