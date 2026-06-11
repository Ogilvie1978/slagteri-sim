"use client";
import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { formatDKK } from "@/lib/utils";
import type { Company, MarketWeek } from "@/lib/types";
import { INDUSTRY_CONFIG } from "@/lib/types";
import DayTimer from "@/components/DayTimer";
import Navigation from "@/components/Navigation";

type AnimalPrice = {
  category: string;
  category_label: string;
  best_use: string;
  price_dkk_per_kg: number;
};

type Buyer = {
  id: string;
  name: string;
  type: string;
  logo_emoji: string;
  description: string;
  min_compliance: number;
  price_bonus_pct: number;
  accepted_classes: string[];
  min_volume_kg: number;
};

export default function DashboardPage() {
  const [company, setCompany] = useState<Company | null>(null);
  const [market, setMarket] = useState<MarketWeek | null>(null);
  const [prices, setPrices] = useState<AnimalPrice[]>([]);
  const [buyers, setBuyers] = useState<Buyer[]>([]);
  const [hasPurchased, setHasPurchased] = useState(false);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const supabase = createClient();

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.push("/login"); return; }

    const { data: co } = await supabase
      .from("companies").select("*").eq("player_id", user.id).single();
    if (!co) { router.push("/onboarding"); return; }
    setCompany(co);

    const [mwRes, apRes, buyerRes, purchaseRes] = await Promise.all([
      supabase.from("market_weeks").select("*").eq("week_number", co.current_week).single(),
      supabase.from("animal_prices")
        .select("category, category_label, best_use, price_dkk_per_kg")
        .eq("week_number", co.current_week).eq("industry", co.industry)
        .order("price_dkk_per_kg", { ascending: false }),
      supabase.from("buyers").select("*").eq("active", true).order("type"),
      supabase.from("raw_material_purchases").select("id")
        .eq("company_id", co.id).eq("week_number", co.current_week)
        .eq("is_weekend", false).limit(1),
    ]);

    setMarket(mwRes.data);
    setPrices(apRes.data || []);
    setBuyers(buyerRes.data || []);
    setHasPurchased((purchaseRes.data || []).length > 0);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, []);

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <p className="text-stone-500">Indlæser...</p>
    </div>
  );

  if (!company) return null;

  const ind = INDUSTRY_CONFIG[company.industry] ?? INDUSTRY_CONFIG["kreaturslagteri"];
  const liquidityTotal = company.cash + (company.credit_limit - company.credit_used);
  const weeklyInterest = Math.floor(company.credit_used * company.credit_rate / 52);
  const availableBuyers = buyers.filter(b =>
    b.type === "guaranteed" || company.compliance_score >= b.min_compliance
  );

  const isSunday = company.week_day_number === 7;

  return (
    <div className="min-h-screen bg-stone-950">
      <Navigation />
      <header className="border-b border-stone-800 bg-stone-900/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl">{ind.emoji}</span>
            <div>
              <h1 className="font-bold text-stone-100">{company.name}</h1>
              <p className="text-xs text-stone-500">{ind.label} · {company.region}</p>
            </div>
          </div>
          <span className="badge-blue">Omdømme: {company.reputation}/100</span>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8 space-y-6">

        {/* Dag-timer */}
        <DayTimer
          companyId={company.id}
          currentDay={company.current_day || "Mandag"}
          weekDayNumber={company.week_day_number || 1}
          dayStartedAt={company.day_started_at || new Date().toISOString()}
          saturdayApproved={company.saturday_approved || false}
          currentWeek={company.current_week}
          onDayEnd={load}
        />

        {/* Setup banner – første dag */}
        {!company.is_operational && (
          <div className="card border-l-4 border-l-red-500 bg-red-950/20">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-red-400 font-medium text-sm">Slagteriet er ikke klar til drift</p>
                <p className="text-stone-400 text-sm mt-0.5">
                  Ansæt mindst 5 slagtere, 1 tekniker og 1 QA medarbejder for at starte produktion.
                </p>
              </div>
              <button
                onClick={() => router.push("/hr")}
                className="btn-primary ml-4 whitespace-nowrap"
              >
                👔 Ansæt personale
              </button>
            </div>
          </div>
        )}

        {/* Søndag besked */}
        {isSunday && (
          <div className="card border-l-4 border-l-stone-600 bg-stone-900/50">
            <p className="text-stone-400 text-sm font-medium">Søndag – hviledag</p>
            <p className="text-stone-500 text-sm mt-0.5">
              Markedet er lukket. Mandag starter en ny uge med friske priser og muligheder.
            </p>
          </div>
        )}

        {/* Ugeoversigt */}
        {market?.week_summary && (
          <div className="card border-l-4 border-l-brand-500">
            <p className="text-xs text-brand-400 font-medium mb-2 uppercase tracking-wide">
              Ugens nyheder · Uge {company.current_week}
            </p>
            <p className="text-stone-300 leading-relaxed">{market.week_summary}</p>
          </div>
        )}

        {/* Økonomi */}
        <div>
          <h2 className="text-sm font-medium text-stone-500 uppercase tracking-wide mb-3">Økonomi</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="stat-card">
              <span className="stat-label">Likvide midler</span>
              <span className="stat-value text-green-400">{formatDKK(company.cash)}</span>
            </div>
            <div className="stat-card">
              <span className="stat-label">Kassekredit brugt</span>
              <span className={`stat-value ${company.credit_used > 0 ? "text-red-400" : "text-stone-400"}`}>
                {formatDKK(company.credit_used)}
              </span>
              <span className="text-xs text-stone-600">af {formatDKK(company.credit_limit)}</span>
            </div>
            <div className="stat-card">
              <span className="stat-label">Total likviditet</span>
              <span className="stat-value">{formatDKK(liquidityTotal)}</span>
            </div>
            <div className="stat-card">
              <span className="stat-label">Ugentlig rente</span>
              <span className={`stat-value ${weeklyInterest > 0 ? "text-red-400" : "text-stone-400"}`}>
                {weeklyInterest > 0 ? `-${formatDKK(weeklyInterest)}` : "Ingen"}
              </span>
            </div>
          </div>
        </div>

        {/* Råvarepriser */}
        {prices.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-medium text-stone-500 uppercase tracking-wide">
                Aktuelle råvarepriser · {ind.label}
              </h2>

            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {prices.map(p => (
                <div key={p.category} className="stat-card">
                  <span className="stat-label">{p.category_label}</span>
                  <span className="stat-value text-brand-400">{p.price_dkk_per_kg} kr/kg</span>
                  <span className="text-xs text-stone-600">{p.best_use}</span>
                </div>
              ))}
            </div>
            {!isSunday && (
              <button
                onClick={() => router.push("/purchase")}
                className="btn-primary w-full mt-3 py-3 text-base"
              >
                🐄 Gå til indkøb af levende dyr
              </button>
            )}
          </div>
        )}

        {/* Markedsforhold */}
        {market && (
          <div>
            <h2 className="text-sm font-medium text-stone-500 uppercase tracking-wide mb-3">Markedsforhold</h2>
            <div className="grid grid-cols-3 gap-3">
              <div className="stat-card">
                <span className="stat-label">Efterspørgsel</span>
                <span className={`stat-value ${market.demand_index >= 100 ? "text-green-400" : "text-red-400"}`}>
                  {market.demand_index}
                </span>
                <span className="text-xs text-stone-600">indeks (100 = normal)</span>
              </div>
              <div className="stat-card">
                <span className="stat-label">Arbejdsmarked</span>
                <span className="stat-value">
                  {market.labor_market === "tight" ? "Stramt" :
                   market.labor_market === "normal" ? "Normalt" : "Løst"}
                </span>
              </div>
              <div className="stat-card">
                <span className="stat-label">Brændstof</span>
                <span className={`stat-value ${market.fuel_cost_index > 100 ? "text-red-400" : "text-green-400"}`}>
                  {market.fuel_cost_index}
                </span>
                <span className="text-xs text-stone-600">indeks</span>
              </div>
            </div>
          </div>
        )}

        {/* Tilgængelige købere */}
        <div>
          <h2 className="text-sm font-medium text-stone-500 uppercase tracking-wide mb-3">
            Tilgængelige købere
            <span className="ml-2 text-stone-600 normal-case font-normal">
              ({availableBuyers.length} af {buyers.length})
            </span>
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {availableBuyers.map(b => (
              <div key={b.id} className={`card flex items-start gap-3 ${b.type === "guaranteed" ? "border-stone-700" : "border-stone-800"}`}>
                <span className="text-2xl mt-0.5">{b.logo_emoji}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-stone-100 text-sm">{b.name}</span>
                    {b.price_bonus_pct > 0 && <span className="badge-green">+{b.price_bonus_pct}%</span>}
                    {b.type === "guaranteed" && <span className="badge-blue">Garanteret aftager</span>}
                  </div>
                  <p className="text-xs text-stone-500 mt-0.5">{b.description}</p>
                  {b.min_volume_kg > 0 && (
                    <p className="text-xs text-stone-600 mt-1">
                      Min. {b.min_volume_kg.toLocaleString("da-DK")} kg/uge · Compliance {b.min_compliance}+
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
          {buyers.length > availableBuyers.length && (
            <p className="text-xs text-stone-600 mt-2">
              {buyers.length - availableBuyers.length} købere kræver højere compliance score.
            </p>
          )}
        </div>

        {/* Virksomhedsstatus */}
        <div>
          <h2 className="text-sm font-medium text-stone-500 uppercase tracking-wide mb-3">Virksomhed</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <div className="stat-card">
              <span className="stat-label">Omdømme</span>
              <div className="flex items-center gap-2">
                <span className="stat-value">{company.reputation}</span>
                <span className="text-stone-500">/100</span>
              </div>
              <div className="w-full bg-stone-800 rounded-full h-1.5 mt-1">
                <div className="bg-brand-500 h-1.5 rounded-full" style={{ width: `${company.reputation}%` }} />
              </div>
            </div>
            <div className="stat-card">
              <span className="stat-label">Compliance</span>
              <div className="flex items-center gap-2">
                <span className="stat-value">{company.compliance_score}</span>
                <span className="text-stone-500">/100</span>
              </div>
              <div className="w-full bg-stone-800 rounded-full h-1.5 mt-1">
                <div className={`h-1.5 rounded-full ${company.compliance_score >= 70 ? "bg-green-500" : company.compliance_score >= 50 ? "bg-yellow-500" : "bg-red-500"}`}
                  style={{ width: `${company.compliance_score}%` }} />
              </div>
            </div>
            <div className="stat-card">
              <span className="stat-label">Kapacitet</span>
              <span className="stat-value">{(company.capacity_kg / 1000).toFixed(0)}t</span>
              <span className="text-xs text-stone-600">per dag</span>
            </div>
          </div>
        </div>

      </main>
    </div>
  );
}
