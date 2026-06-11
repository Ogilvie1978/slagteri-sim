import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(request: Request) {
  // Brug service role til alt - vi validerer via company_id i body
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Hent company_id fra request body
  let companyId: string | null = null;
  try {
    const body = await request.json();
    companyId = body.companyId;
  } catch {}

  if (!companyId) return NextResponse.json({ error: "Missing companyId" }, { status: 400 });

  const { data: company } = await admin
    .from("companies")
    .select("*")
    .eq("id", companyId)
    .single();

  if (!company) return NextResponse.json({ error: "No company" }, { status: 404 });

  const DAYS = ["Mandag", "Tirsdag", "Onsdag", "Torsdag", "Fredag", "Lørdag", "Søndag"];
  const currentDayNum = company.week_day_number || 1;
  const isLastDay = currentDayNum === 5 && !company.saturday_approved;
  const isSaturday = currentDayNum === 6;

  // 1. Dyr der ankom FØR i dag er klar til slagtning
  const currentDayIdx = DAYS.indexOf(company.current_day || "Mandag");
  const arrivedDaysToMakeReady = DAYS.filter((_, i) => i !== currentDayIdx);

  await admin
    .from("stable_animals")
    .update({ ready_for_slaughter: true })
    .eq("company_id", company.id)
    .eq("status", "resting")
    .eq("ready_for_slaughter", false)
    .in("arrived_day", arrivedDaysToMakeReady);

  // 2. Kroppe der afkølede er nu klar
  await admin
    .from("cold_storage")
    .update({ status: "ready" })
    .eq("company_id", company.id)
    .eq("status", "cooling");

  // 3. Opdater modningsdage
  const { data: maturingItems } = await admin
    .from("cold_storage")
    .select("id, maturation_days, max_maturation_days")
    .eq("company_id", company.id)
    .eq("status", "maturing");

  for (const item of maturingItems || []) {
    const newDays = (item.maturation_days || 0) + 1;
    const bonus = Math.min(20, newDays * 1.5);
    const isDegraded = newDays > item.max_maturation_days;
    await admin.from("cold_storage").update({
      maturation_days: newDays,
      maturation_bonus_pct: isDegraded ? 0 : Math.round(bonus * 10) / 10,
      status: isDegraded ? "degraded" : "maturing",
    }).eq("id", item.id);
  }

  // 4. Daglig lønomkostning
  const { data: employees } = await admin
    .from("employees")
    .select("pay_type, hourly_rate, monthly_salary")
    .eq("company_id", company.id)
    .eq("active", true);

  const WORK_HOURS = 7.4;
  const dailyCost = (employees || []).reduce((sum, emp) => {
    if (emp.pay_type === "hourly") return sum + (emp.hourly_rate || 0) * WORK_HOURS;
    return sum + (emp.monthly_salary || 0) / 22;
  }, 0);

  const dailyInterest = Math.floor((company.credit_used || 0) * (company.credit_rate || 0.08) / 365);
  const totalDailyCost = Math.round(dailyCost + dailyInterest);
  const newCash = company.cash - Math.min(totalDailyCost, company.cash);
  const extraCredit = Math.max(0, totalDailyCost - company.cash);
  const newCreditUsed = Math.min(company.credit_limit, (company.credit_used || 0) + extraCredit);

  // 5. Avancer dag
  let nextDayNum = currentDayNum + 1;
  let nextWeek = company.current_week;
  let saturdayApproved = company.saturday_approved;

  if (isLastDay || isSaturday) {
    nextDayNum = 1;
    nextWeek = company.current_week + 1;
    saturdayApproved = false;
  }

  const nextDay = DAYS[nextDayNum - 1];

  await admin.from("companies").update({
    cash: newCash,
    credit_used: newCreditUsed,
    current_day: nextDay,
    week_day_number: nextDayNum,
    current_week: nextWeek,
    day_started_at: new Date().toISOString(),
    saturday_approved: saturdayApproved,
  }).eq("id", company.id);

  // 6. Opret market_weeks for næste uge hvis det er en ny uge
  if (nextWeek > company.current_week) {
    const { data: existingWeek } = await admin
      .from("market_weeks")
      .select("id")
      .eq("week_number", nextWeek)
      .single();

    if (!existingWeek) {
      // Generer nye priser med lille tilfældig variation
      const { data: lastWeek } = await admin
        .from("market_weeks")
        .select("*")
        .eq("week_number", company.current_week)
        .single();

      const vary = (val: number, pct: number) =>
        Math.round((val * (1 + (Math.random() - 0.5) * pct)) * 100) / 100;

      await admin.from("market_weeks").insert({
        week_number: nextWeek,
        demand_index: Math.min(130, Math.max(70, Math.round((lastWeek?.demand_index || 100) + (Math.random() - 0.5) * 20))),
        fuel_cost_index: Math.min(130, Math.max(80, Math.round((lastWeek?.fuel_cost_index || 100) + (Math.random() - 0.5) * 10))),
        labor_market: ["tight","normal","normal","normal","loose"][Math.floor(Math.random() * 5)],
        week_summary: `Uge ${nextWeek}: Markedet fortsætter. Hold øje med prisudviklingen.`,
      });

      // Kopier og varier dyrepriser til ny uge
      const { data: lastPrices } = await admin
        .from("animal_prices")
        .select("*")
        .eq("week_number", company.current_week);

      if (lastPrices && lastPrices.length > 0) {
        await admin.from("animal_prices").insert(
          lastPrices.map(p => ({
            week_number: nextWeek,
            industry: p.industry,
            category: p.category,
            category_label: p.category_label,
            best_use: p.best_use,
            price_dkk_per_kg: vary(p.price_dkk_per_kg, 0.08),
            weight_min_kg: p.weight_min_kg,
            weight_max_kg: p.weight_max_kg,
            unit: p.unit,
            source: "estimated",
          }))
        );
      }
    }
  }

  return NextResponse.json({
    success: true,
    nextDay,
    nextWeek,
    dailyCost: Math.round(dailyCost),
    dailyInterest,
    totalDailyCost,
  });
}
