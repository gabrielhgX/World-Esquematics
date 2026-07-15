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
