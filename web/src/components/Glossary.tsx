import { Tooltip } from "./ui";

const TERMS: Record<string, string> = {
  evapotranspiración:
    "Agua que el suelo y la planta devuelven al aire; indica la demanda hídrica del cultivo.",
  ndvi:
    "Índice satelital de verdor: valores altos = más vegetación activa, bajos = suelo desnudo o seco.",
  anomalía:
    "Diferencia respecto de lo normal para esa época del año, medida con años anteriores.",
  "balance hídrico":
    "Lluvia disponible menos lo que el cultivo necesita en su ciclo; negativo = déficit.",
  "grados-día":
    "Suma de calor útil (sobre 10 °C) que acumula un cultivo para completar su ciclo.",
};

export function glossaryText(term: string): string {
  return TERMS[term.toLowerCase()] ??
    "Término técnico; consultá el glosario.";
}

/** "?" icon next to a technical term. */
export function Glossary({ term }: { term: string }) {
  return <Tooltip label={`${term}?`} text={glossaryText(term)} />;
}
