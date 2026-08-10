import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, X, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { fetchCategories, createCategory, updateCategory, deleteCategory, Category } from "@/lib/api";
import { errorLabelClass, errorInputClass } from "@/lib/utils";

const AdminCategories = () => {
  const queryClient = useQueryClient();
  const { data: categories = [], isLoading, isError } = useQuery({ queryKey: ["categories"], queryFn: fetchCategories });

  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [attemptedSubmit, setAttemptedSubmit] = useState(false);
  const nameError = attemptedSubmit && !name.trim();

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["categories"] });
    queryClient.invalidateQueries({ queryKey: ["products"] });
  };

  const onError = (err: unknown) => toast.error(err instanceof Error ? err.message : "Algo salió mal");

  const createMutation = useMutation({
    mutationFn: createCategory,
    onSuccess: () => {
      invalidate();
      toast.success("Categoría agregada");
      setIsAdding(false);
      setName("");
    },
    onError,
  });

  const updateMutation = useMutation({
    mutationFn: updateCategory,
    onSuccess: () => {
      invalidate();
      toast.success("Categoría actualizada");
      setEditingId(null);
      setName("");
    },
    onError,
  });

  const deleteMutation = useMutation({
    mutationFn: deleteCategory,
    onSuccess: () => {
      invalidate();
      toast.success("Categoría eliminada");
    },
    onError,
  });

  const handleAdd = () => {
    setIsAdding(true);
    setEditingId(null);
    setName("");
    setAttemptedSubmit(false);
  };

  const handleEdit = (category: Category) => {
    setEditingId(category.id);
    setIsAdding(false);
    setName(category.name);
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

  const handleDelete = (category: Category) => {
    if (!confirm(`¿Eliminar la categoría "${category.name}"?`)) return;
    deleteMutation.mutate(category.id);
  };

  return (
    <div>
      <div className="flex justify-end mb-6">
        <Button onClick={handleAdd} className="gap-2">
          <Plus className="w-4 h-4" /> Agregar categoría
        </Button>
      </div>

      {(isAdding || editingId !== null) && (
        <div className="mb-8 p-6 border border-border rounded-lg bg-card">
          <h2 className="text-lg font-medium mb-4" style={{ fontFamily: "var(--font-display)" }}>
            {editingId !== null ? "Editar categoría" : "Nueva categoría"}
          </h2>
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-[12rem]">
              <label className={errorLabelClass(nameError)}>Nombre *</label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Carteras, Bolsos..."
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
              {categories.map((category) => (
                <tr key={category.id} className="border-b border-border last:border-0 hover:bg-muted/10 transition-colors">
                  <td className="py-3 px-4 font-medium">{category.name}</td>
                  <td className="py-3 px-4">
                    <div className="flex gap-2 justify-end">
                      <Button variant="ghost" size="icon" onClick={() => handleEdit(category)}>
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDelete(category)} className="text-destructive hover:text-destructive">
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
              {isLoading && (
                <tr>
                  <td colSpan={2} className="py-12 text-center text-muted-foreground">Cargando categorías...</td>
                </tr>
              )}
              {isError && (
                <tr>
                  <td colSpan={2} className="py-12 text-center text-destructive">No se pudo conectar con la API.</td>
                </tr>
              )}
              {!isLoading && !isError && categories.length === 0 && (
                <tr>
                  <td colSpan={2} className="py-12 text-center text-muted-foreground">No hay categorías. Agrega una nueva.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default AdminCategories;
