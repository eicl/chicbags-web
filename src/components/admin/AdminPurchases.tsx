import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileText, Loader2, Pencil, Plus, Save, Search, Trash2, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { createPurchase, deletePurchase, fetchPurchases, updatePurchase, uploadReceipt, Purchase, PurchaseDocumentType, PurchaseInput } from "@/lib/api";
import { productImageUrl } from "@/lib/images";
import { errorLabelClass, errorInputClass } from "@/lib/utils";
import Pagination from "@/components/admin/Pagination";

const PAGE_SIZE = 20;
const DOCUMENT_TYPES: PurchaseDocumentType[] = ["Factura", "Boleta", "Recibo por Honorarios", "Nota de Crédito", "Nota de Débito", "Otro"];
const isPdf = (filename: string) => filename.toLowerCase().endsWith(".pdf");

// Igual que en el registro de pagos: no usar toISOString(), que convierte a
// UTC y en Perú (UTC-5) ya adelanta la fecha un día después de las 7pm.
const toLocalDateStr = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const todayDate = () => toLocalDateStr(new Date());

// purchase_date se guarda en UTC medianoche (mismo criterio que el plazo de
// separación de pedidos) — se muestra también en UTC para que no se corra
// un día según la zona horaria del navegador.
const formatDateOnly = (iso: string) => new Date(iso).toLocaleDateString("es-PE", { dateStyle: "medium", timeZone: "UTC" });

const emptyForm = {
  purchaseDate: todayDate(),
  documentType: "Factura" as PurchaseDocumentType,
  documentNumber: "",
  supplierName: "",
  supplierRuc: "",
  description: "",
  total: "",
  subtotal: "",
  receiptImage: "",
};

const matchesPurchase = (purchase: Purchase, query: string) => {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [purchase.supplierName, purchase.supplierRuc, purchase.documentNumber, purchase.documentType, purchase.description]
    .some((field) => (field ?? "").toLowerCase().includes(q));
};

const AdminPurchases = () => {
  const queryClient = useQueryClient();
  const { data: purchases = [], isLoading, isError } = useQuery({ queryKey: ["purchases"], queryFn: fetchPurchases });

  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [uploading, setUploading] = useState(false);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [attemptedSubmit, setAttemptedSubmit] = useState(false);

  const totalNumber = Number(form.total);
  const subtotalNumber = form.subtotal === "" ? totalNumber || 0 : Number(form.subtotal);
  const igvNumber = Math.max((totalNumber || 0) - (Number.isFinite(subtotalNumber) ? subtotalNumber : 0), 0);

  const dateError = attemptedSubmit && !form.purchaseDate;
  const supplierError = attemptedSubmit && !form.supplierName.trim();
  const totalError = attemptedSubmit && (!form.total.trim() || !Number.isFinite(totalNumber) || totalNumber <= 0);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["purchases"] });
  const onError = (err: unknown) => toast.error(err instanceof Error ? err.message : "Algo salió mal");

  const createMutation = useMutation({
    mutationFn: createPurchase,
    onSuccess: () => {
      invalidate();
      toast.success("Compra registrada");
      setIsAdding(false);
      setForm(emptyForm);
    },
    onError,
  });

  const updateMutation = useMutation({
    mutationFn: updatePurchase,
    onSuccess: () => {
      invalidate();
      toast.success("Compra actualizada");
      setEditingId(null);
      setForm(emptyForm);
    },
    onError,
  });

  const deleteMutation = useMutation({
    mutationFn: deletePurchase,
    onSuccess: () => {
      invalidate();
      toast.success("Compra eliminada");
    },
    onError,
  });

  const handleAdd = () => {
    setIsAdding(true);
    setEditingId(null);
    setForm(emptyForm);
    setAttemptedSubmit(false);
  };

  const handleEdit = (purchase: Purchase) => {
    setEditingId(purchase.id);
    setIsAdding(false);
    setForm({
      purchaseDate: toLocalDateStr(new Date(purchase.purchaseDate)),
      documentType: purchase.documentType,
      documentNumber: purchase.documentNumber,
      supplierName: purchase.supplierName,
      supplierRuc: purchase.supplierRuc,
      description: purchase.description,
      total: String(purchase.total),
      subtotal: String(purchase.subtotal),
      receiptImage: purchase.receiptImage,
    });
    setAttemptedSubmit(false);
  };

  const handleCancel = () => {
    setIsAdding(false);
    setEditingId(null);
    setForm(emptyForm);
    setAttemptedSubmit(false);
  };

  const handleUploadReceipt = async (file: File) => {
    setUploading(true);
    try {
      const { filename } = await uploadReceipt(file);
      setForm((f) => ({ ...f, receiptImage: filename }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo subir el recibo");
    } finally {
      setUploading(false);
    }
  };

  const handleCalculateIgv = () => {
    if (!Number.isFinite(totalNumber) || totalNumber <= 0) return;
    setForm((f) => ({ ...f, subtotal: (totalNumber / 1.18).toFixed(2) }));
  };

  const handleSave = () => {
    if (!form.purchaseDate || !form.supplierName.trim() || !form.total.trim() || !Number.isFinite(totalNumber) || totalNumber <= 0) {
      setAttemptedSubmit(true);
      toast.error("Completa la fecha, el proveedor y un total válido");
      return;
    }
    const data: PurchaseInput = {
      purchaseDate: form.purchaseDate,
      documentType: form.documentType,
      documentNumber: form.documentNumber.trim(),
      supplierName: form.supplierName.trim(),
      supplierRuc: form.supplierRuc.trim(),
      description: form.description.trim(),
      total: totalNumber,
      subtotal: subtotalNumber,
      igv: igvNumber,
      receiptImage: form.receiptImage,
    };
    if (editingId !== null) {
      updateMutation.mutate({ id: editingId, createdAt: "", ...data });
    } else {
      createMutation.mutate(data);
    }
  };

  const handleDelete = (purchase: Purchase) => {
    if (!confirm(`¿Eliminar la compra a "${purchase.supplierName}" del ${formatDateOnly(purchase.purchaseDate)}?`)) return;
    deleteMutation.mutate(purchase.id);
  };

  const filteredPurchases = purchases.filter((p) => matchesPurchase(p, query));
  const totalPages = Math.max(1, Math.ceil(filteredPurchases.length / PAGE_SIZE));
  const pagePurchases = filteredPurchases.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const totalAmount = filteredPurchases.reduce((sum, p) => sum + p.total, 0);

  const handleQueryChange = (value: string) => {
    setQuery(value);
    setPage(1);
  };

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => handleQueryChange(e.target.value)}
            placeholder="Buscar por proveedor, RUC, N° de comprobante..."
            className="pl-9"
          />
        </div>
        <Button onClick={handleAdd} className="gap-2">
          <Plus className="w-4 h-4" /> Registrar compra
        </Button>
      </div>

      <p className="text-sm text-muted-foreground mb-6">
        Total {query.trim() ? "de la búsqueda" : "registrado"}: <span className="font-semibold text-foreground">S/.{totalAmount.toFixed(2)}</span>
        {" "}({filteredPurchases.length} {filteredPurchases.length === 1 ? "compra" : "compras"})
      </p>

      {(isAdding || editingId !== null) && (
        <div className="mb-8 p-6 border border-border rounded-lg bg-card">
          <h2 className="text-lg font-medium mb-4" style={{ fontFamily: "var(--font-display)" }}>
            {editingId !== null ? "Editar compra" : "Registrar compra"}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
            <div>
              <label className={errorLabelClass(dateError)}>Fecha de compra *</label>
              <Input
                type="date"
                value={form.purchaseDate}
                onChange={(e) => setForm({ ...form, purchaseDate: e.target.value })}
                className={errorInputClass(dateError)}
              />
            </div>
            <div>
              <label className="text-sm text-muted-foreground mb-1 block">Tipo de comprobante *</label>
              <select
                value={form.documentType}
                onChange={(e) => setForm({ ...form, documentType: e.target.value as PurchaseDocumentType })}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                {DOCUMENT_TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm text-muted-foreground mb-1 block">Serie y número</label>
              <Input
                value={form.documentNumber}
                onChange={(e) => setForm({ ...form, documentNumber: e.target.value })}
                placeholder="Ej. F001-1234"
              />
            </div>
            <div>
              <label className={errorLabelClass(supplierError)}>Proveedor / Razón social *</label>
              <Input
                value={form.supplierName}
                onChange={(e) => setForm({ ...form, supplierName: e.target.value })}
                placeholder="Nombre o razón social"
                className={errorInputClass(supplierError)}
              />
            </div>
            <div>
              <label className="text-sm text-muted-foreground mb-1 block">RUC del proveedor</label>
              <Input
                value={form.supplierRuc}
                onChange={(e) => setForm({ ...form, supplierRuc: e.target.value })}
                placeholder="20123456789"
              />
            </div>
            <div className="lg:col-span-3">
              <label className="text-sm text-muted-foreground mb-1 block">Descripción / Concepto</label>
              <Input
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Ej. Compra de carteras al por mayor"
              />
            </div>
            <div>
              <label className={errorLabelClass(totalError)}>Total (S/.) *</label>
              <Input
                type="number"
                min={0}
                step={0.01}
                value={form.total}
                onChange={(e) => setForm({ ...form, total: e.target.value })}
                placeholder="0.00"
                className={errorInputClass(totalError)}
              />
            </div>
            <div>
              <label className="text-sm text-muted-foreground mb-1 block">Subtotal (S/.)</label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={0}
                  step={0.01}
                  value={form.subtotal}
                  onChange={(e) => setForm({ ...form, subtotal: e.target.value })}
                  placeholder={form.total || "0.00"}
                />
                <Button type="button" variant="outline" size="sm" onClick={handleCalculateIgv} className="shrink-0">
                  IGV 18%
                </Button>
              </div>
            </div>
            <div>
              <label className="text-sm text-muted-foreground mb-1 block">IGV (S/.)</label>
              <p className="h-10 flex items-center text-sm text-muted-foreground">S/.{igvNumber.toFixed(2)}</p>
            </div>
            <div className="lg:col-span-3">
              <label className="text-sm text-muted-foreground mb-1 block">Foto o PDF del recibo</label>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 h-9 px-3 rounded-md border border-input text-sm cursor-pointer hover:bg-muted/50">
                  {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                  {form.receiptImage ? "Cambiar" : "Subir"}
                  <input
                    type="file"
                    accept="image/*,application/pdf"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleUploadReceipt(file);
                      e.target.value = "";
                    }}
                  />
                </label>
                {form.receiptImage && (
                  <a href={productImageUrl(form.receiptImage)} target="_blank" rel="noopener noreferrer">
                    {isPdf(form.receiptImage) ? (
                      <span className="w-12 h-12 rounded border border-border flex items-center justify-center text-muted-foreground hover:text-primary">
                        <FileText className="w-5 h-5" />
                      </span>
                    ) : (
                      <img
                        src={productImageUrl(form.receiptImage)}
                        alt="Recibo"
                        className="w-12 h-12 rounded object-cover border border-border"
                      />
                    )}
                  </a>
                )}
              </div>
            </div>
          </div>
          <div className="flex gap-3">
            <Button onClick={handleSave} disabled={uploading} className="gap-2"><Save className="w-4 h-4" /> Guardar</Button>
            <Button variant="outline" onClick={handleCancel} className="gap-2"><X className="w-4 h-4" /> Cancelar</Button>
          </div>
        </div>
      )}

      <div className="border border-border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left text-xs uppercase tracking-widest text-muted-foreground py-3 px-4">Fecha</th>
                <th className="text-left text-xs uppercase tracking-widest text-muted-foreground py-3 px-4">Comprobante</th>
                <th className="text-left text-xs uppercase tracking-widest text-muted-foreground py-3 px-4">Proveedor</th>
                <th className="text-left text-xs uppercase tracking-widest text-muted-foreground py-3 px-4">Descripción</th>
                <th className="text-right text-xs uppercase tracking-widest text-muted-foreground py-3 px-4">Subtotal</th>
                <th className="text-right text-xs uppercase tracking-widest text-muted-foreground py-3 px-4">IGV</th>
                <th className="text-right text-xs uppercase tracking-widest text-muted-foreground py-3 px-4">Total</th>
                <th className="text-center text-xs uppercase tracking-widest text-muted-foreground py-3 px-4">Recibo</th>
                <th className="text-right text-xs uppercase tracking-widest text-muted-foreground py-3 px-4">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {pagePurchases.map((purchase) => (
                <tr key={purchase.id} className="border-b border-border last:border-0 hover:bg-muted/10 transition-colors">
                  <td className="py-3 px-4 text-muted-foreground text-sm whitespace-nowrap">{formatDateOnly(purchase.purchaseDate)}</td>
                  <td className="py-3 px-4 text-sm">
                    {purchase.documentType}
                    {purchase.documentNumber && <div className="text-xs text-muted-foreground">{purchase.documentNumber}</div>}
                  </td>
                  <td className="py-3 px-4 font-medium text-sm">
                    {purchase.supplierName}
                    {purchase.supplierRuc && <div className="text-xs text-muted-foreground font-normal">RUC {purchase.supplierRuc}</div>}
                  </td>
                  <td className="py-3 px-4 text-muted-foreground text-sm max-w-xs truncate">{purchase.description || "—"}</td>
                  <td className="py-3 px-4 text-right text-sm">S/.{purchase.subtotal.toFixed(2)}</td>
                  <td className="py-3 px-4 text-right text-sm">S/.{purchase.igv.toFixed(2)}</td>
                  <td className="py-3 px-4 text-right font-medium">S/.{purchase.total.toFixed(2)}</td>
                  <td className="py-3 px-4 text-center">
                    {purchase.receiptImage ? (
                      <a href={productImageUrl(purchase.receiptImage)} target="_blank" rel="noopener noreferrer" className="inline-block">
                        {isPdf(purchase.receiptImage) ? (
                          <span className="w-9 h-9 rounded border border-border flex items-center justify-center text-muted-foreground hover:text-primary mx-auto">
                            <FileText className="w-4 h-4" />
                          </span>
                        ) : (
                          <img
                            src={productImageUrl(purchase.receiptImage)}
                            alt="Recibo"
                            className="w-9 h-9 rounded object-cover border border-border mx-auto"
                          />
                        )}
                      </a>
                    ) : (
                      <span className="text-muted-foreground text-xs">—</span>
                    )}
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex gap-2 justify-end">
                      <Button variant="ghost" size="icon" onClick={() => handleEdit(purchase)}>
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDelete(purchase)} className="text-destructive hover:text-destructive">
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
              {isLoading && (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-muted-foreground">Cargando compras...</td>
                </tr>
              )}
              {isError && (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-destructive">No se pudo conectar con la API.</td>
                </tr>
              )}
              {!isLoading && !isError && filteredPurchases.length === 0 && (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-muted-foreground">
                    {purchases.length === 0 ? "No hay compras registradas." : "Ninguna compra coincide con la búsqueda."}
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

export default AdminPurchases;
