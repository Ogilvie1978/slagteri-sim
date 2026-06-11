"use client";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

const REGIONS = ["Jylland", "Sjælland", "Fyn", "Bornholm"];

export default function OnboardingPage() {
  const [companyName, setCompanyName] = useState("");
  const [region, setRegion] = useState("Jylland");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  async function handleCreate() {
    if (!companyName.trim()) { setError("Giv dit slagteri et navn"); return; }
    setLoading(true);
    setError("");

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.push("/login"); return; }

    const { error } = await supabase.from("companies").insert({
      player_id: user.id,
      name: companyName.trim(),
      region,
      cash: 1000000,
      equity: 1000000,
      credit_limit: 10000000,
      credit_used: 0,
      credit_rate: 0.08,
      reputation: 50,
      capacity_kg: 50000,
      compliance_score: 70,
      current_week: 1,
    });

    if (error) {
      setError("Kunne ikke oprette virksomhed. Prøv igen.");
      setLoading(false);
      return;
    }

    router.push("/dashboard");
    router.refresh();
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="text-5xl mb-4">🏭</div>
          <h1 className="text-3xl font-bold text-stone-100">Velkommen til branchen</h1>
          <p className="text-stone-400 mt-2 max-w-sm mx-auto">
            Du starter med <span className="text-green-400 font-semibold">1.000.000 kr.</span> i egenkapital
            og en kassekredit på <span className="text-blue-400 font-semibold">10.000.000 kr.</span>
          </p>
        </div>
        <div className="card space-y-6">
          {error && (
            <div className="bg-red-900/30 border border-red-800 text-red-400 text-sm px-4 py-3 rounded-lg">
              {error}
            </div>
          )}
          <div>
            <label className="label">Hvad hedder dit slagteri?</label>
            <input
              className="input text-lg"
              type="text"
              placeholder="fx. Jørgensens Slagteri A/S"
              value={companyName}
              onChange={e => setCompanyName(e.target.value)}
              maxLength={60}
            />
          </div>
          <div>
            <label className="label">Region</label>
            <div className="grid grid-cols-2 gap-2">
              {REGIONS.map(r => (
                <button
                  key={r}
                  onClick={() => setRegion(r)}
                  className={`py-3 rounded-lg border text-sm font-medium transition-colors ${
                    region === r
                      ? "bg-brand-500 border-brand-400 text-white"
                      : "bg-stone-800 border-stone-700 text-stone-300 hover:bg-stone-700"
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>
          <div className="bg-stone-800/50 rounded-lg p-4 text-sm text-stone-400 space-y-1">
            <div className="flex justify-between"><span>Startkapital</span><span className="text-green-400 font-medium">1.000.000 kr.</span></div>
            <div className="flex justify-between"><span>Kassekredit</span><span className="text-blue-400 font-medium">10.000.000 kr.</span></div>
            <div className="flex justify-between"><span>Rente på kassekredit</span><span className="text-stone-300">8% p.a.</span></div>
            <div className="flex justify-between"><span>Startkapacitet</span><span className="text-stone-300">50.000 kg/uge</span></div>
          </div>
          <button className="btn-primary w-full text-base py-3" onClick={handleCreate} disabled={loading}>
            {loading ? "Opretter slagteri..." : "Åbn dørene 🚪"}
          </button>
        </div>
      </div>
    </div>
  );
}
