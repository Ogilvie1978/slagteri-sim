"use client";
import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatDKK } from "@/lib/utils";

const DAY_DURATION_MS = 60 * 60 * 1000;
const DECISION_TIME_MS = 45 * 60 * 1000; // 45 min = vis overblik

const SEUROP_COLORS: Record<string, string> = {
  S: "bg-purple-900 text-purple-300",
  E: "bg-blue-900 text-blue-300",
  U: "bg-green-900 text-green-300",
  R: "bg-yellow-900 text-yellow-300",
  O: "bg-stone-700 text-stone-300",
  P: "bg-red-900 text-red-300",
};

// Konsekvens ved forkert destination
const DESTINATION_RULES: Record<string, {
  label: string;
  emoji: string;
  expectedClasses: string[];
  reputationPenalty: number;
  priceBonus: number;
}> = {
  export:      { label: "Eksport",        emoji: "✈️",  expectedClasses: ["S","E"],     reputationPenalty: -10, priceBonus: 35 },
  premium:     { label: "Premium/restaurant", emoji: "🍽️", expectedClasses: ["E","U"],  reputationPenalty: -5,  priceBonus: 25 },
  supermarket: { label: "Supermarked",    emoji: "🛒",  expectedClasses: ["U","R"],     reputationPenalty: -3,  priceBonus: 15 },
  industrial:  { label: "Industri",       emoji: "🏭",  expectedClasses: ["O","P"],     reputationPenalty: 0,   priceBonus: 5  },
  guaranteed:  { label: "NordSlagt A/S",  emoji: "🏗️",  expectedClasses: ["S","E","U","R","O","P"], reputationPenalty: 0, priceBonus: 0 },
  butchery:    { label: "Udbening",       emoji: "🔪",  expectedClasses: ["S","E","U","R"], reputationPenalty: 0, priceBonus: 0 },
};

type ColdItem = {
  id: string;
  seurop_class: string;
  carcass_weight_kg: number;
  animal_category: string;
  destination: string;
};

type Props = {
  companyId: string;
  currentDay: string;
  weekDayNumber: number;
  dayStartedAt: string;
  stableAnimals: { id: string; animal_category: string; quantity: number; actual_weight_kg: number; ready_for_slaughter: boolean; stress_level: number }[];
  baseAnimalPrice: number;
  onUpdate: () => void;
};

function getSEUROPForAnimal(category: string, stressLevel: number): { class: string; pct: number }[] {
  const base: Record<string, { class: string; pct: number }[]> = {
    young_bulls: [{ class:"S",pct:5},{class:"E",pct:30},{class:"U",pct:40},{class:"R",pct:20},{class:"O",pct:5}],
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
  const def = base[category] || [{class:"R",pct:100}];
  if (stressLevel > 60) {
    return def.map(d => ({...d, pct: d.pct}));
  }
  return def;
}

export default function SlaughterProgress({
  companyId, currentDay, weekDayNumber, dayStartedAt,
  stableAnimals, baseAnimalPrice, onUpdate
}: Props) {
  const [elapsed, setElapsed] = useState(0);
  const [showDecision, setShowDecision] = useState(false);
  const [todayCold, setTodayCold] = useState<ColdItem[]>([]);
  const [destinations, setDestinations] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [slaughtered, setSlaughtered] = useState(false);
  const supabase = createClient();

  const isSlaughterDay = weekDayNumber >= 1 && weekDayNumber <= 6;
  const readyAnimals = stableAnimals.filter(a => a.ready_for_slaughter);

  const calcElapsed = useCallback(() => {
    const started = new Date(dayStartedAt).getTime();
    return Math.min(DAY_DURATION_MS, Date.now() - started);
  }, [dayStartedAt]);

  // Simuler slagtning progressivt
  const getSlaughteredSoFar = (elapsedMs: number) => {
    const progress = Math.min(1, elapsedMs / DECISION_TIME_MS);
    return readyAnimals.map(a => ({
      ...a,
      slaughteredQty: Math.floor(a.quantity * progress),
    }));
  };

  useEffect(() => {
    if (!isSlaughterDay || readyAnimals.length === 0) return;

    const interval = setInterval(() => {
      const e = calcElapsed();
      setElapsed(e);

      if (e >= DECISION_TIME_MS && !showDecision && !slaughtered) {
        setShowDecision(true);
        loadTodayCold();
      }
    }, 5000); // Opdater hvert 5. sekund

    setElapsed(calcElapsed());
    return () => clearInterval(interval);
  }, [dayStartedAt, slaughtered]);

  async function loadTodayCold() {
    const { data } = await supabase
      .from("cold_storage")
      .select("id, seurop_class, carcass_weight_kg, animal_category, destination")
      .eq("company_id", companyId)
      .eq("slaughtered_day", currentDay)
      .eq("destination", "pending");

    const items = data || [];
    setTodayCold(items);

    // Sæt default destinations
    const dests: Record<string, string> = {};
    items.forEach(i => { dests[i.id] = "guaranteed"; });
    setDestinations(dests);
  }

  async function doSlaughter() {
    if (slaughtered || readyAnimals.length === 0) return;
    setSaving(true);

    for (const animal of readyAnimals) {
      const seurop = getSEUROPForAnimal(animal.animal_category, animal.stress_level);
      const carcassWeight = animal.actual_weight_kg * 0.55;

      const coldItems = seurop
        .map(cls => ({
          company_id: companyId,
          animal_category: animal.animal_category,
          seurop_class: cls.class,
          carcass_weight_kg: Math.round(carcassWeight * cls.pct / 100 * 10) / 10,
          slaughtered_week: 1,
          slaughtered_day: currentDay,
          status: "ready",
          maturation_days: 0,
          maturation_bonus_pct: 0,
          max_maturation_days: 21,
          destination: "pending",
        }))
        .filter(i => i.carcass_weight_kg > 0);

      await supabase.from("cold_storage").insert(coldItems);
      await supabase.from("stable_animals")
        .update({ status: "slaughtered" })
        .eq("id", animal.id);
    }

    setSlaughtered(true);
    setSaving(false);
    loadTodayCold();
    onUpdate();
  }

  async function saveDestinations() {
    setSaving(true);
    for (const [id, dest] of Object.entries(destinations)) {
      await supabase.from("cold_storage")
        .update({ destination: dest, status: dest === "butchery" ? "butchering_queue" : "ready" })
        .eq("id", id);
    }
    setShowDecision(false);
    setSaving(false);
    onUpdate();
  }

  if (!isSlaughterDay || readyAnimals.length === 0) return null;

  const progress = Math.min(100, Math.round(elapsed / DECISION_TIME_MS * 100));
  const slaughteredSoFar = getSlaughteredSoFar(elapsed);
  const totalSlaughtered = slaughteredSoFar.reduce((s, a) => s + a.slaughteredQty, 0);
  const totalAnimals = readyAnimals.reduce((s, a) => s + a.quantity, 0);
  const isDecisionTime = elapsed >= DECISION_TIME_MS;

  // Aggreger SEUROP klasser
  const seuropTotals: Record<string, number> = {};
  readyAnimals.forEach(a => {
    const seurop = getSEUROPForAnimal(a.animal_category, a.stress_level);
    const kg = a.actual_weight_kg * 0.55 * a.quantity;
    seurop.forEach(cls => {
      seuropTotals[cls.class] = (seuropTotals[cls.class] || 0) + Math.round(kg * cls.pct / 100);
    });
  });

  return (
    <>
      {/* Live slagte-progress */}
      <div className={`card ${isDecisionTime ? "border-amber-700" : "border-stone-800"}`}>
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-sm font-medium text-stone-100">
              {isDecisionTime ? "⏰ Slagtning færdig – tag beslutning" : "⚙️ Slagtning i gang"}
            </p>
            <p className="text-xs text-stone-500 mt-0.5">
              {isDecisionTime
                ? `${totalAnimals} dyr slagtet i dag`
                : `${totalSlaughtered} af ${totalAnimals} dyr slagtet`}
            </p>
          </div>
          {!slaughtered && isDecisionTime && (
            <button onClick={doSlaughter} disabled={saving}
              className="btn-primary py-2 text-sm">
              {saving ? "Slagter..." : "Registrér slagtning"}
            </button>
          )}
          {isDecisionTime && slaughtered && (
            <button onClick={() => setShowDecision(true)}
              className="btn-primary py-2 text-sm">
              Bestem destinationer →
            </button>
          )}
        </div>

        <div className="w-full bg-stone-800 rounded-full h-2 mb-3">
          <div className={`h-2 rounded-full transition-all duration-5000 ${isDecisionTime ? "bg-amber-500" : "bg-green-500"}`}
            style={{ width: `${progress}%` }} />
        </div>

        {/* SEUROP fordeling */}
        <div className="flex gap-2 flex-wrap">
          {Object.entries(seuropTotals).map(([cls, kg]) => {
            const displayKg = isDecisionTime ? kg : Math.round(kg * progress / 100);
            return (
              <div key={cls} className="flex items-center gap-1.5">
                <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${SEUROP_COLORS[cls]}`}>{cls}</span>
                <span className="text-xs text-stone-400">{displayKg.toLocaleString("da-DK")} kg</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Beslutnings-modal */}
      {showDecision && todayCold.length > 0 && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 px-4 py-8 overflow-y-auto">
          <div className="bg-stone-900 border border-amber-700/50 rounded-2xl p-6 max-w-2xl w-full space-y-4">
            <div>
              <h2 className="text-lg font-bold text-amber-400">Dagens slagtning – vælg destinationer</h2>
              <p className="text-stone-400 text-sm mt-1">
                Beslut hvad hver SEUROP-klasse skal bruges til. Forkerte valg påvirker omdømme og troværdighed.
              </p>
            </div>

            {/* Gruppér efter SEUROP klasse */}
            {Object.entries(
              todayCold.reduce((acc, item) => {
                if (!acc[item.seurop_class]) acc[item.seurop_class] = [];
                acc[item.seurop_class].push(item);
                return acc;
              }, {} as Record<string, ColdItem[]>)
            ).sort(([a], [b]) => "SEUROPE OP".indexOf(a) - "SEUROPE OP".indexOf(b))
             .map(([cls, items]) => {
              const totalKg = items.reduce((s, i) => s + i.carcass_weight_kg, 0);
              const currentDest = destinations[items[0].id] || "guaranteed";
              const destRule = DESTINATION_RULES[currentDest];
              const isWrongClass = !destRule?.expectedClasses.includes(cls);

              return (
                <div key={cls} className={`bg-stone-800 rounded-xl p-4 ${isWrongClass ? "border border-red-800" : ""}`}>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span className={`text-sm font-bold px-2 py-0.5 rounded ${SEUROP_COLORS[cls]}`}>{cls}</span>
                      <span className="text-stone-300 text-sm">{totalKg.toFixed(0)} kg slagtevægt</span>
                      <span className="text-stone-500 text-xs">{items.length} kroppe</span>
                    </div>
                    {isWrongClass && currentDest !== "guaranteed" && (
                      <span className="text-xs text-red-400">
                        ⚠️ Omdømme {destRule.reputationPenalty}
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    {Object.entries(DESTINATION_RULES).map(([key, rule]) => {
                      const isSelected = items.every(i => (destinations[i.id] || "guaranteed") === key);
                      const isWrong = !rule.expectedClasses.includes(cls) && key !== "guaranteed";
                      return (
                        <button
                          key={key}
                          onClick={() => {
                            const newDests = { ...destinations };
                            items.forEach(i => { newDests[i.id] = key; });
                            setDestinations(newDests);
                          }}
                          className={`p-2 rounded-lg border text-xs font-medium transition-all text-left ${
                            isSelected
                              ? isWrong
                                ? "bg-red-900/50 border-red-600 text-red-300"
                                : "bg-brand-500/30 border-brand-400 text-white"
                              : "bg-stone-700 border-stone-600 text-stone-300 hover:bg-stone-600"
                          }`}
                        >
                          <div>{rule.emoji} {rule.label}</div>
                          {rule.priceBonus > 0 && (
                            <div className={`mt-0.5 ${isWrong ? "text-red-400" : "text-green-400"}`}>
                              +{rule.priceBonus}%
                            </div>
                          )}
                          {isWrong && <div className="text-red-400 mt-0.5">Omdømme {rule.reputationPenalty}</div>}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}

            <div className="flex gap-3 pt-2">
              <button onClick={() => setShowDecision(false)}
                className="btn-secondary flex-1">
                Gem til senere
              </button>
              <button onClick={saveDestinations} disabled={saving}
                className="btn-primary flex-1">
                {saving ? "Gemmer..." : "Bekræft destinationer →"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
