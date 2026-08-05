import { useState } from "react";
import { useCart } from "@/context/CartContext";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, CreditCard, Truck, ShieldCheck, Smartphone, Building2, Banknote, CheckCircle2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { placeholderImage } from "@/lib/placeholder";
import { productImageUrl } from "@/lib/images";
import Header from "@/components/Header";

const yapeQr = placeholderImage("Yape QR", 400, 400, "#5c2d91", "#ffffff");

type PaymentMethod = "yape" | "plin" | "transferencia" | "contra_entrega" | "tarjeta";

const paymentMethods: { id: PaymentMethod; label: string; icon: React.ReactNode; description: string }[] = [
  { id: "yape", label: "Yape", icon: <Smartphone className="w-5 h-5" />, description: "Escanea el QR y paga con tu app Yape" },
  { id: "plin", label: "Plin", icon: <Smartphone className="w-5 h-5" />, description: "Paga con tu app Plin al número 992 398 675" },
  { id: "transferencia", label: "Transferencia bancaria", icon: <Building2 className="w-5 h-5" />, description: "Deposita a nuestra cuenta BCP o Interbank" },
  { id: "contra_entrega", label: "Contra entrega", icon: <Banknote className="w-5 h-5" />, description: "Paga en efectivo al recibir tu pedido (solo Lima)" },
  { id: "tarjeta", label: "Tarjeta de crédito/débito", icon: <CreditCard className="w-5 h-5" />, description: "Visa, Mastercard" },
];

const formatCardNumber = (value: string) => {
  const digits = value.replace(/\D/g, "").slice(0, 16);
  return digits.replace(/(\d{4})(?=\d)/g, "$1 ");
};

const formatExpiry = (value: string) => {
  const digits = value.replace(/\D/g, "").slice(0, 4);
  if (digits.length >= 3) return digits.slice(0, 2) + "/" + digits.slice(2);
  return digits;
};

const Checkout = () => {
  const { items, totalPrice, clearCart } = useCart();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    nombre: "", apellido: "", email: "", telefono: "",
    direccion: "", distrito: "", ciudad: "", notas: "",
  });
  const [selectedPayment, setSelectedPayment] = useState<PaymentMethod | null>(null);
  const [processing, setProcessing] = useState(false);
  const [paymentConfirmed, setPaymentConfirmed] = useState(false);

  // Card fields
  const [cardNumber, setCardNumber] = useState("");
  const [cardName, setCardName] = useState("");
  const [cardExpiry, setCardExpiry] = useState("");
  const [cardCvv, setCardCvv] = useState("");

  const shipping = totalPrice > 500 ? 0 : 15;
  const total = totalPrice + shipping;

  const handleChange = (field: string, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const resetPaymentState = () => {
    setPaymentConfirmed(false);
    setCardNumber("");
    setCardName("");
    setCardExpiry("");
    setCardCvv("");
  };

  const handleSelectPayment = (id: PaymentMethod) => {
    setSelectedPayment(id);
    resetPaymentState();
  };

  const isCardValid = () => {
    return cardNumber.replace(/\s/g, "").length === 16 &&
      cardName.trim().length > 2 &&
      cardExpiry.length === 5 &&
      cardCvv.length >= 3;
  };

  const isPaymentReady = () => {
    if (!selectedPayment) return false;
    if (selectedPayment === "tarjeta") return isCardValid();
    if (selectedPayment === "yape" || selectedPayment === "plin") return paymentConfirmed;
    if (selectedPayment === "transferencia") return paymentConfirmed;
    if (selectedPayment === "contra_entrega") return true;
    return false;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.nombre.trim() || !form.apellido.trim() || !form.email.trim() || !form.telefono.trim() || !form.direccion.trim() || !form.distrito.trim() || !form.ciudad.trim()) {
      toast.error("Completa todos los campos obligatorios");
      return;
    }
    if (!selectedPayment) {
      toast.error("Selecciona un método de pago");
      return;
    }
    if (!isPaymentReady()) {
      toast.error("Completa los datos de pago antes de continuar");
      return;
    }
    setProcessing(true);
    setTimeout(() => {
      toast.success("¡Pedido realizado con éxito! Te contactaremos pronto.");
      clearCart();
      navigate("/");
      setProcessing(false);
    }, 1500);
  };

  if (items.length === 0) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="flex flex-col items-center justify-center gap-6 px-4 py-24">
          <h1 className="text-2xl font-medium" style={{ fontFamily: "var(--font-display)" }}>
            Tu carrito está vacío
          </h1>
          <p className="text-muted-foreground">Agrega productos antes de continuar al pago.</p>
          <Button onClick={() => navigate("/")} variant="outline" className="gap-2">
            <ArrowLeft className="w-4 h-4" /> Volver a la tienda
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="container mx-auto px-4 md:px-8 py-8 md:py-12">
        <div className="flex items-center gap-4 mb-8">
          <button onClick={() => navigate("/")} className="p-2 hover:bg-muted rounded-full transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-2xl md:text-3xl font-medium" style={{ fontFamily: "var(--font-display)" }}>
            Finalizar Compra
          </h1>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-8 lg:gap-12">
          <form onSubmit={handleSubmit} className="lg:col-span-3 space-y-6">
            {/* Datos personales */}
            <div className="border border-border rounded-lg p-6 space-y-4">
              <h2 className="text-lg font-medium flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-primary" /> Datos personales
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm text-muted-foreground mb-1 block">Nombre *</label>
                  <Input value={form.nombre} onChange={(e) => handleChange("nombre", e.target.value)} placeholder="Tu nombre" maxLength={100} />
                </div>
                <div>
                  <label className="text-sm text-muted-foreground mb-1 block">Apellido *</label>
                  <Input value={form.apellido} onChange={(e) => handleChange("apellido", e.target.value)} placeholder="Tu apellido" maxLength={100} />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm text-muted-foreground mb-1 block">Email *</label>
                  <Input type="email" value={form.email} onChange={(e) => handleChange("email", e.target.value)} placeholder="tu@gmail.com" maxLength={255} />
                </div>
                <div>
                  <label className="text-sm text-muted-foreground mb-1 block">Teléfono *</label>
                  <Input value={form.telefono} onChange={(e) => handleChange("telefono", e.target.value)} placeholder="+51 999 999 999" maxLength={20} />
                </div>
              </div>
            </div>

            {/* Dirección de envío */}
            <div className="border border-border rounded-lg p-6 space-y-4">
              <h2 className="text-lg font-medium flex items-center gap-2">
                <Truck className="w-5 h-5 text-primary" /> Dirección de envío
              </h2>
              <div>
                <label className="text-sm text-muted-foreground mb-1 block">Dirección *</label>
                <Input value={form.direccion} onChange={(e) => handleChange("direccion", e.target.value)} placeholder="Av. / Jr. / Calle, número" maxLength={200} />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm text-muted-foreground mb-1 block">Distrito *</label>
                  <Input value={form.distrito} onChange={(e) => handleChange("distrito", e.target.value)} placeholder="Tu distrito" maxLength={100} />
                </div>
                <div>
                  <label className="text-sm text-muted-foreground mb-1 block">Ciudad *</label>
                  <Input value={form.ciudad} onChange={(e) => handleChange("ciudad", e.target.value)} placeholder="Lima" maxLength={100} />
                </div>
              </div>
              <div>
                <label className="text-sm text-muted-foreground mb-1 block">Notas del pedido</label>
                <textarea value={form.notas} onChange={(e) => handleChange("notas", e.target.value)} placeholder="Instrucciones adicionales (opcional)" maxLength={500} rows={3} className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-none" />
              </div>
            </div>

            {/* Método de pago */}
            <div className="border border-border rounded-lg p-6 space-y-4">
              <h2 className="text-lg font-medium flex items-center gap-2">
                <CreditCard className="w-5 h-5 text-primary" /> Método de pago
              </h2>
              <div className="space-y-3">
                {paymentMethods.map((method) => (
                  <button
                    key={method.id}
                    type="button"
                    onClick={() => handleSelectPayment(method.id)}
                    className={`w-full flex items-center gap-4 p-4 rounded-lg border transition-all text-left ${
                      selectedPayment === method.id
                        ? "border-primary bg-primary/5 ring-1 ring-primary"
                        : "border-border hover:border-muted-foreground/30"
                    }`}
                  >
                    <div className={`p-2 rounded-full ${selectedPayment === method.id ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
                      {method.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{method.label}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{method.description}</p>
                    </div>
                    {selectedPayment === method.id && (
                      <CheckCircle2 className="w-5 h-5 text-primary shrink-0" />
                    )}
                  </button>
                ))}
              </div>

              {/* Tarjeta de crédito/débito */}
              {selectedPayment === "tarjeta" && (
                <div className="bg-muted/50 rounded-lg p-5 space-y-4">
                  <p className="text-sm font-medium">💳 Datos de la tarjeta</p>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Número de tarjeta</label>
                    <Input
                      value={cardNumber}
                      onChange={(e) => setCardNumber(formatCardNumber(e.target.value))}
                      placeholder="1234 5678 9012 3456"
                      maxLength={19}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Nombre del titular</label>
                    <Input
                      value={cardName}
                      onChange={(e) => setCardName(e.target.value)}
                      placeholder="Como aparece en la tarjeta"
                      maxLength={100}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">Fecha de expiración</label>
                      <Input
                        value={cardExpiry}
                        onChange={(e) => setCardExpiry(formatExpiry(e.target.value))}
                        placeholder="MM/AA"
                        maxLength={5}
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">CVV</label>
                      <Input
                        type="password"
                        value={cardCvv}
                        onChange={(e) => setCardCvv(e.target.value.replace(/\D/g, "").slice(0, 4))}
                        placeholder="***"
                        maxLength={4}
                      />
                    </div>
                  </div>
                  {isCardValid() && (
                    <p className="text-xs text-primary flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> Datos de tarjeta completos</p>
                  )}
                </div>
              )}

              {/* Yape con QR */}
              {selectedPayment === "yape" && (
                <div className="bg-muted/50 rounded-lg p-5 space-y-4">
                  <p className="text-sm font-medium">📱 Paga con Yape</p>
                  <div className="flex flex-col items-center gap-3">
                    <img src={yapeQr} alt="QR de Yape para pago" className="w-48 h-48 rounded-lg border border-border" loading="lazy" width={192} height={192} />
                    <p className="text-sm text-muted-foreground text-center">Escanea el QR con tu app Yape o paga al número <span className="text-foreground font-medium">992 398 675</span></p>
                    <p className="text-sm font-medium">Monto: S/ {total.toFixed(2)}</p>
                  </div>
                  <label className="flex items-center gap-3 cursor-pointer p-3 rounded-lg border border-border hover:bg-muted/50 transition-colors">
                    <input
                      type="checkbox"
                      checked={paymentConfirmed}
                      onChange={(e) => setPaymentConfirmed(e.target.checked)}
                      className="w-4 h-4 accent-primary"
                    />
                    <span className="text-sm">Ya realicé el pago por Yape</span>
                  </label>
                </div>
              )}

              {/* Plin */}
              {selectedPayment === "plin" && (
                <div className="bg-muted/50 rounded-lg p-5 space-y-4">
                  <p className="text-sm font-medium">📱 Datos para Plin:</p>
                  <p className="text-sm text-muted-foreground">Número: <span className="text-foreground font-medium">992 398 675</span></p>
                  <p className="text-sm text-muted-foreground">Titular: <span className="text-foreground font-medium">ChicBags</span></p>
                  <p className="text-sm font-medium">Monto: S/ {total.toFixed(2)}</p>
                  <label className="flex items-center gap-3 cursor-pointer p-3 rounded-lg border border-border hover:bg-muted/50 transition-colors">
                    <input
                      type="checkbox"
                      checked={paymentConfirmed}
                      onChange={(e) => setPaymentConfirmed(e.target.checked)}
                      className="w-4 h-4 accent-primary"
                    />
                    <span className="text-sm">Ya realicé el pago por Plin</span>
                  </label>
                </div>
              )}

              {/* Transferencia */}
              {selectedPayment === "transferencia" && (
                <div className="bg-muted/50 rounded-lg p-5 space-y-3">
                  <p className="text-sm font-medium">🏦 Datos bancarios:</p>
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">BCP Cuenta Ahorros:</p>
                    <p className="text-sm text-foreground font-medium font-mono">XXX-XXXXXXX-X-XX</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">CCI Interbancario:</p>
                    <p className="text-sm text-foreground font-medium font-mono">XXX-XXX-XXXXXXX-X-XX</p>
                  </div>
                  <p className="text-sm text-muted-foreground">Titular: <span className="text-foreground font-medium">ChicBags</span></p>
                  <p className="text-sm font-medium">Monto: S/ {total.toFixed(2)}</p>
                  <label className="flex items-center gap-3 cursor-pointer p-3 rounded-lg border border-border hover:bg-muted/50 transition-colors">
                    <input
                      type="checkbox"
                      checked={paymentConfirmed}
                      onChange={(e) => setPaymentConfirmed(e.target.checked)}
                      className="w-4 h-4 accent-primary"
                    />
                    <span className="text-sm">Ya realicé la transferencia</span>
                  </label>
                </div>
              )}

              {/* Contra entrega */}
              {selectedPayment === "contra_entrega" && (
                <div className="bg-muted/50 rounded-lg p-4 space-y-2">
                  <p className="text-sm font-medium">💵 Contra entrega:</p>
                  <p className="text-sm text-muted-foreground">Paga en efectivo cuando recibas tu pedido. Disponible solo para <span className="text-foreground font-medium">Lima Metropolitana</span>.</p>
                  <p className="text-xs text-muted-foreground">El repartidor te entregará una boleta de venta.</p>
                </div>
              )}
            </div>

            <Button
              type="submit"
              disabled={processing || !isPaymentReady()}
              className="w-full py-6 text-sm tracking-widest uppercase gap-2"
            >
              <CreditCard className="w-4 h-4" />
              {processing ? "Procesando..." : `Confirmar Pedido — S/ ${total.toFixed(2)}`}
            </Button>
          </form>

          {/* Resumen del pedido */}
          <div className="lg:col-span-2">
            <div className="border border-border rounded-lg p-6 space-y-6 lg:sticky lg:top-8">
              <h2 className="text-lg font-medium">Resumen del pedido</h2>
              <div className="space-y-4 max-h-80 overflow-y-auto">
                {items.map((item) => (
                  <div key={item.id} className="flex gap-3">
                    <img src={productImageUrl(item.image)} alt={item.name} className="w-16 h-16 object-cover rounded-sm bg-muted" loading="lazy" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{item.name}</p>
                      <p className="text-xs text-muted-foreground">Cant: {item.quantity}</p>
                    </div>
                    <p className="text-sm font-medium">S/ {(item.price * item.quantity).toFixed(2)}</p>
                  </div>
                ))}
              </div>
              <div className="border-t border-border pt-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span>S/ {totalPrice.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Envío</span>
                  <span>{shipping === 0 ? "Gratis" : `S/ ${shipping.toFixed(2)}`}</span>
                </div>
                {shipping === 0 && <p className="text-xs text-primary">🎉 ¡Envío gratis en compras mayores a S/ 500!</p>}
                {selectedPayment && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Pago</span>
                    <span>{paymentMethods.find(m => m.id === selectedPayment)?.label}</span>
                  </div>
                )}
                <div className="flex justify-between text-lg font-medium pt-2 border-t border-border">
                  <span>Total</span>
                  <span>S/ {total.toFixed(2)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Checkout;
