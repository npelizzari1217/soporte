"use client";

/**
 * ComponenteCreateDialog — alta de un componente de un equipo desde el
 * toolbar del detalle (son cinco campos: los mismos 4 de `ComponenteEditDialog`
 * — tipo, descripción, número de serie, capacidad — más el repuesto del
 * catálogo (WU-3, ver más abajo), que `ComponenteEditDialog` no tiene.
 * Reemplaza el formulario inline
 * incompleto de `EquipoComponentesSection` (que solo pedía tipo + capacidad
 * — bug que dejaba `descripcion`/`numeroSerie` afuera del payload de alta).
 *
 * Sin la rama `tipoActualFueraDeCatalogo` de `ComponenteEditDialog`: esa
 * rama existe para no forzar un cambio de tipo al EDITAR un componente cuyo
 * tipo quedó dado de baja en el catálogo. Un alta no tiene "tipo actual" —
 * siempre parte del catálogo de tipos ACTIVOS (`useTiposComponente`).
 *
 * `submit()` envía `values.campo || undefined` (no `null`): a diferencia de
 * `ComponenteEditDialog` (PATCH semántico, donde `null` borra el valor
 * explícitamente), el alta es un POST — un campo vacío simplemente se omite
 * del body en vez de mandarse como "borrar" un valor que nunca existió.
 *
 * `insumoId` (WU-3, sdd/repuestos-vinculo-componente) agrega un segundo
 * camino: elegir un repuesto del catálogo (`useInsumos(true, true)`, la
 * MISMA fuente que la sección Repuestos, WU-2, con `soloVinculables: true`
 * agregado). Con un repuesto elegido, el select de "Tipo" se DESHABILITA y
 * se limpia — el backend deriva `tipoComponenteCodigo` de la familia del
 * repuesto, así que mostrarlo editable sugeriría una elección que el use
 * case ignora.
 */
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useTiposComponente } from "../hooks/use-equipos";
import { useAgregarComponente } from "../hooks/use-equipo-mutations";
import { useInsumos } from "@/features/insumos/hooks/use-insumos";
import { componenteSchema, type ComponenteFormValues } from "../schemas";

export interface ComponenteCreateDialogProps {
  equipoId: string;
}

const EMPTY: ComponenteFormValues = {
  tipoComponenteCodigo: "",
  insumoId: "",
  descripcion: "",
  numeroSerie: "",
  capacidad: "",
};

export function ComponenteCreateDialog({ equipoId }: ComponenteCreateDialogProps) {
  const [open, setOpen] = useState(false);
  const tiposComponenteQuery = useTiposComponente();
  const repuestosQuery = useInsumos(true, true);
  const agregarMutation = useAgregarComponente(equipoId);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<ComponenteFormValues>({
    resolver: zodResolver(componenteSchema),
    defaultValues: EMPTY,
  });

  const tiposActivos = tiposComponenteQuery.data ?? [];
  // SIN filtro propio a propósito (WU-3): `useInsumos(true, true)` ya pide
  // `soloVinculables: true`, que el SERVIDOR resuelve contra las DOS
  // condiciones que `AgregarComponenteUseCase` exige — insumo habilitado Y
  // familia habilitada. Filtrar de nuevo acá sería una segunda definición de
  // "vinculable" que puede discrepar de la del servidor sin que nadie se
  // entere; antes de WU-3 este filtro solo cubría `activo` del insumo (no la
  // familia), que es justo el caso que dejaba pasar un 422
  // `FAMILIA_REPUESTO_DESHABILITADA` por algo que el usuario veía en la lista.
  const repuestos = repuestosQuery.data ?? [];
  const insumoIdElegido = watch("insumoId");

  // Repuesto elegido → el tipo se deriva en el backend; limpiar lo que haya
  // en el select de "Tipo" evita mandar un código que el use case ignora.
  // `shouldValidate: true` es necesario: sin él, si el usuario ya había
  // disparado el `.refine()` (envío vacío, "Elegí un tipo de componente o un
  // repuesto del catálogo") y RECIÉN DESPUÉS elige un repuesto, el mensaje de
  // error quedaba en pantalla — apuntando además a un campo que en ese
  // momento está deshabilitado — aunque el formulario ya fuera válido.
  useEffect(() => {
    if (insumoIdElegido) setValue("tipoComponenteCodigo", "", { shouldValidate: true });
  }, [insumoIdElegido, setValue]);

  function submit(values: ComponenteFormValues) {
    agregarMutation.mutate(
      {
        tipoComponenteCodigo: values.insumoId ? undefined : values.tipoComponenteCodigo,
        insumoId: values.insumoId || undefined,
        descripcion: values.descripcion || undefined,
        numeroSerie: values.numeroSerie || undefined,
        capacidad: values.capacidad || undefined,
      },
      { onSuccess: () => setOpen(false) },
    );
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        // Reset al ABRIR (no al cerrar ni tras el éxito): así el formulario
        // arranca siempre vacío, incluso si un alta anterior quedó a medio
        // completar y se cerró el dialog sin guardar.
        if (next) reset(EMPTY);
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
              Repuesto del catálogo (opcional)
            </label>
            <Select id="crear-componente-repuesto" {...register("insumoId")}>
              <option value="">Sin repuesto — cargar tipo a mano</option>
              {repuestos.map((repuesto) => (
                <option key={repuesto.id} value={repuesto.id}>
                  {repuesto.codigo} — {repuesto.nombre}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="crear-componente-tipo" className="text-sm font-medium text-foreground">
              Tipo
            </label>
            <Select
              id="crear-componente-tipo"
              disabled={!!insumoIdElegido}
              error={!!errors.tipoComponenteCodigo}
              {...register("tipoComponenteCodigo")}
            >
              <option value="" disabled>
                {insumoIdElegido ? "Se deriva del repuesto elegido" : "Elegí un tipo"}
              </option>
              {tiposActivos.map((tipo) => (
                <option key={tipo.codigo} value={tipo.codigo}>
                  {tipo.nombre}
                </option>
              ))}
            </Select>
            {errors.tipoComponenteCodigo && (
              <p role="alert" className="text-sm text-destructive">
                {errors.tipoComponenteCodigo.message}
              </p>
            )}
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="crear-componente-descripcion" className="text-sm font-medium text-foreground">
              Descripción
            </label>
            <Input id="crear-componente-descripcion" {...register("descripcion")} />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="crear-componente-serie" className="text-sm font-medium text-foreground">
              Número de serie
            </label>
            <Input id="crear-componente-serie" {...register("numeroSerie")} />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="crear-componente-capacidad" className="text-sm font-medium text-foreground">
              Capacidad
            </label>
            <Input id="crear-componente-capacidad" {...register("capacidad")} />
          </div>
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
