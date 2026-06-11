export type Player = {
  id: string;
  username: string;
  created_at: string;
};

export type Industry = "svineslagteri" | "kreaturslagteri" | "lammeslagteri" | "kyllingslagteri";

export const INDUSTRY_CONFIG: Record<Industry, {
  label: string;
  emoji: string;
  animal: string;
  priceKey: string;
}> = {
  svineslagteri:    { label: "Svineslagteri",    emoji: "🐷", animal: "Svinekød",    priceKey: "pig_price" },
  kreaturslagteri:  { label: "Kreaturslagteri",  emoji: "🐄", animal: "Oksekød",     priceKey: "cattle_price" },
  lammeslagteri:    { label: "Lammeslagteri",    emoji: "🐑", animal: "Lammekød",    priceKey: "lamb_price" },
  kyllingslagteri:  { label: "Kyllingslagteri",  emoji: "🐔", animal: "Kyllingekød", priceKey: "chicken_price" },
};

export type Company = {
  id: string;
  player_id: string;
  name: string;
  region: string;
  industry: Industry;
  cash: number;
  equity: number;
  credit_limit: number;
  credit_used: number;
  credit_rate: number;
  reputation: number;
  capacity_kg: number;
  compliance_score: number;
  current_week: number;
  // Dag-system
  current_day: string;
  week_day_number: number;
  day_started_at: string;
  saturday_approved: boolean;
  // Setup
  is_operational: boolean;
  setup_completed_day: string | null;
  // Produktion
  cold_storage_capacity_kg: number;
  has_vacuum_packer: boolean;
  has_butchery: boolean;
  stable_capacity_animals: number;
  stable_current_animals: number;
  slaughter_started_at: string | null;
  slaughter_queue: any[];
  slaughter_speed_per_min: number;
  total_revenue: number;
  total_cogs: number;
  total_salary_paid: number;
  total_interest_paid: number;
  vat_collected: number;
  vat_paid: number;
  vat_due: number;
  last_vat_settlement_week: number;
  tax_aconto: number;
  current_week_revenue: number;
  current_week_cogs: number;
  created_at: string;
};

export type MarketWeek = {
  id: string;
  week_number: number;
  demand_index: number;
  fuel_cost_index: number;
  labor_market: "tight" | "normal" | "loose";
  week_summary: string | null;
  created_at: string;
};

export type AnimalPrice = {
  id: string;
  week_number: number;
  industry: string;
  category: string;
  category_label: string;
  best_use: string;
  price_eur_per_100kg: number | null;
  price_dkk_per_kg: number;
  weight_min_kg: number | null;
  weight_max_kg: number | null;
  unit: string;
  source: string;
  created_at: string;
};

export type Buyer = {
  id: string;
  name: string;
  type: string;
  description: string;
  logo_emoji: string;
  min_compliance: number;
  accepted_classes: string[];
  min_volume_kg: number;
  price_bonus_pct: number;
  contract_duration_weeks: number;
  penalty_dkk: number;
  active: boolean;
};

export type Contract = {
  id: string;
  company_id: string;
  buyer_id: string;
  animal_category: string;
  volume_kg_per_week: number;
  price_bonus_pct: number;
  week_start: number;
  week_end: number;
  active: boolean;
  penalty_dkk: number;
  created_at: string;
};

export type RawMaterialPurchase = {
  id: string;
  company_id: string;
  week_number: number;
  animal_category: string;
  quantity_kg: number;
  quantity_animals: number | null;
  price_per_kg: number;
  total_cost: number;
  supplier_name: string;
  is_weekend: boolean;
  created_at: string;
};

export type SlaughterResult = {
  id: string;
  company_id: string;
  week_number: number;
  total_input_kg: number;
  animal_category: string;
  class_s_kg: number;
  class_e_kg: number;
  class_u_kg: number;
  class_r_kg: number;
  class_o_kg: number;
  class_p_kg: number;
  guaranteed_revenue: number;
  contract_revenue: number;
  total_revenue: number;
  narrative: string | null;
  created_at: string;
};

export type MarketEvent = {
  id: string;
  week_number: number;
  type: string;
  title: string;
  description: string;
  severity: string;
  affects_industry: string | null;
  price_delta_pct: number;
  demand_delta: number;
  opportunity_buyer: string | null;
  opportunity_bonus_pct: number;
  opportunity_volume_kg: number;
  opportunity_weeks: number;
  affects_all: boolean;
  created_at: string;
};

export type Employee = {
  id: string;
  company_id: string;
  name: string;
  role: string;
  salary: number;
  skill_level: number;
  morale: number;
  experience_weeks: number;
  active: boolean;
  hired_week: number;
  created_at: string;
};

export type WeekResult = {
  id: string;
  company_id: string;
  week_number: number;
  revenue: number;
  raw_material_cost: number;
  salary_cost: number;
  interest_cost: number;
  other_costs: number;
  profit: number;
  cash_end: number;
  credit_used_end: number;
  reputation_end: number;
  compliance_end: number;
  kg_slaughtered: number;
  narrative: string | null;
  created_at: string;
};
