import { NextRequest } from "next/server";
import { format } from "date-fns";
import { requireOrganization } from "@/lib/auth-helpers";
import { computeForecast } from "@/lib/cashflow/forecast";
import { buildForecastWorkbook } from "@/lib/cashflow/xlsx-export";

const ALLOWED_STRESS_DAYS = new Set([0, 7, 14, 30]);

/**
 * CF-4 — Download the current cashflow forecast as a .xlsx workbook.
 *
 * URL: `/api/cashflow/forecast/export?stressDays=N`
 *
 * The route uses the same stress-day allow-list as the page itself
 * so URL-tampering can't request an unsupported scenario via the
 * export endpoint.
 *
 * Streams a single workbook with 4 sheets: Summary / Weekly / Daily
 * / Items. See `lib/cashflow/xlsx-export.ts` for the schema.
 */
export async function GET(req: NextRequest) {
  const { organization } = await requireOrganization();
  const today = new Date();

  const rawStress = req.nextUrl.searchParams.get("stressDays");
  const parsed = rawStress ? Number.parseInt(rawStress, 10) : 0;
  const stressDays =
    Number.isFinite(parsed) && ALLOWED_STRESS_DAYS.has(parsed) ? parsed : 0;

  const forecast = await computeForecast(organization.id, today, 84, {
    currency: organization.currency,
    stressDays,
  });

  const buf = await buildForecastWorkbook(forecast, organization.name);

  const scenarioSuffix =
    stressDays > 0 ? `-stress-${stressDays}d` : "";
  const filename = `cashflow-forecast-${format(today, "yyyy-MM-dd")}${scenarioSuffix}.xlsx`;

  return new Response(buf as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
      "Content-Length": String(buf.byteLength),
    },
  });
}
