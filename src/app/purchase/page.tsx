"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter, useSearchParams } from "next/navigation";
import { formatDKK } from "@/lib/utils";
import Navigation from "@/components/Navigation";
import type { Company } from "@/lib/types";
import { INDUSTRY_CONFIG } from "@/lib/types";
import { Suspense } from "react";

type AnimalPrice = {
  category: string;
  category_label: string;
  best_use: string;
  price_dkk_per_kg: number;
  weight_min_kg: number | null;
  weight_max_kg: number | null;
  unit: string;
};

type CartItem = {
  category: string;
  category_label: string;
  quantity: number;
  unit: string;
  weight_min_kg: number | null;
  weight_max_kg: number | null;
  price_per_kg: number;
  is_weekend: boolean;
};

function avgWeight(min: number | null, max: number | null): number {
  if (!min || !max) return 1;
  return (min + max) / 2;
}

function estimatedKg(item: CartItem): number {
  if (item.unit === "kg") return item.quantity;
  return item.quantity * avgWeight(item.weight_min_kg, item.weight_max_kg);
}

function estimatedCost(item: CartItem): number {
  return estimatedKg(item) * item.price_per_kg;
}

function PurchaseContent() {
  const [company, setCompany] = useState<Company | null>(null);
  const [prices, setPrices] = useState<AnimalPrice[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();
  const searchParams = useSearchParams();
  const isWeekend = searchParams.get("weekend") === "1";
  const supabase = createClient();

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/login"); return; }

      const { data: co } = await supabase
        .from("companies").select("*").eq("player_id", user.id).single();
      if (!co) { router.push("/onboarding"); return; }
      setCompany(co);

      const { data: ap } = await supabase
        .from("animal_prices")
        .select("category, category_label, best_use, price_dkk_per_kg, weight_min_kg, weight_max_kg, unit")
        .eq("week_number", co.current_week)
        .eq("industry", co.industry)
        .order("price_dkk_per_kg", { ascending: false });

      setPrices(ap || []);
      setCart((ap || []).map(p => ({
        category: p.category,
        category_label: p.category_label,
        quantity: 0,
        unit: p.unit,
        weight_min_kg: p.weight_min_kg,
        weight_max_kg: p.weight_max_kg,
        price_per_kg: isWeekend ? p.price_dkk_per_kg * 1.05 : p.price_dkk_per_kg,
        is_weekend: isWeekend,
      })));

      setLoading(false);
    }
    load();
  }, [isWeekend]);

  function updateQuantity(category: string, value: string) {
    const qty = Math.max(0, parseInt(value) || 0);
    setCart(prev => prev.map(item =>
      item.category === category ? { ...item, quantity: qty } : item
    ));
  }

  function addPreset(category: string, amount: number) {
    setCart(prev => prev.map(item =>
      item.category === category
        ? { ...item, quantity: Math.max(0, item.quantity + amount) }
        : item
    ));
  }

  const totalEstimatedKg = cart.reduce((sum, i) => sum + estimatedKg(i), 0);
  const totalEstimatedCost = cart.reduce((sum, i) => sum + estimatedCost(i), 0);
  const hasItems = cart.some(i => i.quantity > 0);

  async function handlePurchase() {
    if (!company || !hasItems) return;
    setSaving(true);
    setError("");

    const items = cart.filter(i => i.quantity > 0);

    const { error: err } = await supabase
      .from("raw_material_purchases")
      .insert(items.map(item => ({
        company_id: company.id,
        week_number: company.current_week,
        animal_category: item.category,
        quantity_kg: Math.round(estimatedKg(item)),
        quantity_animals: item.unit === "styk" ? item.quantity : null,
        price_per_kg: item.price_per_kg,
        total_cost: Math.round(estimatedCost(item)),
        supplier_name: isWeekend ? "Weekend-marked" : "Lokalt landbrug",
        is_weekend: isWeekend,
      })));

    if (err) {
      setError("Kunne ikke gennemføre købet. Prøv igen.");
      setSaving(false);
      return;
    }

    await supabase
      .from("companies")
      .update((() => {
        const cost = Math.round(totalEstimatedCost);
        const newCash = Math.max(0, company.cash - cost);
        const creditNeeded = Math.max(0, cost - company.cash);
        const newCreditUsed = Math.min(company.credit_limit, (company.credit_used || 0) + creditNeeded);
        return { cash: newCash, credit_used: newCreditUsed };
      })())
      .eq("id", company.id);

    // Registrer dyr i stalden
    const stableItems = items.filter(i => i.unit === "styk" && i.quantity > 0);
    if (stableItems.length > 0) {
      const stableRows = stableItems.flatMap(item => {
        const min = item.weight_min_kg || 500;
        const max = item.weight_max_kg || 650;
        // Opret en række per dyr med tilfældig vægt
        return Array.from({ length: item.quantity }, () => ({
          company_id: company!.id,
          animal_category: item.category,
          quantity: 1,
          actual_weight_kg: Math.round((min + Math.random() * (max - min)) * 10) / 10,
          arrived_week: company!.current_week,
          arrived_day: company!.current_day || "Mandag",
          ready_for_slaughter: false,
          health_status: "ok",
          vet_checked: false,
          stress_level: Math.floor(Math.random() * 30) + 10,
          status: "resting",
        }));
      });

      // Indsæt i batches af 50 for ikke at overbelaste
      for (let i = 0; i < stableRows.length; i += 50) {
        await supabase.from("stable_animals").insert(stableRows.slice(i, i + 50));
      }

      // Opdater stald-tæller
      const totalAnimals = stableItems.reduce((s, i) => s + i.quantity, 0);
      await supabase.from("companies").update({
        stable_current_animals: (company!.stable_current_animals || 0) + totalAnimals
      }).eq("id", company!.id);
    }

    router.push("/dashboard");
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <p className="text-stone-500">Indlæser...</p>
    </div>
  );

  if (!company) return null;

  const ind = INDUSTRY_CONFIG[company.industry] ?? INDUSTRY_CONFIG["kreaturslagteri"];
  const totalAvailable = company.cash + (company.credit_limit - (company.credit_used || 0));
  const canAfford = totalEstimatedCost <= totalAvailable;

  return (
    <div className="min-h-screen bg-stone-950">
      <Navigation />
      <header className="border-b border-stone-800 bg-stone-900/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => router.push("/dashboard")}
              className="text-stone-500 hover:text-stone-300 text-sm transition-colors">
              ← Tilbage
            </button>
            <div className="w-px h-5 bg-stone-700" />
            <span className="text-2xl">{ind.emoji}</span>
            <div>
              <h1 className="font-bold text-stone-100">
                {isWeekend ? "Weekend-marked" : "Indkøb af levende dyr"}
              </h1>
              <p className="text-xs text-stone-500">
                {isWeekend ? "Til lørdag · +5% weekendtillæg" : `Uge ${company.current_week} · Til mandag`}
              </p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs text-stone-500">Disponibel</p>
            <p className="font-bold text-green-400">{formatDKK(company.cash)}</p>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8 space-y-4">

        {isWeekend && (
          <div className="card border-l-4 border-l-amber-500 bg-amber-950/20">
            <p className="text-amber-400 text-sm font-medium">Weekend-marked</p>
            <p className="text-stone-400 text-sm mt-0.5">
              Priserne er 5% højere end normalt. Dyrene leveres til lørdag-slagtning.
            </p>
          </div>
        )}

        {error && (
          <div className="bg-red-900/30 border border-red-800 text-red-400 text-sm px-4 py-3 rounded-lg">
            {error}
          </div>
        )}

        {prices.map((price, i) => {
          const item = cart[i];
          if (!item) return null;
          const avg = avgWeight(price.weight_min_kg, price.weight_max_kg);
          const estKg = estimatedKg(item);
          const estCost = estimatedCost(item);
          const pricePerAnimal = price.unit === "styk" ? avg * item.price_per_kg : null;

          return (
            <div key={price.category} className="card space-y-4">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-semibold text-stone-100">{price.category_label}</h3>
                  <p className="text-xs text-stone-500 mt-0.5">{price.best_use}</p>
                  {price.unit === "styk" && price.weight_min_kg && price.weight_max_kg && (
                    <p className="text-xs text-stone-600 mt-0.5">
                      Levende vægt: {price.weight_min_kg}–{price.weight_max_kg} kg pr. dyr
                      · snit ~{avg.toFixed(0)} kg
                    </p>
                  )}
                </div>
                <div className="text-right">
                  <p className="font-bold text-brand-400">
                    {item.price_per_kg.toFixed(2)} kr/kg
                  </p>
                  {pricePerAnimal && (
                    <p className="text-xs text-stone-500">
                      ~{formatDKK(pricePerAnimal)} pr. dyr
                    </p>
                  )}
                  {isWeekend && (
                    <p className="text-xs text-stone-600 line-through">
                      {price.price_dkk_per_kg.toFixed(2)} kr/kg
                    </p>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-3 flex-wrap">
                {/* Hurtigknapper */}
                <div className="flex gap-1">
                  {(price.unit === "styk"
                    ? [5, 10, 25, 50]
                    : [1000, 5000, 10000]
                  ).map(amt => (
                    <button
                      key={amt}
                      onClick={() => addPreset(price.category, amt)}
                      className="px-2 py-1 text-xs bg-stone-800 hover:bg-stone-700 text-stone-400 rounded border border-stone-700 transition-colors"
                    >
                      +{price.unit === "styk" ? amt : `${amt/1000}t`}
                    </button>
                  ))}
                  {item.quantity > 0 && (
                    <button
                      onClick={() => updateQuantity(price.category, "0")}
                      className="px-2 py-1 text-xs bg-red-900/30 hover:bg-red-900/50 text-red-400 rounded border border-red-800 transition-colors"
                    >
                      Nulstil
                    </button>
                  )}
                </div>

                {/* Input */}
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="0"
                    value={item.quantity || ""}
                    placeholder="0"
                    onChange={e => updateQuantity(price.category, e.target.value)}
                    className="input text-right w-28"
                  />
                  <span className="text-stone-500 text-sm">{price.unit}</span>
                </div>

                {/* Delsum */}
                {item.quantity > 0 && (
                  <div className="ml-auto text-right">
                    <p className="font-medium text-stone-200">{formatDKK(estCost)}</p>
                    <p className="text-xs text-stone-500">
                      ~{Math.round(estKg).toLocaleString("da-DK")} kg levende vægt
                    </p>
                  </div>
                )}
              </div>

              {/* SEUROP forventning */}
              {item.quantity > 0 && (
                <div className="bg-stone-800/50 rounded-lg p-3">
                  <p className="text-xs text-stone-500 mb-2">Forventet SEUROP efter slagtning</p>
                  <div className="flex gap-3 flex-wrap">
                    {getSEUROPExpectation(price.category).map(cls => {
                      const carcassKg = Math.round(estKg * 0.55 * cls.pct / 100);
                      return (
                        <div key={cls.class} className="flex items-center gap-1.5">
                          <span className={`text-xs font-bold px-2 py-0.5 rounded ${cls.color}`}>
                            {cls.class}
                          </span>
                          <span className="text-xs text-stone-400">
                            ~{carcassKg.toLocaleString("da-DK")} kg
                          </span>
                          <span className="text-xs text-stone-600">({cls.pct}%)</span>
                        </div>
                      );
                    })}
                  </div>
                  <p className="text-xs text-stone-600 mt-2">
                    Slagteudbytte ~55% af levende vægt. Klassificering varierer ±15% i praksis.
                  </p>
                </div>
              )}
            </div>
          );
        })}

        {/* Kurv */}
        <div className="card bg-stone-900 border-stone-700">
          <div className="flex items-start justify-between mb-4">
            <div>
              <p className="text-stone-400 text-sm font-medium">Estimeret total</p>
              <p className="text-xs text-stone-600 mt-0.5">
                ~{Math.round(totalEstimatedKg).toLocaleString("da-DK")} kg levende vægt
              </p>
              <p className="text-xs text-stone-600">
                Faktisk vægt kendes ved ankomst
              </p>
            </div>
            <div className="text-right">
              <p className={`text-2xl font-bold ${canAfford ? "text-stone-100" : "text-red-400"}`}>
                {formatDKK(totalEstimatedCost)}
              </p>
              {!canAfford && <p className="text-xs text-red-400">Ikke nok likvider</p>}
              {canAfford && hasItems && (
                <p className="text-xs text-stone-500">
                  Tilbage: {formatDKK(company.cash - totalEstimatedCost)}
                </p>
              )}
            </div>
          </div>

          <div className="flex gap-3">
            <button onClick={() => router.push("/dashboard")} className="btn-secondary flex-1">
              Spring over
            </button>
            <button
              onClick={handlePurchase}
              disabled={!hasItems || !canAfford || saving}
              className="btn-primary flex-1"
            >
              {saving ? "Køber..." : hasItems
                ? `Bekræft indkøb`
                : "Ingen valgt"}
            </button>
          </div>
        </div>

      </main>
    </div>
  );
}

function getSEUROPExpectation(category: string) {
  const map: Record<string, { class: string; pct: number; color: string }[]> = {
    young_bulls: [
      { class: "S", pct: 5,  color: "bg-purple-900 text-purple-300" },
      { class: "E", pct: 30, color: "bg-blue-900 text-blue-300" },
      { class: "U", pct: 40, color: "bg-green-900 text-green-300" },
      { class: "R", pct: 20, color: "bg-yellow-900 text-yellow-300" },
      { class: "O", pct: 5,  color: "bg-stone-700 text-stone-300" },
    ],
    heifers: [
      { class: "E", pct: 20, color: "bg-blue-900 text-blue-300" },
      { class: "U", pct: 35, color: "bg-green-900 text-green-300" },
      { class: "R", pct: 35, color: "bg-yellow-900 text-yellow-300" },
      { class: "O", pct: 10, color: "bg-stone-700 text-stone-300" },
    ],
    steers: [
      { class: "U", pct: 20, color: "bg-green-900 text-green-300" },
      { class: "R", pct: 45, color: "bg-yellow-900 text-yellow-300" },
      { class: "O", pct: 30, color: "bg-stone-700 text-stone-300" },
      { class: "P", pct: 5,  color: "bg-red-900 text-red-300" },
    ],
    cows: [
      { class: "R", pct: 10, color: "bg-yellow-900 text-yellow-300" },
      { class: "O", pct: 45, color: "bg-stone-700 text-stone-300" },
      { class: "P", pct: 45, color: "bg-red-900 text-red-300" },
    ],
    class_s: [{ class: "S", pct: 100, color: "bg-purple-900 text-purple-300" }],
    class_e: [{ class: "E", pct: 100, color: "bg-blue-900 text-blue-300" }],
    class_r: [{ class: "R", pct: 100, color: "bg-yellow-900 text-yellow-300" }],
    light: [
      { class: "E", pct: 40, color: "bg-blue-900 text-blue-300" },
      { class: "U", pct: 40, color: "bg-green-900 text-green-300" },
      { class: "R", pct: 20, color: "bg-yellow-900 text-yellow-300" },
    ],
    heavy: [
      { class: "U", pct: 30, color: "bg-green-900 text-green-300" },
      { class: "R", pct: 50, color: "bg-yellow-900 text-yellow-300" },
      { class: "O", pct: 20, color: "bg-stone-700 text-stone-300" },
    ],
    broiler: [
      { class: "A", pct: 80, color: "bg-green-900 text-green-300" },
      { class: "B", pct: 20, color: "bg-yellow-900 text-yellow-300" },
    ],
    hen: [
      { class: "B", pct: 60, color: "bg-yellow-900 text-yellow-300" },
      { class: "C", pct: 40, color: "bg-stone-700 text-stone-300" },
    ],
  };
  return map[category] || [{ class: "R", pct: 100, color: "bg-yellow-900 text-yellow-300" }];
}

export default function PurchasePage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-stone-500">Indlæser...</p>
      </div>
    }>
      <PurchaseContent />
    </Suspense>
  );
}
