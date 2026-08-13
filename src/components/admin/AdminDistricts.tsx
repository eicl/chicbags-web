import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Search, Trash2, X, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { fetchDistricts, createDistrict, updateDistrict, deleteDistrict, District } from "@/lib/api";
import { PERU_DEPARTMENTS, PERU_LOCATIONS } from "@/lib/peru-locations";
import { errorLabelClass, errorInputClass } from "@/lib/utils";
import Pagination from "@/components/admin/Pagination";

const PAGE_SIZE = 20;

const AdminDistricts = () => {
  const queryClient = useQueryClient();
  const [department, setDepartment] = useState("");
  const [province, setProvince] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);

  const { data: districts = [], isLoading, isError } = useQuery({
    queryKey: ["districts", province],
    queryFn: () => fetchDistricts(province),
    enabled: !!province,
  });

  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [attemptedSubmit, setAttemptedSubmit] = useState(false);
  const nameError = attemptedSubmit && !name.trim();

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["districts", province] });
    queryClient.invalidateQueries({ queryKey: ["customers"] });
  };
  const onError = (err: unknown) => toast.error(err instanceof Error ? err.message : "Algo salió mal");

  const createMutation = useMutation({
    mutationFn: (n: string) => createDistrict(province, n),
    onSuccess: () => {
      invalidate();
      toast.success("Distrito agregado");
      setIsAdding(false);
      setName("");
    },
    onError,
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, name: n }: { id: number; name: string }) => updateDistrict(id, n),
    onSuccess: () => {
      invalidate();
      toast.success("Distrito actualizado");
      setEditingId(null);
      setName("");
    },
    onError,
  });

  const deleteMutation = useMutation({
    mutationFn: deleteDistrict,
    onSuccess: () => {
      invalidate();
      toast.success("Distrito eliminado");
    },
    onError,
  });

  const provinces = department ? PERU_LOCATIONS[department] ?? [] : [];

  const handleDepartmentChange = (value: string) => {
    setDepartment(value);
    setProvince("");
    setIsAdding(false);
    setEditingId(null);
  };

  const handleProvinceChange = (value: string) => {
    setProvince(value);
    setIsAdding(false);
    setEditingId(null);
    setQuery("");
    setPage(1);
  };

  const handleQueryChange = (value: string) => {
    setQuery(value);
    setPage(1);
  };

  const handleAdd = () => {
    setIsAdding(true);
    setEditingId(null);
    setName("");
    setAttemptedSubmit(false);
  };

  const handleEdit = (district: District) => {
    setEditingId(district.id);
    setIsAdding(false);
    setName(district.name);
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

  const handleDelete = (district: District) => {
    if (!confirm(`¿Eliminar el distrito "${district.name}"?`)) return;
    deleteMutation.mutate(district.id);
  };

  const filteredDistricts = districts.filter((d) => d.name.toLowerCase().includes(query.trim().toLowerCase()));
  const totalPages = Math.max(1, Math.ceil(filteredDistricts.length / PAGE_SIZE));
  const pageDistricts = filteredDistricts.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6 max-w-xl">
        <div>
          <label className="text-sm text-muted-foreground mb-1 block">Departamento</label>
          <select
            value={department}
            onChange={(e) => handleDepartmentChange(e.target.value)}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <option value="">Selecciona...</option>
            {PERU_DEPARTMENTS.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-sm text-muted-foreground mb-1 block">Provincia</label>
          <select
            value={province}
            onChange={(e) => handleProvinceChange(e.target.value)}
            disabled={!department}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <option value="">Selecciona...</option>
            {provinces.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </div>
      </div>

      {!province ? (
        <p className="text-sm text-muted-foreground">Elige un departamento y una provincia para ver y administrar sus distritos.</p>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input value={query} onChange={(e) => handleQueryChange(e.target.value)} placeholder="Buscar distrito..." className="pl-9" />
            </div>
            <Button onClick={handleAdd} className="gap-2">
              <Plus className="w-4 h-4" /> Agregar distrito en {province}
            </Button>
          </div>

          {(isAdding || editingId !== null) && (
            <div className="mb-8 p-6 border border-border rounded-lg bg-card">
              <h2 className="text-lg font-medium mb-4" style={{ fontFamily: "var(--font-display)" }}>
                {editingId !== null ? "Editar distrito" : `Nuevo distrito en ${province}`}
              </h2>
              <div className="flex flex-wrap items-end gap-3">
                <div className="flex-1 min-w-[12rem]">
                  <label className={errorLabelClass(nameError)}>Nombre *</label>
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Miraflores, San Isidro..."
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
                  {pageDistricts.map((district) => (
                    <tr key={district.id} className="border-b border-border last:border-0 hover:bg-muted/10 transition-colors">
                      <td className="py-3 px-4 font-medium">{district.name}</td>
                      <td className="py-3 px-4">
                        <div className="flex gap-2 justify-end">
                          <Button variant="ghost" size="icon" onClick={() => handleEdit(district)}>
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => handleDelete(district)} className="text-destructive hover:text-destructive">
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {isLoading && (
                    <tr>
                      <td colSpan={2} className="py-12 text-center text-muted-foreground">Cargando distritos...</td>
                    </tr>
                  )}
                  {isError && (
                    <tr>
                      <td colSpan={2} className="py-12 text-center text-destructive">No se pudo conectar con la API.</td>
                    </tr>
                  )}
                  {!isLoading && !isError && filteredDistricts.length === 0 && (
                    <tr>
                      <td colSpan={2} className="py-12 text-center text-muted-foreground">
                        {districts.length === 0
                          ? `No hay distritos registrados en ${province} todavía.`
                          : "Ningún distrito coincide con la búsqueda."}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
        </>
      )}
    </div>
  );
};

export default AdminDistricts;
