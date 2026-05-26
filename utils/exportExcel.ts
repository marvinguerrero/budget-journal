import * as XLSX from 'xlsx'
import { Expense } from '@/types'
import { getMonthName } from '@/utils/format'

interface ExportOptions {
  month?: number   // undefined = all months
  year?: number    // undefined = all years
  day?: string     // 'all' or a day number string
}

export function exportExpensesToExcel(expenses: Expense[], options: ExportOptions) {
  const { month, year, day } = options

  const rows = expenses.map((e) => {
    const date = new Date(e.created_at)
    return {
      Date: date.toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' }),
      Category: e.category,
      Note: e.note || '',
      'Payment Method': e.payment_method || '',
      Amount: e.amount,
    }
  })

  // Summary row
  const total = expenses.reduce((sum, e) => sum + e.amount, 0)
  rows.push({
    Date: '',
    Category: '',
    Note: '',
    'Payment Method': 'TOTAL',
    Amount: total,
  })

  const ws = XLSX.utils.json_to_sheet(rows)

  // Column widths
  ws['!cols'] = [
    { wch: 16 }, // Date
    { wch: 16 }, // Category
    { wch: 28 }, // Note
    { wch: 18 }, // Payment Method
    { wch: 12 }, // Amount
  ]

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Expenses')

  const monthPart = month ? getMonthName(month) : 'All-Months'
  const yearPart = year ? String(year) : 'All-Years'
  const dayPart = day && day !== 'all' ? `-day${day}` : ''
  const filename = `expenses-${monthPart}-${yearPart}${dayPart}.xlsx`
  XLSX.writeFile(wb, filename)
}
