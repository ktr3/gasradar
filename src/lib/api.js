const API_BASE = "https://sedeaplicaciones.minetur.gob.es/ServiciosRESTCarburantes/PreciosCarburantes";

export const FUEL_TYPES = [
  { key: "Precio Gasolina 95 E5", label: "Gasolina 95", short: "G95" },
  { key: "Precio Gasolina 98 E5", label: "Gasolina 98", short: "G98" },
  { key: "Precio Gasoleo A", label: "Diésel", short: "Diésel" },
  { key: "Precio Gasoleo Premium", label: "Diésel+", short: "Diésel+" },
  { key: "Precio Gases licuados del petróleo", label: "GLP", short: "GLP" },
];

export async function fetchStations() {
  const res = await fetch(`${API_BASE}/EstacionesTerrestres/`);
  if (!res.ok) throw new Error("Error fetching stations");
  const data = await res.json();
  return data.ListaEESSPrecio || [];
}

export async function fetchStationsByProvince(provinceId) {
  const res = await fetch(`${API_BASE}/EstacionesTerrestres/FiltroProvincia/${provinceId}`);
  if (!res.ok) throw new Error("Error fetching stations");
  const data = await res.json();
  return data.ListaEESSPrecio || [];
}

export function parseStation(raw, fuelKey) {
  const priceStr = raw[fuelKey];
  if (!priceStr) return null;

  const price = parseFloat(priceStr.replace(",", "."));
  if (isNaN(price) || price <= 0) return null;

  const lat = parseFloat((raw["Latitud"] || "").replace(",", "."));
  const lng = parseFloat((raw["Longitud (WGS84)"] || "").replace(",", "."));
  if (isNaN(lat) || isNaN(lng)) return null;

  return {
    id: raw["IDEESS"],
    name: raw["Rótulo"] || "Sin nombre",
    address: raw["Dirección"] || "",
    locality: raw["Localidad"] || "",
    municipality: raw["Municipio"] || "",
    province: raw["Provincia"] || "",
    cp: raw["C.P."] || "",
    schedule: raw["Horario"] || "",
    lat,
    lng,
    price,
    brand: raw["Rótulo"] || "",
  };
}

export function categorizePrice(price, stats) {
  if (price <= stats.p25) return "cheap";
  if (price <= stats.p75) return "mid";
  return "expensive";
}

export function computeStats(stations) {
  if (!stations.length) return { min: 0, max: 0, avg: 0, p25: 0, p75: 0 };
  const prices = stations.map((s) => s.price).sort((a, b) => a - b);
  const len = prices.length;
  return {
    min: prices[0],
    max: prices[len - 1],
    avg: prices.reduce((a, b) => a + b, 0) / len,
    p25: prices[Math.floor(len * 0.25)],
    p75: prices[Math.floor(len * 0.75)],
  };
}

export function extractBrands(stations, minCount = 10) {
  const map = {};
  for (const s of stations) {
    const brand = s.brand.toUpperCase().trim();
    if (!brand) continue;
    if (!map[brand]) map[brand] = 0;
    map[brand]++;
  }
  return Object.entries(map)
    .filter(([, count]) => count >= minCount)
    .map(([brand, count]) => ({ brand, count }))
    .sort((a, b) => b.count - a.count);
}

export function getDistance(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
