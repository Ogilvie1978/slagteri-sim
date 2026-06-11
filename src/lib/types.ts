export type Player = {
  id: string;
  username: string;
  created_at: string;
};

export type Company = {
  id: string;
  player_id: string;
  name: string;
  region: string;
  cash: number;
  equity: number;
  credit_limit: number;
  credit_used: number;
  credit_rate: number;
  reputation: number;
  capacity_kg: number;
  compliance_score: number;
  current_week: number;
  created_at: string;
};

export type MarketWeek = {
  id: string;
  week_number: number;
  pig_price: number;
  cattle_price: number;
  lamb_price: number;
  demand_index: number;
  fuel_cost_index: number;
  labor_market: "tight" | "normal" | "loose";
  week_summary: string | null;
  created_at: string;
};

export type GameEvent = {
  id: string;
  week_number: number;
  type: "market" | "regulation" | "weather" | "scandal" | "opportunity" | "crisis";
  title: string;
  description: string;
  severity: "low" | "medium" | "high";
  effect: Record<string, number> | null;
  affects_all: boolean;
  created_at: string;
};

export type Action = {
  id: string;
  company_id: string;
  week_number: number;
  type: string;
  payload: Record<string, unknown>;
  result: Record<string, unknown> | null;
  ai_narrative: string | null;
  created_at: string;
};

export type Contract = {
  id: string;
  company_id: string;
  customer_name: string;
  customer_type: "supermarket" | "restaurant" | "export" | "retail";
  product_type: string;
  volume_kg: number;
  price_per_kg: number;
  duration_weeks: number;
  week_start: number;
  week_end: number;
  active: boolean;
  compliance_req: number;
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
  costs: number;
  profit: number;
  cash_end: number;
  credit_used_end: number;
  kg_processed: number;
  kg_sold: number;
  reputation_end: number;
  compliance_end: number;
  narrative: string | null;
  created_at: string;
};
