import { BarChart3, Calculator, Database, GitCompareArrows } from 'lucide-react'

export const fuelNames = { diesel: 'Дизельное топливо', ai92: 'Бензин АИ-92', ai95: 'Бензин АИ-95' }
export const lineColors = Array.from({ length: 5 }, (_, index) => `var(--chart-${index + 1})`)
export const menu = [
  { id: 'overview', label: 'Обзор цен', icon: BarChart3 },
  { id: 'comparison', label: 'Сравнение регионов', icon: GitCompareArrows },
  { id: 'calculator', label: 'Калькулятор', icon: Calculator },
  { id: 'sources', label: 'О данных', icon: Database },
] as const
