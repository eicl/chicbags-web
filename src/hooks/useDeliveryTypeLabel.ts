import { useQuery } from "@tanstack/react-query";
import { fetchDeliveryTypes } from "@/lib/api";

// Resuelve el nombre a mostrar de un tipo de delivery (el que se configuró
// desde Admin > Tipos de delivery), cayendo al identificador real cuando no
// hay uno configurado. React Query deduplica la queryKey entre componentes,
// así que usar este hook en varias pantallas a la vez no repite el fetch.
export const useDeliveryTypeLabel = () => {
  const { data = [] } = useQuery({ queryKey: ["deliveryTypes"], queryFn: fetchDeliveryTypes });
  return (deliveryType: string) => data.find((d) => d.deliveryType === deliveryType)?.displayName || deliveryType;
};
