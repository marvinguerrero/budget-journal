import * as XLSX from 'xlsx'
import { Expense } from '@/types'
import { getMonthName } from '@/utils/format'

interface ExportOptions {
  month?: number
  year?: number
  day?: string
}

export function exportExpensesToExcel(expenses: Expense[], options: ExportOptions) {
  const { month, year, day } = options

  const rows = expenses.map((e) => {
    const date = new Date(e.created_at)
    return {
      Date: date.toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' }),
      Category: e.category,
      Item: e.shared_budget_item ?? '',
      Note: e.note || '',
      Source: e.is_shared_budget_expense ? 'Shared Budget' : 'Personal',
      Amount: e.amount,
    }
  })

  const total = expenses.reduce((sum, e) => sum + e.amount, 0)
  rows.push({
    Date: '',
    Category: '',
    Item: '',
    Note: 'TOTAL',
    Source: '',
    Amount: total,
  })

  const ws = XLSX.utils.json_to_sheet(rows)

  ws['!cols'] = [
    { wch: 16 },
    { wch: 16 },
    { wch: 18 },
    { wch: 28 },
    { wch: 16 },
    { wch: 12 },
  ]

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Expenses')

  const monthPart = month ? getMonthName(month) : 'All-Months'
  const yearPart = year ? String(year) : 'All-Years'
  const dayPart = day && day !== 'all' ? `-day${day}` : ''
  const filename = `expenses-${monthPart}-${yearPart}${dayPart}.xlsx`
  XLSX.writeFile(wb, filename)
}
