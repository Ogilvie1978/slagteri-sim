"use client";
import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { formatDKK } from "@/lib/utils";
import type { Company } from "@/lib/types";

type ColdStorageItem = {
  id: string;
  animal_category: string;
  seurop_class: string;
  carcass_weight_kg: number;
  slaughtered_week: number;
  slaughtered_day: string;
  day_entered_cold: string;
  status: string;
  maturation_days: number;
  maturation_bonus_pct: number;
  max_maturation_days: number;
  reserved_for_buyer: string | null;
  notes: string | null;
};

type CutDefinition = {
  id: string;
  industry: string;
  animal_category: string;
  cut_name: string;
  cut_category: string;
  yield_pct: number;
  price_multiplier: number;
  requires_skill_level: number;
  sold_to: string[];
  sort_order: number;
};

type ButcheredCut = {
  id: string;
  cut_name: string;
  cut_category: string;
  animal_category: string;
  seurop_class: string;
  weight_kg: number;
  base_price_dkk_per_kg: number;
  maturation_bonus_pct: number;
  is_vacuum_packed: boolean;
  status: string;
  week_butchered: number;
  day_butchered: string;
};

const SEUROP_COLORS: Record<string, string> = {
  S: "bg-purple-900 text-purple-300 border-purple-700",
  E: "bg-blue-900 text-blue-300 border-blue-700",
  U: "bg-green-900 text-green-300 border-green-700",
  R: "bg-yellow-900 text-yellow-300 border-yellow-700",
  O: "bg-stone-700 text-stone-300 border-stone-600",
  P: "bg-red-900 text-red-300 border-red-700",
};

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  cooling:           { label: "Køler ned",    color: "text-blue-400" },
  ready:             { label: "Klar",          color: "text-green-400" },
  maturing:          { label: "Modner",        color: "text-amber-400" },
  butchering_queue:  { label: "Til udbening",  color: "text-purple-400" },
  butchered:         { label: "Udbenet",       color: "text-stone-400" },
  sold_quarter:      { label: "Solgt (1/4)",   color: "text-stone-500" },
  degraded:          { label: "Kvalitetstab",  color: "text-red-400" },
};

const ANIMAL_LABELS: Record<string, string> = {
  young_bulls: "Ungtyre", heifers: "Kvier", steers: "Stude", cows: "Køer",
  class_s: "Klasse S svin", class_e: "Klasse E svin", class_r: "Klasse R svin",
  light: "Let lam", heavy: "Tungt lam", broiler: "Slagtekylling", hen: "Høne",
};

export default function ProductionPage() {
  const [company, setCompany] = useState<Company | null>(null);
  const [coldStorage, setColdStorage] = useState<ColdStorageItem[]>([]);
  const [butcheredCuts, setButcheredCuts] = useState<ButcheredCut[]>([]);
  const [cutDefs, setCutDefs] = useState<CutDefinition[]>([]);
  const [activeTab, setActiveTab] = useState<"cold" | "cuts">("cold");
  const [selectedItem, setSelectedItem] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.push("/login"); return; }

    const { data: co } = await supabase.from("companies").select("*").eq("player_id", user.id).single();
    if (!co) { router.push("/onboarding"); return; }
    setCompany(co);

    const [coldRes, cutsRes, defRes] = await Promise.all([
      supabase.from("cold_storage").select("*")
        .eq("company_id", co.id)
        .not("status", "in", '("sold_quarter","butchered")')
        .order("day_entered_cold"),
      supabase.from("butchered_cuts").select("*")
        .eq("company_id", co.id)
        .eq("status", "available")
        .order("created_at", { ascending: false }),
      supabase.from("cut_definitions").select("*")
        .eq("industry", co.industry)
        .order("sort_order"),
    ]);

    setColdStorage(coldRes.data || []);
    setButcheredCuts(cutsRes.data || []);
    setCutDefs(defRes.data || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, []);

  async function setMaturing(id: string) {
    setProcessing(true);
    await supabase.from("cold_storage").update({ status: "maturing" }).eq("id", id);
    setProcessing(false);
    load();
  }

  async function queueForButchering(id: string) {
    setProcessing(true);
    await supabase.from("cold_storage")
      .update({ status: "butchering_queue" }).eq("id", id);
    setProcessing(false);
    load();
  }

  async function sellAsQuarter(id: string, item: ColdStorageItem, basePrice: number) {
    setProcessing(true);
    const revenue = Math.round(item.carcass_weight_kg * basePrice * (1 + item.maturation_bonus_pct / 100));
    await supabase.from("cold_storage").update({ status: "sold_quarter" }).eq("id", id);
    await supabase.from("companies").update({
      cash: (company?.cash || 0) + revenue
    }).eq("id", company?.id);
    setProcessing(false);
    load();
  }

  async function butcherItem(item: ColdStorageItem, animalBasePrice: number) {
    if (!company) return;
    setProcessing(true);

    const relevantDefs = cutDefs.filter(d => d.animal_category === item.animal_category);

    const cuts = relevantDefs.map(def => ({
      company_id: company.id,
      cold_storage_id: item.id,
      cut_name: def.cut_name,
      cut_category: def.cut_category,
      animal_category: item.animal_category,
      seurop_class: item.seurop_class,
      weight_kg: Math.round(item.carcass_weight_kg * def.yield_pct / 100 * 10) / 10,
      base_price_dkk_per_kg: Math.round(animalBasePrice * def.price_multiplier * 10) / 10,
      maturation_bonus_pct: item.maturation_bonus_pct,
      is_vacuum_packed: false,
      status: "available",
      week_butchered: company.current_week,
      day_butchered: company.current_day || "Mandag",
    }));

    await supabase.from("butchered_cuts").insert(cuts);
    await supabase.from("cold_storage").update({ status: "butchered" }).eq("id", item.id);

    setProcessing(false);
    setSelectedItem(null);
    load();
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <p className="text-stone-500">Indlæser...</p>
    </div>
  );

  if (!company) return null;

  const readyItems = coldStorage.filter(i => i.status === "ready" || i.status === "maturing");
  const coolingItems = coldStorage.filter(i => i.status === "cooling");
  const queueItems = coldStorage.filter(i => i.status === "butchering_queue");
  const totalColdKg = coldStorage.reduce((sum, i) => sum + i.carcass_weight_kg, 0);
  const capacityPct = Math.round(totalColdKg / (company.cold_storage_capacity_kg || 50000) * 100);

  const totalCutsValue = butcheredCuts.reduce((sum, c) => {
    const price = c.base_price_dkk_per_kg * (1 + c.maturation_bonus_pct / 100) * (c.is_vacuum_packed ? 1.2 : 1);
    return sum + c.weight_kg * price;
  }, 0);

  return (
    <div className="min-h-screen bg-stone-950">
      <header className="border-b border-stone-800 bg-stone-900/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => router.push("/dashboard")}
              className="text-stone-500 hover:text-stone-300 text-sm transition-colors">
              ← Tilbage
            </button>
            <div className="w-px h-5 bg-stone-700" />
            <div>
              <h1 className="font-bold text-stone-100">Produktion</h1>
              <p className="text-xs text-stone-500">{company.name} · {company.current_day}</p>
            </div>
          </div>
          <div className="flex items-center gap-4 text-right">
            <div>
              <p className="text-xs text-stone-500">Kølelager</p>
              <p className={`font-bold text-sm ${capacityPct > 80 ? "text-red-400" : capacityPct > 60 ? "text-yellow-400" : "text-stone-300"}`}>
                {Math.round(totalColdKg).toLocaleString("da-DK")} / {(company.cold_storage_capacity_kg || 50000).toLocaleString("da-DK")} kg
              </p>
            </div>
            <div>
              <p className="text-xs text-stone-500">Lagerværdi</p>
              <p className="font-bold text-green-400 text-sm">{formatDKK(Math.round(totalCutsValue))}</p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8 space-y-6">

        {/* Kapacitetsbar */}
        <div className="card p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-stone-400">Kølerumskapacitet</span>
            <span className={`text-sm font-medium ${capacityPct > 80 ? "text-red-400" : "text-stone-300"}`}>
              {capacityPct}%
            </span>
          </div>
          <div className="w-full bg-stone-800 rounded-full h-2">
            <div
              className={`h-2 rounded-full transition-all ${capacityPct > 80 ? "bg-red-500" : capacityPct > 60 ? "bg-yellow-500" : "bg-green-500"}`}
              style={{ width: `${Math.min(capacityPct, 100)}%` }}
            />
          </div>
          {capacityPct > 80 && (
            <p className="text-xs text-red-400 mt-1">Kølerummet er næsten fuldt – sælg eller udbén snart!</p>
          )}
        </div>

        {/* Tabs */}
        <div className="flex gap-2">
          {[
            { key: "cold", label: "🧊 Kølelager", count: coldStorage.length },
            { key: "cuts", label: "🔪 Delstykker", count: butcheredCuts.length },
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key as "cold" | "cuts")}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl border text-sm font-medium transition-colors ${
                activeTab === tab.key
                  ? "bg-stone-700 border-stone-500 text-stone-100"
                  : "bg-stone-900 border-stone-800 text-stone-400 hover:bg-stone-800"
              }`}
            >
              {tab.label}
              <span className="bg-stone-600 text-stone-200 text-xs px-1.5 py-0.5 rounded-full">
                {tab.count}
              </span>
            </button>
          ))}
        </div>

        {/* KØLELAGER */}
        {activeTab === "cold" && (
          <div className="space-y-4">

            {coolingItems.length > 0 && (
              <div>
                <h2 className="text-sm font-medium text-stone-500 uppercase tracking-wide mb-3">
                  Afkøler ({coolingItems.length} poster)
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {coolingItems.map(item => (
                    <div key={item.id} className="card border-blue-900/50 opacity-70">
                      <div className="flex items-center justify-between">
                        <div>
                          <span className={`text-xs font-bold px-2 py-0.5 rounded border mr-2 ${SEUROP_COLORS[item.seurop_class]}`}>
                            {item.seurop_class}
                          </span>
                          <span className="text-stone-300 text-sm">{ANIMAL_LABELS[item.animal_category]}</span>
                        </div>
                        <span className="text-stone-400 text-sm font-medium">
                          {item.carcass_weight_kg.toFixed(1)} kg
                        </span>
                      </div>
                      <p className="text-xs text-blue-400 mt-2">
                        ❄️ Afkøler – klar til udbening i morgen
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {readyItems.length > 0 && (
              <div>
                <h2 className="text-sm font-medium text-stone-500 uppercase tracking-wide mb-3">
                  Klar til behandling ({readyItems.length} poster)
                </h2>
                <div className="space-y-3">
                  {readyItems.map(item => {
                    const isSelected = selectedItem === item.id;
                    const isMaturing = item.status === "maturing";
                    return (
                      <div key={item.id} className={`card transition-all ${isSelected ? "border-brand-500" : ""}`}>
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <span className={`text-xs font-bold px-2 py-0.5 rounded border ${SEUROP_COLORS[item.seurop_class]}`}>
                              {item.seurop_class}
                            </span>
                            <span className="text-stone-100 text-sm font-medium">
                              {ANIMAL_LABELS[item.animal_category]}
                            </span>
                            <span className="text-stone-500 text-xs">
                              {item.carcass_weight_kg.toFixed(1)} kg
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            {item.maturation_bonus_pct > 0 && (
                              <span className="badge-yellow">+{item.maturation_bonus_pct}% modning</span>
                            )}
                            {isMaturing && (
                              <span className="text-xs text-amber-400">
                                Dag {item.maturation_days} / {item.max_maturation_days}
                              </span>
                            )}
                          </div>
                        </div>

                        {isSelected ? (
                          <div className="space-y-2 pt-3 border-t border-stone-700">
                            <p className="text-xs text-stone-500 mb-2">Hvad vil du gøre med denne krop?</p>
                            <button
                              onClick={() => butcherItem(item, 22.5)}
                              disabled={processing}
                              className="btn-primary w-full py-2 text-sm"
                            >
                              🔪 Udbén og opskær til delstykker
                            </button>
                            <button
                              onClick={() => sellAsQuarter(item.id, item, 22.5)}
                              disabled={processing}
                              className="btn-secondary w-full py-2 text-sm"
                            >
                              📦 Sælg som 1/4 nu ({formatDKK(Math.round(item.carcass_weight_kg * 22.5))})
                            </button>
                            {!isMaturing && (
                              <button
                                onClick={() => setMaturing(item.id)}
                                disabled={processing}
                                className="w-full py-2 text-sm bg-amber-950/30 border border-amber-800/50 text-amber-400 rounded-lg hover:bg-amber-950/50 transition-colors"
                              >
                                ⏳ Lad hænge til modning (+op til 20% pris)
                              </button>
                            )}
                            <button
                              onClick={() => setSelectedItem(null)}
                              className="w-full text-xs text-stone-600 hover:text-stone-500 py-1"
                            >
                              Annuller
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setSelectedItem(item.id)}
                            className="btn-secondary w-full py-2 text-sm"
                          >
                            Vælg handling →
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {queueItems.length > 0 && (
              <div>
                <h2 className="text-sm font-medium text-stone-500 uppercase tracking-wide mb-3">
                  I kø til udbening ({queueItems.length} poster)
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {queueItems.map(item => (
                    <div key={item.id} className="card border-purple-900/50">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className={`text-xs font-bold px-2 py-0.5 rounded border ${SEUROP_COLORS[item.seurop_class]}`}>
                            {item.seurop_class}
                          </span>
                          <span className="text-stone-300 text-sm">{ANIMAL_LABELS[item.animal_category]}</span>
                        </div>
                        <span className="text-stone-400 text-sm">{item.carcass_weight_kg.toFixed(1)} kg</span>
                      </div>
                      <p className="text-xs text-purple-400 mt-2">🔪 Venter på opskærer</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {coldStorage.length === 0 && (
              <div className="card border-dashed border-stone-700 text-center py-12">
                <p className="text-stone-500">Ingen kroppe i kølerummet</p>
                <p className="text-stone-600 text-sm mt-1">Køb dyr og start slagtning</p>
              </div>
            )}
          </div>
        )}

        {/* DELSTYKKER */}
        {activeTab === "cuts" && (
          <div className="space-y-4">
            {["premium", "standard", "industrial"].map(cat => {
              const items = butcheredCuts.filter(c => c.cut_category === cat);
              if (items.length === 0) return null;
              const catLabels: Record<string, string> = {
                premium: "⭐ Premium udskæringer",
                standard: "🛒 Standard udskæringer",
                industrial: "🏭 Industrikød",
              };
              return (
                <div key={cat}>
                  <h2 className="text-sm font-medium text-stone-500 uppercase tracking-wide mb-3">
                    {catLabels[cat]} ({items.length})
                  </h2>
                  <div className="space-y-2">
                    {items.map(cut => {
                      const effectivePrice = cut.base_price_dkk_per_kg *
                        (1 + cut.maturation_bonus_pct / 100) *
                        (cut.is_vacuum_packed ? 1.2 : 1);
                      return (
                        <div key={cut.id} className="card flex items-center justify-between gap-4">
                          <div className="flex items-center gap-3">
                            <span className={`text-xs font-bold px-1.5 py-0.5 rounded border ${SEUROP_COLORS[cut.seurop_class]}`}>
                              {cut.seurop_class}
                            </span>
                            <div>
                              <span className="text-stone-100 text-sm font-medium">{cut.cut_name}</span>
                              <span className="text-stone-500 text-xs ml-2">{ANIMAL_LABELS[cut.animal_category]}</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-4 text-right">
                            <div>
                              <p className="text-stone-300 text-sm">{cut.weight_kg.toFixed(1)} kg</p>
                            </div>
                            <div>
                              <p className="text-brand-400 font-medium text-sm">
                                {effectivePrice.toFixed(2)} kr/kg
                              </p>
                              <p className="text-stone-500 text-xs">
                                {formatDKK(Math.round(cut.weight_kg * effectivePrice))}
                              </p>
                            </div>
                            {cut.maturation_bonus_pct > 0 && (
                              <span className="badge-yellow">+{cut.maturation_bonus_pct}%</span>
                            )}
                            {cut.is_vacuum_packed && (
                              <span className="badge-blue">Vakuum</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}

            {butcheredCuts.length === 0 && (
              <div className="card border-dashed border-stone-700 text-center py-12">
                <p className="text-stone-500">Ingen delstykker på lager</p>
                <p className="text-stone-600 text-sm mt-1">Udbén kroppe fra kølelageret</p>
              </div>
            )}
          </div>
        )}

      </main>
    </div>
  );
}
