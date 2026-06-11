"use client";
import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { formatDKK } from "@/lib/utils";
import type { Company } from "@/lib/types";
import Navigation from "@/components/Navigation";

type Transaction = {
  id: string;
  week_number: number;
  day: string;
  type: string;
  description: string;
  amount: number;
  vat_amount: number;
  created_at: string;
};

const TYPE_CONFIG: Record<string, { label: string; emoji: string; color: string }> = {
  sale:       { label: "Salg",        emoji: "💰", color: "text-green-400" },
  purchase:   { label: "Indkøb",      emoji: "🐄", color: "text-red-400" },
  salary:     { label: "Løn",         emoji: "👔", color: "text-orange-400" },
  interest:   { label: "Rente",       emoji: "🏦", color: "text-red-300" },
  vat:        { label: "Moms",        emoji: "🧾", color: "text-yellow-400" },
  tax:        { label: "Skat",        emoji: "📋", color: "text-purple-400" },
  investment: { label: "Investering", emoji: "🏗️", color: "text-blue-400" },
};

export default function AdminPage() {
  const [company, setCompany] = useState<Company | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"overview" | "transactions" | "vat" | "tax">("overview");
  const router = useRouter();
  const supabase = createClient();

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.push("/login"); return; }
    const { data: co } = await supabase.from("companies").select("*").eq("player_id", user.id).single();
    if (!co) { router.push("/onboarding"); return; }
    setCompany(co);

    const { data: txns } = await supabase
      .from("transactions")
      .select("*")
      .eq("company_id", co.id)
      .order("created_at", { ascending: false })
      .limit(100);

    setTransactions(txns || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, []);

  async function payVAT() {
    if (!company) return;
    const due = (company as any).vat_due || 0;
    if (due <= 0) return;
    const newCash = company.cash - Math.min(due, company.cash);
    const extraCredit = Math.max(0, due - company.cash);
    const newCreditUsed = Math.min(company.credit_limit, (company.credit_used || 0) + extraCredit);
    await supabase.from("transactions").insert({
      company_id: company.id,
      week_number: company.current_week,
      day: company.current_day || "Mandag",
      type: "vat",
      description: `Momsbetaling Q${Math.ceil(company.current_week / 13)}`,
      amount: -due,
      vat_amount: 0,
    });
    await supabase.from("companies").update({
      cash: newCash,
      credit_used: newCreditUsed,
      vat_due: 0,
      last_vat_settlement_week: company.current_week,
    }).eq("id", company.id);
    load();
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center"><p className="text-stone-500">Indlæser...</p></div>;
  if (!company) return null;

  const co = company as any;
  const totalRevenue = co.total_revenue || 0;
  const totalCOGS = co.total_cogs || 0;
  const totalSalary = co.total_salary_paid || 0;
  const totalInterest = co.total_interest_paid || 0;
  const grossProfit = totalRevenue - totalCOGS;
  const ebit = grossProfit - totalSalary;
  const netResult = ebit - totalInterest;

  const weekRevenue = co.current_week_revenue || 0;
  const weekCOGS = co.current_week_cogs || 0;
  const weekGross = weekRevenue - weekCOGS;

  const vatCollected = co.vat_collected || 0;
  const vatPaid = co.vat_paid || 0;
  const vatDue = co.vat_due || 0;
  const taxEstimate = Math.max(0, Math.round(netResult * 0.22));
  const nextVatWeek = (co.last_vat_settlement_week || 0) + 13;

  // Ugentlig gruppering af transaktioner
  const byWeek = transactions.reduce((acc, t) => {
    if (!acc[t.week_number]) acc[t.week_number] = [];
    acc[t.week_number].push(t);
    return acc;
  }, {} as Record<number, Transaction[]>);

  return (
    <div className="min-h-screen bg-stone-950">
      <Navigation />
      <header className="border-b border-stone-800 bg-stone-900/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="font-bold text-stone-100">Administration</h1>
            <p className="text-xs text-stone-500">{company.name} · Uge {company.current_week}</p>
          </div>
          <div className="flex items-center gap-4 text-right text-xs">
            <div>
              <p className="text-stone-500">Resultat</p>
              <p className={`font-bold ${netResult >= 0 ? "text-green-400" : "text-red-400"}`}>
                {formatDKK(Math.round(netResult))}
              </p>
            </div>
            <div>
              <p className="text-stone-500">Kasse</p>
              <p className="font-bold text-stone-200">{formatDKK(company.cash)}</p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6 space-y-6">

        {/* Tabs */}
        <div className="flex gap-2 flex-wrap">
          {[
            { key: "overview",     label: "📊 Overblik" },
            { key: "transactions", label: "📋 Transaktioner" },
            { key: "vat",          label: "🧾 Moms" },
            { key: "tax",          label: "📋 Skat" },
          ].map(tab => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key as any)}
              className={`px-4 py-2.5 rounded-xl border text-sm font-medium transition-colors ${activeTab === tab.key ? "bg-stone-700 border-stone-500 text-stone-100" : "bg-stone-900 border-stone-800 text-stone-400 hover:bg-stone-800"}`}>
              {tab.label}
            </button>
          ))}
        </div>

        {/* OVERBLIK */}
        {activeTab === "overview" && (
          <div className="space-y-6">

            {/* Denne uge */}
            <div>
              <h2 className="text-sm font-medium text-stone-500 uppercase tracking-wide mb-3">Denne uge</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="stat-card">
                  <span className="stat-label">Omsætning</span>
                  <span className="stat-value text-green-400">{formatDKK(Math.round(weekRevenue))}</span>
                </div>
                <div className="stat-card">
                  <span className="stat-label">Vareforbrug</span>
                  <span className="stat-value text-red-400">{formatDKK(Math.round(weekCOGS))}</span>
                </div>
                <div className="stat-card">
                  <span className="stat-label">Bruttoavance</span>
                  <span className={`stat-value ${weekGross >= 0 ? "text-green-400" : "text-red-400"}`}>{formatDKK(Math.round(weekGross))}</span>
                  {weekRevenue > 0 && <span className="text-xs text-stone-500">{Math.round(weekGross / weekRevenue * 100)}%</span>}
                </div>
                <div className="stat-card">
                  <span className="stat-label">Lager (estimat)</span>
                  <span className="stat-value text-amber-400">{formatDKK(Math.round(weekRevenue * 0.3))}</span>
                </div>
              </div>
            </div>

            {/* Resultatopgørelse */}
            <div>
              <h2 className="text-sm font-medium text-stone-500 uppercase tracking-wide mb-3">Resultatopgørelse – total</h2>
              <div className="card space-y-0 p-0 overflow-hidden">
                {[
                  { label: "Omsætning",       value: totalRevenue,   color: "text-green-400",  bold: false },
                  { label: "Vareforbrug",      value: -totalCOGS,     color: "text-red-400",    bold: false },
                  { label: "Bruttoavance",     value: grossProfit,    color: grossProfit >= 0 ? "text-green-400" : "text-red-400", bold: true },
                  { label: "Lønomkostninger",  value: -totalSalary,   color: "text-orange-400", bold: false },
                  { label: "EBIT",             value: ebit,           color: ebit >= 0 ? "text-green-400" : "text-red-400", bold: true },
                  { label: "Renteomkostninger",value: -totalInterest, color: "text-red-300",    bold: false },
                  { label: "Resultat før skat",value: netResult,      color: netResult >= 0 ? "text-green-400" : "text-red-400", bold: true },
                  { label: "Skat (22%)",        value: -taxEstimate,   color: "text-purple-400", bold: false },
                  { label: "Nettoresultat",    value: netResult - taxEstimate, color: (netResult - taxEstimate) >= 0 ? "text-green-400" : "text-red-400", bold: true },
                ].map((row, i) => (
                  <div key={i} className={`flex items-center justify-between px-4 py-3 ${row.bold ? "bg-stone-800/50 border-t border-stone-700" : "border-t border-stone-800/50"}`}>
                    <span className={`text-sm ${row.bold ? "font-medium text-stone-200" : "text-stone-400"}`}>{row.label}</span>
                    <span className={`text-sm font-medium ${row.color}`}>{formatDKK(Math.round(row.value))}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Likviditet */}
            <div>
              <h2 className="text-sm font-medium text-stone-500 uppercase tracking-wide mb-3">Likviditet</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="stat-card">
                  <span className="stat-label">Kassebeholdning</span>
                  <span className="stat-value text-green-400">{formatDKK(company.cash)}</span>
                </div>
                <div className="stat-card">
                  <span className="stat-label">Kassekredit brugt</span>
                  <span className={`stat-value ${company.credit_used > 0 ? "text-red-400" : "text-stone-400"}`}>{formatDKK(company.credit_used)}</span>
                  <span className="text-xs text-stone-600">af {formatDKK(company.credit_limit)}</span>
                </div>
                <div className="stat-card">
                  <span className="stat-label">Fri likviditet</span>
                  <span className="stat-value">{formatDKK(company.cash + (company.credit_limit - company.credit_used))}</span>
                </div>
                <div className="stat-card">
                  <span className="stat-label">Daglig løn</span>
                  <span className="stat-value text-orange-400">
                    {formatDKK(Math.round(totalSalary / Math.max(1, company.current_week * 5)))}
                  </span>
                  <span className="text-xs text-stone-600">estimat</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TRANSAKTIONER */}
        {activeTab === "transactions" && (
          <div className="space-y-4">
            {Object.keys(byWeek).length === 0 && (
              <div className="card border-dashed border-stone-700 text-center py-12">
                <p className="text-stone-500">Ingen transaktioner endnu</p>
              </div>
            )}
            {Object.entries(byWeek).sort(([a], [b]) => Number(b) - Number(a)).map(([week, txns]) => {
              const weekTotal = txns.reduce((s, t) => s + t.amount, 0);
              return (
                <div key={week}>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-medium text-stone-400">Uge {week}</h3>
                    <span className={`text-sm font-medium ${weekTotal >= 0 ? "text-green-400" : "text-red-400"}`}>
                      {weekTotal >= 0 ? "+" : ""}{formatDKK(Math.round(weekTotal))}
                    </span>
                  </div>
                  <div className="space-y-1">
                    {txns.map(t => {
                      const cfg = TYPE_CONFIG[t.type] || { label: t.type, emoji: "•", color: "text-stone-400" };
                      return (
                        <div key={t.id} className="card py-2.5 px-4 flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <span className="text-base">{cfg.emoji}</span>
                            <div>
                              <p className="text-stone-200 text-sm">{t.description}</p>
                              <p className="text-stone-600 text-xs">{t.day} · {cfg.label}</p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className={`text-sm font-medium ${t.amount >= 0 ? "text-green-400" : "text-red-400"}`}>
                              {t.amount >= 0 ? "+" : ""}{formatDKK(Math.round(t.amount))}
                            </p>
                            {t.vat_amount > 0 && (
                              <p className="text-xs text-stone-600">Moms: {formatDKK(Math.round(t.vat_amount))}</p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* MOMS */}
        {activeTab === "vat" && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="stat-card">
                <span className="stat-label">Opkrævet salgsmoms</span>
                <span className="stat-value text-green-400">{formatDKK(Math.round(vatCollected))}</span>
                <span className="text-xs text-stone-600">25% af omsætning</span>
              </div>
              <div className="stat-card">
                <span className="stat-label">Betalt købsmoms</span>
                <span className="stat-value text-stone-400">{formatDKK(Math.round(vatPaid))}</span>
                <span className="text-xs text-stone-600">25% af vareforbrug</span>
              </div>
              <div className="stat-card">
                <span className="stat-label">Momstilsvar</span>
                <span className={`stat-value ${vatDue > 0 ? "text-red-400" : "text-stone-400"}`}>{formatDKK(Math.round(vatDue))}</span>
                <span className="text-xs text-stone-600">Skal betales</span>
              </div>
              <div className="stat-card">
                <span className="stat-label">Næste afregning</span>
                <span className="stat-value text-amber-400">Uge {nextVatWeek}</span>
                <span className="text-xs text-stone-600">Kvartalsvis</span>
              </div>
            </div>

            {vatDue > 0 && (
              <div className="card border-l-4 border-l-red-500 bg-red-950/20">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-red-400 font-medium">Momsbetaling forfalder</p>
                    <p className="text-stone-400 text-sm mt-0.5">
                      Skyldig moms: {formatDKK(Math.round(vatDue))}
                    </p>
                  </div>
                  <button onClick={payVAT} className="btn-primary">
                    Betal moms nu
                  </button>
                </div>
              </div>
            )}

            <div className="card bg-stone-900/50">
              <p className="text-sm text-stone-300 font-medium mb-2">Momsregler</p>
              <div className="space-y-1 text-xs text-stone-500">
                <p>• Salgsmoms: 25% lægges til salgspris (betales af køber)</p>
                <p>• Købsmoms: 25% af vareforbrug (kan fratrækkes)</p>
                <p>• Momstilsvar = Salgsmoms – Købsmoms</p>
                <p>• Afregnes til SKAT hvert kvartal (uge 13, 26, 39, 52)</p>
              </div>
            </div>
          </div>
        )}

        {/* SKAT */}
        {activeTab === "tax" && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <div className="stat-card">
                <span className="stat-label">Resultat før skat</span>
                <span className={`stat-value ${netResult >= 0 ? "text-green-400" : "text-stone-400"}`}>
                  {formatDKK(Math.round(netResult))}
                </span>
              </div>
              <div className="stat-card">
                <span className="stat-label">Estimeret skat (22%)</span>
                <span className="stat-value text-purple-400">{formatDKK(taxEstimate)}</span>
                <span className="text-xs text-stone-600">Beregnes ved årsafslutning</span>
              </div>
              <div className="stat-card">
                <span className="stat-label">Aconto betalt</span>
                <span className="stat-value text-stone-400">{formatDKK(Math.round(co.tax_aconto || 0))}</span>
              </div>
            </div>

            <div className="card bg-stone-900/50">
              <p className="text-sm text-stone-300 font-medium mb-2">Skatteregler i spillet</p>
              <div className="space-y-1 text-xs text-stone-500">
                <p>• Selskabsskat: 22% af årsresultat</p>
                <p>• Acontoskat betales halvårligt (uge 26 og 52)</p>
                <p>• Underskud kan fremføres til næste år</p>
                <p>• Manglende betaling → compliance fald og omdømmetab</p>
              </div>
            </div>

            {netResult > 0 && (
              <div className="card border-l-4 border-l-purple-500 bg-purple-950/20">
                <p className="text-purple-300 font-medium text-sm">Skatteplanlægning</p>
                <p className="text-stone-400 text-sm mt-1">
                  Dit estimerede skattetilsvar er {formatDKK(taxEstimate)}. 
                  Overvej om investeringer i udstyr kan reducere skattebetalingen.
                </p>
              </div>
            )}
          </div>
        )}

      </main>
    </div>
  );
}
