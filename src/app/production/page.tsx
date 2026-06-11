"use client";
import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import Navigation from "@/components/Navigation";
import { formatDKK } from "@/lib/utils";
import type { Company } from "@/lib/types";
import SlaughterLine from "@/components/SlaughterLine";

type StableAnimal = {
  id: string;
  animal_category: string;
  quantity: number;
  actual_weight_kg: number;
  arrived_week: number;
  arrived_day: string;
  arrived_at: string;
  ready_for_slaughter: boolean;
  health_status: string;
  vet_checked: boolean;
  stress_level: number;
  status: string;
};

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
};

const SEUROP_COLORS: Record<string, string> = {
  S: "bg-purple-900 text-purple-300 border-purple-700",
  E: "bg-blue-900 text-blue-300 border-blue-700",
  U: "bg-green-900 text-green-300 border-green-700",
  R: "bg-yellow-900 text-yellow-300 border-yellow-700",
  O: "bg-stone-700 text-stone-300 border-stone-600",
  P: "bg-red-900 text-red-300 border-red-700",
};

const ANIMAL_LABELS: Record<string, string> = {
  young_bulls: "Ungtyre", heifers: "Kvier", steers: "Stude", cows: "Køer",
  class_s: "Klasse S svin", class_e: "Klasse E svin", class_r: "Klasse R svin",
  light: "Let lam", heavy: "Tungt lam", broiler: "Slagtekylling", hen: "Høne",
};

const SECTIONS = [
  { key: "stable",    label: "Modtagelse / stald", emoji: "🐄" },
  { key: "slaughter", label: "Slagtelinje",         emoji: "⚙️" },
  { key: "cold",      label: "Kølelager",           emoji: "🧊" },
  { key: "butchery",  label: "Udbening / opskæring",emoji: "🔪" },
  { key: "packing",   label: "Pakkeri",             emoji: "📦" },
  { key: "packed",    label: "Pakkelager",           emoji: "🏭" },
];

function getSEUROPExpectation(category: string, stressLevel: number) {
  const base: Record<string, { class: string; pct: number }[]> = {
    young_bulls: [
      { class: "S", pct: 5 }, { class: "E", pct: 30 },
      { class: "U", pct: 40 }, { class: "R", pct: 20 }, { class: "O", pct: 5 },
    ],
    heifers: [
      { class: "E", pct: 20 }, { class: "U", pct: 35 },
      { class: "R", pct: 35 }, { class: "O", pct: 10 },
    ],
    steers: [
      { class: "U", pct: 20 }, { class: "R", pct: 45 },
      { class: "O", pct: 30 }, { class: "P", pct: 5 },
    ],
    cows: [
      { class: "R", pct: 10 }, { class: "O", pct: 45 }, { class: "P", pct: 45 },
    ],
  };
  const def = base[category] || [{ class: "R", pct: 100 }];
  // Høj stress skubber klasser ned
  if (stressLevel > 60) {
    return def.map(d => ({ ...d, pct: d.pct }));
  }
  return def;
}

export default function ProductionPage() {
  const [company, setCompany] = useState<Company | null>(null);
  const [stableAnimals, setStableAnimals] = useState<StableAnimal[]>([]);
  const [coldStorage, setColdStorage] = useState<ColdStorageItem[]>([]);
  const [butcheredCuts, setButcheredCuts] = useState<ButcheredCut[]>([]);
  const [cutDefs, setCutDefs] = useState<CutDefinition[]>([]);
  const [activeSection, setActiveSection] = useState("stable");
  const [selectedColdItem, setSelectedColdItem] = useState<string | null>(null);
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

    const [stableRes, coldRes, cutsRes, defRes] = await Promise.all([
      supabase.from("stable_animals").select("*")
        .eq("company_id", co.id)
        .not("status", "in", '("slaughtered","rejected")')
        .order("arrived_at"),
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

    setStableAnimals(stableRes.data || []);
    setColdStorage(coldRes.data || []);
    setButcheredCuts(cutsRes.data || []);
    setCutDefs(defRes.data || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, []);

  async function slaughterAnimal(animal: StableAnimal, basePrice: number) {
    if (!company) return;
    setProcessing(true);

    const seurop = getSEUROPExpectation(animal.animal_category, animal.stress_level);
    const carcassWeight = animal.actual_weight_kg * 0.55;

    const coldItems = seurop.map(cls => ({
      company_id: company.id,
      animal_category: animal.animal_category,
      seurop_class: cls.class,
      carcass_weight_kg: Math.round(carcassWeight * cls.pct / 100 * 10) / 10,
      slaughtered_week: company.current_week,
      slaughtered_day: company.current_day || "Mandag",
      status: "cooling",
      maturation_days: 0,
      maturation_bonus_pct: 0,
      max_maturation_days: 21,
    })).filter(i => i.carcass_weight_kg > 0);

    await supabase.from("cold_storage").insert(coldItems);
    await supabase.from("stable_animals").update({ status: "slaughtered" }).eq("id", animal.id);
    await supabase.from("companies").update({
      stable_current_animals: Math.max(0, (company.stable_current_animals || 0) - animal.quantity)
    }).eq("id", company.id);

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
    setSelectedColdItem(null);
    setProcessing(false);
    load();
  }

  async function sellAsQuarter(item: ColdStorageItem, basePrice: number) {
    if (!company) return;
    setProcessing(true);
    const revenue = Math.round(item.carcass_weight_kg * basePrice * (1 + item.maturation_bonus_pct / 100));
    await supabase.from("cold_storage").update({ status: "sold_quarter" }).eq("id", item.id);
    await supabase.from("companies").update({ cash: company.cash + revenue }).eq("id", company.id);
    setProcessing(false);
    load();
  }

  async function setMaturing(id: string) {
    setProcessing(true);
    await supabase.from("cold_storage").update({ status: "maturing" }).eq("id", id);
    setProcessing(false);
    load();
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <p className="text-stone-500">Indlæser...</p>
    </div>
  );
  if (!company) return null;

  const stablePct = Math.round((company.stable_current_animals || 0) / (company.stable_capacity_animals || 100) * 100);
  const coldKg = coldStorage.reduce((s, i) => s + i.carcass_weight_kg, 0);
  const coldPct = Math.round(coldKg / (company.cold_storage_capacity_kg || 50000) * 100);
  const cutsValue = butcheredCuts.reduce((s, c) => s + c.weight_kg * c.base_price_dkk_per_kg * (1 + c.maturation_bonus_pct / 100), 0);

  const readyForSlaughter = stableAnimals.filter(a => a.ready_for_slaughter && a.status === "resting");
  const resting = stableAnimals.filter(a => !a.ready_for_slaughter);
  const readyCold = coldStorage.filter(i => i.status === "ready" || i.status === "maturing");
  const coolingCold = coldStorage.filter(i => i.status === "cooling");
  const vacuumCuts = butcheredCuts.filter(c => c.is_vacuum_packed);
  const unpackedCuts = butcheredCuts.filter(c => !c.is_vacuum_packed);

  const sectionCounts: Record<string, number> = {
    stable: stableAnimals.length,
    slaughter: readyForSlaughter.length,
    cold: coldStorage.length,
    butchery: coldStorage.filter(i => i.status === "butchering_queue").length,
    packing: unpackedCuts.length,
    packed: vacuumCuts.length,
  };

  return (
    <div className="min-h-screen bg-stone-950">
      <Navigation />
      <header className="border-b border-stone-800 bg-stone-900/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => router.push("/dashboard")}
              className="text-stone-500 hover:text-stone-300 text-sm transition-colors">← Tilbage</button>
            <div className="w-px h-5 bg-stone-700" />
            <div>
              <h1 className="font-bold text-stone-100">Produktion</h1>
              <p className="text-xs text-stone-500">{company.name} · {company.current_day}</p>
            </div>
          </div>
          <div className="flex items-center gap-4 text-right text-xs">
            <div>
              <p className="text-stone-500">Stald</p>
              <p className={`font-bold ${stablePct > 80 ? "text-red-400" : "text-stone-300"}`}>
                {company.stable_current_animals || 0}/{company.stable_capacity_animals || 100} dyr
              </p>
            </div>
            <div>
              <p className="text-stone-500">Kølelager</p>
              <p className={`font-bold ${coldPct > 80 ? "text-red-400" : "text-stone-300"}`}>
                {Math.round(coldKg).toLocaleString("da-DK")} kg
              </p>
            </div>
            <div>
              <p className="text-stone-500">Lagerværdi</p>
              <p className="font-bold text-green-400">{formatDKK(Math.round(cutsValue))}</p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6 space-y-6">

        {/* Sektion-navigation */}
        <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
          {SECTIONS.map(s => (
            <button key={s.key} onClick={() => setActiveSection(s.key)}
              className={`card text-center py-3 px-2 transition-all ${activeSection === s.key ? "border-brand-500 bg-stone-800" : "hover:border-stone-600"}`}>
              <div className="text-xl mb-1">{s.emoji}</div>
              <div className={`text-xs font-medium leading-tight ${activeSection === s.key ? "text-stone-100" : "text-stone-400"}`}>
                {s.label}
              </div>
              {sectionCounts[s.key] > 0 && (
                <div className={`text-lg font-bold mt-1 ${activeSection === s.key ? "text-brand-400" : "text-stone-500"}`}>
                  {sectionCounts[s.key]}
                </div>
              )}
            </button>
          ))}
        </div>

        {/* MODTAGELSE / STALD */}
        {activeSection === "stable" && (
          <div className="space-y-4">
            <div className="card p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-stone-400">Staldkapacitet</span>
                <span className={`text-sm font-medium ${stablePct > 80 ? "text-red-400" : "text-stone-300"}`}>{stablePct}%</span>
              </div>
              <div className="w-full bg-stone-800 rounded-full h-2">
                <div className={`h-2 rounded-full ${stablePct > 80 ? "bg-red-500" : "bg-green-500"}`}
                  style={{ width: `${Math.min(stablePct, 100)}%` }} />
              </div>
              <p className="text-xs text-stone-600 mt-1">
                {company.stable_current_animals || 0} af {company.stable_capacity_animals || 100} pladser brugt
              </p>
            </div>

            {resting.length > 0 && (
              <div>
                <h2 className="text-sm font-medium text-stone-500 uppercase tracking-wide mb-3">
                  Hviler – ikke klar endnu ({resting.length})
                </h2>
                <div className="space-y-2">
                  {Object.entries(
                    resting.reduce((acc, a) => {
                      if (!acc[a.animal_category]) acc[a.animal_category] = { count: 0, totalKg: 0 };
                      acc[a.animal_category].count += a.quantity;
                      acc[a.animal_category].totalKg += a.actual_weight_kg * a.quantity;
                      return acc;
                    }, {} as Record<string, { count: number; totalKg: number }>)
                  ).map(([cat, data]) => (
                    <div key={cat} className="card opacity-70 flex items-center justify-between">
                      <div>
                        <span className="text-stone-100 text-sm font-medium">{ANIMAL_LABELS[cat]}</span>
                        <span className="text-stone-500 text-xs ml-2">{data.count} styk</span>
                      </div>
                      <div className="text-right">
                        <p className="text-stone-400 text-sm">{Math.round(data.totalKg / data.count)} kg/styk</p>
                        <p className="text-xs text-blue-400">💤 Klar næste dag</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {readyForSlaughter.length > 0 && (
              <div>
                <h2 className="text-sm font-medium text-stone-500 uppercase tracking-wide mb-3">
                  Klar til slagtning ({readyForSlaughter.length})
                </h2>
                <div className="space-y-3">
                  {readyForSlaughter.map(a => {
                    const seurop = getSEUROPExpectation(a.animal_category, a.stress_level);
                    return (
                      <div key={a.id} className="card">
                        <div className="flex items-center justify-between mb-3">
                          <div>
                            <span className="text-stone-100 font-medium">{ANIMAL_LABELS[a.animal_category]}</span>
                            <span className="text-stone-500 text-xs ml-2">{a.quantity} styk · {a.actual_weight_kg.toFixed(0)} kg/styk</span>
                          </div>
                          <div className="flex gap-2">
                            {a.stress_level > 60 && <span className="badge-red">Stresset</span>}
                            {a.stress_level <= 60 && <span className="badge-green">Rolig</span>}
                            {a.vet_checked && <span className="badge-green">Dyrlæge ✓</span>}
                          </div>
                        </div>
                        <div className="flex gap-2 flex-wrap mb-3">
                          {seurop.map(cls => (
                            <div key={cls.class} className="flex items-center gap-1">
                              <span className={`text-xs font-bold px-1.5 py-0.5 rounded border ${SEUROP_COLORS[cls.class]}`}>{cls.class}</span>
                              <span className="text-xs text-stone-500">~{cls.pct}%</span>
                            </div>
                          ))}
                        </div>
                        <button
                          onClick={() => slaughterAnimal(a, 22.5)}
                          disabled={processing}
                          className="btn-primary w-full py-2 text-sm"
                        >
                          ⚙️ Send til slagtelinje
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {stableAnimals.length === 0 && (
              <div className="card border-dashed border-stone-700 text-center py-12">
                <p className="text-stone-500">Ingen dyr i stalden</p>
                <button onClick={() => router.push("/purchase")} className="btn-secondary mt-4">
                  Gå til indkøb →
                </button>
              </div>
            )}
          </div>
        )}

        {/* SLAGTELINJE */}
        {activeSection === "slaughter" && (
          <SlaughterLine
            readyAnimals={readyForSlaughter}
            company={company}
            onSlaughter={slaughterAnimal}
            processing={processing}
          />
        )}

        {/* KØLELAGER */}
        {activeSection === "cold" && (
          <div className="space-y-4">
            <div className="card p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-stone-400">Kølerumskapacitet</span>
                <span className={`text-sm font-medium ${coldPct > 80 ? "text-red-400" : "text-stone-300"}`}>{coldPct}%</span>
              </div>
              <div className="w-full bg-stone-800 rounded-full h-2">
                <div className={`h-2 rounded-full ${coldPct > 80 ? "bg-red-500" : coldPct > 60 ? "bg-yellow-500" : "bg-blue-500"}`}
                  style={{ width: `${Math.min(coldPct, 100)}%` }} />
              </div>
            </div>

            {coolingCold.length > 0 && (
              <div>
                <h2 className="text-sm font-medium text-stone-500 uppercase tracking-wide mb-3">
                  Afkøler – ikke klar endnu ({coolingCold.length})
                </h2>
                <div className="space-y-2">
                  {Object.entries(
                    coolingCold.reduce((acc, item) => {
                      const key = `${item.animal_category}-${item.seurop_class}`;
                      if (!acc[key]) acc[key] = { animal_category: item.animal_category, seurop_class: item.seurop_class, count: 0, totalKg: 0 };
                      acc[key].count++;
                      acc[key].totalKg += item.carcass_weight_kg;
                      return acc;
                    }, {} as Record<string, { animal_category: string; seurop_class: string; count: number; totalKg: number }>)
                  ).map(([key, data]) => (
                    <div key={key} className="card opacity-70 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-bold px-2 py-0.5 rounded border ${SEUROP_COLORS[data.seurop_class]}`}>{data.seurop_class}</span>
                        <span className="text-stone-300 text-sm">{ANIMAL_LABELS[data.animal_category]}</span>
                        <span className="text-stone-500 text-xs">{data.count} kroppe</span>
                      </div>
                      <div className="text-right">
                        <p className="text-stone-400 text-sm">{Math.round(data.totalKg)} kg</p>
                        <p className="text-xs text-blue-400">❄️ Klar i morgen</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {readyCold.length > 0 && (
              <div>
                <h2 className="text-sm font-medium text-stone-500 uppercase tracking-wide mb-3">
                  Klar til behandling ({readyCold.length} kroppe)
                </h2>
                <div className="space-y-3">
                  {Object.entries(
                    readyCold.reduce((acc, item) => {
                      const key = `${item.animal_category}-${item.seurop_class}`;
                      if (!acc[key]) acc[key] = { animal_category: item.animal_category, seurop_class: item.seurop_class, items: [], totalKg: 0, maxBonus: 0 };
                      acc[key].items.push(item);
                      acc[key].totalKg += item.carcass_weight_kg;
                      acc[key].maxBonus = Math.max(acc[key].maxBonus, item.maturation_bonus_pct);
                      return acc;
                    }, {} as Record<string, { animal_category: string; seurop_class: string; items: typeof readyCold; totalKg: number; maxBonus: number }>)
                  ).map(([key, group]) => {
                    const isSelected = selectedColdItem === key;
                    return (
                      <div key={key} className={`card transition-all ${isSelected ? "border-brand-500" : ""}`}>
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <span className={`text-xs font-bold px-2 py-0.5 rounded border ${SEUROP_COLORS[group.seurop_class]}`}>{group.seurop_class}</span>
                            <span className="text-stone-100 text-sm">{ANIMAL_LABELS[group.animal_category]}</span>
                            <span className="text-stone-500 text-xs">{group.items.length} kroppe · {Math.round(group.totalKg)} kg</span>
                          </div>
                          {group.maxBonus > 0 && <span className="badge-yellow">+{group.maxBonus}% modning</span>}
                        </div>
                        {isSelected ? (
                          <div className="space-y-2 pt-2 border-t border-stone-700">
                            <button onClick={async () => { for (const item of group.items) await butcherItem(item, 22.5); setSelectedColdItem(null); }}
                              className="btn-primary w-full py-2 text-sm">
                              🔪 Udbén alle ({group.items.length} kroppe)
                            </button>
                            <button onClick={async () => { for (const item of group.items) await sellAsQuarter(item, 22.5); setSelectedColdItem(null); }} disabled={processing}
                              className="btn-secondary w-full py-2 text-sm">
                              📦 Sælg alle som 1/4 ({formatDKK(Math.round(group.totalKg * 22.5))})
                            </button>
                            <button onClick={async () => { for (const item of group.items) await setMaturing(item.id); setSelectedColdItem(null); }} disabled={processing}
                              className="w-full py-2 text-sm bg-amber-950/30 border border-amber-800/50 text-amber-400 rounded-lg hover:bg-amber-950/50 transition-colors">
                              ⏳ Lad alle hænge til modning
                            </button>
                            <button onClick={() => setSelectedColdItem(null)}
                              className="w-full text-xs text-stone-600 hover:text-stone-500 py-1">Annuller</button>
                          </div>
                        ) : (
                          <button onClick={() => setSelectedColdItem(key)}
                            className="btn-secondary w-full py-2 text-sm">
                            Vælg handling →
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {coldStorage.length === 0 && (
              <div className="card border-dashed border-stone-700 text-center py-12">
                <p className="text-stone-500">Kølerummet er tomt</p>
              </div>
            )}
          </div>
        )}

        {/* UDBENING */}
        {activeSection === "butchery" && (
          <div className="space-y-4">
            <div className="card border-l-4 border-l-purple-500 bg-stone-900/50">
              <p className="text-stone-300 text-sm">
                Kroppe fra kølerummet udskæres til delstykker her. Vælg en krop fra kølelageret og send den til udbening.
              </p>
            </div>
            {readyCold.length > 0 ? (
              <div className="space-y-3">
                {readyCold.map(item => (
                  <div key={item.id} className="card">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-bold px-2 py-0.5 rounded border ${SEUROP_COLORS[item.seurop_class]}`}>{item.seurop_class}</span>
                        <span className="text-stone-100">{ANIMAL_LABELS[item.animal_category]}</span>
                        <span className="text-stone-500 text-xs">{item.carcass_weight_kg.toFixed(1)} kg</span>
                      </div>
                      {item.maturation_bonus_pct > 0 && <span className="badge-yellow">+{item.maturation_bonus_pct}%</span>}
                    </div>
                    <div className="bg-stone-800/50 rounded-lg p-3 mb-3">
                      <p className="text-xs text-stone-500 mb-2">Forventede udskæringer</p>
                      <div className="grid grid-cols-2 gap-1">
                        {cutDefs.filter(d => d.animal_category === item.animal_category).slice(0, 6).map(def => (
                          <div key={def.id} className="flex justify-between text-xs">
                            <span className="text-stone-400">{def.cut_name}</span>
                            <span className="text-stone-500">~{(item.carcass_weight_kg * def.yield_pct / 100).toFixed(1)} kg</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <button onClick={() => butcherItem(item, 22.5)} disabled={processing}
                      className="btn-primary w-full py-2 text-sm">
                      🔪 Udbén denne krop
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="card border-dashed border-stone-700 text-center py-12">
                <p className="text-stone-500">Ingen kroppe klar til udbening</p>
                <button onClick={() => setActiveSection("cold")} className="btn-secondary mt-4">
                  Gå til kølelager →
                </button>
              </div>
            )}
          </div>
        )}

        {/* PAKKERI */}
        {activeSection === "packing" && (
          <div className="space-y-4">
            <div className="card border-l-4 border-l-teal-500 bg-stone-900/50">
              <p className="text-stone-300 text-sm">
                Udbenede delstykker vakuumpakkes her. Vakuumpakning forlænger holdbarhed og øger salgsprisen med +20%.
              </p>
              {!company.has_vacuum_packer && (
                <p className="text-amber-400 text-sm mt-2">⚠️ Du har ingen vakuumpakker. Invester i udstyr for at aktivere denne funktion.</p>
              )}
            </div>
            {unpackedCuts.length > 0 ? (
              <div className="space-y-2">
                {["premium", "standard", "industrial"].map(cat => {
                  const items = unpackedCuts.filter(c => c.cut_category === cat);
                  if (!items.length) return null;
                  const catLabel = { premium: "⭐ Premium", standard: "🛒 Standard", industrial: "🏭 Industri" }[cat];
                  return (
                    <div key={cat}>
                      <h3 className="text-xs font-medium text-stone-500 uppercase tracking-wide mb-2">{catLabel}</h3>
                      {items.map(cut => (
                        <div key={cut.id} className="card flex items-center justify-between gap-4 py-3">
                          <div className="flex items-center gap-2">
                            <span className={`text-xs font-bold px-1.5 py-0.5 rounded border ${SEUROP_COLORS[cut.seurop_class]}`}>{cut.seurop_class}</span>
                            <span className="text-stone-100 text-sm">{cut.cut_name}</span>
                          </div>
                          <div className="flex items-center gap-3 text-right">
                            <span className="text-stone-400 text-sm">{cut.weight_kg.toFixed(1)} kg</span>
                            <span className="text-brand-400 text-sm">{cut.base_price_dkk_per_kg} kr/kg</span>
                            {company.has_vacuum_packer && (
                              <button className="btn-secondary py-1 px-3 text-xs">Pak</button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="card border-dashed border-stone-700 text-center py-12">
                <p className="text-stone-500">Ingen delstykker til pakning</p>
                <button onClick={() => setActiveSection("butchery")} className="btn-secondary mt-4">
                  Gå til udbening →
                </button>
              </div>
            )}
          </div>
        )}

        {/* PAKKELAGER */}
        {activeSection === "packed" && (
          <div className="space-y-4">
            <div className="card border-l-4 border-l-stone-500 bg-stone-900/50">
              <p className="text-stone-300 text-sm">
                Færdigpakkede varer klar til levering. Vakuumpakkede varer har +20% i salgspris.
              </p>
            </div>
            {vacuumCuts.length > 0 ? (
              <div className="space-y-2">
                {vacuumCuts.map(cut => (
                  <div key={cut.id} className="card flex items-center justify-between gap-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-bold px-1.5 py-0.5 rounded border ${SEUROP_COLORS[cut.seurop_class]}`}>{cut.seurop_class}</span>
                      <span className="text-stone-100 text-sm">{cut.cut_name}</span>
                      <span className="badge-blue">Vakuum</span>
                    </div>
                    <div className="text-right">
                      <p className="text-brand-400 text-sm font-medium">
                        {(cut.base_price_dkk_per_kg * 1.2).toFixed(2)} kr/kg
                      </p>
                      <p className="text-stone-500 text-xs">{cut.weight_kg.toFixed(1)} kg</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="card border-dashed border-stone-700 text-center py-12">
                <p className="text-stone-500">Ingen pakket varer på lager</p>
              </div>
            )}
          </div>
        )}

      </main>
    </div>
  );
}
