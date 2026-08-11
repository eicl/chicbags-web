import { Fragment, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronUp } from "lucide-react";
import { fetchOrders } from "@/lib/api";

const formatDate = (iso: string) =>
  new Date(iso).toLocaleString("es-PE", { dateStyle: "medium", timeStyle: "short" });

const AdminOrders = () => {
  const { data: orders = [], isLoading, isError } = useQuery({ queryKey: ["orders"], queryFn: fetchOrders });
  const [expandedId, setExpandedId] = useState<number | null>(null);

  return (
    <div>
      <div className="border border-border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left text-xs uppercase tracking-widest text-muted-foreground py-3 px-4">Pedido</th>
                <th className="text-left text-xs uppercase tracking-widest text-muted-foreground py-3 px-4">Cliente</th>
                <th className="text-left text-xs uppercase tracking-widest text-muted-foreground py-3 px-4">Documento</th>
                <th className="text-left text-xs uppercase tracking-widest text-muted-foreground py-3 px-4">Celular</th>
                <th className="text-left text-xs uppercase tracking-widest text-muted-foreground py-3 px-4">Vendedor</th>
                <th className="text-left text-xs uppercase tracking-widest text-muted-foreground py-3 px-4">Productos</th>
                <th className="text-left text-xs uppercase tracking-widest text-muted-foreground py-3 px-4">Total</th>
                <th className="text-left text-xs uppercase tracking-widest text-muted-foreground py-3 px-4">Fecha</th>
                <th className="text-right text-xs uppercase tracking-widest text-muted-foreground py-3 px-4"></th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => {
                const isExpanded = expandedId === order.id;
                return (
                  <Fragment key={order.id}>
                    <tr
                      onClick={() => setExpandedId(isExpanded ? null : order.id)}
                      className="border-b border-border last:border-0 hover:bg-muted/10 transition-colors cursor-pointer"
                    >
                      <td className="py-3 px-4 text-sm font-medium text-primary">#{order.id}</td>
                      <td className="py-3 px-4 font-medium">
                        {order.customerName}
                        <div className="text-xs text-muted-foreground font-normal">Código: #{order.customerId}</div>
                      </td>
                      <td className="py-3 px-4 text-muted-foreground text-sm">{order.customerDocument}</td>
                      <td className="py-3 px-4 text-muted-foreground text-sm">{order.customerMobile}</td>
                      <td className="py-3 px-4 text-muted-foreground text-sm">{order.sellerName || "—"}</td>
                      <td className="py-3 px-4 text-muted-foreground text-sm">
                        {order.items.length} {order.items.length === 1 ? "producto" : "productos"}
                      </td>
                      <td className="py-3 px-4 font-medium">S/.{order.total.toFixed(2)}</td>
                      <td className="py-3 px-4 text-muted-foreground text-sm">{formatDate(order.createdAt)}</td>
                      <td className="py-3 px-4 text-right">
                        {isExpanded ? (
                          <ChevronUp className="w-4 h-4 inline text-muted-foreground" />
                        ) : (
                          <ChevronDown className="w-4 h-4 inline text-muted-foreground" />
                        )}
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr key={`${order.id}-detail`} className="border-b border-border last:border-0 bg-muted/20">
                        <td colSpan={9} className="px-4 py-3">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="text-xs uppercase tracking-widest text-muted-foreground">
                                <th className="text-left py-1.5 font-medium">Producto</th>
                                <th className="text-left py-1.5 font-medium">Color</th>
                                <th className="text-right py-1.5 font-medium">Precio</th>
                                <th className="text-right py-1.5 font-medium">Cant.</th>
                                <th className="text-right py-1.5 font-medium">Subtotal</th>
                              </tr>
                            </thead>
                            <tbody>
                              {order.items.map((item) => (
                                <tr key={item.id}>
                                  <td className="py-1.5">{item.productName}</td>
                                  <td className="py-1.5 text-muted-foreground">{item.colorName}</td>
                                  <td className="py-1.5 text-right">S/.{item.unitPrice.toFixed(2)}</td>
                                  <td className="py-1.5 text-right">{item.quantity}</td>
                                  <td className="py-1.5 text-right font-medium">S/.{item.subtotal.toFixed(2)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
              {isLoading && (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-muted-foreground">Cargando pedidos...</td>
                </tr>
              )}
              {isError && (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-destructive">No se pudo conectar con la API.</td>
                </tr>
              )}
              {!isLoading && !isError && orders.length === 0 && (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-muted-foreground">No hay pedidos registrados.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default AdminOrders;
