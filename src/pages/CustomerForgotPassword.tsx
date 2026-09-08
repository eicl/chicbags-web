import { useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, Send } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import Header from "@/components/Header";
import { requestPasswordReset } from "@/lib/api";

const CustomerForgotPassword = () => {
  const [identifier, setIdentifier] = useState("");

  // La respuesta del servidor es siempre el mismo mensaje, coincida o no el
  // identificador con una cuenta real — nunca hay que revelar eso acá.
  const requestMutation = useMutation({
    mutationFn: () => requestPasswordReset(identifier.trim()),
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : "Algo salió mal"),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!identifier.trim()) {
      toast.error("Ingresa tu documento, celular o código de cliente");
      return;
    }
    requestMutation.mutate();
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="container mx-auto px-4 md:px-8 py-16 md:py-24 max-w-md">
        <div className="mb-8 text-center">
          <h1 className="text-2xl md:text-3xl font-medium mb-2" style={{ fontFamily: "var(--font-display)" }}>
            Olvidé mi contraseña
          </h1>
          <p className="text-muted-foreground">Te enviamos un link por WhatsApp para poner una contraseña nueva.</p>
        </div>

        {requestMutation.isSuccess ? (
          <div className="border border-border rounded-lg p-6 text-center space-y-3">
            <CheckCircle2 className="w-10 h-10 text-primary mx-auto" />
            <p className="text-sm text-muted-foreground">{requestMutation.data.message}</p>
            <Link to="/mi-cuenta/ingresar" className="inline-block text-sm text-primary hover:underline">
              Volver a iniciar sesión
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="border border-border rounded-lg p-6 space-y-4">
            <div>
              <label className="text-sm text-muted-foreground mb-1 block">Documento, celular o código de cliente</label>
              <Input value={identifier} onChange={(e) => setIdentifier(e.target.value)} placeholder="Ej. 42242274" />
            </div>
            <Button type="submit" disabled={requestMutation.isPending} className="w-full py-6 text-sm tracking-widest uppercase gap-2">
              <Send className="w-4 h-4" /> {requestMutation.isPending ? "Enviando..." : "Enviar link"}
            </Button>
            <p className="text-sm text-muted-foreground text-center">
              <Link to="/mi-cuenta/ingresar" className="text-primary hover:underline">
                Volver a iniciar sesión
              </Link>
            </p>
          </form>
        )}
      </div>
    </div>
  );
};

export default CustomerForgotPassword;
