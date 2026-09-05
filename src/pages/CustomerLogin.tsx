import { useState } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { LogIn } from "lucide-react";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import Header from "@/components/Header";
import { useCustomerAuth } from "@/context/CustomerAuthContext";

const CustomerLogin = () => {
  const navigate = useNavigate();
  const location = useLocation();
  // Si llegó acá desde el checkout (sesión exigida para pagar), vuelve ahí
  // después de iniciar sesión en vez de mandarlo siempre al inicio.
  const from = (location.state as { from?: string } | null)?.from ?? "/";
  const { login } = useCustomerAuth();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!identifier.trim() || !password) {
      toast.error("Ingresa tu usuario y contraseña");
      return;
    }
    setIsSubmitting(true);
    try {
      await login(identifier.trim(), password);
      toast.success("Sesión iniciada");
      navigate(from);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo iniciar sesión");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="container mx-auto px-4 md:px-8 py-16 md:py-24 max-w-md">
        <div className="mb-8 text-center">
          <h1 className="text-2xl md:text-3xl font-medium mb-2" style={{ fontFamily: "var(--font-display)" }}>
            Inicia sesión
          </h1>
          <p className="text-muted-foreground">Con tu documento, celular o código de cliente.</p>
        </div>

        <form onSubmit={handleSubmit} className="border border-border rounded-lg p-6 space-y-4">
          <div>
            <label className="text-sm text-muted-foreground mb-1 block">Documento, celular o código de cliente</label>
            <Input value={identifier} onChange={(e) => setIdentifier(e.target.value)} placeholder="Ej. 42242274" />
          </div>
          <div>
            <label className="text-sm text-muted-foreground mb-1 block">Contraseña</label>
            <PasswordInput value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
          </div>
          <Button type="submit" disabled={isSubmitting} className="w-full py-6 text-sm tracking-widest uppercase gap-2">
            <LogIn className="w-4 h-4" /> {isSubmitting ? "Ingresando..." : "Ingresar"}
          </Button>
          <p className="text-sm text-muted-foreground text-center">
            ¿Todavía no tienes cuenta?{" "}
            <Link to="/mi-cuenta/registro" state={{ from }} className="text-primary hover:underline">
              Regístrate aquí
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
};

export default CustomerLogin;
