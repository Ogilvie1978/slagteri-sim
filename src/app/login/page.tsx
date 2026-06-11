"use client";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  async function handleLogin() {
    setLoading(true);
    setError("");
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setError("Forkert email eller adgangskode");
      setLoading(false);
    } else {
      router.push("/");
      router.refresh();
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="text-4xl mb-3">🥩</div>
          <h1 className="text-2xl font-bold text-stone-100">Slagteri Simulator</h1>
          <p className="text-stone-500 mt-1">Log ind på din virksomhed</p>
        </div>
        <div className="card space-y-4">
          {error && (
            <div className="bg-red-900/30 border border-red-800 text-red-400 text-sm px-4 py-3 rounded-lg">
              {error}
            </div>
          )}
          <div>
            <label className="label">Email</label>
            <input className="input" type="email" placeholder="din@email.dk" value={email} onChange={e => setEmail(e.target.value)} />
          </div>
          <div>
            <label className="label">Adgangskode</label>
            <input className="input" type="password" placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleLogin()} />
          </div>
          <button className="btn-primary w-full" onClick={handleLogin} disabled={loading}>
            {loading ? "Logger ind..." : "Log ind"}
          </button>
          <p className="text-center text-sm text-stone-500">
            Ingen konto?{" "}
            <Link href="/signup" className="text-brand-400 hover:text-brand-300">Opret dig her</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
