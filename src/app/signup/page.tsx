"use client";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function SignupPage() {
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  async function handleSignup() {
    if (!username.trim()) { setError("Vælg et brugernavn"); return; }
    if (password.length < 6) { setError("Adgangskoden skal være mindst 6 tegn"); return; }
    setLoading(true);
    setError("");

    const { data, error: signupError } = await supabase.auth.signUp({ email, password });
    if (signupError || !data.user) {
      setError(signupError?.message || "Noget gik galt");
      setLoading(false);
      return;
    }

    const { error: profileError } = await supabase.from("players").insert({
      id: data.user.id,
      username: username.trim(),
    });

    if (profileError) {
      setError("Brugernavnet er allerede taget");
      setLoading(false);
      return;
    }

    router.push("/onboarding");
    router.refresh();
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="text-4xl mb-3">🥩</div>
          <h1 className="text-2xl font-bold text-stone-100">Opret konto</h1>
          <p className="text-stone-500 mt-1">Start dit slagteri</p>
        </div>
        <div className="card space-y-4">
          {error && (
            <div className="bg-red-900/30 border border-red-800 text-red-400 text-sm px-4 py-3 rounded-lg">
              {error}
            </div>
          )}
          <div>
            <label className="label">Brugernavn</label>
            <input className="input" type="text" placeholder="DitNavn" value={username} onChange={e => setUsername(e.target.value)} />
          </div>
          <div>
            <label className="label">Email</label>
            <input className="input" type="email" placeholder="din@email.dk" value={email} onChange={e => setEmail(e.target.value)} />
          </div>
          <div>
            <label className="label">Adgangskode</label>
            <input className="input" type="password" placeholder="Mindst 6 tegn" value={password} onChange={e => setPassword(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleSignup()} />
          </div>
          <button className="btn-primary w-full" onClick={handleSignup} disabled={loading}>
            {loading ? "Opretter konto..." : "Opret konto"}
          </button>
          <p className="text-center text-sm text-stone-500">
            Har du allerede en konto?{" "}
            <Link href="/login" className="text-brand-400 hover:text-brand-300">Log ind her</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
