import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, X, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import { fetchUsers, createUser, updateUser, deleteUser, UserAccount } from "@/lib/api";

const emptyForm = { username: "", password: "" };

const AdminUsers = () => {
  const { user: currentUser } = useAuth();
  const queryClient = useQueryClient();
  const { data: users = [], isLoading, isError } = useQuery({ queryKey: ["users"], queryFn: fetchUsers });

  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState(emptyForm);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["users"] });
  const onError = (err: unknown) => toast.error(err instanceof Error ? err.message : "Algo salió mal");

  const createMutation = useMutation({
    mutationFn: createUser,
    onSuccess: () => {
      invalidate();
      toast.success("Usuario creado");
      setIsAdding(false);
      setForm(emptyForm);
    },
    onError,
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...data }: { id: number; username: string; password?: string }) => updateUser(id, data),
    onSuccess: () => {
      invalidate();
      toast.success("Usuario actualizado");
      setEditingId(null);
      setForm(emptyForm);
    },
    onError,
  });

  const deleteMutation = useMutation({
    mutationFn: deleteUser,
    onSuccess: () => {
      invalidate();
      toast.success("Usuario eliminado");
    },
    onError,
  });

  const handleAdd = () => {
    setIsAdding(true);
    setEditingId(null);
    setForm(emptyForm);
  };

  const handleEdit = (user: UserAccount) => {
    setEditingId(user.id);
    setIsAdding(false);
    setForm({ username: user.username, password: "" });
  };

  const handleCancel = () => {
    setIsAdding(false);
    setEditingId(null);
    setForm(emptyForm);
  };

  const handleSave = () => {
    if (!form.username.trim()) {
      toast.error("El usuario es obligatorio");
      return;
    }
    if (editingId !== null) {
      updateMutation.mutate({ id: editingId, username: form.username, password: form.password || undefined });
    } else {
      if (!form.password) {
        toast.error("La contraseña es obligatoria");
        return;
      }
      createMutation.mutate({ username: form.username, password: form.password });
    }
  };

  const handleDelete = (user: UserAccount) => {
    if (!confirm(`¿Eliminar al usuario "${user.username}"?`)) return;
    deleteMutation.mutate(user.id);
  };

  return (
    <div>
      <div className="flex justify-end mb-6">
        <Button onClick={handleAdd} className="gap-2">
          <Plus className="w-4 h-4" /> Agregar usuario
        </Button>
      </div>

      {(isAdding || editingId !== null) && (
        <div className="mb-8 p-6 border border-border rounded-lg bg-card">
          <h2 className="text-lg font-medium mb-4" style={{ fontFamily: "var(--font-display)" }}>
            {editingId !== null ? "Editar usuario" : "Nuevo usuario"}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <div>
              <label className="text-sm text-muted-foreground mb-1 block">Usuario *</label>
              <Input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} placeholder="admin" autoFocus />
            </div>
            <div>
              <label className="text-sm text-muted-foreground mb-1 block">
                Contraseña {editingId !== null ? "(dejar vacío para no cambiarla)" : "*"}
              </label>
              <Input
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                placeholder="••••••••"
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
                <th className="text-left text-xs uppercase tracking-widest text-muted-foreground py-3 px-4">Usuario</th>
                <th className="text-right text-xs uppercase tracking-widest text-muted-foreground py-3 px-4">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id} className="border-b border-border last:border-0 hover:bg-muted/10 transition-colors">
                  <td className="py-3 px-4 font-medium">
                    {user.username}
                    {currentUser?.username === user.username && (
                      <span className="ml-2 text-xs text-muted-foreground">(tú)</span>
                    )}
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex gap-2 justify-end">
                      <Button variant="ghost" size="icon" onClick={() => handleEdit(user)}>
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDelete(user)}
                        disabled={users.length <= 1}
                        title={users.length <= 1 ? "No puedes eliminar el único usuario" : undefined}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
              {isLoading && (
                <tr>
                  <td colSpan={2} className="py-12 text-center text-muted-foreground">Cargando usuarios...</td>
                </tr>
              )}
              {isError && (
                <tr>
                  <td colSpan={2} className="py-12 text-center text-destructive">No se pudo conectar con la API.</td>
                </tr>
              )}
              {!isLoading && !isError && users.length === 0 && (
                <tr>
                  <td colSpan={2} className="py-12 text-center text-muted-foreground">No hay usuarios.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default AdminUsers;
