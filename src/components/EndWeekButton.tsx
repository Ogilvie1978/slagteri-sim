"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Company } from "@/lib/types";

type Props = {
  company: Company;
  hasPurchasedThisWeek: boolean;
};

export default function EndWeekButton({ company, hasPurchasedThisWeek }: Props) {
  const [showModal, setShowModal] = useState(false);
  const router = useRouter();

  return (
    <>
      <button className="btn-primary" onClick={() => setShowModal(true)}>
        Afslut uge {company.current_week} →
      </button>

      {showModal && (
        <div
          className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 px-4"
          onClick={e => e.target === e.currentTarget && setShowModal(false)}
        >
          <div className="bg-stone-900 border border-stone-700 rounded-2xl p-6 max-w-md w-full space-y-4">
            <h2 className="text-lg font-bold text-stone-100">
              Afslut uge {company.current_week}
            </h2>

            {!hasPurchasedThisWeek ? (
              <>
                <p className="text-stone-400 text-sm">
                  Du har ikke købt dyr denne uge. Vil du købe inden du afslutter?
                </p>
                <div className="space-y-2">
                  <button
                    className="btn-primary w-full"
                    onClick={() => {
                      setShowModal(false);
                      router.push("/purchase");
                    }}
                  >
                    🐄 Køb dyr til mandag
                  </button>
                  <button
                    className="btn-secondary w-full"
                    onClick={() => {
                      setShowModal(false);
                      router.push("/purchase?weekend=1");
                    }}
                  >
                    🌙 Køb til lørdag (+5% weekendpris)
                  </button>
                  <button
                    className="w-full py-2.5 text-sm text-stone-500 hover:text-stone-300 transition-colors"
                    onClick={() => {
                      setShowModal(false);
                      router.push("/end-week");
                    }}
                  >
                    Spring over og afslut uge →
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="text-stone-400 text-sm">
                  Du har allerede købt dyr til mandag. Vil du også købe til lørdag?
                </p>
                <div className="space-y-2">
                  <button
                    className="btn-secondary w-full"
                    onClick={() => {
                      setShowModal(false);
                      router.push("/purchase?weekend=1");
                    }}
                  >
                    🌙 Køb til lørdag (+5% weekendpris)
                  </button>
                  <button
                    className="btn-primary w-full"
                    onClick={() => {
                      setShowModal(false);
                      router.push("/end-week");
                    }}
                  >
                    Afslut uge {company.current_week} →
                  </button>
                </div>
              </>
            )}

            <button
              onClick={() => setShowModal(false)}
              className="w-full text-xs text-stone-600 hover:text-stone-500 transition-colors"
            >
              Annuller
            </button>
          </div>
        </div>
      )}
    </>
  );
}
