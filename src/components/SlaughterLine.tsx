"use client";
import { useEffect, useState, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Company } from "@/lib/types";

type Animal = {
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
};

type Props = {
  readyAnimals: Animal[];
  company: Company;
  onSlaughter: (animal: Animal, basePrice: number) => Promise<void>;
  processing: boolean;
};

const ANIMAL_LABELS: Record<string, string> = {
  young_bulls: "Ungtype", heifers: "Kvie", steers: "Stud", cows: "Ko",
  class_s: "S-svin", class_e: "E-svin", class_r: "R-svin",
  light: "Lam (let)", heavy: "Lam (tungt)", broiler: "Kylling", hen: "Høne",
};

// Vægtfaktor – tunge dyr tager længere tid
function weightFactor(kg: number): number {
  if (kg > 600) return 1.3;
  if (kg > 400) return 1.1;
  if (kg < 60)  return 0.5;
  if (kg < 120) return 0.7;
  return 1.0;
}

// Minutter per dyr baseret på antal slagtere
function minutesPerAnimal(slaughterers: number, weightKg: number): number {
  const base = 8 - ((Math.min(60, Math.max(5, slaughterers)) - 5) / 55) * 7;
  return Math.max(0.5, base * weightFactor(weightKg));
}

function getSEUROPClass(category: string, stressLevel: number): string {
  const distributions: Record<string, { class: string; pct: number }[]> = {
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
  const dist = distributions[category] || [{class:"R",pct:100}];
  // Stress skubber klassen ned
  const stressShift = stressLevel > 60 ? 1 : 0;
  const rand = Math.random() * 100;
  let cum = 0;
  for (let i = 0; i < dist.length; i++) {
    cum += dist[i].pct;
    if (rand <= cum) {
      return dist[Math.min(i + stressShift, dist.length - 1)].class;
    }
  }
  return dist[dist.length - 1].class;
}

const SEUROP_COLORS: Record<string, string> = {
  S: "bg-purple-900 text-purple-300",
  E: "bg-blue-900 text-blue-300",
  U: "bg-green-900 text-green-300",
  R: "bg-yellow-900 text-yellow-300",
  O: "bg-stone-700 text-stone-300",
  P: "bg-red-900 text-red-300",
};

export default function SlaughterLine({ readyAnimals, company, onSlaughter, processing }: Props) {
  const [queue, setQueue] = useState<Animal[]>([]);
  const [currentAnimal, setCurrentAnimal] = useState<Animal | null>(null);
  const [progress, setProgress] = useState(0);
  const [slaughteredToday, setSlaughteredToday] = useState<{ category: string; seurop: string; kg: number }[]>([]);
  const [running, setRunning] = useState(false);
  const [slaughterers, setSlaughterers] = useState(5);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const progressRef = useRef(0);
  const supabase = createClient();

  // Hent antal slagtere fra employees
  useEffect(() => {
    async function loadSlaughterers() {
      const { data } = await supabase
        .from("employees")
        .select("id")
        .eq("company_id", company.id)
        .eq("department", "slagteri")
        .eq("active", true);
      setSlaughterers(Math.max(5, (data || []).length));
    }
    loadSlaughterers();
  }, [company.id]);

  function addAllToQueue() {
    setQueue([...readyAnimals]);
  }

  function startLine() {
    if (queue.length === 0) return;
    setRunning(true);
    processNext(queue, 0);
  }

  function processNext(q: Animal[], progressStart: number) {
    if (q.length === 0) {
      setRunning(false);
      setCurrentAnimal(null);
      return;
    }
    const animal = q[0];
    setCurrentAnimal(animal);
    progressRef.current = 0;
    setProgress(0);

    const totalMs = minutesPerAnimal(slaughterers, animal.actual_weight_kg) * 60 * 1000;
    const tickMs = 500;
    const increment = (tickMs / totalMs) * 100;

    if (intervalRef.current) clearInterval(intervalRef.current);

    intervalRef.current = setInterval(async () => {
      progressRef.current += increment;
      setProgress(Math.min(100, progressRef.current));

      if (progressRef.current >= 100) {
        clearInterval(intervalRef.current!);

        // Slagt dyret
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

        setSlaughteredToday(prev => [...prev, { category: animal.animal_category, seurop, kg: carcassKg }]);

        const remaining = q.slice(1);
        setQueue(remaining);
        processNext(remaining, 0);
      }
    }, tickMs);
  }

  useEffect(() => {
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, []);

  const minsPerAnimal = currentAnimal
    ? minutesPerAnimal(slaughterers, currentAnimal.actual_weight_kg)
    : 0;

  // Aggreger slagtede
  const seuropSummary = slaughteredToday.reduce((acc, s) => {
    acc[s.seurop] = (acc[s.seurop] || 0) + s.kg;
    return acc;
  }, {} as Record<string, number>);

  const totalKgToday = slaughteredToday.reduce((s, a) => s + a.kg, 0);

  return (
    <div className="space-y-4">

      {/* Kapacitetsinfo */}
      <div className="card bg-stone-900/50">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-stone-300">Slagtelinje</p>
            <p className="text-xs text-stone-500 mt-0.5">
              {slaughterers} slagtere · {minutesPerAnimal(slaughterers, 600).toFixed(1)} min/tung dyr · {minutesPerAnimal(slaughterers, 80).toFixed(1)} min/lille dyr
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-stone-500">Slagtet i dag</p>
            <p className="text-sm font-bold text-green-400">{slaughteredToday.length} dyr · {Math.round(totalKgToday)} kg</p>
          </div>
        </div>
      </div>

      {/* Kø-setup */}
      {!running && queue.length === 0 && readyAnimals.length > 0 && (
        <div className="card">
          <p className="text-sm text-stone-300 mb-3">
            {readyAnimals.length} dyr klar til slagtning
          </p>
          <div className="space-y-2 mb-4">
            {readyAnimals.slice(0, 5).map(a => (
              <div key={a.id} className="flex items-center justify-between text-sm">
                <span className="text-stone-300">{ANIMAL_LABELS[a.animal_category]}</span>
                <span className="text-stone-500">{a.actual_weight_kg} kg · ~{minutesPerAnimal(slaughterers, a.actual_weight_kg).toFixed(1)} min</span>
              </div>
            ))}
            {readyAnimals.length > 5 && (
              <p className="text-xs text-stone-600">+ {readyAnimals.length - 5} flere dyr</p>
            )}
          </div>
          <p className="text-xs text-stone-500 mb-3">
            Estimeret total: ~{readyAnimals.reduce((s, a) => s + minutesPerAnimal(slaughterers, a.actual_weight_kg), 0).toFixed(0)} minutter
          </p>
          <button onClick={() => { addAllToQueue(); }} className="btn-primary w-full py-2.5">
            ⚙️ Start slagtelinje ({readyAnimals.length} dyr)
          </button>
        </div>
      )}

      {/* Kø klar – start */}
      {!running && queue.length > 0 && (
        <div className="card">
          <p className="text-sm text-stone-300 mb-3">{queue.length} dyr i kø</p>
          <button onClick={startLine} className="btn-primary w-full py-2.5">
            ▶ Start slagtning
          </button>
        </div>
      )}

      {/* Live progress */}
      {running && currentAnimal && (
        <div className="card border-green-800/50">
          <div className="flex items-center justify-between mb-2">
            <div>
              <p className="text-sm font-medium text-stone-100">
                ⚙️ Slagter: {ANIMAL_LABELS[currentAnimal.animal_category]}
              </p>
              <p className="text-xs text-stone-500 mt-0.5">
                {currentAnimal.actual_weight_kg} kg levende · ~{(currentAnimal.actual_weight_kg * 0.55).toFixed(0)} kg slagtevægt
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs text-stone-500">Tilbage i kø</p>
              <p className="text-sm font-bold text-stone-300">{queue.length} dyr</p>
            </div>
          </div>
          <div className="w-full bg-stone-800 rounded-full h-3 mb-1">
            <div
              className="h-3 rounded-full bg-green-500 transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-xs text-stone-600 text-right">{Math.round(progress)}%</p>
        </div>
      )}

      {/* Dags resultat */}
      {slaughteredToday.length > 0 && (
        <div className="card">
          <p className="text-xs font-medium text-stone-500 uppercase tracking-wide mb-3">
            Slagtet i dag – {slaughteredToday.length} dyr
          </p>
          <div className="flex gap-2 flex-wrap">
            {Object.entries(seuropSummary).map(([cls, kg]) => (
              <div key={cls} className="flex items-center gap-1.5">
                <span className={`text-xs font-bold px-2 py-0.5 rounded ${SEUROP_COLORS[cls] || "bg-stone-700 text-stone-300"}`}>{cls}</span>
                <span className="text-xs text-stone-400">{Math.round(kg)} kg</span>
              </div>
            ))}
          </div>
          <p className="text-xs text-stone-600 mt-2">
            Kroppe afkøler – klar til behandling i morgen
          </p>
        </div>
      )}

      {readyAnimals.length === 0 && queue.length === 0 && !running && (
        <div className="card border-dashed border-stone-700 text-center py-12">
          <p className="text-stone-500">Ingen dyr klar til slagtning</p>
          <p className="text-stone-600 text-sm mt-1">Dyr hviler i stalden til næste dag</p>
        </div>
      )}
    </div>
  );
}
