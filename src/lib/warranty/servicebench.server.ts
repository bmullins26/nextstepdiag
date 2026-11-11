// Whirlpool Corporation live entitlement lookup via ServiceBench's public
// warranty lookup (serviceAdministratorId 27 = Whirlpool US). Server-only.
// Best-effort: hard 3s cap, never throws — local decoder is the fallback.
// Consumer PII (owner name, dealer account #) is intentionally dropped.

type Row = { dataKey: string; dataDescripton?: string | null };

export type SbEntitlement = {
  productName: string | null;
  manufacturedDate: string | null;
  purchaseDate: string | null;
  markedAs: string | null;
  standard: { laborMonths: string | null; laborExpires: string | null; partsMonths: string | null; partsExpires: string | null };
  extended: { component: string; partsMonths: string | null; partsExpires: string | null; laborMonths: string | null; laborExpires: string | null }[];
  notices: { number: string | null; description: string | null; expires: string | null }[];
  history: { claimNumber: string | null; date: string | null; complaint: string | null; parts: { name: string; number: string | null }[] }[];
};

/** Split a flat key/value list into records, starting a new one when `startKey` repeats. */
function group(rows: Row[] | undefined, startKey: string): Record<string, string | null>[] {
  const out: Record<string, string | null>[] = [];
  for (const r of rows ?? []) {
    if (r.dataKey === startKey || !out.length) out.push({});
    out[out.length - 1][r.dataKey] = r.dataDescripton ?? null;
  }
  return out;
}

export async function lookupServiceBench(model: string, serial: string): Promise<SbEntitlement | null> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 3000);
  try {
    const res = await fetch("https://warrantylookup.servicebench.com/api/wm", {
      method: "POST",
      signal: ctl.signal,
      headers: { "content-type": "application/json", url: "operations/warrantymanagement/v1/lookup" },
      body: JSON.stringify({ modelNumber: model.toUpperCase(), serialNumber: serial.toUpperCase(), serviceAdministratorId: "27" }),
    });
    if (!res.ok) return null;
    const j = (await res.json()) as { entitlement?: Record<string, Row[]> };
    const e = j.entitlement;
    if (!e?.overview?.length) return null;
    const ov = group(e.overview, "productName")[0] ?? {};
    const sw = group(e.standardWarranty, "laborWarranty")[0] ?? {};
    // Service history: one claim spans claimId..parts; parts repeat inside.
    const history: SbEntitlement["history"] = [];
    for (const r of e.serviceHistory ?? []) {
      const v = r.dataDescripton ?? null;
      if (r.dataKey === "claimId" || !history.length) history.push({ claimNumber: null, date: null, complaint: null, parts: [] });
      const h = history[history.length - 1];
      if (r.dataKey === "claimNumber") h.claimNumber = v;
      else if (r.dataKey === "dateServiceRequested") h.date = v;
      else if (r.dataKey === "customerComplaint") h.complaint = v;
      else if (r.dataKey === "partName" && v) h.parts.push({ name: v, number: null });
      else if (r.dataKey === "partNumber" && h.parts.length) h.parts[h.parts.length - 1].number = v;
    }
    return {
      productName: ov.productName ?? null,
      manufacturedDate: ov.manufacturedDate ?? ov.actualGoodsIssueDate ?? null,
      purchaseDate: ov.purchaseDate ?? null,
      markedAs: ov.markedAs ?? null,
      standard: { laborMonths: sw.laborWarranty ?? null, laborExpires: sw.laborExpirationDate ?? null, partsMonths: sw.partsWarranty ?? null, partsExpires: sw.partsExpirationDate ?? null },
      extended: group(e.extendedWarranty, "defectDescription").filter((x) => x.defectDescription).map((x) => ({
        component: x.defectDescription!, partsMonths: x.partsWarranty ?? null, partsExpires: x.partsExpirationDate ?? null,
        laborMonths: x.laborWarranty ?? null, laborExpires: x.laborExpirationDate ?? null,
      })),
      notices: group(e.serviceNotification, "recallNumber").filter((x) => x.recallNumber || x.description).map((x) => ({
        number: x.recallNumber ?? null, description: x.description ?? null, expires: x.expirationDate ?? null,
      })),
      history: history.slice(0, 10),
    };
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}
