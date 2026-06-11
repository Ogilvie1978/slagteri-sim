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

  // 0. Fix stable_current_animals baseret på faktisk antal
  const { count: actualStableCount } = await admin
    .from("stable_animals")
    .select("*", { count: "exact", head: true })
    .eq("company_id", company.id)
    .in("status", ["resting", "ready"]);

  await admin.from("companies")
    .update({ stable_current_animals: actualStableCount || 0 })
    .eq("id", company.id);

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

  // 2. Kroppe der afkølede er nu klar – sæt holdbarhed (6 dage fra nu)
  const expiresAt6 = new Date(Date.now() + 6 * 24 * 60 * 60 * 1000).toISOString();
  await admin
    .from("cold_storage")
    .update({ status: "ready", expires_at: expiresAt6 })
    .eq("company_id", company.id)
    .eq("status", "cooling");

  // 1b. Slagt alle dyr der er i kø (slaughter_queue) – test mode
  const slaughterQueue = company.slaughter_queue as any[] || [];
  if (slaughterQueue.length > 0) {
    const SEUROP_DIST: Record<string, {class:string;pct:number}[]> = {
      young_bulls: [{class:"S",pct:5},{class:"E",pct:30},{class:"U",pct:40},{class:"R",pct:20},{class:"O",pct:5}],
      heifers:     [{class:"E",pct:20},{class:"U",pct:35},{class:"R",pct:35},{class:"O",pct:10}],
      steers:      [{class:"U",pct:20},{class:"R",pct:45},{class:"O",pct:30},{class:"P",pct:5}],
      cows:        [{class:"R",pct:10},{class:"O",pct:45},{class:"P",pct:45}],
      class_s:     [{class:"S",pct:100}],
      class_e:     [{class:"E",pct:100}],
      class_r:     [{class:"R",pct:100}],
      light:       [{class:"E",pct:40},{class:"U",pct:40},{class:"R",pct:20}],
      heavy:       [{class:"U",pct:30},{class:"R",pct:50},{class:"O",pct:20}],
      broiler:     [{class:"A",pct:80},{class:"B",pct:20}],
      hen:         [{class:"B",pct:60},{class:"C",pct:40}],
    };

    function pickSEUROP(category: string, stress: number): string {
      const dist = SEUROP_DIST[category] || [{class:"R",pct:100}];
      const shift = stress > 60 ? 1 : 0;
      const rand = Math.random() * 100;
      let cum = 0;
      for (let i = 0; i < dist.length; i++) {
        cum += dist[i].pct;
        if (rand <= cum) return dist[Math.min(i + shift, dist.length - 1)].class;
      }
      return dist[dist.length - 1].class;
    }

    const expiresAt = new Date(Date.now() + 6 * 24 * 60 * 60 * 1000).toISOString();
    for (const animal of slaughterQueue) {
      const seurop = pickSEUROP(animal.animal_category, animal.stress_level || 20);
      const carcassKg = Math.round((animal.actual_weight_kg || 500) * 0.55 * 10) / 10;
      await admin.from("cold_storage").insert({
        company_id: company.id,
        animal_category: animal.animal_category,
        seurop_class: seurop,
        carcass_weight_kg: carcassKg,
        slaughtered_week: company.current_week,
        slaughtered_day: company.current_day || "Mandag",
        status: "cooling",
        maturation_days: 0,
        maturation_bonus_pct: 0,
        max_maturation_days: 21,
        destination: "pending",
        expires_at: expiresAt,
      });
      await admin.from("stable_animals")
        .update({ status: "slaughtered" })
        .eq("id", animal.id);
    }

    // Ryd køen
    await admin.from("companies").update({
      slaughter_queue: [],
      slaughter_started_at: null,
      stable_current_animals: Math.max(0, (company.stable_current_animals || 0) - slaughterQueue.length),
    }).eq("id", company.id);
  }

  // 2b. Marker udløbne slagtekroppe som degraded
  await admin
    .from("cold_storage")
    .update({ status: "degraded" })
    .eq("company_id", company.id)
    .in("status", ["ready", "maturing"])
    .lt("expires_at", new Date().toISOString());

  // 2c. Marker udløbne delstykker som expired
  await admin
    .from("butchered_cuts")
    .update({ status: "expired" })
    .eq("company_id", company.id)
    .eq("status", "available")
    .lt("expires_at", new Date().toISOString());

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

  // Log løn transaktion
  if (Math.round(dailyCost) > 0) {
    await admin.from("transactions").insert({
      company_id: company.id,
      week_number: company.current_week,
      day: company.current_day || "Mandag",
      type: "salary",
      description: `Daglig løn – ${(employees || []).length} ansatte`,
      amount: -Math.round(dailyCost),
      vat_amount: 0,
    });
  }

  // Log rente transaktion
  if (dailyInterest > 0) {
    await admin.from("transactions").insert({
      company_id: company.id,
      week_number: company.current_week,
      day: company.current_day || "Mandag",
      type: "interest",
      description: `Daglig rente på kassekredit (${(company.credit_rate * 100).toFixed(1)}% p.a.)`,
      amount: -dailyInterest,
      vat_amount: 0,
    });
  }

  // Nulstil ugentlig revenue ved ny uge
  const resetWeeklyFields = nextWeek > company.current_week
    ? { current_week_revenue: 0, current_week_cogs: 0 }
    : {};

  await admin.from("companies").update({
    cash: newCash,
    credit_used: newCreditUsed,
    current_day: nextDay,
    week_day_number: nextDayNum,
    current_week: nextWeek,
    day_started_at: new Date().toISOString(),
    saturday_approved: saturdayApproved,
    total_salary_paid: (company.total_salary_paid || 0) + Math.round(dailyCost),
    total_interest_paid: (company.total_interest_paid || 0) + dailyInterest,
    ...resetWeeklyFields,
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
