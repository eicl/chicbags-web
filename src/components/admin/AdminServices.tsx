import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Search, Trash2, X, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { fetchServices, createService, updateService, deleteService, Service } from "@/lib/api";
import { errorLabelClass, errorInputClass } from "@/lib/utils";
import Pagination from "@/components/admin/Pagination";

const PAGE_SIZE = 20;

const emptyForm = { code: "", name: "", description: "", price: "" };

const matchesService = (service: Service, query: string) => {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [service.code, service.name, service.description].some((field) => field.toLowerCase().includes(q));
};

const AdminServices = () => {
  const queryClient = useQueryClient();
  const { data: services = [], isLoading, isError } = useQuery({ queryKey: ["services"], queryFn: fetchServices });

  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [attemptedSubmit, setAttemptedSubmit] = useState(false);

  const nameError = attemptedSubmit && !form.name.trim();
  const priceNumber = Number(form.price);
  const priceError = attemptedSubmit && (!form.price.trim() || !Number.isFinite(priceNumber) || priceNumber < 0);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["services"] });
  const onError = (err: unknown) => toast.error(err instanceof Error ? err.message : "Algo salió mal");

  const createMutation = useMutation({
    mutationFn: createService,
    onSuccess: () => {
      invalidate();
      toast.success("Servicio agregado");
      setIsAdding(false);
      setForm(emptyForm);
    },
    onError,
  });

  const updateMutation = useMutation({
    mutationFn: updateService,
    onSuccess: () => {
      invalidate();
      toast.success("Servicio actualizado");
      setEditingId(null);
      setForm(emptyForm);
    },
    onError,
  });

  const deleteMutation = useMutation({
    mutationFn: deleteService,
    onSuccess: () => {
      invalidate();
      toast.success("Servicio eliminado");
    },
    onError,
  });

  const handleAdd = () => {
    setIsAdding(true);
    setEditingId(null);
    setForm(emptyForm);
    setAttemptedSubmit(false);
  };

  const handleEdit = (service: Service) => {
    setEditingId(service.id);
    setIsAdding(false);
    setForm({ code: service.code, name: service.name, description: service.description, price: String(service.price) });
    setAttemptedSubmit(false);
  };

  const handleCancel = () => {
    setIsAdding(false);
    setEditingId(null);
    setForm(emptyForm);
    setAttemptedSubmit(false);
  };

  const handleSave = () => {
    if (!form.name.trim() || !form.price.trim() || !Number.isFinite(priceNumber) || priceNumber < 0) {
      setAttemptedSubmit(true);
      toast.error("Completa el nombre y un precio válido");
      return;
    }
    const data = { code: form.code.trim(), name: form.name.trim(), description: form.description.trim(), price: priceNumber };
    if (editingId !== null) {
      updateMutation.mutate({ id: editingId, ...data });
    } else {
      createMutation.mutate(data);
    }
  };

  const handleDelete = (service: Service) => {
    if (!confirm(`¿Eliminar el servicio "${service.name}"?`)) return;
    deleteMutation.mutate(service.id);
  };

  const filteredServices = services.filter((s) => matchesService(s, query));
  const totalPages = Math.max(1, Math.ceil(filteredServices.length / PAGE_SIZE));
  const pageServices = filteredServices.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const handleQueryChange = (value: string) => {
    setQuery(value);
    setPage(1);
  };

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => handleQueryChange(e.target.value)}
            placeholder="Buscar por código, nombre o descripción..."
            className="pl-9"
          />
        </div>
        <Button onClick={handleAdd} className="gap-2">
          <Plus className="w-4 h-4" /> Agregar servicio
        </Button>
      </div>

      {(isAdding || editingId !== null) && (
        <div className="mb-8 p-6 border border-border rounded-lg bg-card">
          <h2 className="text-lg font-medium mb-4" style={{ fontFamily: "var(--font-display)" }}>
            {editingId !== null ? "Editar servicio" : "Nuevo servicio"}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="text-sm text-muted-foreground mb-1 block">Código</label>
              <Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="Ej. SRV-001" />
            </div>
            <div>
              <label className={errorLabelClass(nameError)}>Nombre *</label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Ej. Personalización de bolso"
                className={errorInputClass(nameError)}
              />
            </div>
            <div className="sm:col-span-2">
              <label className="text-sm text-muted-foreground mb-1 block">Descripción</label>
              <textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                rows={2}
                className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              />
            </div>
            <div>
              <label className={errorLabelClass(priceError)}>Precio (S/.) *</label>
              <Input
                type="number"
                min={0}
                step={0.1}
                value={form.price}
                onChange={(e) => setForm({ ...form, price: e.target.value })}
                placeholder="0.00"
                className={errorInputClass(priceError)}
              />
            </div>
          </div>
          <div className="flex gap-3">
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
                <th className="text-left text-xs uppercase tracking-widest text-muted-foreground py-3 px-4">Código</th>
                <th className="text-left text-xs uppercase tracking-widest text-muted-foreground py-3 px-4">Nombre</th>
                <th className="text-left text-xs uppercase tracking-widest text-muted-foreground py-3 px-4">Descripción</th>
                <th className="text-left text-xs uppercase tracking-widest text-muted-foreground py-3 px-4">Precio</th>
                <th className="text-right text-xs uppercase tracking-widest text-muted-foreground py-3 px-4">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {pageServices.map((service) => (
                <tr key={service.id} className="border-b border-border last:border-0 hover:bg-muted/10 transition-colors">
                  <td className="py-3 px-4 text-muted-foreground text-sm">{service.code || "—"}</td>
                  <td className="py-3 px-4 font-medium">{service.name}</td>
                  <td className="py-3 px-4 text-muted-foreground text-sm max-w-xs truncate">{service.description || "—"}</td>
                  <td className="py-3 px-4 font-medium">S/.{service.price.toFixed(2)}</td>
                  <td className="py-3 px-4">
                    <div className="flex gap-2 justify-end">
                      <Button variant="ghost" size="icon" onClick={() => handleEdit(service)}>
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDelete(service)} className="text-destructive hover:text-destructive">
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
              {isLoading && (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-muted-foreground">Cargando servicios...</td>
                </tr>
              )}
              {isError && (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-destructive">No se pudo conectar con la API.</td>
                </tr>
              )}
              {!isLoading && !isError && filteredServices.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-muted-foreground">
                    {services.length === 0 ? "No hay servicios. Agrega uno nuevo." : "Ningún servicio coincide con la búsqueda."}
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

export default AdminServices;
