const SPREADSHEET_ID = "1-X3w6j3ZpiYwaKPEzeyWPpDcKiHUQx6haBbge8U1IZ8";
const SHEET_NAME = "Leads";
const MOBILITY_SHEET_NAME = "Mobilidade";
const INTERESTS_SHEET_NAME = "Interesses";
const MOBILITY_HEADERS = [
  "Chave",
  "Conjunto de âncoras",
  "ID âncora",
  "Endereço âncora",
  "ID imóvel",
  "Endereço imóvel",
  "Modo",
  "Distância (m)",
  "Duração (min)",
  "Status",
  "Provedor",
  "Calculado em",
  "Expira em",
  "ID do par de coordenadas",
  "Duração a pé (min)",
  "Duração de carro (min)",
];

function doPost(event) {
  try {
    const payload = JSON.parse(event.postData.contents || "{}");
    const expectedToken = PropertiesService.getScriptProperties().getProperty("WEBHOOK_TOKEN");

    if (!expectedToken || payload.token !== expectedToken) {
      return jsonResponse({ ok: false, error: "Não autorizado." });
    }

    if (payload.action === "mobility_lookup") {
      return jsonResponse(lookupMobility(payload));
    }
    if (payload.action === "mobility_store") {
      return jsonResponse(storeMobility(payload));
    }
    if (payload.action === "property_interest") {
      return jsonResponse(storePropertyInterest(payload));
    }

    const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEET_NAME);
    if (!sheet) {
      return jsonResponse({ ok: false, error: "Aba Leads não encontrada." });
    }
    sheet.getRange(1, 17, 1, 2).setValues([["Imóveis compatíveis", "IDs dos imóveis compatíveis"]]);

    sheet.appendRow([
      payload.receivedAt || new Date().toISOString(),
      payload.name || "",
      payload.whatsapp || "",
      payload.currentCity || "",
      payload.hospitalProgram || "",
      payload.moveDate || "",
      payload.budget || "",
      payload.livingArrangement || "",
      payload.consent ? "Sim" : "Não",
      payload.utmSource || "",
      payload.utmMedium || "",
      payload.utmCampaign || "",
      payload.ref || "",
      payload.pageUrl || "",
      "Novo",
      "",
      Number(payload.matchingPropertyCount) || 0,
      Array.isArray(payload.matchingPropertyIds) ? payload.matchingPropertyIds.join(", ") : "",
    ]);

    return jsonResponse({ ok: true });
  } catch (error) {
    console.error(error);
    return jsonResponse({ ok: false, error: String(error) });
  }
}

function getInterestsSheet() {
  const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = spreadsheet.getSheetByName(INTERESTS_SHEET_NAME);
  const headers = [
    "Clicado em",
    "Nome",
    "WhatsApp",
    "ID imóvel",
    "Endereço imóvel",
    "URL imóvel",
    "ID hospital",
    "Hospital escolhido",
    "utm_source",
    "utm_medium",
    "utm_campaign",
    "ref",
    "Página de origem",
  ];
  if (!sheet) sheet = spreadsheet.insertSheet(INTERESTS_SHEET_NAME);
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.setFrozenRows(1);
  return sheet;
}

function storePropertyInterest(payload) {
  const sheet = getInterestsSheet();
  sheet.appendRow([
    payload.clickedAt || new Date().toISOString(),
    payload.name || "",
    payload.whatsapp || "",
    payload.propertyId || "",
    payload.propertyAddress || "",
    payload.propertyUrl || "",
    payload.hospitalId || "",
    payload.hospitalName || "",
    payload.utmSource || "",
    payload.utmMedium || "",
    payload.utmCampaign || "",
    payload.ref || "",
    payload.sourcePageUrl || payload.pageUrl || "",
  ]);
  return { ok: true };
}

function getMobilitySheet() {
  const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = spreadsheet.getSheetByName(MOBILITY_SHEET_NAME);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(MOBILITY_SHEET_NAME);
  }
  sheet.getRange(1, 1, 1, MOBILITY_HEADERS.length).setValues([MOBILITY_HEADERS]);
  sheet.setFrozenRows(1);
  return sheet;
}

function lookupMobility(payload) {
  const pairs = Array.isArray(payload.pairs) ? payload.pairs.slice(0, 6) : [];
  if (!pairs.length) return { ok: true, records: [] };

  const sheet = getMobilitySheet();
  const rows = sheet.getLastRow() > 1
    ? sheet.getRange(2, 1, sheet.getLastRow() - 1, MOBILITY_HEADERS.length).getValues()
    : [];
  const byKey = new Map(rows.map(function(row) { return [String(row[0]), row]; }));
  const byCoordinatePairAndMode = new Map();
  rows.forEach(function(row) {
    const pairId = String(row[13] || "");
    if (pairId) byCoordinatePairAndMode.set(pairId + "|" + String(row[6]), row);
  });
  const now = Date.now();
  const records = [];

  pairs.forEach(function(pair) {
    const pairId = String(pair.pairId || "");
    const row = byKey.get(String(pair.key || "")) ||
      (pairId ? byCoordinatePairAndMode.get(pairId + "|" + String(pair.mode || "")) : null);
    if (!row) return;
    const expiresAt = new Date(row[12]).getTime();
    if (!Number.isFinite(expiresAt) || expiresAt <= now) return;

    records.push({
      key: String(pair.key || row[0]),
      originId: String(pair.originId || row[4]),
      anchorId: String(row[2]),
      mode: String(row[6]),
      distanceMeters: row[7] === "" ? null : Number(row[7]),
      durationMinutes: row[8] === "" ? null : Number(row[8]),
      status: String(row[9]),
      provider: String(row[10]),
      pairId: String(row[13] || ""),
    });
  });

  return { ok: true, records: records };
}

function storeMobility(payload) {
  const records = Array.isArray(payload.records) ? payload.records.slice(0, 6) : [];
  if (!records.length) return { ok: true, stored: 0 };

  const containsGoogleResult = records.some(function(record) {
    return String(record.provider || "") === "google-routes";
  });
  const maximumTtl = containsGoogleResult ? 30 : 3650;
  const ttlDays = Math.min(maximumTtl, Math.max(1, Number(payload.ttlDays) || 30));
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    const sheet = getMobilitySheet();
    const existingRows = sheet.getLastRow() > 1
      ? sheet.getRange(2, 1, sheet.getLastRow() - 1, MOBILITY_HEADERS.length).getValues()
      : [];
    const rowNumberByKey = new Map();
    const durationsByPair = new Map();
    existingRows.forEach(function(row, index) {
      rowNumberByKey.set(String(row[0]), index + 2);
      const pairId = String(row[13] || "");
      if (!pairId) return;
      const durations = durationsByPair.get(pairId) || { walk: "", drive: "", rows: [] };
      if (String(row[6]) === "WALK" && row[8] !== "") durations.walk = Number(row[8]);
      if (String(row[6]) === "DRIVE" && row[8] !== "") durations.drive = Number(row[8]);
      if (row[14] !== "") durations.walk = Number(row[14]);
      if (row[15] !== "") durations.drive = Number(row[15]);
      durations.rows.push(index + 2);
      durationsByPair.set(pairId, durations);
    });

    const computedAt = new Date();
    const expiresAt = new Date(computedAt.getTime() + ttlDays * 24 * 60 * 60 * 1000);
    records.forEach(function(record) {
      const pairId = String(record.pairId || "");
      const durations = durationsByPair.get(pairId) || { walk: "", drive: "", rows: [] };
      if (String(record.mode) === "WALK" && record.durationMinutes != null) {
        durations.walk = Number(record.durationMinutes);
      }
      if (String(record.mode) === "DRIVE" && record.durationMinutes != null) {
        durations.drive = Number(record.durationMinutes);
      }
      const row = [[
        String(record.key || ""),
        String(record.anchorSetId || ""),
        String(record.anchorId || ""),
        String(record.anchorAddress || ""),
        String(record.originId || ""),
        String(record.originAddress || ""),
        String(record.mode || "WALK"),
        record.distanceMeters == null ? "" : Number(record.distanceMeters),
        record.durationMinutes == null ? "" : Number(record.durationMinutes),
        String(record.status || "route_not_found"),
        String(record.provider || ""),
        computedAt,
        expiresAt,
        pairId,
        durations.walk,
        durations.drive,
      ]];
      const rowNumber = rowNumberByKey.get(String(record.key || ""));
      if (rowNumber) sheet.getRange(rowNumber, 1, 1, MOBILITY_HEADERS.length).setValues(row);
      else sheet.getRange(sheet.getLastRow() + 1, 1, 1, MOBILITY_HEADERS.length).setValues(row);
      if (pairId) {
        durations.rows.forEach(function(existingRowNumber) {
          sheet.getRange(existingRowNumber, 15, 1, 2).setValues([[durations.walk, durations.drive]]);
        });
        durationsByPair.set(pairId, durations);
      }
    });
    return { ok: true, stored: records.length };
  } finally {
    lock.releaseLock();
  }
}

function jsonResponse(body) {
  return ContentService
    .createTextOutput(JSON.stringify(body))
    .setMimeType(ContentService.MimeType.JSON);
}
