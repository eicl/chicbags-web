import { useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { KeyRound } from "lucide-react";
import { PasswordInput } from "@/components/ui/password-input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import Header from "@/components/Header";
import { useCustomerAuth } from "@/context/CustomerAuthContext";

const CustomerResetPassword = () => {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { resetPassword } = useCustomerAuth();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    if (!password || password.length < 6) {
      toast.error("La contraseña debe tener al menos 6 caracteres");
      return;
    }
    if (password !== confirmPassword) {
      toast.error("Las contraseñas no coinciden");
      return;
    }
    setIsSubmitting(true);
    try {
      await resetPassword(token, password);
      toast.success("Contraseña actualizada, ya iniciaste sesión");
      navigate("/mi-cuenta");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo restablecer la contraseña");
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
            Nueva contraseña
          </h1>
          <p className="text-muted-foreground">Elige la contraseña con la que vas a iniciar sesión de ahora en adelante.</p>
        </div>

        <form onSubmit={handleSubmit} className="border border-border rounded-lg p-6 space-y-4">
          <div>
            <label className="text-sm text-muted-foreground mb-1 block">Contraseña nueva</label>
            <PasswordInput value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
          </div>
          <div>
            <label className="text-sm text-muted-foreground mb-1 block">Confirmar contraseña</label>
            <PasswordInput value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="••••••••" />
          </div>
          <Button type="submit" disabled={isSubmitting} className="w-full py-6 text-sm tracking-widest uppercase gap-2">
            <KeyRound className="w-4 h-4" /> {isSubmitting ? "Guardando..." : "Guardar contraseña"}
          </Button>
          <p className="text-sm text-muted-foreground text-center">
            ¿El link venció?{" "}
            <Link to="/mi-cuenta/olvide-contrasena" className="text-primary hover:underline">
              Pide uno nuevo
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
};

export default CustomerResetPassword;
