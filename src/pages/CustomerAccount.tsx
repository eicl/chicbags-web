import { Link } from "react-router-dom";
import { LogOut, UserPlus, LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import Header from "@/components/Header";
import { useCustomerAuth } from "@/context/CustomerAuthContext";

const CustomerAccount = () => {
  const { customer, isLoading, logout } = useCustomerAuth();

  const handleLogout = () => {
    logout();
    toast.success("Sesión cerrada");
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="container mx-auto px-4 md:px-8 py-16 md:py-24 max-w-md text-center">
        {isLoading ? (
          <p className="text-muted-foreground">Cargando...</p>
        ) : customer ? (
          <div className="border border-border rounded-lg p-6 space-y-4">
            <h1 className="text-2xl font-medium" style={{ fontFamily: "var(--font-display)" }}>
              Hola, {customer.firstName}
            </h1>
            <p className="text-sm text-muted-foreground">
              {customer.documentType} {customer.documentNumber} · {customer.mobile}
            </p>
            <span className="inline-block px-3 py-1 rounded-md bg-primary/10 text-primary text-sm font-semibold">
              Código de cliente: #{customer.id}
            </span>
            <p className="text-sm text-muted-foreground">
              Ya puedes dejar tu valoración desde la <Link to="/#valoraciones" className="text-primary hover:underline">página de inicio</Link>.
            </p>
            <Button variant="outline" onClick={handleLogout} className="gap-2">
              <LogOut className="w-4 h-4" /> Cerrar sesión
            </Button>
          </div>
        ) : (
          <div className="border border-border rounded-lg p-6 space-y-4">
            <h1 className="text-2xl font-medium mb-2" style={{ fontFamily: "var(--font-display)" }}>
              Mi cuenta
            </h1>
            <p className="text-sm text-muted-foreground mb-4">Inicia sesión o crea tu cuenta para dejar valoraciones.</p>
            <div className="flex flex-col gap-3">
              <Link to="/mi-cuenta/ingresar">
                <Button className="w-full gap-2"><LogIn className="w-4 h-4" /> Iniciar sesión</Button>
              </Link>
              <Link to="/mi-cuenta/registro">
                <Button variant="outline" className="w-full gap-2"><UserPlus className="w-4 h-4" /> Crear cuenta</Button>
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default CustomerAccount;
