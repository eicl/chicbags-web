import { useQuery } from "@tanstack/react-query";
import { fetchMonthlySales, fetchDailySalesBySeller } from "@/lib/api";
import SalesLineChart, { SalesLineChartSeries } from "@/components/admin/SalesLineChart";

// Paleta categórica validada (ver skill de dataviz) — orden fijo, nunca se
// reordena por valor. Hasta 8 vendedores caben cómodos; de ahí para
// arriba se pliegan en "Otros" con un gris neutro en vez de inventar una
// novena tonalidad.
const CATEGORICAL_PALETTE = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#4a3aa7", "#e34948"];
const OTHER_COLOR = "#898781";
const MAX_SELLER_SERIES = 8;

const formatSoles = (v: number) => `S/.${v.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const monthLabel = (key: string) => {
  const [y, m] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("es-PE", { month: "short", year: "numeric", timeZone: "UTC" });
};

const dayLabel = (key: string) => {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("es-PE", { day: "2-digit", month: "short", timeZone: "UTC" });
};

const dayLabelFull = (key: string) => {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("es-PE", { weekday: "short", day: "2-digit", month: "short", timeZone: "UTC" });
};

const ChartCard = ({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) => (
  <div className="p-6 border border-border rounded-lg bg-card">
    <h2 className="text-lg font-medium mb-1" style={{ fontFamily: "var(--font-display)" }}>
      {title}
    </h2>
    <p className="text-sm text-muted-foreground mb-6">{subtitle}</p>
    {children}
  </div>
);

const AdminDashboard = () => {
  const { data: monthly = [], isLoading: loadingMonthly } = useQuery({ queryKey: ["dashboardMonthlySales"], queryFn: fetchMonthlySales });
  const { data: daily, isLoading: loadingDaily } = useQuery({
    queryKey: ["dashboardDailySalesBySeller"],
    queryFn: fetchDailySalesBySeller,
  });

  const monthlyTotal = monthly.reduce((sum, m) => sum + m.total, 0);
  const currentMonthTotal = monthly[monthly.length - 1]?.total ?? 0;

  // De los N vendedores, se arman hasta MAX_SELLER_SERIES series propias
  // (en el mismo orden que manda el servidor) y el resto se pliega en
  // "Otros" — ver el comentario de CATEGORICAL_PALETTE arriba.
  let sellerSeries: SalesLineChartSeries[] = [];
  let dailyXLabels: string[] = [];
  let dailyXTooltipLabels: string[] = [];
  let dailyTotal = 0;

  if (daily) {
    dailyXLabels = daily.days.map((d) => dayLabel(d.date));
    dailyXTooltipLabels = daily.days.map((d) => dayLabelFull(d.date));

    const mainSellers = daily.sellers.slice(0, MAX_SELLER_SERIES);
    const restSellers = daily.sellers.slice(MAX_SELLER_SERIES);

    const totalBySeller = new Map<number, number>();
    for (const seller of daily.sellers) {
      totalBySeller.set(
        seller.id,
        daily.days.reduce((sum, d) => sum + (d.totals[seller.id] ?? 0), 0)
      );
    }

    sellerSeries = mainSellers.map((seller, i) => ({
      key: String(seller.id),
      label: `${seller.username} — ${formatSoles(totalBySeller.get(seller.id) ?? 0)}`,
      color: CATEGORICAL_PALETTE[i],
      values: daily.days.map((d) => d.totals[seller.id] ?? 0),
    }));

    if (restSellers.length > 0) {
      const restTotal = restSellers.reduce((sum, s) => sum + (totalBySeller.get(s.id) ?? 0), 0);
      sellerSeries.push({
        key: "other",
        label: `Otros (${restSellers.length}) — ${formatSoles(restTotal)}`,
        color: OTHER_COLOR,
        values: daily.days.map((d) => restSellers.reduce((sum, s) => sum + (d.totals[s.id] ?? 0), 0)),
      });
    }

    dailyTotal = daily.sellers.reduce((sum, s) => sum + (totalBySeller.get(s.id) ?? 0), 0);
  }

  return (
    <div className="max-w-5xl space-y-6">
      <ChartCard title="Evolución de ventas por mes" subtitle="Total de pedidos registrados, mes a mes (últimos 12 meses).">
        {loadingMonthly ? (
          <p className="text-sm text-muted-foreground">Cargando...</p>
        ) : (
          <>
            <div className="flex flex-wrap gap-6 mb-4">
              <div>
                <p className="text-xs uppercase tracking-widest text-muted-foreground mb-1">Este mes</p>
                <p className="text-2xl font-medium">{formatSoles(currentMonthTotal)}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-widest text-muted-foreground mb-1">Últimos 12 meses</p>
                <p className="text-2xl font-medium">{formatSoles(monthlyTotal)}</p>
              </div>
            </div>
            <SalesLineChart
              xLabels={monthly.map((m) => monthLabel(m.month))}
              series={[{ key: "total", label: "Ventas", color: "hsl(var(--primary))", values: monthly.map((m) => m.total) }]}
            />
          </>
        )}
      </ChartCard>

      <ChartCard title="Ventas diarias por vendedor" subtitle="Total de pedidos registrados por vendedor, día a día (últimos 30 días).">
        {loadingDaily || !daily ? (
          <p className="text-sm text-muted-foreground">Cargando...</p>
        ) : daily.sellers.length === 0 ? (
          <p className="text-sm text-muted-foreground">Todavía no hay vendedores registrados.</p>
        ) : (
          <>
            <div className="mb-4">
              <p className="text-xs uppercase tracking-widest text-muted-foreground mb-1">Últimos 30 días (todos los vendedores)</p>
              <p className="text-2xl font-medium">{formatSoles(dailyTotal)}</p>
            </div>
            <SalesLineChart xLabels={dailyXLabels} xTooltipLabels={dailyXTooltipLabels} series={sellerSeries} />
          </>
        )}
      </ChartCard>
    </div>
  );
};

export default AdminDashboard;
