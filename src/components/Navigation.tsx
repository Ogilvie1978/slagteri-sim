"use client";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const NAV_ITEMS = [
  { href: "/dashboard",   label: "Oversigt",    emoji: "📊" },
  { href: "/purchase",    label: "Indkøb",      emoji: "🐄" },
  { href: "/production",  label: "Produktion",  emoji: "⚙️" },
  { href: "/hr",          label: "Personale",   emoji: "👔" },
  { href: "/sales",       label: "Salg",        emoji: "💰" },
];

export default function Navigation() {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  return (
    <nav className="border-b border-stone-800 bg-stone-900/80 backdrop-blur-sm sticky top-0 z-20">
      <div className="max-w-6xl mx-auto px-4">
        <div className="flex items-center justify-between h-14">
          {/* Logo */}
          <button
            onClick={() => router.push("/dashboard")}
            className="flex items-center gap-2 text-stone-100 font-bold"
          >
            <span className="text-xl">🥩</span>
            <span className="hidden sm:block text-sm">Slagteri Sim</span>
          </button>

          {/* Nav links */}
          <div className="flex items-center gap-1">
            {NAV_ITEMS.map(item => {
              const isActive = pathname === item.href ||
                (item.href !== "/dashboard" && pathname.startsWith(item.href));
              return (
                <button
                  key={item.href}
                  onClick={() => router.push(item.href)}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? "bg-stone-700 text-stone-100"
                      : "text-stone-400 hover:text-stone-200 hover:bg-stone-800"
                  }`}
                >
                  <span className="text-base">{item.emoji}</span>
                  <span className="hidden sm:block">{item.label}</span>
                </button>
              );
            })}
          </div>

          {/* Log ud */}
          <button
            onClick={handleLogout}
            className="text-xs text-stone-600 hover:text-stone-400 transition-colors"
          >
            Log ud
          </button>
        </div>
      </div>
    </nav>
  );
}
