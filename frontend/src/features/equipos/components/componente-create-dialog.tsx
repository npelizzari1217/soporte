"use client";

/**
 * ComponenteCreateDialog — único alta de un componente de un equipo
 * (sdd/catalogo-unico-componentes, WU-8). Absorbe al ex `ComponenteInstalarDialog`:
 * el repuesto del catálogo es OBLIGATORIO y no hay selector de tipo — el tipo
 * se deriva SIEMPRE de la familia del repuesto, en el backend.
 *
 * La casilla "Descontar del depósito" arranca marcada. El cliente envía
 * `descontarStock` SIEMPRE explícito (`true` o `false`), aunque el backend
 * tome `true` cuando falta. Con la casilla marcada el backend descuenta 1
 * unidad y crea el componente en una sola transacción; si el stock no alcanza
 * rechaza todo con un 422 que se muestra vía `notifyError`, sin crear nada.
 *
 * Repuestos ofrecidos: `useInsumos(true, true)` — `esRepuesto` + `soloVinculables`
 * (insumo habilitado Y familia habilitada). SIN filtro propio ni de stock en el
 * cliente: la autoridad es el servidor, y filtrar de nuevo sería una segunda
 * definición de "vinculable" que puede discrepar de la real.
 *
 * Con la casilla marcada aparece el selector de condición (WU-11, ADR-7):
 * elige el saldo, nuevo o usado, del repuesto del que se descuenta. El payload
 * lleva `condicion` SOLO con descuento y con el selector visible; sin
 * `INSUMOS:LECTURA` el selector queda habilitado, en NUEVO y sin saldos (decide
 * el backend). Sin descuento no se consulta el stock ni se envía `condicion`.
 *
 * Repuesto con seguimiento `SERIE` (repuestos-numero-de-serie, WU-19): con
 * descuento se elige primero la condición (nuevo o usado, con las reglas del
 * selector de saldo) y después la PIEZA por su serial (`SelectorUnidad`, solo las
 * que tienen serial y esa condición) y se envía `unidadId`, sin `condicion` ni
 * serial de texto (la unidad ya los tiene). Sin descuento (D3) el serial es obligatorio y
 * la condición se elige acá; nunca se manda `unidadId` (el backend responde
 * 422 `UNIDAD_CON_ALTA_SIN_DESCUENTO`). Con `NINGUNO` nada cambia.
 *
 * `submit()` envía `values.campo || undefined` (no `null`): el alta es un POST,
 * un campo vacío se omite del body en vez de mandarse como "borrar".
 */
import { useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useAgregarComponente } from "../hooks/use-equipo-mutations";
import { useInsumos } from "@/features/insumos/hooks/use-insumos";
import { useSelectorCondicion } from "@/features/insumos/hooks/use-selector-condicion";
import { CondicionStockSelector } from "@/features/insumos/components/condicion-stock-selector";
import { useSeleccionUnidad } from "@/features/insumos/hooks/use-seleccion-unidad";
import { SelectorUnidad } from "@/features/insumos/components/selector-unidad";
import { numeroSerieSchema } from "@/features/insumos/schemas";
import { agregarComponenteSchema, type AgregarComponenteFormValues } from "../schemas";

export interface ComponenteCreateDialogProps {
  equipoId: string;
}

const EMPTY: AgregarComponenteFormValues = {
  insumoId: "",
  descontarStock: true,
  descripcion: "",
  numeroSerie: "",
  condicion: "NUEVO",
  capacidad: "",
};

export function ComponenteCreateDialog({ equipoId }: ComponenteCreateDialogProps) {
  const [open, setOpen] = useState(false);
  const repuestosQuery = useInsumos(true, true);
  const agregarMutation = useAgregarComponente(equipoId);

  const {
    register,
    control,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<AgregarComponenteFormValues>({
    resolver: zodResolver(agregarComponenteSchema),
    defaultValues: EMPTY,
  });

  const repuestos = repuestosQuery.data ?? [];
  const insumoId = useWatch({ control, name: "insumoId" });
  const descontarStock = useWatch({ control, name: "descontarStock" });
  const esSerie = repuestos.find((repuesto) => repuesto.id === insumoId)?.seguimiento === "SERIE";
  const eligePieza = esSerie && descontarStock;
  const serieSinDescuento = esSerie && !descontarStock;
  // Sin descuento, o con una pieza por elegir, el id va vacío: la consulta de stock no corre y no hay selector.
  // Con una pieza por elegir, la condición se elige primero y filtra las piezas (`selector.valor`).
  const selector = useSelectorCondicion(descontarStock ? insumoId : "");
  const seleccion = useSeleccionUnidad(insumoId, eligePieza, "salida", selector.valor);

  function submit(values: AgregarComponenteFormValues) {
    const comun = {
      insumoId: values.insumoId,
      descontarStock: values.descontarStock,
      descripcion: values.descripcion || undefined,
      capacidad: values.capacidad || undefined,
    };
    const onSuccess = () => setOpen(false);
    if (eligePieza) {
      const unidadId = seleccion.validar();
      if (!unidadId) return;
      // La unidad ya trae su serial y su condición: no se mandan.
      agregarMutation.mutate({ ...comun, unidadId }, { onSuccess, onError: seleccion.refrescar });
      return;
    }
    if (serieSinDescuento) {
      const serial = numeroSerieSchema.safeParse(values.numeroSerie ?? "");
      if (!serial.success) {
        setError("numeroSerie", { message: serial.error.issues[0].message });
        return;
      }
      agregarMutation.mutate({ ...comun, numeroSerie: serial.data, condicion: values.condicion }, { onSuccess });
      return;
    }
    agregarMutation.mutate(
      {
        ...comun,
        condicion: values.descontarStock ? selector.paraEnviar : undefined,
        numeroSerie: values.numeroSerie || undefined,
      },
      { onSuccess },
    );
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        // Reset al ABRIR (no al cerrar ni tras el éxito): así el formulario
        // arranca siempre con los valores vigentes (casilla marcada, resto
        // vacío), incluso si un alta anterior quedó a medio completar.
        if (next) {
          reset(EMPTY);
          selector.reiniciar();
          seleccion.reiniciar();
        }
      }}
    >
      <DialogTrigger asChild>
        <Button type="button" size="sm">
          Agregar componente
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Agregar componente</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(submit)} className="flex flex-col gap-3" noValidate>
          <div className="flex flex-col gap-1">
            <label htmlFor="crear-componente-repuesto" className="text-sm font-medium text-foreground">
              Repuesto del catálogo
            </label>
            <Select id="crear-componente-repuesto" error={!!errors.insumoId} {...register("insumoId")}>
              <option value="" disabled>
                Elegí un repuesto
              </option>
              {repuestos.map((repuesto) => (
                <option key={repuesto.id} value={repuesto.id}>
                  {repuesto.codigo} — {repuesto.nombre}
                </option>
              ))}
            </Select>
            {errors.insumoId && (
              <p role="alert" className="text-sm text-destructive">
                {errors.insumoId.message}
              </p>
            )}
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="crear-componente-descripcion" className="text-sm font-medium text-foreground">
              Descripción
            </label>
            <Input id="crear-componente-descripcion" {...register("descripcion")} />
          </div>
          {!eligePieza && (
            <div className="flex flex-col gap-1">
              <label htmlFor="crear-componente-serie" className="text-sm font-medium text-foreground">
                {serieSinDescuento ? "Número de serie (obligatorio)" : "Número de serie"}
              </label>
              <Input id="crear-componente-serie" error={!!errors.numeroSerie} {...register("numeroSerie")} />
              {errors.numeroSerie && (
                <p role="alert" className="text-sm text-destructive">
                  {errors.numeroSerie.message}
                </p>
              )}
            </div>
          )}
          <div className="flex flex-col gap-1">
            <label htmlFor="crear-componente-capacidad" className="text-sm font-medium text-foreground">
              Capacidad
            </label>
            <Input id="crear-componente-capacidad" {...register("capacidad")} />
          </div>
          <div className="flex flex-col gap-1">
            <label className="flex items-center gap-2 text-sm text-foreground">
              <Controller
                control={control}
                name="descontarStock"
                render={({ field }) => (
                  <Checkbox checked={field.value} onCheckedChange={(checked) => field.onChange(checked === true)} />
                )}
              />
              Descontar del depósito
            </label>
            <p className="text-xs text-muted-foreground">
              Si lo desmarcás, el componente se registra sin descontar una unidad del stock del repuesto.
            </p>
          </div>
          {descontarStock && <CondicionStockSelector id="crear-componente-condicion" selector={selector} />}
          {eligePieza && (
            <SelectorUnidad
              id="crear-componente-pieza"
              seleccion={seleccion}
              nota="La pieza elegida se instala en el equipo."
            />
          )}
          {serieSinDescuento && (
            <div className="flex flex-col gap-1">
              <label htmlFor="crear-componente-condicion" className="text-sm font-medium text-foreground">
                Condición
              </label>
              <Select id="crear-componente-condicion" {...register("condicion")}>
                <option value="NUEVO">Nuevo</option>
                <option value="USADO">Usado</option>
              </Select>
            </div>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="submit" isLoading={agregarMutation.isPending}>
              Agregar
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
