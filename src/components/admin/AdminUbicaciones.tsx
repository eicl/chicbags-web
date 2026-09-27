import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Search, Trash2, X, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { fetchWarehouseLocations, createWarehouseLocation, updateWarehouseLocation, deleteWarehouseLocation, WarehouseLocation } from "@/lib/api";
import { errorLabelClass, errorInputClass } from "@/lib/utils";
import Pagination from "@/components/admin/Pagination";

const PAGE_SIZE = 20;

// Lista plana global de ubicaciones físicas de almacén (ej. "Estante A1"),
// para control de stock/inventario — se asignan a un pedido al pasarlo a
// "Separado en almacén" (ver AdminOrders.tsx). Mismo patrón que AdminBrands.
const AdminUbicaciones = () => {
  const queryClient = useQueryClient();
  const { data: locations = [], isLoading, isError } = useQuery({ queryKey: ["warehouseLocations"], queryFn: fetchWarehouseLocations });

  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [attemptedSubmit, setAttemptedSubmit] = useState(false);
  const nameError = attemptedSubmit && !name.trim();

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["warehouseLocations"] });
    queryClient.invalidateQueries({ queryKey: ["orders"] });
  };

  const onError = (err: unknown) => toast.error(err instanceof Error ? err.message : "Algo salió mal");

  const createMutation = useMutation({
    mutationFn: createWarehouseLocation,
    onSuccess: () => {
      invalidate();
      toast.success("Ubicación agregada");
      setIsAdding(false);
      setName("");
    },
    onError,
  });

  const updateMutation = useMutation({
    mutationFn: updateWarehouseLocation,
    onSuccess: () => {
      invalidate();
      toast.success("Ubicación actualizada");
      setEditingId(null);
      setName("");
    },
    onError,
  });

  const deleteMutation = useMutation({
    mutationFn: deleteWarehouseLocation,
    onSuccess: () => {
      invalidate();
      toast.success("Ubicación eliminada");
    },
    onError,
  });

  const handleAdd = () => {
    setIsAdding(true);
    setEditingId(null);
    setName("");
    setAttemptedSubmit(false);
  };

  const handleEdit = (location: WarehouseLocation) => {
    setEditingId(location.id);
    setIsAdding(false);
    setName(location.name);
    setAttemptedSubmit(false);
  };

  const handleCancel = () => {
    setIsAdding(false);
    setEditingId(null);
    setName("");
    setAttemptedSubmit(false);
  };

  const handleSave = () => {
    if (!name.trim()) {
      setAttemptedSubmit(true);
      toast.error("Falta el campo: Nombre");
      return;
    }
    if (editingId !== null) {
      updateMutation.mutate({ id: editingId, name });
    } else {
      createMutation.mutate(name);
    }
  };

  const handleDelete = (location: WarehouseLocation) => {
    if (!confirm(`¿Eliminar la ubicación "${location.name}"?`)) return;
    deleteMutation.mutate(location.id);
  };

  const filteredLocations = locations.filter((l) => l.name.toLowerCase().includes(query.trim().toLowerCase()));
  const totalPages = Math.max(1, Math.ceil(filteredLocations.length / PAGE_SIZE));
  const pageLocations = filteredLocations.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const handleQueryChange = (value: string) => {
    setQuery(value);
    setPage(1);
  };

  return (
    <div>
      <p className="text-sm text-muted-foreground mb-6">
        Ubicaciones físicas de almacén, para control de stock e inventario. Se eligen al pasar un pedido de
        "Separación" a "Separado en almacén".
      </p>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input value={query} onChange={(e) => handleQueryChange(e.target.value)} placeholder="Buscar ubicación..." className="pl-9" />
        </div>
        <Button onClick={handleAdd} className="gap-2">
          <Plus className="w-4 h-4" /> Agregar ubicación
        </Button>
      </div>

      {(isAdding || editingId !== null) && (
        <div className="mb-8 p-6 border border-border rounded-lg bg-card">
          <h2 className="text-lg font-medium mb-4" style={{ fontFamily: "var(--font-display)" }}>
            {editingId !== null ? "Editar ubicación" : "Nueva ubicación"}
          </h2>
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-[12rem]">
              <label className={errorLabelClass(nameError)}>Nombre *</label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Estante A1, Rack B2..."
                autoFocus
                className={errorInputClass(nameError)}
              />
            </div>
            <Button onClick={handleSave} className="gap-2"><Save className="w-4 h-4" /> Guardar</Button>
            <Button variant="outline" onClick={handleCancel} className="gap-2"><X className="w-4 h-4" /> Cancelar</Button>
          </div>
        </div>
      )}

      <div className="border border-border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left text-xs uppercase tracking-widest text-muted-foreground py-3 px-4">Nombre</th>
                <th className="text-right text-xs uppercase tracking-widest text-muted-foreground py-3 px-4">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {pageLocations.map((location) => (
                <tr key={location.id} className="border-b border-border last:border-0 hover:bg-muted/10 transition-colors">
                  <td className="py-3 px-4 font-medium">{location.name}</td>
                  <td className="py-3 px-4">
                    <div className="flex gap-2 justify-end">
                      <Button variant="ghost" size="icon" onClick={() => handleEdit(location)}>
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDelete(location)} className="text-destructive hover:text-destructive">
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
              {isLoading && (
                <tr>
                  <td colSpan={2} className="py-12 text-center text-muted-foreground">Cargando ubicaciones...</td>
                </tr>
              )}
              {isError && (
                <tr>
                  <td colSpan={2} className="py-12 text-center text-destructive">No se pudo conectar con la API.</td>
                </tr>
              )}
              {!isLoading && !isError && filteredLocations.length === 0 && (
                <tr>
                  <td colSpan={2} className="py-12 text-center text-muted-foreground">
                    {locations.length === 0 ? "No hay ubicaciones. Agrega una nueva." : "Ninguna ubicación coincide con la búsqueda."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
    </div>
  );
};

export default AdminUbicaciones;
