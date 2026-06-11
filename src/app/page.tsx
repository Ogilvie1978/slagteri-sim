"use client";
import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

export default function Home() {
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    async function check() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/login"); return; }
      const { data: company } = await supabase
        .from("companies")
        .select("id")
        .eq("player_id", user.id)
        .single();
      if (!company) { router.push("/onboarding"); return; }
      router.push("/dashboard");
    }
    check();
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <p className="text-stone-500">Indlæser...</p>
    </div>
  );
}
