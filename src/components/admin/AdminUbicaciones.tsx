import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Printer, Search, Trash2, X, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { fetchWarehouseLocations, createWarehouseLocation, updateWarehouseLocation, deleteWarehouseLocation, WarehouseLocation } from "@/lib/api";
import { errorLabelClass, errorInputClass } from "@/lib/utils";
import Pagination from "@/components/admin/Pagination";

const PAGE_SIZE = 20;

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// A más caracteres, letra más chica — para que nombres cortos ("A1") salgan
// gigantes y nombres largos ("Estante trasero derecho") todavía entren en
// una A6 sin desbordarse.
const fontSizeForName = (name: string) => {
  const len = name.length;
  if (len <= 3) return 220;
  if (len <= 6) return 160;
  if (len <= 10) return 120;
  if (len <= 16) return 85;
  if (len <= 24) return 60;
  return 42;
};

// Etiqueta para pegar en el estante/rack físico: el nombre de la ubicación
// solo, lo más grande posible, en A6 horizontal — mismo criterio de
// impresión (@page + window.print()) que las etiquetas de pedido en
// AdminOrders.tsx.
const printLocation = (name: string) => {
  const html = `
    <html>
      <head>
        <title>${escapeHtml(name)}</title>
        <style>
          @page { size: A6 landscape; margin: 6mm; }
          * { box-sizing: border-box; }
          body {
            font-family: Arial, Helvetica, sans-serif;
            color: #111;
            margin: 0;
            height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            text-align: center;
          }
          .name {
            font-size: ${fontSizeForName(name)}px;
            font-weight: 800;
            line-height: 1.05;
            overflow-wrap: break-word;
            width: 100%;
          }
        </style>
      </head>
      <body>
        <div class="name">${escapeHtml(name)}</div>
      </body>
    </html>
  `;
  const printWindow = window.open("", "_blank", "width=600,height=450");
  if (!printWindow) {
    toast.error("El navegador bloqueó la ventana de impresión");
    return;
  }
  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.onload = () => {
    printWindow.focus();
    printWindow.print();
  };
};

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
                      <Button variant="ghost" size="icon" onClick={() => printLocation(location.name)} title="Imprimir etiqueta (A6 horizontal)">
                        <Printer className="w-4 h-4" />
                      </Button>
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
