"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter, useSearchParams } from "next/navigation";
import { formatDKK } from "@/lib/utils";
import type { Company } from "@/lib/types";
import { INDUSTRY_CONFIG } from "@/lib/types";
import { Suspense } from "react";

type AnimalPrice = {
  category: string;
  category_label: string;
  best_use: string;
  price_dkk_per_kg: number;
};

type CartItem = {
  category: string;
  category_label: string;
  quantity_kg: number;
  price_per_kg: number;
  is_weekend: boolean;
};

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
        .from("companies")
        .select("*")
        .eq("player_id", user.id)
        .single();
      if (!co) { router.push("/onboarding"); return; }
      setCompany(co);

      const { data: ap } = await supabase
        .from("animal_prices")
        .select("category, category_label, best_use, price_dkk_per_kg")
        .eq("week_number", co.current_week)
        .eq("industry", co.industry)
        .order("price_dkk_per_kg", { ascending: false });
      setPrices(ap || []);

      // Initialiser kurv med 0 for alle kategorier
      setCart((ap || []).map(p => ({
        category: p.category,
        category_label: p.category_label,
        quantity_kg: 0,
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
      item.category === category ? { ...item, quantity_kg: qty } : item
    ));
  }

  function addPreset(category: string, amount: number) {
    setCart(prev => prev.map(item =>
      item.category === category
        ? { ...item, quantity_kg: Math.max(0, item.quantity_kg + amount) }
        : item
    ));
  }

  const totalKg = cart.reduce((sum, i) => sum + i.quantity_kg, 0);
  const totalCost = cart.reduce((sum, i) => sum + i.quantity_kg * i.price_per_kg, 0);
  const hasItems = totalKg > 0;

  async function handlePurchase() {
    if (!company || !hasItems) return;
    setSaving(true);
    setError("");

    const items = cart.filter(i => i.quantity_kg > 0);

    const { error: err } = await supabase
      .from("raw_material_purchases")
      .insert(items.map(item => ({
        company_id: company.id,
        week_number: company.current_week,
        animal_category: item.category,
        quantity_kg: item.quantity_kg,
        price_per_kg: item.price_per_kg,
        total_cost: Math.round(item.quantity_kg * item.price_per_kg),
        supplier_name: isWeekend ? "Weekend-marked" : "Lokalt landbrug",
      })));

    if (err) {
      setError("Kunne ikke gennemføre købet. Prøv igen.");
      setSaving(false);
      return;
    }

    // Træk beløb fra cash
    const { error: cashErr } = await supabase
      .from("companies")
      .update({ cash: company.cash - Math.round(totalCost) })
      .eq("id", company.id);

    if (cashErr) {
      setError("Fejl ved opdatering af økonomi.");
      setSaving(false);
      return;
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
  const canAfford = totalCost <= company.cash;

  return (
    <div className="min-h-screen bg-stone-950">
      <header className="border-b border-stone-800 bg-stone-900/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => router.push("/dashboard")}
              className="text-stone-500 hover:text-stone-300 transition-colors text-sm">
              ← Tilbage
            </button>
            <div className="w-px h-5 bg-stone-700" />
            <span className="text-2xl">{ind.emoji}</span>
            <div>
              <h1 className="font-bold text-stone-100">
                {isWeekend ? "Weekend-marked" : "Indkøb af levende dyr"}
              </h1>
              <p className="text-xs text-stone-500">
                {isWeekend
                  ? "Til lørdag · +5% weekendtillæg"
                  : `Uge ${company.current_week} · Til mandag`}
              </p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs text-stone-500">Disponibel</p>
            <p className="font-bold text-green-400">{formatDKK(company.cash)}</p>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8 space-y-6">

        {isWeekend && (
          <div className="card border-l-4 border-l-amber-500 bg-amber-950/20">
            <p className="text-amber-400 text-sm font-medium">Weekend-marked</p>
            <p className="text-stone-400 text-sm mt-0.5">
              Priserne er 5% højere end normalt, men du får dyrene leveret til lørdag-slagtning.
            </p>
          </div>
        )}

        {error && (
          <div className="bg-red-900/30 border border-red-800 text-red-400 text-sm px-4 py-3 rounded-lg">
            {error}
          </div>
        )}

        {/* Dyre-kategorier */}
        <div className="space-y-3">
          {prices.map((price, i) => {
            const cartItem = cart[i];
            if (!cartItem) return null;
            const itemCost = cartItem.quantity_kg * cartItem.price_per_kg;

            return (
              <div key={price.category} className="card space-y-4">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-semibold text-stone-100">{price.category_label}</h3>
                    <p className="text-xs text-stone-500 mt-0.5">{price.best_use}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-brand-400">
                      {cartItem.price_per_kg.toFixed(2)} kr/kg
                    </p>
                    {isWeekend && (
                      <p className="text-xs text-stone-600 line-through">
                        {price.price_dkk_per_kg.toFixed(2)} kr/kg
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  {/* Hurtigknapper */}
                  <div className="flex gap-1">
                    {[1000, 5000, 10000].map(amt => (
                      <button
                        key={amt}
                        onClick={() => addPreset(price.category, amt)}
                        className="px-2 py-1 text-xs bg-stone-800 hover:bg-stone-700 text-stone-400 rounded border border-stone-700 transition-colors"
                      >
                        +{(amt/1000).toFixed(0)}t
                      </button>
                    ))}
                    {cartItem.quantity_kg > 0 && (
                      <button
                        onClick={() => updateQuantity(price.category, "0")}
                        className="px-2 py-1 text-xs bg-red-900/30 hover:bg-red-900/50 text-red-400 rounded border border-red-800 transition-colors"
                      >
                        Nulstil
                      </button>
                    )}
                  </div>

                  {/* Manuelt input */}
                  <div className="flex-1 flex items-center gap-2">
                    <input
                      type="number"
                      min="0"
                      step="500"
                      value={cartItem.quantity_kg || ""}
                      placeholder="0"
                      onChange={e => updateQuantity(price.category, e.target.value)}
                      className="input text-right w-36"
                    />
                    <span className="text-stone-500 text-sm">kg</span>
                  </div>

                  {/* Delsum */}
                  {itemCost > 0 && (
                    <div className="text-right min-w-[100px]">
                      <p className="font-medium text-stone-200">{formatDKK(itemCost)}</p>
                    </div>
                  )}
                </div>

                {/* Forventet SEUROP output */}
                {cartItem.quantity_kg > 0 && (
                  <div className="bg-stone-800/50 rounded-lg p-3">
                    <p className="text-xs text-stone-500 mb-2">Forventet SEUROP-klassificering</p>
                    <div className="flex gap-2 flex-wrap">
                      {getSEUROPExpectation(price.category).map(cls => (
                        <div key={cls.class} className="text-center">
                          <div className={`text-xs font-bold px-2 py-0.5 rounded ${cls.color}`}>
                            {cls.class}
                          </div>
                          <div className="text-xs text-stone-500 mt-0.5">
                            ~{Math.round(cartItem.quantity_kg * cls.pct / 100 * 0.75).toLocaleString("da-DK")} kg
                          </div>
                          <div className="text-xs text-stone-600">{cls.pct}%</div>
                        </div>
                      ))}
                    </div>
                    <p className="text-xs text-stone-600 mt-2">
                      Slagteudbyttet er ~75% af levende vægt. Klassificering varierer ±15%.
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Kurv-opsummering */}
        <div className="card bg-stone-900 border-stone-700 sticky bottom-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-stone-400 text-sm">Total indkøb</p>
              <p className="text-stone-500 text-xs">{totalKg.toLocaleString("da-DK")} kg levende vægt</p>
            </div>
            <div className="text-right">
              <p className={`text-2xl font-bold ${canAfford ? "text-stone-100" : "text-red-400"}`}>
                {formatDKK(totalCost)}
              </p>
              {!canAfford && (
                <p className="text-xs text-red-400">Ikke nok likvider</p>
              )}
              {canAfford && hasItems && (
                <p className="text-xs text-stone-500">
                  Tilbage: {formatDKK(company.cash - totalCost)}
                </p>
              )}
            </div>
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => router.push("/dashboard")}
              className="btn-secondary flex-1"
            >
              Spring over
            </button>
            <button
              onClick={handlePurchase}
              disabled={!hasItems || !canAfford || saving}
              className="btn-primary flex-1"
            >
              {saving ? "Køber..." : hasItems ? `Køb ${totalKg.toLocaleString("da-DK")} kg` : "Ingen valgt"}
            </button>
          </div>
        </div>

      </main>
    </div>
  );
}

// Forventet SEUROP-fordeling per kategori
function getSEUROPExpectation(category: string) {
  const expectations: Record<string, { class: string; pct: number; color: string }[]> = {
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
    // Svin
    class_s:  [{ class: "S", pct: 100, color: "bg-purple-900 text-purple-300" }],
    class_e:  [{ class: "E", pct: 100, color: "bg-blue-900 text-blue-300" }],
    class_r:  [{ class: "R", pct: 100, color: "bg-yellow-900 text-yellow-300" }],
    // Lam
    light:    [
      { class: "E", pct: 40, color: "bg-blue-900 text-blue-300" },
      { class: "U", pct: 40, color: "bg-green-900 text-green-300" },
      { class: "R", pct: 20, color: "bg-yellow-900 text-yellow-300" },
    ],
    heavy:    [
      { class: "U", pct: 30, color: "bg-green-900 text-green-300" },
      { class: "R", pct: 50, color: "bg-yellow-900 text-yellow-300" },
      { class: "O", pct: 20, color: "bg-stone-700 text-stone-300" },
    ],
    // Kylling
    broiler:  [{ class: "A", pct: 80, color: "bg-green-900 text-green-300" },
               { class: "B", pct: 20, color: "bg-yellow-900 text-yellow-300" }],
    hen:      [{ class: "B", pct: 60, color: "bg-yellow-900 text-yellow-300" },
               { class: "C", pct: 40, color: "bg-stone-700 text-stone-300" }],
  };
  return expectations[category] || [{ class: "R", pct: 100, color: "bg-yellow-900 text-yellow-300" }];
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
