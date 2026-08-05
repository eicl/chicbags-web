import { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const AdminLogin = () => {
  const { login, loginError, isLoggingIn } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    login(username, password).catch(() => {
      // el error ya queda expuesto vía loginError
    });
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <form onSubmit={handleSubmit} className="w-full max-w-sm border border-border rounded-lg p-8 bg-card">
        <div className="flex flex-col items-center gap-3 mb-6">
          <img src="/chicBags.jpeg" alt="ChicBags" className="w-14 h-14 rounded-full object-cover" />
          <h1 className="text-xl font-medium" style={{ fontFamily: "var(--font-display)" }}>
            Panel Admin — ChicBags
          </h1>
          <p className="text-sm text-muted-foreground text-center">Inicia sesión para gestionar el catálogo.</p>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-sm text-muted-foreground mb-1 block">Usuario</label>
            <Input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="admin" autoFocus />
          </div>
          <div>
            <label className="text-sm text-muted-foreground mb-1 block">Contraseña</label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
          </div>

          {loginError && <p className="text-sm text-destructive">{loginError}</p>}

          <Button type="submit" disabled={isLoggingIn} className="w-full">
            {isLoggingIn ? "Ingresando..." : "Ingresar"}
          </Button>
        </div>
      </form>
    </div>
  );
};

export default AdminLogin;
