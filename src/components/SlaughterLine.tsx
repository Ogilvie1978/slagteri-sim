"use client";
import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Company } from "@/lib/types";

type QueueAnimal = {
  id: string;
  animal_category: string;
  actual_weight_kg: number;
  stress_level: number;
};

type SlaughteredResult = {
  category: string;
  seurop: string;
  kg: number;
};

type Props = {
  readyAnimals: {
    id: string;
    animal_category: string;
    quantity: number;
    actual_weight_kg: number;
    stress_level: number;
    ready_for_slaughter: boolean;
    status: string;
    arrived_week: number;
    arrived_day: string;
    arrived_at: string;
    health_status: string;
    vet_checked: boolean;
  }[];
  company: Company;
  slaughterers: number;
  onDone: () => void;
};

const ANIMAL_LABELS: Record<string, string> = {
  young_bulls: "Ungtyre", heifers: "Kvier", steers: "Stude", cows: "Køer",
  class_s: "S-svin", class_e: "E-svin", class_r: "R-svin",
  light: "Let lam", heavy: "Tungt lam", broiler: "Slagtekylling", hen: "Høne",
};

const SEUROP_COLORS: Record<string, string> = {
  S: "bg-purple-900 text-purple-300",
  E: "bg-blue-900 text-blue-300",
  U: "bg-green-900 text-green-300",
  R: "bg-yellow-900 text-yellow-300",
  O: "bg-stone-700 text-stone-300",
  P: "bg-red-900 text-red-300",
};

// Minutter per dyr baseret på antal slagtere og vægt
function minutesPerAnimal(slaughterers: number, weightKg: number): number {
  const s = Math.min(60, Math.max(5, slaughterers));
  const base = 8 - ((s - 5) / 55) * 7;
  const wf = weightKg > 600 ? 1.3 : weightKg > 400 ? 1.1 : weightKg < 60 ? 0.5 : weightKg < 120 ? 0.7 : 1.0;
  return Math.max(0.3, base * wf);
}

function getSEUROPClass(category: string, stressLevel: number): string {
  const dist: Record<string, {class:string;pct:number}[]> = {
    young_bulls: [{class:"S",pct:5},{class:"E",pct:30},{class:"U",pct:40},{class:"R",pct:20},{class:"O",pct:5}],
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
  const d = dist[category] || [{class:"R",pct:100}];
  const shift = stressLevel > 60 ? 1 : 0;
  const rand = Math.random() * 100;
  let cum = 0;
  for (let i = 0; i < d.length; i++) {
    cum += d[i].pct;
    if (rand <= cum) return d[Math.min(i + shift, d.length - 1)].class;
  }
  return d[d.length - 1].class;
}

// Beregn hvad der er slagtet baseret på starttidspunkt og kø
function calcSlaughtered(
  queue: QueueAnimal[],
  startedAt: string,
  slaughterers: number
): { done: QueueAnimal[]; current: QueueAnimal | null; remaining: QueueAnimal[]; currentProgress: number } {
  const elapsedMin = (Date.now() - new Date(startedAt).getTime()) / 60000;
  let timeUsed = 0;
  let done: QueueAnimal[] = [];
  let current: QueueAnimal | null = null;
  let currentProgress = 0;

  for (let i = 0; i < queue.length; i++) {
    const animal = queue[i];
    const needed = minutesPerAnimal(slaughterers, animal.actual_weight_kg);
    if (timeUsed + needed <= elapsedMin) {
      done.push(animal);
      timeUsed += needed;
    } else {
      current = animal;
      currentProgress = Math.min(100, ((elapsedMin - timeUsed) / needed) * 100);
      const remaining = queue.slice(i + 1);
      return { done, current, remaining, currentProgress };
    }
  }
  return { done, current: null, remaining: [], currentProgress: 100 };
}

export default function SlaughterLine({ readyAnimals, company, slaughterers, onDone }: Props) {
  const [localQueue, setLocalQueue] = useState<QueueAnimal[]>([]);
  const [startedAt, setStartedAt] = useState<string | null>(null);
  const [currentAnimal, setCurrentAnimal] = useState<QueueAnimal | null>(null);
  const [currentProgress, setCurrentProgress] = useState(0);
  const [slaughteredResults, setSlaughteredResults] = useState<SlaughteredResult[]>([]);
  const [processedIds, setProcessedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const supabase = createClient();

  // Hent eksisterende kø fra database ved load
  useEffect(() => {
    const q = (company as any).slaughter_queue as QueueAnimal[] | null;
    const s = (company as any).slaughter_started_at as string | null;
    if (q && q.length > 0 && s) {
      setLocalQueue(q);
      setStartedAt(s);
    }
  }, [company.id]);

  // Opdater progress hvert sekund
  useEffect(() => {
    if (!startedAt || localQueue.length === 0) return;

    const interval = setInterval(async () => {
      const { done, current, currentProgress: cp } = calcSlaughtered(localQueue, startedAt, slaughterers);
      setCurrentAnimal(current);
      setCurrentProgress(cp);

      // Gem slagtede dyr der ikke er behandlet endnu
      const newlyDone = done.filter(a => !processedIds.includes(a.id));
      if (newlyDone.length > 0) {
        for (const animal of newlyDone) {
          const seurop = getSEUROPClass(animal.animal_category, animal.stress_level);
          const carcassKg = Math.round(animal.actual_weight_kg * 0.55 * 10) / 10;

          await supabase.from("cold_storage").insert({
            company_id: company.id,
            animal_category: animal.animal_category,
            seurop_class: seurop,
            carcass_weight_kg: carcassKg,
            slaughtered_week: company.current_week,
            slaughtered_day: company.current_day || "Mandag",
            status: "cooling",
            maturation_days: 0,
            maturation_bonus_pct: 0,
            max_maturation_days: 21,
            destination: "pending",
          });

          await supabase.from("stable_animals")
            .update({ status: "slaughtered" })
            .eq("id", animal.id);

          setProcessedIds(prev => [...prev, animal.id]);
          setSlaughteredResults(prev => [...prev, { category: animal.animal_category, seurop, kg: carcassKg }]);
        }
      }

      // Færdig
      if (!current && done.length > 0 && done.length >= localQueue.length) {
        clearInterval(interval);
        await supabase.from("companies").update({
          slaughter_queue: [],
          slaughter_started_at: null,
        }).eq("id", company.id);
        onDone();
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [startedAt, localQueue, slaughterers, processedIds]);

  async function startSlaughter() {
    if (readyAnimals.length === 0) return;
    setLoading(true);

    const queue: QueueAnimal[] = readyAnimals.map(a => ({
      id: a.id,
      animal_category: a.animal_category,
      actual_weight_kg: a.actual_weight_kg,
      stress_level: a.stress_level,
    }));

    const now = new Date().toISOString();

    await supabase.from("companies").update({
      slaughter_queue: queue,
      slaughter_started_at: now,
    }).eq("id", company.id);

    setLocalQueue(queue);
    setStartedAt(now);
    setLoading(false);
  }

  const isRunning = startedAt !== null && localQueue.length > 0;
  const totalMins = readyAnimals.reduce((s, a) => s + minutesPerAnimal(slaughterers, a.actual_weight_kg), 0);

  // Aggreger resultater
  const seuropSummary = slaughteredResults.reduce((acc, s) => {
    acc[s.seurop] = (acc[s.seurop] || 0) + s.kg;
    return acc;
  }, {} as Record<string, number>);

  // Gruppér klar-dyr per kategori
  const grouped = readyAnimals.reduce((acc, a) => {
    if (!acc[a.animal_category]) acc[a.animal_category] = { count: 0, totalKg: 0 };
    acc[a.animal_category].count += a.quantity;
    acc[a.animal_category].totalKg += a.actual_weight_kg;
    return acc;
  }, {} as Record<string, { count: number; totalKg: number }>);

  return (
    <div className="space-y-4">

      {/* Kapacitet */}
      <div className="card bg-stone-900/50">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-stone-300">Slagtelinje</p>
            <p className="text-xs text-stone-500 mt-0.5">
              {slaughterers} slagtere · ~{minutesPerAnimal(slaughterers, 600).toFixed(1)} min/tung dyr · kører mens du navigerer
            </p>
          </div>
          {slaughteredResults.length > 0 && (
            <div className="text-right">
              <p className="text-xs text-stone-500">Slagtet</p>
              <p className="text-sm font-bold text-green-400">{slaughteredResults.length} dyr</p>
            </div>
          )}
        </div>
      </div>

      {/* Ikke startet */}
      {!isRunning && readyAnimals.length > 0 && (
        <div className="card space-y-3">
          {Object.entries(grouped).map(([cat, data]) => (
            <div key={cat} className="flex items-center justify-between">
              <div>
                <span className="text-stone-100 text-sm font-medium">{ANIMAL_LABELS[cat]}</span>
                <span className="text-stone-500 text-xs ml-2">{data.count} styk</span>
              </div>
              <span className="text-stone-500 text-xs">
                ~{readyAnimals.filter(a => a.animal_category === cat)
                    .reduce((s, a) => s + minutesPerAnimal(slaughterers, a.actual_weight_kg), 0)
                    .toFixed(0)} min
              </span>
            </div>
          ))}
          <div className="border-t border-stone-700 pt-3">
            <p className="text-xs text-stone-500 mb-3">
              {readyAnimals.length} dyr · estimeret ~{totalMins.toFixed(0)} min total
            </p>
            <button onClick={startSlaughter} disabled={loading} className="btn-primary w-full py-2.5">
              {loading ? "Starter..." : `⚙️ Start slagtelinje – ${readyAnimals.length} dyr`}
            </button>
          </div>
        </div>
      )}

      {/* Kører */}
      {isRunning && currentAnimal && (
        <div className="card border-green-800/50">
          <div className="flex items-center justify-between mb-2">
            <div>
              <p className="text-sm font-medium text-stone-100">
                ⚙️ Slagter: {ANIMAL_LABELS[currentAnimal.animal_category]}
              </p>
              <p className="text-xs text-stone-500 mt-0.5">
                {currentAnimal.actual_weight_kg} kg · ~{(currentAnimal.actual_weight_kg * 0.55).toFixed(0)} kg slagtevægt
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs text-stone-500">I kø</p>
              <p className="text-sm font-bold text-stone-300">
                {localQueue.filter(a => !processedIds.includes(a.id) && a.id !== currentAnimal!.id).length} dyr
              </p>
            </div>
          </div>
          <div className="w-full bg-stone-800 rounded-full h-3">
            <div className="h-3 rounded-full bg-green-500 transition-all duration-2000"
              style={{ width: `${currentProgress}%` }} />
          </div>
          <p className="text-xs text-stone-600 mt-1 text-right">{Math.round(currentProgress)}%</p>
        </div>
      )}

      {isRunning && !currentAnimal && localQueue.length > 0 && (
        <div className="card text-center py-6">
          <p className="text-green-400 font-medium">✓ Slagtning færdig!</p>
          <p className="text-stone-500 text-sm mt-1">Alle dyr er slagtet</p>
        </div>
      )}

      {/* Resultater */}
      {slaughteredResults.length > 0 && (
        <div className="card">
          <p className="text-xs font-medium text-stone-500 uppercase tracking-wide mb-3">
            Slagtet – {slaughteredResults.length} dyr · {Math.round(slaughteredResults.reduce((s, r) => s + r.kg, 0))} kg slagtevægt
          </p>
          <div className="flex gap-2 flex-wrap">
            {Object.entries(seuropSummary).map(([cls, kg]) => (
              <div key={cls} className="flex items-center gap-1.5">
                <span className={`text-xs font-bold px-2 py-0.5 rounded ${SEUROP_COLORS[cls] || "bg-stone-700 text-stone-300"}`}>{cls}</span>
                <span className="text-xs text-stone-400">{Math.round(kg)} kg</span>
              </div>
            ))}
          </div>
          <p className="text-xs text-stone-600 mt-2">Kroppe afkøler – klar til behandling i morgen</p>
        </div>
      )}

      {!isRunning && readyAnimals.length === 0 && slaughteredResults.length === 0 && (
        <div className="card border-dashed border-stone-700 text-center py-12">
          <p className="text-stone-500">Ingen dyr klar til slagtning</p>
          <p className="text-stone-600 text-sm mt-1">Dyr hviler i stalden til næste dag</p>
        </div>
      )}
    </div>
  );
}
