import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useCustomerAuth } from "@/context/CustomerAuthContext";
import { fetchReviews, submitReview } from "@/lib/api";

const formatDate = (iso: string) => new Date(iso).toLocaleDateString("es-PE", { dateStyle: "medium" });

const StarDisplay = ({ rating }: { rating: number }) => (
  <div className="flex gap-0.5" aria-label={`${rating} de 5 estrellas`}>
    {[1, 2, 3, 4, 5].map((n) => (
      <Star key={n} className={`w-4 h-4 ${n <= rating ? "fill-primary text-primary" : "text-muted-foreground"}`} />
    ))}
  </div>
);

const StarInput = ({ value, onChange }: { value: number; onChange: (n: number) => void }) => (
  <div className="flex gap-1">
    {[1, 2, 3, 4, 5].map((n) => (
      <button key={n} type="button" onClick={() => onChange(n)} aria-label={`${n} estrellas`}>
        <Star className={`w-6 h-6 transition-colors ${n <= value ? "fill-primary text-primary" : "text-muted-foreground hover:text-primary"}`} />
      </button>
    ))}
  </div>
);

const ReviewsSection = () => {
  const { customer } = useCustomerAuth();
  const queryClient = useQueryClient();
  const { data: reviews = [], isLoading } = useQuery({ queryKey: ["reviews"], queryFn: fetchReviews });

  const myReview = customer ? reviews.find((r) => r.customerId === customer.id) : undefined;
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");

  useEffect(() => {
    if (myReview) {
      setRating(myReview.rating);
      setComment(myReview.comment);
    }
  }, [myReview]);

  const mutation = useMutation({
    mutationFn: submitReview,
    onSuccess: () => {
      toast.success(myReview ? "Valoración actualizada" : "¡Gracias por tu valoración!");
      queryClient.invalidateQueries({ queryKey: ["reviews"] });
    },
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : "No se pudo enviar tu valoración"),
  });

  const handleSubmit = () => {
    if (rating < 1) {
      toast.error("Elige una calificación de 1 a 5 estrellas");
      return;
    }
    if (!comment.trim()) {
      toast.error("Escribe tu comentario");
      return;
    }
    mutation.mutate({ rating, comment: comment.trim() });
  };

  const average = reviews.length > 0 ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length : 0;

  return (
    <section id="valoraciones" className="container mx-auto px-4 md:px-8 py-16 md:py-24 border-t border-border">
      <div className="text-center mb-12">
        <h2 className="text-3xl md:text-4xl font-medium mb-3" style={{ fontFamily: "var(--font-display)" }}>
          Lo que dicen nuestras clientas
        </h2>
        <div className="w-16 h-1 bg-primary mx-auto mb-4 rounded-full" aria-hidden="true" />
        {reviews.length > 0 && (
          <div className="flex items-center justify-center gap-2">
            <StarDisplay rating={Math.round(average)} />
            <span className="text-sm text-muted-foreground">
              {average.toFixed(1)} de 5 ({reviews.length} {reviews.length === 1 ? "valoración" : "valoraciones"})
            </span>
          </div>
        )}
      </div>

      <div className="max-w-2xl mx-auto mb-12 p-6 border border-border rounded-lg bg-card">
        {customer ? (
          <div className="space-y-3">
            <h3 className="font-medium" style={{ fontFamily: "var(--font-display)" }}>
              {myReview ? "Edita tu valoración" : "Deja tu valoración"}
            </h3>
            <StarInput value={rating} onChange={setRating} />
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Cuéntanos qué te pareció..."
              rows={3}
              className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-y"
            />
            <Button onClick={handleSubmit} disabled={mutation.isPending} className="gap-2">
              {mutation.isPending ? "Enviando..." : myReview ? "Actualizar valoración" : "Enviar valoración"}
            </Button>
          </div>
        ) : (
          <div className="text-center space-y-3">
            <p className="text-sm text-muted-foreground">Inicia sesión para dejar tu valoración.</p>
            <div className="flex justify-center gap-3">
              <Link to="/mi-cuenta/ingresar"><Button size="sm">Iniciar sesión</Button></Link>
              <Link to="/mi-cuenta/registro"><Button size="sm" variant="outline">Crear cuenta</Button></Link>
            </div>
          </div>
        )}
      </div>

      {isLoading ? (
        <p className="text-center text-muted-foreground">Cargando valoraciones...</p>
      ) : reviews.length === 0 ? (
        <p className="text-center text-muted-foreground">Todavía no hay valoraciones. ¡Sé la primera en dejar una!</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 max-w-5xl mx-auto">
          {reviews.map((review) => (
            <div key={review.id} className="p-4 border border-border rounded-lg bg-card">
              <StarDisplay rating={review.rating} />
              <p className="text-sm mt-2 mb-3">{review.comment}</p>
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span className="font-medium text-foreground">{review.customerName}</span>
                <span>{formatDate(review.createdAt)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
};

export default ReviewsSection;
