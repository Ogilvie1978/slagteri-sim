"use client";
import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

const DAY_DURATION_MS = 60 * 60 * 1000; // 1 time = 1 spildag

const DAYS = ["Mandag", "Tirsdag", "Onsdag", "Torsdag", "Fredag", "Lørdag", "Søndag"];
const DAY_COLORS: Record<string, string> = {
  "Mandag":   "text-blue-400",
  "Tirsdag":  "text-blue-400",
  "Onsdag":   "text-blue-400",
  "Torsdag":  "text-blue-400",
  "Fredag":   "text-amber-400",
  "Lørdag":   "text-orange-400",
  "Søndag":   "text-stone-500",
};

type Props = {
  companyId: string;
  currentDay: string;
  weekDayNumber: number;
  dayStartedAt: string;
  saturdayApproved: boolean;
  currentWeek: number;
  onDayEnd: () => void;
};

export default function DayTimer({
  companyId,
  currentDay,
  weekDayNumber,
  dayStartedAt,
  saturdayApproved,
  currentWeek,
  onDayEnd,
}: Props) {
  const [timeLeft, setTimeLeft] = useState(0);
  const [showFridayModal, setShowFridayModal] = useState(false);
  const [showEndDayModal, setShowEndDayModal] = useState(false);
  const [advancingDay, setAdvancingDay] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  const calcTimeLeft = useCallback(() => {
    const started = new Date(dayStartedAt).getTime();
    const now = Date.now();
    const elapsed = now - started;
    return Math.max(0, DAY_DURATION_MS - elapsed);
  }, [dayStartedAt]);

  useEffect(() => {
    setTimeLeft(calcTimeLeft());
    const interval = setInterval(() => {
      const left = calcTimeLeft();
      setTimeLeft(left);
      if (left === 0) {
        clearInterval(interval);
        handleDayEnd();
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [dayStartedAt]);

  async function handleDayEnd() {
    if (weekDayNumber === 5) {
      // Fredag – vis popup om lørdag
      setShowFridayModal(true);
    } else if (weekDayNumber === 6 || (weekDayNumber === 5 && !saturdayApproved)) {
      // Lørdag eller fredag uden lørdag → afslut uge
      setShowEndDayModal(true);
    } else {
      await advanceToNextDay();
    }
  }

  async function advanceToNextDay() {
    setAdvancingDay(true);
    await fetch("/api/advance-day", { method: "POST" });
    setAdvancingDay(false);
    onDayEnd();
    router.refresh();
  }

  async function approveSaturday() {
    await supabase.from("companies").update({
      saturday_approved: true,
      current_day: "Lørdag",
      week_day_number: 6,
      day_started_at: new Date().toISOString(),
    }).eq("id", companyId);
    setShowFridayModal(false);
    onDayEnd();
    router.refresh();
  }

  async function skipSaturday() {
    // Spring lørdag over – gå til søndag/næste uge
    setShowFridayModal(false);
    setShowEndDayModal(true);
  }

  async function endWeek() {
    setAdvancingDay(true);
    await fetch("/api/advance-day", { method: "POST" });
    setShowEndDayModal(false);
    setAdvancingDay(false);
    onDayEnd();
    router.refresh();
  }

  const hours = Math.floor(timeLeft / (1000 * 60 * 60));
  const minutes = Math.floor((timeLeft % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((timeLeft % (1000 * 60)) / 1000);
  const pct = (timeLeft / DAY_DURATION_MS) * 100;
  const isUrgent = timeLeft < 10 * 60 * 1000; // under 10 min

  return (
    <>
      <div className="card bg-stone-900 border-stone-800 p-4">
        <div className="flex items-center justify-between mb-2">
          <div>
            <span className={`text-sm font-medium ${DAY_COLORS[currentDay] || "text-stone-400"}`}>
              {currentDay}
            </span>
            <span className="text-stone-600 text-xs ml-2">· Uge {currentWeek}</span>
          </div>
          <div className={`font-mono text-sm font-bold ${isUrgent ? "text-red-400" : "text-stone-300"}`}>
            {String(hours).padStart(2, "0")}:{String(minutes).padStart(2, "0")}:{String(seconds).padStart(2, "0")}
          </div>
        </div>

        {/* Progress bar */}
        <div className="w-full bg-stone-800 rounded-full h-1.5">
          <div
            className={`h-1.5 rounded-full transition-all duration-1000 ${isUrgent ? "bg-red-500" : currentDay === "Fredag" ? "bg-amber-500" : "bg-brand-500"}`}
            style={{ width: `${pct}%` }}
          />
        </div>

        {/* Dag-oversigt */}
        <div className="flex gap-1 mt-3">
          {["M", "T", "O", "T", "F", "L"].map((d, i) => (
            <div
              key={i}
              className={`flex-1 text-center text-xs py-1 rounded ${
                i + 1 < weekDayNumber ? "bg-stone-700 text-stone-500" :
                i + 1 === weekDayNumber ? "bg-brand-500 text-white font-bold" :
                i + 1 === 6 && !saturdayApproved ? "bg-stone-800 text-stone-600" :
                "bg-stone-800 text-stone-600"
              }`}
            >
              {d}
            </div>
          ))}
        </div>

        {isUrgent && (
          <p className="text-xs text-red-400 mt-2 text-center">
            Dagen slutter snart!
          </p>
        )}
      </div>

      {/* Fredag modal */}
      {showFridayModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 px-4">
          <div className="bg-stone-900 border border-amber-800/50 rounded-2xl p-6 max-w-md w-full space-y-4">
            <div className="flex items-center gap-2">
              <span className="text-2xl">🌙</span>
              <h2 className="text-lg font-bold text-amber-400">Fredag er slut</h2>
            </div>

            <p className="text-stone-300 text-sm leading-relaxed">
              Arbejdsugen er overstået. Du kan vælge at køre lørdag-overarbejde
              – men det koster +50% i lønomkostninger og sænker medarbejdernes moral.
            </p>

            <div className="bg-stone-800/50 rounded-lg p-3 space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-stone-500">Overarbejdstillæg</span>
                <span className="text-orange-400">+50% løn</span>
              </div>
              <div className="flex justify-between">
                <span className="text-stone-500">Moral-tab ansatte</span>
                <span className="text-orange-400">-5 point</span>
              </div>
              <div className="flex justify-between">
                <span className="text-stone-500">Ekstra kapacitet</span>
                <span className="text-green-400">+100% denne dag</span>
              </div>
            </div>

            <div className="space-y-2">
              <button
                className="btn-primary w-full"
                onClick={() => {
                  setShowFridayModal(false);
                  router.push("/purchase?weekend=1");
                }}
              >
                🐄 Køb dyr til lørdag og kør overarbejde
              </button>
              <button
                className="btn-secondary w-full"
                onClick={approveSaturday}
              >
                Kør lørdag med eksisterende dyr
              </button>
              <button
                className="w-full py-2.5 text-sm text-stone-500 hover:text-stone-300 transition-colors"
                onClick={skipSaturday}
              >
                Hold fri – afslut ugen
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Afslut uge modal */}
      {showEndDayModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 px-4">
          <div className="bg-stone-900 border border-stone-700 rounded-2xl p-6 max-w-md w-full space-y-4">
            <div className="flex items-center gap-2">
              <span className="text-2xl">📋</span>
              <h2 className="text-lg font-bold text-stone-100">Uge {currentWeek} er slut</h2>
            </div>

            <p className="text-stone-400 text-sm">
              Ugen afsluttes og resultaterne opgøres. Uge {currentWeek + 1} starter mandag.
            </p>

            <button
              className="btn-primary w-full"
              onClick={endWeek}
              disabled={advancingDay}
            >
              {advancingDay ? "Afslutter..." : "Afslut uge og start uge " + (currentWeek + 1)}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
