"use client";
import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { formatDKK } from "@/lib/utils";
import type { Company } from "@/lib/types";
import Navigation from "@/components/Navigation";

type ColdItem = {
  id: string;
  animal_category: string;
  seurop_class: string;
  carcass_weight_kg: number;
  status: string;
  maturation_bonus_pct: number;
  destination: string;
};

type CutItem = {
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

type Buyer = {
  id: string;
  name: string;
  type: string;
  logo_emoji: string;
  price_bonus_pct: number;
  accepted_classes: string[];
  min_compliance: number;
  description: string;
};

const ANIMAL_LABELS: Record<string, string> = {
  young_bulls: "Ungtyre", heifers: "Kvier", steers: "Stude", cows: "Køer",
  class_s: "S-svin", class_e: "E-svin", class_r: "R-svin",
  light: "Let lam", heavy: "Tungt lam", broiler: "Slagtekylling", hen: "Høne",
};

const SEUROP_COLORS: Record<string, string> = {
  S: "bg-purple-900 text-purple-300 border-purple-700",
  E: "bg-blue-900 text-blue-300 border-blue-700",
  U: "bg-green-900 text-green-300 border-green-700",
  R: "bg-yellow-900 text-yellow-300 border-yellow-700",
  O: "bg-stone-700 text-stone-300 border-stone-600",
  P: "bg-red-900 text-red-300 border-red-700",
};

const BASE_PRICE = 22.5;

export default function SalesPage() {
  const [company, setCompany] = useState<Company | null>(null);
  const [coldItems, setColdItems] = useState<ColdItem[]>([]);
  const [cutItems, setCutItems] = useState<CutItem[]>([]);
  const [buyers, setBuyers] = useState<Buyer[]>([]);
  const [selectedBuyerId, setSelectedBuyerId] = useState<string>("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [selling, setSelling] = useState(false);
  const [activeTab, setActiveTab] = useState<"quarter" | "cuts">("quarter");
  const router = useRouter();
  const supabase = createClient();

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.push("/login"); return; }
    const { data: co } = await supabase.from("companies").select("*").eq("player_id", user.id).single();
    if (!co) { router.push("/onboarding"); return; }
    setCompany(co);

    const [coldRes, cutsRes, buyerRes] = await Promise.all([
      supabase.from("cold_storage").select("*").eq("company_id", co.id).eq("status", "ready").order("seurop_class"),
      supabase.from("butchered_cuts").select("*").eq("company_id", co.id).eq("status", "available").order("cut_category"),
      supabase.from("buyers").select("*").eq("active", true).order("price_bonus_pct", { ascending: false }),
    ]);

    setColdItems(coldRes.data || []);
    setCutItems(cutsRes.data || []);
    const b = buyerRes.data || [];
    setBuyers(b);
    if (b.length > 0 && !selectedBuyerId) setSelectedBuyerId(b[b.length - 1]?.id || "");
    setLoading(false);
  }, [selectedBuyerId]);

  useEffect(() => { load(); }, []);

  const buyer = buyers.find(b => b.id === selectedBuyerId);
  const priceBonus = buyer?.price_bonus_pct || 0;

  function toggle(id: string) {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }

  function selectGroup(ids: string[]) {
    setSelectedIds(prev => {
      const allIn = ids.every(id => prev.includes(id));
      if (allIn) return prev.filter(id => !ids.includes(id));
      return [...prev, ...ids.filter(id => !prev.includes(id))];
    });
  }

  const selCold = coldItems.filter(i => selectedIds.includes(i.id));
  const selCuts = cutItems.filter(i => selectedIds.includes(i.id));

  const coldValue = selCold.reduce((s, i) => s + i.carcass_weight_kg * BASE_PRICE * (1 + i.maturation_bonus_pct / 100) * (1 + priceBonus / 100), 0);
  const cutsValue = selCuts.reduce((s, i) => s + i.weight_kg * i.base_price_dkk_per_kg * (1 + i.maturation_bonus_pct / 100) * (i.is_vacuum_packed ? 1.2 : 1) * (1 + priceBonus / 100), 0);
  const totalValue = Math.round(coldValue + cutsValue);
  const totalKg = Math.round(selCold.reduce((s, i) => s + i.carcass_weight_kg, 0) + selCuts.reduce((s, i) => s + i.weight_kg, 0));

  const totalLager = Math.round(
    coldItems.reduce((s, i) => s + i.carcass_weight_kg * BASE_PRICE, 0) +
    cutItems.reduce((s, i) => s + i.weight_kg * i.base_price_dkk_per_kg, 0)
  );

  async function sellSelected() {
    if (!company || selectedIds.length === 0) return;
    setSelling(true);
    let cashGain = 0;
    let repLoss = 0;

    for (const item of selCold) {
      const price = BASE_PRICE * (1 + item.maturation_bonus_pct / 100) * (1 + priceBonus / 100);
      cashGain += Math.round(item.carcass_weight_kg * price);
      if (buyer?.accepted_classes?.length && !buyer.accepted_classes.includes(item.seurop_class)) repLoss -= 5;
      await supabase.from("cold_storage").update({ status: "sold_quarter" }).eq("id", item.id);
    }

    for (const item of selCuts) {
      const price = item.base_price_dkk_per_kg * (1 + item.maturation_bonus_pct / 100) * (item.is_vacuum_packed ? 1.2 : 1) * (1 + priceBonus / 100);
      cashGain += Math.round(item.weight_kg * price);
      await supabase.from("butchered_cuts").update({ status: "sold" }).eq("id", item.id);
    }

    await supabase.from("companies").update({
      cash: company.cash + cashGain,
      reputation: Math.max(0, company.reputation + repLoss),
    }).eq("id", company.id);

    setSelectedIds([]);
    setSelling(false);
    load();
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center"><p className="text-stone-500">Indlæser...</p></div>;
  if (!company) return null;

  const groupedCold = coldItems.reduce((acc, item) => {
    const key = `${item.animal_category}-${item.seurop_class}`;
    if (!acc[key]) acc[key] = { animal_category: item.animal_category, seurop_class: item.seurop_class, items: [] as ColdItem[], totalKg: 0 };
    acc[key].items.push(item);
    acc[key].totalKg += item.carcass_weight_kg;
    return acc;
  }, {} as Record<string, { animal_category: string; seurop_class: string; items: ColdItem[]; totalKg: number }>);

  const groupedCuts = cutItems.reduce((acc, item) => {
    const key = `${item.cut_name}-${item.seurop_class}`;
    if (!acc[key]) acc[key] = { ...item, items: [] as CutItem[], totalKg: 0 };
    acc[key].items.push(item);
    acc[key].totalKg += item.weight_kg;
    return acc;
  }, {} as Record<string, CutItem & { items: CutItem[]; totalKg: number }>);

  return (
    <div className="min-h-screen bg-stone-950">
      <Navigation />
      <header className="border-b border-stone-800 bg-stone-900/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="font-bold text-stone-100">Salg</h1>
            <p className="text-xs text-stone-500">{company.current_day} · Uge {company.current_week}</p>
          </div>
          <div className="flex items-center gap-4 text-right text-xs">
            <div>
              <p className="text-stone-500">Lagerværdi</p>
              <p className="font-bold text-green-400">{formatDKK(totalLager)}</p>
            </div>
            <div>
              <p className="text-stone-500">Kasse</p>
              <p className="font-bold text-stone-200">{formatDKK(company.cash)}</p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6 space-y-6">

        {/* Vælg køber */}
        <div>
          <h2 className="text-sm font-medium text-stone-500 uppercase tracking-wide mb-3">Vælg køber</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {buyers.map(b => (
              <button key={b.id} onClick={() => setSelectedBuyerId(b.id)}
                className={`card text-left transition-all ${selectedBuyerId === b.id ? "border-brand-500 bg-stone-800" : "hover:border-stone-600"}`}>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-lg">{b.logo_emoji}</span>
                  <span className="text-sm font-medium text-stone-100 truncate">{b.name}</span>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  {b.price_bonus_pct > 0 ? <span className="badge-green">+{b.price_bonus_pct}%</span> : <span className="text-xs text-stone-500">Basismarkedspris</span>}
                  {b.type === "guaranteed" && <span className="badge-blue">Garanti</span>}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2">
          {[
            { key: "quarter", label: "🧊 Slagtekroppe", count: coldItems.length },
            { key: "cuts",    label: "🔪 Delstykker",   count: cutItems.length },
          ].map(tab => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key as "quarter" | "cuts")}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl border text-sm font-medium transition-colors ${activeTab === tab.key ? "bg-stone-700 border-stone-500 text-stone-100" : "bg-stone-900 border-stone-800 text-stone-400 hover:bg-stone-800"}`}>
              {tab.label}
              <span className="bg-stone-600 text-stone-200 text-xs px-1.5 py-0.5 rounded-full">{tab.count}</span>
            </button>
          ))}
        </div>

        {/* SLAGTEKROPPE */}
        {activeTab === "quarter" && (
          <div className="space-y-2">
            {Object.keys(groupedCold).length === 0 && (
              <div className="card border-dashed border-stone-700 text-center py-12">
                <p className="text-stone-500">Ingen slagtekroppe klar til salg</p>
                <p className="text-stone-600 text-sm mt-1">Kroppe der afkøler er klar næste dag</p>
              </div>
            )}
            {Object.entries(groupedCold).map(([key, group]) => {
              const allSel = group.items.every(i => selectedIds.includes(i.id));
              const price = BASE_PRICE * (1 + priceBonus / 100);
              const val = Math.round(group.totalKg * price);
              const wrongClass = buyer?.accepted_classes?.length && !buyer.accepted_classes.includes(group.seurop_class);
              return (
                <div key={key} onClick={() => selectGroup(group.items.map(i => i.id))}
                  className={`card cursor-pointer transition-all ${allSel ? "border-brand-500 bg-stone-800/50" : "hover:border-stone-600"} ${wrongClass ? "border-l-4 border-l-red-700" : ""}`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 ${allSel ? "bg-brand-500 border-brand-500" : "border-stone-600"}`}>
                        {allSel && <span className="text-white text-xs">✓</span>}
                      </div>
                      <span className={`text-xs font-bold px-2 py-0.5 rounded border ${SEUROP_COLORS[group.seurop_class]}`}>{group.seurop_class}</span>
                      <div>
                        <span className="text-stone-100 text-sm font-medium">{ANIMAL_LABELS[group.animal_category]}</span>
                        <span className="text-stone-500 text-xs ml-2">{group.items.length} kroppe · {Math.round(group.totalKg)} kg</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-brand-400 font-medium">{formatDKK(val)}</p>
                      <p className="text-stone-500 text-xs">{price.toFixed(2)} kr/kg</p>
                      {wrongClass && <p className="text-red-400 text-xs">Omdømme -5</p>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* DELSTYKKER */}
        {activeTab === "cuts" && (
          <div className="space-y-4">
            {Object.keys(groupedCuts).length === 0 && (
              <div className="card border-dashed border-stone-700 text-center py-12">
                <p className="text-stone-500">Ingen delstykker klar til salg</p>
              </div>
            )}
            {["premium", "standard", "industrial"].map(cat => {
              const entries = Object.entries(groupedCuts).filter(([, g]) => g.cut_category === cat);
              if (!entries.length) return null;
              return (
                <div key={cat}>
                  <h3 className="text-xs font-medium text-stone-500 uppercase tracking-wide mb-2">
                    {cat === "premium" ? "⭐ Premium" : cat === "standard" ? "🛒 Standard" : "🏭 Industri"}
                  </h3>
                  <div className="space-y-2">
                    {entries.map(([key, group]) => {
                      const allSel = group.items.every(i => selectedIds.includes(i.id));
                      const price = group.base_price_dkk_per_kg * (1 + group.maturation_bonus_pct / 100) * (group.is_vacuum_packed ? 1.2 : 1) * (1 + priceBonus / 100);
                      const val = Math.round(group.totalKg * price);
                      return (
                        <div key={key} onClick={() => selectGroup(group.items.map(i => i.id))}
                          className={`card cursor-pointer transition-all ${allSel ? "border-brand-500 bg-stone-800/50" : "hover:border-stone-600"}`}>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <div className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 ${allSel ? "bg-brand-500 border-brand-500" : "border-stone-600"}`}>
                                {allSel && <span className="text-white text-xs">✓</span>}
                              </div>
                              <span className={`text-xs font-bold px-1.5 py-0.5 rounded border ${SEUROP_COLORS[group.seurop_class]}`}>{group.seurop_class}</span>
                              <div>
                                <span className="text-stone-100 text-sm font-medium">{group.cut_name}</span>
                                <span className="text-stone-500 text-xs ml-2">{group.totalKg.toFixed(1)} kg</span>
                              </div>
                            </div>
                            <div className="flex items-center gap-3">
                              {group.maturation_bonus_pct > 0 && <span className="badge-yellow">+{group.maturation_bonus_pct}%</span>}
                              {group.is_vacuum_packed && <span className="badge-blue">Vakuum</span>}
                              <div className="text-right">
                                <p className="text-brand-400 font-medium">{formatDKK(val)}</p>
                                <p className="text-stone-500 text-xs">{price.toFixed(2)} kr/kg</p>
                              </div>
                            </div>
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

        {selectedIds.length > 0 && <div className="h-24" />}
      </main>

      {/* Sticky salgsbar */}
      {selectedIds.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 bg-stone-900 border-t border-stone-700 p-4 z-20">
          <div className="max-w-6xl mx-auto flex items-center justify-between gap-4">
            <div>
              <p className="text-stone-300 text-sm font-medium">{selectedIds.length} poster · {totalKg} kg</p>
              <p className="text-xs text-stone-500">Til {buyer?.name || "?"} {priceBonus > 0 ? `(+${priceBonus}%)` : ""}</p>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-right">
                <p className="text-xs text-stone-500">Salgsindtægt</p>
                <p className="text-xl font-bold text-green-400">{formatDKK(totalValue)}</p>
              </div>
              <button onClick={sellSelected} disabled={selling} className="btn-primary px-6 py-3 text-base">
                {selling ? "Sælger..." : "Sælg nu →"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
