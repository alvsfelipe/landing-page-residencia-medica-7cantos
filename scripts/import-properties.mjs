import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

function parseCsv(source) {
  const rows = [];
  let row = [];
  let value = "";
  let quoted = false;

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    const next = source[index + 1];

    if (character === '"' && quoted && next === '"') {
      value += '"';
      index += 1;
    } else if (character === '"') {
      quoted = !quoted;
    } else if (character === "," && !quoted) {
      row.push(value);
      value = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && next === "\n") index += 1;
      row.push(value);
      if (row.some((cell) => cell.trim())) rows.push(row);
      row = [];
      value = "";
    } else {
      value += character;
    }
  }

  if (value || row.length) {
    row.push(value);
    rows.push(row);
  }

  const [headers, ...records] = rows;
  return records.map((record) => Object.fromEntries(headers.map((header, index) => [header.trim(), record[index]?.trim() ?? ""])));
}

const numberOrZero = (value) => {
  const parsed = Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
};

const [, , propertiesPath, imagesPath, outputPath = "data/properties.json"] = process.argv;

if (!propertiesPath || !imagesPath) {
  console.error("Uso: node scripts/import-properties.mjs <imoveis.csv> <imagens.csv> [saida.json]");
  process.exit(1);
}

const [propertiesCsv, imagesCsv] = await Promise.all([
  readFile(resolve(propertiesPath), "utf8"),
  readFile(resolve(imagesPath), "utf8"),
]);

const imagesById = new Map(
  parseCsv(imagesCsv.replace(/^\uFEFF/, ""))
    .filter((row) => row.ID && row["URL Imagem Principal"])
    .map((row) => [row.ID, row["URL Imagem Principal"]]),
);

const properties = parseCsv(propertiesCsv.replace(/^\uFEFF/, ""))
  .filter((row) => row.city?.toLocaleLowerCase("pt-BR") === "são paulo" && row.state?.toUpperCase() === "SP")
  .map((row) => {
    const photo = imagesById.get(row.id);
    return {
      id: row.id,
      bairro: row.neighborhood,
      cidade: row.city,
      uf: row.state,
      cep: row.postal_code,
      endereco: [row.street, row.number].filter(Boolean).join(", "),
      complemento: row.unit || undefined,
      aluguel: numberOrZero(row.rent_price),
      condominio: numberOrZero(row.condo_fee),
      iptu: numberOrZero(row.property_tax),
      area: numberOrZero(row.area_m2),
      quartos: numberOrZero(row.bedrooms),
      banheiros: numberOrZero(row.bathrooms),
      suites: numberOrZero(row.suites),
      vagas: numberOrZero(row.parking_spaces),
      foto: photo || undefined,
      fotos: photo ? [photo] : [],
    };
  });

await writeFile(resolve(outputPath), `${JSON.stringify(properties, null, 2)}\n`, "utf8");

const vilaClementino = properties.filter((property) => property.bairro?.toLocaleLowerCase("pt-BR") === "vila clementino");
console.log(`Importados ${properties.length} imóveis de São Paulo.`);
console.log(`Vila Clementino: ${vilaClementino.length} imóveis (${vilaClementino.filter((property) => property.foto).length} com foto).`);
