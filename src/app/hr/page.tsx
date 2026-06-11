"use client";
import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { formatDKK } from "@/lib/utils";
import type { Company } from "@/lib/types";

type JobRole = {
  id: string;
  department: string;
  title: string;
  pay_type: string;
  hourly_rate: number | null;
  monthly_min: number | null;
  monthly_max: number | null;
  affects_capacity: boolean;
  affects_compliance: boolean;
  affects_purchase: boolean;
  affects_sales: boolean;
  description: string;
  required_minimum: number;
};

type Employee = {
  id: string;
  name: string;
  department: string;
  role_title: string;
  pay_type: string;
  hourly_rate: number | null;
  monthly_salary: number | null;
  morale: number;
  skill_level: number;
  experience_weeks: number;
  hired_week: number;
};

const DEPT_CONFIG: Record<string, { label: string; emoji: string; color: string }> = {
  direktion: { label: "Direktion",       emoji: "👔", color: "text-purple-400" },
  indkøb:    { label: "Indkøb",          emoji: "🛒", color: "text-blue-400" },
  salg:      { label: "Salg",            emoji: "📈", color: "text-green-400" },
  qa:        { label: "QA",             emoji: "🔬", color: "text-yellow-400" },
  teknisk:   { label: "Teknisk",         emoji: "⚙️", color: "text-orange-400" },
  slagteri:  { label: "Slagteri",        emoji: "🔪", color: "text-red-400" },
};

const DEPARTMENTS = Object.keys(DEPT_CONFIG);

const MALE_NAMES = ["Lars", "Peter", "Mads", "Søren", "Jens", "Thomas", "Henrik", "Michael", "Rasmus", "Anders", "Niels", "Bo", "Kasper", "Martin", "Jesper"];
const FEMALE_NAMES = ["Anne", "Kirsten", "Hanne", "Mette", "Louise", "Camilla", "Lene", "Maria", "Sofie", "Emma", "Ida", "Sara", "Julie", "Tina", "Pia"];
const LAST_NAMES = ["Jensen", "Nielsen", "Hansen", "Pedersen", "Andersen", "Christensen", "Larsen", "Sørensen", "Rasmussen", "Jørgensen", "Petersen", "Madsen", "Kristensen", "Olsen", "Thomsen"];

function randomName() {
  const allFirst = [...MALE_NAMES, ...FEMALE_NAMES];
  return `${allFirst[Math.floor(Math.random() * allFirst.length)]} ${LAST_NAMES[Math.floor(Math.random() * LAST_NAMES.length)]}`;
}

export default function HRPage() {
  const [company, setCompany] = useState<Company | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [jobRoles, setJobRoles] = useState<JobRole[]>([]);
  const [selectedDept, setSelectedDept] = useState("slagteri");
  const [hiring, setHiring] = useState<string | null>(null);
  const [hireForm, setHireForm] = useState<{ roleId: string; salary: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.push("/login"); return; }

    const { data: co } = await supabase.from("companies").select("*").eq("player_id", user.id).single();
    if (!co) { router.push("/onboarding"); return; }
    setCompany(co);

    const [empRes, roleRes] = await Promise.all([
      supabase.from("employees").select("*").eq("company_id", co.id).eq("active", true),
      supabase.from("job_roles").select("*").order("department").order("title"),
    ]);

    setEmployees(empRes.data || []);
    setJobRoles(roleRes.data || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, []);

  async function fireEmployee(id: string) {
    if (!confirm("Er du sikker på at du vil afskedige denne medarbejder?")) return;
    await supabase.from("employees").update({ active: false }).eq("id", id);
    load();
  }

  async function hireEmployee() {
    if (!company || !hireForm) return;
    setSaving(true);

    const role = jobRoles.find(r => r.id === hireForm.roleId);
    if (!role) { setSaving(false); return; }

    await supabase.from("employees").insert({
      company_id: company.id,
      name: randomName(),
      department: role.department,
      role_title: role.title,
      pay_type: role.pay_type,
      hourly_rate: role.pay_type === "hourly" ? role.hourly_rate : null,
      monthly_salary: role.pay_type === "monthly" ? hireForm.salary : null,
      skill_level: Math.floor(Math.random() * 30) + 50,
      morale: 80,
      experience_weeks: 0,
      active: true,
      hired_week: company.current_week,
      hired_day: company.current_day || "Mandag",
    });

    // Check om minimum-krav er opfyldt
    const { data: allEmp } = await supabase
      .from("employees").select("department, role_title").eq("company_id", company.id).eq("active", true);

    const slagterCount = (allEmp || []).filter(e => e.department === "slagteri").length;
    const teknikCount = (allEmp || []).filter(e => e.department === "teknisk").length;
    const qaCount = (allEmp || []).filter(e => e.department === "qa").length;

    const isOperational = slagterCount >= 5 && teknikCount >= 1 && qaCount >= 1;

    if (isOperational && !company.is_operational) {
      await supabase.from("companies").update({
        is_operational: true,
        setup_completed_day: company.current_day,
      }).eq("id", company.id);
    }

    setHiring(null);
    setHireForm(null);
    setSaving(false);
    load();
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <p className="text-stone-500">Indlæser...</p>
    </div>
  );

  if (!company) return null;

  const deptEmployees = employees.filter(e => e.department === selectedDept);
  const deptRoles = jobRoles.filter(r => r.department === selectedDept);

  // Tjek minimum-krav
  const slagterCount = employees.filter(e => e.department === "slagteri").length;
  const teknikCount = employees.filter(e => e.department === "teknisk").length;
  const qaCount = employees.filter(e => e.department === "qa").length;
  const missingReqs = [];
  if (slagterCount < 5) missingReqs.push(`${5 - slagterCount} slagtere mangler`);
  if (teknikCount < 1) missingReqs.push("min. 1 tekniker mangler");
  if (qaCount < 1) missingReqs.push("min. 1 QA medarbejder mangler");

  // Beregn ugentlig lønomkostning
  const weeklyCost = employees.reduce((sum, e) => {
    if (e.pay_type === "monthly") return sum + (e.monthly_salary || 0) / 4.33;
    return sum + (e.hourly_rate || 0) * 7.4 * 5;
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
              <h1 className="font-bold text-stone-100">HR – Personale</h1>
              <p className="text-xs text-stone-500">{company.name} · {employees.length} ansatte</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs text-stone-500">Ugentlig lønomkostning</p>
            <p className="font-bold text-red-400">{formatDKK(Math.round(weeklyCost))}</p>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8 space-y-6">

        {/* Minimum-krav banner */}
        {!company.is_operational && (
          <div className="card border-l-4 border-l-red-500 bg-red-950/20">
            <p className="text-red-400 font-medium text-sm">Slagteriet er ikke klar til drift</p>
            <p className="text-stone-400 text-sm mt-1">
              Følgende mangler: {missingReqs.join(" · ")}
            </p>
            <p className="text-stone-500 text-xs mt-1">
              Minimum krav: 5 slagtere, 1 tekniker, 1 QA medarbejder
            </p>
          </div>
        )}

        {company.is_operational && (
          <div className="card border-l-4 border-l-green-500 bg-green-950/20">
            <p className="text-green-400 font-medium text-sm">✓ Slagteriet er klar til drift</p>
            <p className="text-stone-500 text-xs mt-0.5">Alle minimumskrav er opfyldt.</p>
          </div>
        )}

        {/* Afdelings-tabs */}
        <div className="flex gap-2 overflow-x-auto pb-1">
          {DEPARTMENTS.map(dept => {
            const cfg = DEPT_CONFIG[dept];
            const count = employees.filter(e => e.department === dept).length;
            return (
              <button
                key={dept}
                onClick={() => setSelectedDept(dept)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-medium whitespace-nowrap transition-colors ${
                  selectedDept === dept
                    ? "bg-stone-700 border-stone-500 text-stone-100"
                    : "bg-stone-900 border-stone-800 text-stone-400 hover:bg-stone-800"
                }`}
              >
                <span>{cfg.emoji}</span>
                <span>{cfg.label}</span>
                {count > 0 && (
                  <span className="bg-stone-600 text-stone-200 text-xs px-1.5 py-0.5 rounded-full">
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Ansatte i afdeling */}
          <div className="space-y-3">
            <h2 className="text-sm font-medium text-stone-500 uppercase tracking-wide">
              {DEPT_CONFIG[selectedDept].label} – {deptEmployees.length} ansatte
            </h2>

            {deptEmployees.length === 0 && (
              <div className="card border-dashed border-stone-700 text-center py-8">
                <p className="text-stone-500 text-sm">Ingen ansatte i denne afdeling</p>
                <p className="text-stone-600 text-xs mt-1">Ansæt fra rollerne til højre</p>
              </div>
            )}

            {deptEmployees.map(emp => (
              <div key={emp.id} className="card flex items-start justify-between gap-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-stone-100 text-sm">{emp.name}</span>
                    <span className="text-xs text-stone-500">{emp.role_title}</span>
                  </div>
                  <div className="flex gap-3 mt-1">
                    <span className="text-xs text-stone-600">
                      Kompetence: <span className="text-stone-400">{emp.skill_level}/100</span>
                    </span>
                    <span className="text-xs text-stone-600">
                      Moral: <span className={`${emp.morale >= 70 ? "text-green-400" : emp.morale >= 40 ? "text-yellow-400" : "text-red-400"}`}>
                        {emp.morale}/100
                      </span>
                    </span>
                  </div>
                  <div className="mt-1">
                    {emp.pay_type === "hourly" ? (
                      <span className="text-xs text-brand-400">
                        {emp.hourly_rate} kr/t · ~{formatDKK(Math.round((emp.hourly_rate || 0) * 7.4 * 5))}/uge
                      </span>
                    ) : (
                      <span className="text-xs text-brand-400">
                        {formatDKK(emp.monthly_salary || 0)}/md · ~{formatDKK(Math.round((emp.monthly_salary || 0) / 4.33))}/uge
                      </span>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => fireEmployee(emp.id)}
                  className="text-xs text-red-600 hover:text-red-400 transition-colors mt-1"
                >
                  Afskedig
                </button>
              </div>
            ))}
          </div>

          {/* Tilgængelige roller */}
          <div className="space-y-3">
            <h2 className="text-sm font-medium text-stone-500 uppercase tracking-wide">
              Tilgængelige roller
            </h2>

            {deptRoles.map(role => (
              <div key={role.id} className="card space-y-2">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h3 className="font-medium text-stone-100 text-sm">{role.title}</h3>
                    <p className="text-xs text-stone-500 mt-0.5">{role.description}</p>
                    <div className="flex gap-2 mt-1 flex-wrap">
                      {role.affects_capacity && <span className="badge-blue">Kapacitet</span>}
                      {role.affects_compliance && <span className="badge-green">Compliance</span>}
                      {role.affects_purchase && <span className="badge-yellow">Indkøb</span>}
                      {role.affects_sales && <span className="badge-blue">Salg</span>}
                    </div>
                  </div>
                  <div className="text-right ml-3">
                    {role.pay_type === "hourly" ? (
                      <p className="text-xs text-brand-400 font-medium">{role.hourly_rate} kr/t</p>
                    ) : (
                      <p className="text-xs text-brand-400 font-medium">
                        {formatDKK(role.monthly_min || 0)}–{formatDKK(role.monthly_max || 0)}/md
                      </p>
                    )}
                  </div>
                </div>

                {hiring === role.id ? (
                  <div className="space-y-2 pt-2 border-t border-stone-700">
                    {role.pay_type === "monthly" && (
                      <div>
                        <label className="label">Månedsløn (kr.)</label>
                        <input
                          type="number"
                          min={role.monthly_min || 0}
                          max={role.monthly_max || 999999}
                          step={1000}
                          value={hireForm?.salary || role.monthly_min || 0}
                          onChange={e => setHireForm({ roleId: role.id, salary: parseInt(e.target.value) || 0 })}
                          className="input"
                        />
                        <p className="text-xs text-stone-600 mt-1">
                          Spænd: {formatDKK(role.monthly_min || 0)} – {formatDKK(role.monthly_max || 0)}
                        </p>
                      </div>
                    )}
                    {role.pay_type === "hourly" && (
                      <p className="text-xs text-stone-500">
                        Fast timeløn: {role.hourly_rate} kr/t
                        · Overarbejde: {((role.hourly_rate || 0) * 1.5).toFixed(0)} kr/t
                      </p>
                    )}
                    <div className="flex gap-2">
                      <button
                        onClick={() => { setHiring(null); setHireForm(null); }}
                        className="btn-secondary flex-1 py-2 text-sm"
                      >
                        Annuller
                      </button>
                      <button
                        onClick={hireEmployee}
                        disabled={saving}
                        className="btn-primary flex-1 py-2 text-sm"
                      >
                        {saving ? "Ansætter..." : "Ansæt"}
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => {
                      setHiring(role.id);
                      setHireForm({ roleId: role.id, salary: role.monthly_min || 0 });
                    }}
                    className="btn-secondary w-full py-2 text-sm"
                  >
                    + Ansæt {role.title}
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Samlet overblik */}
        <div>
          <h2 className="text-sm font-medium text-stone-500 uppercase tracking-wide mb-3">Personale overblik</h2>
          <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
            {DEPARTMENTS.map(dept => {
              const cfg = DEPT_CONFIG[dept];
              const count = employees.filter(e => e.department === dept).length;
              const req = jobRoles.find(r => r.department === dept && r.required_minimum > 0);
              const needsMore = req && count < req.required_minimum;
              return (
                <button
                  key={dept}
                  onClick={() => setSelectedDept(dept)}
                  className={`card text-center py-4 transition-colors hover:border-stone-600 ${needsMore ? "border-red-800" : ""}`}
                >
                  <div className="text-2xl mb-1">{cfg.emoji}</div>
                  <div className={`text-lg font-bold ${needsMore ? "text-red-400" : "text-stone-100"}`}>{count}</div>
                  <div className="text-xs text-stone-500">{cfg.label}</div>
                  {needsMore && (
                    <div className="text-xs text-red-500 mt-0.5">min. {req.required_minimum}</div>
                  )}
                </button>
              );
            })}
          </div>
        </div>

      </main>
    </div>
  );
}
