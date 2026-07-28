/**
 * Sincroniza data/properties.json a partir da API externa da 7Cantos.
 *
 * Substituiu o fluxo por CSV, que dependia de exportações manuais do
 * demand-generator.
 *
 * Uso:
 *   npm run sync:properties                        # Vila Clementino, São Paulo/SP, disponíveis
 *   npm run sync:properties -- --dry-run           # não grava, só relata
 *   npm run sync:properties -- --bairro Moema
 *   npm run sync:properties -- --todos-bairros
 *   npm run sync:properties -- --incluir-alugados  # sem o filtro is_active
 *   npm run sync:properties -- --sem-fotos         # pula o detalhe (mais rápido, sem imagens)
 *
 * Credenciais em .env.local: SETE_CANTOS_API_TOKEN (obrigatório, formato
 * `7c_live_...`, escopo `imoveis:read`) e SETE_CANTOS_API_URL (opcional).
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { DEFAULT_BASE_URL, fetchAllImoveis, hydratePhotos } from "../lib/sete-cantos/client.ts";
import { findQualityIssues, isAvailable, mapImovel } from "../lib/sete-cantos/map.ts";

const root = process.cwd();

async function loadLocalEnv() {
  const envPath = process.env.SETE_CANTOS_ENV_FILE || path.join(root, ".env.local");
  const contents = await readFile(envPath, "utf8").catch(() => "");
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

function parseArgs(argv) {
  const options = {
    neighborhood: "Vila Clementino",
    city: "São Paulo",
    uf: "SP",
    onlyAvailable: true,
    comFotos: true,
    out: "data/properties.json",
    pageSize: 100,
    dryRun: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = () => argv[++index];

    if (arg === "--dry-run") options.dryRun = true;
    else if (arg === "--todos-bairros") options.neighborhood = "";
    else if (arg === "--incluir-alugados") options.onlyAvailable = false;
    else if (arg === "--sem-fotos") options.comFotos = false;
    else if (arg === "--bairro") options.neighborhood = next();
    else if (arg === "--cidade") options.city = next();
    else if (arg === "--uf") options.uf = next();
    else if (arg === "--out") options.out = next();
    else if (arg === "--page-size") options.pageSize = Number(next());
    else throw new Error(`Argumento desconhecido: ${arg}`);
  }

  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const env = await loadLocalEnv();
  const token = process.env.SETE_CANTOS_API_TOKEN || env.SETE_CANTOS_API_TOKEN;
  const baseUrl = process.env.SETE_CANTOS_API_URL || env.SETE_CANTOS_API_URL || DEFAULT_BASE_URL;

  if (!token) {
    console.error("SETE_CANTOS_API_TOKEN não encontrado. Defina em .env.local (veja .env.example).");
    process.exit(1);
  }

  const alvo = [options.neighborhood, options.city, options.uf].filter(Boolean).join(", ") || "todos os bairros";
  console.log(`Buscando imóveis em ${baseUrl}/imoveis`);
  console.log(`  filtro: ${alvo}${options.onlyAvailable ? " — apenas disponíveis (is_active=true)" : " — incluindo alugados"}`);

  const imoveis = await fetchAllImoveis(
    { token, baseUrl },
    {
      pageSize: options.pageSize,
      neighborhood: options.neighborhood || undefined,
      city: options.city || undefined,
      uf: options.uf || undefined,
      ...(options.onlyAvailable ? { is_active: true } : {}),
      onPage: (page) => console.log(`  página ${page.page}: ${page.items.length} imóveis (total ${page.total})`),
    },
  );

  console.log(`Recebidos ${imoveis.length} imóveis da API.`);

  if (imoveis.length === 0) {
    console.error("\nERRO: a API não devolveu nenhum imóvel — properties.json não foi alterado.");
    console.error("Confira o bairro/cidade informados e o escopo da API key.");
    process.exit(1);
  }

  const disponiveis = imoveis.filter(isAvailable);
  const alugados = imoveis.length - disponiveis.length;
  if (alugados > 0) console.log(`Descartados ${alugados} imóveis já alugados (is_rented).`);

  // A listagem não devolve `photos`; sem isso todo card da landing fica sem imagem.
  let completos = disponiveis;
  if (options.comFotos) {
    console.log(`Buscando fotos no endpoint de detalhe (${disponiveis.length} imóveis)...`);
    completos = await hydratePhotos(
      { token, baseUrl },
      disponiveis,
      { onProgress: (feitos, total) => process.stdout.write(`\r  ${feitos}/${total}`) },
    );
    process.stdout.write("\n");
  }

  const properties = completos
    .map(mapImovel)
    .sort((a, b) => (a.quartos || 0) - (b.quartos || 0) || (a.area || 0) - (b.area || 0));

  const issues = findQualityIssues(properties);
  if (issues.length) {
    const porProblema = new Map();
    for (const issue of issues) porProblema.set(issue.problema, (porProblema.get(issue.problema) ?? 0) + 1);
    console.log("\nAvisos de qualidade:");
    for (const [problema, quantidade] of porProblema) console.log(`  ${quantidade} imóvel(is) ${problema}`);
  }

  // Um imóvel sem bairro ou sem aluguel não é exibível: a landing filtra por
  // `bairro === "vila clementino"` e mostra o valor no card.
  const inexibiveis = properties.filter((property) => !property.bairro || property.aluguel <= 0).length;
  if (inexibiveis === properties.length) {
    console.error(
      "\nERRO: nenhum imóvel tem bairro e valor de aluguel utilizáveis — o contrato da API pode ter mudado." +
        "\nConfira lib/sete-cantos/map.ts. properties.json não foi alterado.",
    );
    process.exit(1);
  }

  const outPath = path.resolve(root, options.out);

  // scripts/geocode-mobility.mjs grava coordenadas neste mesmo arquivo; sem este
  // merge, cada sincronização apagaria o geocoding já pago à ORS.
  const anteriores = JSON.parse(await readFile(outPath, "utf8").catch(() => "[]"));
  const coordenadasConhecidas = new Map(
    anteriores.filter((item) => item?.id && item.coordinates).map((item) => [String(item.id), item.coordinates]),
  );

  // `mapImovel` omite a chave `coordinates` quando a API não traz lat/long, então
  // basta reinseri-la quando houver coordenada nova ou herdada do geocoding.
  const finais = properties.map((property) => {
    const coordinates = property.coordinates ?? coordenadasConhecidas.get(property.id);
    return coordinates ? { ...property, coordinates } : property;
  });

  const comCoordenadas = finais.filter((property) => property.coordinates).length;

  if (options.dryRun) {
    console.log(`\n[dry-run] ${finais.length} imóveis prontos; ${options.out} não foi alterado.`);
    console.log(JSON.stringify(finais.slice(0, 2), null, 2));
  } else {
    await writeFile(outPath, `${JSON.stringify(finais, null, 2)}\n`, "utf8");
    console.log(`\nGravados ${finais.length} imóveis em ${options.out} (${comCoordenadas} com coordenadas).`);
    if (comCoordenadas < finais.length) console.log("Rode `npm run geocode:mobility` para geocodificar os endereços restantes.");
  }
}

// Falhas de rede/credencial devem virar mensagem legível, não stack trace.
main().catch((error) => {
  console.error(`\nERRO: ${error.message}`);
  if (error.body) console.error(`Resposta da API: ${error.body}`);
  process.exit(1);
});
