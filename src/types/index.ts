export type Transaction = {
  id: string
  user_id: string
  amount: number
  category: string
  type: 'income' | 'expense'
  note: string | null
  date: string
}

export type Goal = {
  id: string
  user_id: string
  name: string
  target_amount: number
  saved_amount: number
  target_date: string
  current_amount?: number
  priority?: 'high' | 'medium' | 'low' | null
}

export type Profile = {
  id: string
  full_name: string | null
  monthly_income: number | null
  income_type: 'salary' | 'business' | 'freelance' | null
  expenses_essentials: number | null
  expenses_lifestyle: number | null
  expenses_emis: number | null
  is_onboarded: boolean
  age?: number | null
  dob?: string | null
  phone?: string | null
  email?: string | null
  created_at?: string | null
}
