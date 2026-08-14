import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Search, Trash2, X, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import { fetchUsers, createUser, updateUser, deleteUser, UserAccount, UserRole } from "@/lib/api";
import { errorLabelClass, errorInputClass } from "@/lib/utils";
import Pagination from "@/components/admin/Pagination";

const USER_ROLES: UserRole[] = ["Administrador", "Vendedor"];
const emptyForm = { username: "", password: "", role: "Vendedor" as UserRole };
const PAGE_SIZE = 20;

const AdminUsers = () => {
  const { user: currentUser } = useAuth();
  const queryClient = useQueryClient();
  const { data: users = [], isLoading, isError } = useQuery({ queryKey: ["users"], queryFn: fetchUsers });

  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [attemptedSubmit, setAttemptedSubmit] = useState(false);
  const usernameError = attemptedSubmit && !form.username.trim();
  const passwordError = attemptedSubmit && editingId === null && !form.password;

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
    mutationFn: ({ id, ...data }: { id: number; username: string; password?: string; role: UserRole }) => updateUser(id, data),
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
    setAttemptedSubmit(false);
  };

  const handleEdit = (user: UserAccount) => {
    setEditingId(user.id);
    setIsAdding(false);
    setForm({ username: user.username, password: "", role: user.role });
    setAttemptedSubmit(false);
  };

  const handleCancel = () => {
    setIsAdding(false);
    setEditingId(null);
    setForm(emptyForm);
    setAttemptedSubmit(false);
  };

  const handleSave = () => {
    const missing: string[] = [];
    if (!form.username.trim()) missing.push("Usuario");
    if (editingId === null && !form.password) missing.push("Contraseña");
    if (missing.length > 0) {
      setAttemptedSubmit(true);
      toast.error(`Faltan campos obligatorios: ${missing.join(", ")}`);
      return;
    }
    if (editingId !== null) {
      updateMutation.mutate({ id: editingId, username: form.username, password: form.password || undefined, role: form.role });
    } else {
      createMutation.mutate({ username: form.username, password: form.password, role: form.role });
    }
  };

  const handleDelete = (user: UserAccount) => {
    if (!confirm(`¿Eliminar al usuario "${user.username}"?`)) return;
    deleteMutation.mutate(user.id);
  };

  const filteredUsers = users.filter((u) =>
    [u.username, u.role].some((field) => field.toLowerCase().includes(query.trim().toLowerCase()))
  );
  const totalPages = Math.max(1, Math.ceil(filteredUsers.length / PAGE_SIZE));
  const pageUsers = filteredUsers.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const handleQueryChange = (value: string) => {
    setQuery(value);
    setPage(1);
  };

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input value={query} onChange={(e) => handleQueryChange(e.target.value)} placeholder="Buscar usuario o perfil..." className="pl-9" />
        </div>
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
              <label className={errorLabelClass(usernameError)}>Usuario *</label>
              <Input
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
                placeholder="admin"
                autoFocus
                className={errorInputClass(usernameError)}
              />
            </div>
            <div>
              <label className={errorLabelClass(passwordError)}>
                Contraseña {editingId !== null ? "(dejar vacío para no cambiarla)" : "*"}
              </label>
              <PasswordInput
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                placeholder="••••••••"
                className={errorInputClass(passwordError)}
              />
            </div>
            <div>
              <label className="text-sm text-muted-foreground mb-1 block">Perfil *</label>
              <select
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value as UserRole })}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                {USER_ROLES.map((role) => (
                  <option key={role} value={role}>{role}</option>
                ))}
              </select>
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
                <th className="text-left text-xs uppercase tracking-widest text-muted-foreground py-3 px-4">Perfil</th>
                <th className="text-right text-xs uppercase tracking-widest text-muted-foreground py-3 px-4">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {pageUsers.map((user) => (
                <tr key={user.id} className="border-b border-border last:border-0 hover:bg-muted/10 transition-colors">
                  <td className="py-3 px-4 font-medium">
                    {user.username}
                    {currentUser?.username === user.username && (
                      <span className="ml-2 text-xs text-muted-foreground">(tú)</span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-muted-foreground text-sm">{user.role}</td>
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
                  <td colSpan={3} className="py-12 text-center text-muted-foreground">Cargando usuarios...</td>
                </tr>
              )}
              {isError && (
                <tr>
                  <td colSpan={3} className="py-12 text-center text-destructive">No se pudo conectar con la API.</td>
                </tr>
              )}
              {!isLoading && !isError && filteredUsers.length === 0 && (
                <tr>
                  <td colSpan={3} className="py-12 text-center text-muted-foreground">
                    {users.length === 0 ? "No hay usuarios." : "Ningún usuario coincide con la búsqueda."}
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

export default AdminUsers;
