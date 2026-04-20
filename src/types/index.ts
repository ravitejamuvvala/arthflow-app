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
}

export type Profile = {
  id: string
  full_name: string | null
  monthly_income: number | null
}
