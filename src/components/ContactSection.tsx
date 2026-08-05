import { useState } from "react";
import { Mail, Phone, MapPin, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

const ContactSection = () => {
  const [form, setForm] = useState({ name: "", email: "", message: "" });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.email.trim() || !form.message.trim()) {
      toast.error("Completa todos los campos");
      return;
    }
    toast.success("Mensaje enviado correctamente");
    setForm({ name: "", email: "", message: "" });
  };

  return (
    <section id="contacto" className="container mx-auto px-4 md:px-8 py-16 md:py-24">
      <div className="text-center mb-12">
        <h2 className="text-3xl md:text-4xl font-medium mb-4" style={{ fontFamily: "var(--font-display)" }}>
          Contacto
        </h2>
        <p className="text-muted-foreground max-w-md mx-auto">
          ¿Tienes alguna pregunta? Escríbenos y te responderemos lo antes posible.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-12 max-w-4xl mx-auto">
        <div className="space-y-8">
          <div className="flex items-start gap-4">
            <div className="p-3 rounded-full bg-muted">
              <Mail className="w-5 h-5 text-foreground" />
            </div>
            <div>
              <h3 className="font-medium text-foreground mb-1">Email</h3>
              <p className="text-sm text-muted-foreground">edwinceslev@gmail.com</p>
            </div>
          </div>
          <div className="flex items-start gap-4">
            <div className="p-3 rounded-full bg-muted">
              <Phone className="w-5 h-5 text-foreground" />
            </div>
            <div>
              <h3 className="font-medium text-foreground mb-1">Teléfono</h3>
              <p className="text-sm text-muted-foreground">+51 914104629</p>
            </div>
          </div>
          <div className="flex items-start gap-4">
            <div className="p-3 rounded-full bg-muted">
              <MapPin className="w-5 h-5 text-foreground" />
            </div>
            <div>
              <h3 className="font-medium text-foreground mb-1">Ubicación</h3>
              <p className="text-sm text-muted-foreground">Lima Metropolitana, Perú</p>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-sm text-muted-foreground mb-1 block">Nombre</label>
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Tu nombre"
              maxLength={100}
            />
          </div>
          <div>
            <label className="text-sm text-muted-foreground mb-1 block">Email</label>
            <Input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="tu@gmail.com"
              maxLength={255}
            />
          </div>
          <div>
            <label className="text-sm text-muted-foreground mb-1 block">Mensaje</label>
            <textarea
              value={form.message}
              onChange={(e) => setForm({ ...form, message: e.target.value })}
              placeholder="¿En qué podemos ayudarte?"
              maxLength={1000}
              rows={4}
              className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-none"
            />
          </div>
          <Button type="submit" className="w-full gap-2">
            <Send className="w-4 h-4" /> Enviar mensaje
          </Button>
        </form>
      </div>
    </section>
  );
};

export default ContactSection;
