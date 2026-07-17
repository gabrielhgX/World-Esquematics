/** Formata metros para rótulos de régua/status: 1500 → "1.5 km", 0.4 → "40 cm". */
export function formatMeters(value_m: number): string {
  const abs = Math.abs(value_m);
  if (abs < 1e-9) return '0 m';
  if (abs >= 1000) return `${trim(value_m / 1000)} km`;
  if (abs >= 1) return `${trim(value_m)} m`;
  return `${trim(value_m * 100)} cm`;
}

function trim(n: number): string {
  return Number(n.toFixed(2)).toString();
}

/**
 * Rótulo de RÉGUA: a precisão vem do PASSO, não do valor — dois ticks
 * vizinhos nunca colapsam no mesmo texto (ex.: passo 1 m perto de 4 km
 * imprime "4001 m", nunca dois "4 km" seguidos). A unidade também vem do
 * passo, para a régua inteira ficar homogênea.
 */
export function formatRulerMeters(value_m: number, step_m: number): string {
  if (!(step_m > 0)) return formatMeters(value_m);
  const km = step_m >= 100;
  const unitValue = km ? value_m / 1000 : value_m;
  const unitStep = km ? step_m / 1000 : step_m;
  const digits = Math.max(0, -Math.floor(Math.log10(unitStep) + 1e-9));
  let text = unitValue.toFixed(digits);
  if (Number(text) === 0) text = (0).toFixed(digits); // sem "-0"
  return `${text} ${km ? 'km' : 'm'}`;
}
