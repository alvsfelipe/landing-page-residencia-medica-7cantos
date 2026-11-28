import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();

async function loadLocalEnv() {
  const envPath = process.env.MOBILITY_ENV_FILE || path.join(root, ".env.local");
  const contents = await readFile(envPath, "utf8");
  return Object.fromEntries(
    contents
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#") && line.includes("="))
      .map((line) => {
        const separator = line.indexOf("=");
        return [line.slice(0, separator), line.slice(separator + 1).replace(/^['"]|['"]$/g, "")];
      }),
  );
}

const normalize = (value) =>
  value.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("pt-BR");

async function geocode(address, apiKey) {
  const query = new URLSearchParams({
    text: address,
    size: "1",
    "boundary.country": "BR",
  });
  const response = await fetch(`https://api.openrouteservice.org/geocode/search?${query}`, {
    headers: { Authorization: apiKey },
  });
  if (!response.ok) throw new Error(`Geocoding respondeu ${response.status} para ${address}`);
  const payload = await response.json();
  const coordinates = payload.features?.[0]?.geometry?.coordinates;
  if (!coordinates || coordinates.length < 2) return null;
  return { latitude: coordinates[1], longitude: coordinates[0] };
}

const env = await loadLocalEnv();
const apiKey = env.OPENROUTESERVICE_API_KEY;
if (!apiKey) throw new Error("OPENROUTESERVICE_API_KEY não encontrada em .env.local");

const propertiesPath = path.join(root, "data/properties.json");
const anchorsPath = path.join(root, "data/mobility-anchors.json");
const properties = JSON.parse(await readFile(propertiesPath, "utf8"));
const anchorCatalog = JSON.parse(await readFile(anchorsPath, "utf8"));
const cache = new Map();

async function coordinatesFor(address) {
  const key = normalize(address);
  if (!cache.has(key)) cache.set(key, await geocode(address, apiKey));
  return cache.get(key);
}

for (const anchorSet of Object.values(anchorCatalog)) {
  for (const anchor of anchorSet.anchors || []) {
    if (!anchor.coordinates) anchor.coordinates = await coordinatesFor(anchor.address);
  }
}

for (const property of properties) {
  if (normalize(property.bairro || "") !== "vila clementino") continue;
  const address = [
    property.endereco,
    property.bairro,
    property.cidade || "São Paulo",
    property.uf || "SP",
    property.cep,
  ].filter(Boolean).join(", ");
  if (!property.coordinates) property.coordinates = await coordinatesFor(address);
}

await writeFile(propertiesPath, `${JSON.stringify(properties, null, 2)}\n`);
await writeFile(anchorsPath, `${JSON.stringify(anchorCatalog, null, 2)}\n`);
console.log(`Coordenadas persistidas para ${cache.size} endereços únicos.`);
