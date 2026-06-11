"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { formatDKK } from "@/lib/utils";
import type { Company, MarketWeek } from "@/lib/types";

export default function DashboardPage() {
  const [company, setCompany] = useState<Company | null>(null);
  const [market, setMarket] = useState<MarketWeek | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/login"); return; }

      const { data: co } = await supabase
        .from("companies")
        .select("*")
        .eq("player_id", user.id)
        .single();

      if (!co) { router.push("/onboarding"); return; }
      setCompany(co);

      const { data: mw } = await supabase
        .from("market_weeks")
        .select("*")
        .eq("week_number", co.current_week)
        .single();

      setMarket(mw);
      setLoading(false);
    }
    load();
  }, []);

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <p className="text-stone-500">Indlæser...</p>
    </div>
  );

  if (!company) return null;

  const liquidityTotal = company.cash + (company.credit_limit - company.credit_used);
  const weeklyInterest = Math.floor(company.credit_used * company.credit_rate / 52);

  return (
    <div className="min-h-screen bg-stone-950">
      <header className="border-b border-stone-800 bg-stone-900/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🥩</span>
            <div>
              <h1 className="font-bold text-stone-100">{company.name}</h1>
              <p className="text-xs text-stone-500">{company.region} · Uge {company.current_week}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="badge-blue">Omdømme: {company.reputation}/100</span>
            <button onClick={async () => { await supabase.auth.signOut(); router.push("/login"); }}
              className="text-sm text-stone-500 hover:text-stone-300 transition-colors">
              Log ud
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8 space-y-6">
        {market?.week_summary && (
          <div className="card border-l-4 border-l-brand-500">
            <p className="text-xs text-brand-400 font-medium mb-2 uppercase tracking-wide">Ugens nyheder · Uge {company.current_week}</p>
            <p className="text-stone-300 leading-relaxed">{market.week_summary}</p>
          </div>
        )}
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
        {market && (
          <div>
            <h2 className="text-sm font-medium text-stone-500 uppercase tracking-wide mb-3">Aktuelle priser</h2>
            <div className="grid grid-cols-3 gap-3">
              <div className="stat-card">
                <span className="stat-label">🐷 Svinekød</span>
                <span className="stat-value">{market.pig_price} kr/kg</span>
              </div>
              <div className="stat-card">
                <span className="stat-label">🐄 Oksekød</span>
                <span className="stat-value">{market.cattle_price} kr/kg</span>
              </div>
              <div className="stat-card">
                <span className="stat-label">🐑 Lammekød</span>
                <span className="stat-value">{market.lamb_price} kr/kg</span>
              </div>
            </div>
          </div>
        )}
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
              <span className="text-xs text-stone-600">per uge</span>
            </div>
          </div>
        </div>
        <div className="card bg-stone-900 border-stone-700">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-stone-100">Klar til næste uge?</h3>
              <p className="text-sm text-stone-500 mt-0.5">Afslut uge {company.current_week} og se hvad der sker</p>
            </div>
            <button className="btn-primary">
              Afslut uge {company.current_week} →
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
