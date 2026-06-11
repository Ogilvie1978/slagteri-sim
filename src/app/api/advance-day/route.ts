import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export async function POST() {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: company } = await supabase
    .from("companies")
    .select("*")
    .eq("player_id", user.id)
    .single();

  if (!company) return NextResponse.json({ error: "No company" }, { status: 404 });

  const DAYS = ["Mandag", "Tirsdag", "Onsdag", "Torsdag", "Fredag", "Lørdag", "Søndag"];
  const currentDayNum = company.week_day_number || 1;
  const isLastDay = currentDayNum >= 5 && !company.saturday_approved;
  const isSaturday = currentDayNum === 6;

  // 1. Dyr der ankom i går er nu klar til slagtning
  await supabase
    .from("stable_animals")
    .update({ ready_for_slaughter: true })
    .eq("company_id", company.id)
    .eq("status", "resting")
    .eq("ready_for_slaughter", false)
    .neq("arrived_day", company.current_day);

  // 2. Dyr der afkøler i kølerummet er nu klar
  await supabase
    .from("cold_storage")
    .update({ status: "ready" })
    .eq("company_id", company.id)
    .eq("status", "cooling");

  // 3. Opdater modningsdage
  const { data: maturingItems } = await supabase
    .from("cold_storage")
    .select("id, maturation_days, max_maturation_days")
    .eq("company_id", company.id)
    .eq("status", "maturing");

  for (const item of maturingItems || []) {
    const newDays = (item.maturation_days || 0) + 1;
    const bonus = Math.min(20, newDays * 1.5);
    const isDegraded = newDays > item.max_maturation_days;
    await supabase.from("cold_storage").update({
      maturation_days: newDays,
      maturation_bonus_pct: isDegraded ? 0 : Math.round(bonus * 10) / 10,
      status: isDegraded ? "degraded" : "maturing",
    }).eq("id", item.id);
  }

  // 4. Beregn daglig lønomkostning og træk fra cash
  const { data: employees } = await supabase
    .from("employees")
    .select("pay_type, hourly_rate, monthly_salary, department")
    .eq("company_id", company.id)
    .eq("active", true);

  const WORK_HOURS = 7.4;
  const dailyCost = (employees || []).reduce((sum, emp) => {
    if (emp.pay_type === "hourly") return sum + (emp.hourly_rate || 0) * WORK_HOURS;
    return sum + (emp.monthly_salary || 0) / 22; // 22 arbejdsdage/md
  }, 0);

  // 5. Beregn daglig rente
  const dailyInterest = Math.floor((company.credit_used || 0) * (company.credit_rate || 0.08) / 365);

  const totalDailyCost = Math.round(dailyCost + dailyInterest);
  const newCash = company.cash - Math.min(totalDailyCost, company.cash);
  const extraCredit = Math.max(0, totalDailyCost - company.cash);
  const newCreditUsed = Math.min(company.credit_limit, (company.credit_used || 0) + extraCredit);

  // 6. Avancer til næste dag
  let nextDayNum = currentDayNum + 1;
  let nextWeek = company.current_week;
  let saturdayApproved = company.saturday_approved;

  if (isLastDay) {
    nextDayNum = 1; // Mandag
    nextWeek = company.current_week + 1;
    saturdayApproved = false;
  } else if (isSaturday) {
    nextDayNum = 1; // Mandag efter lørdag
    nextWeek = company.current_week + 1;
    saturdayApproved = false;
  }

  const nextDay = DAYS[nextDayNum - 1];

  await supabase.from("companies").update({
    cash: newCash,
    credit_used: newCreditUsed,
    current_day: nextDay,
    week_day_number: nextDayNum,
    current_week: nextWeek,
    day_started_at: new Date().toISOString(),
    saturday_approved: saturdayApproved,
  }).eq("id", company.id);

  return NextResponse.json({
    success: true,
    nextDay,
    nextWeek,
    dailyCost: Math.round(dailyCost),
    dailyInterest,
    totalDailyCost,
  });
}
