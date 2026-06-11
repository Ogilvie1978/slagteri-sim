import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function Home() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // Tjek om spilleren har en virksomhed
  const { data: company } = await supabase
    .from("companies")
    .select("id")
    .eq("player_id", user.id)
    .single();

  if (!company) redirect("/onboarding");

  redirect("/dashboard");
}
