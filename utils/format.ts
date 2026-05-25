export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount)
}

export function formatDate(dateString: string): string {
  return new Intl.DateTimeFormat('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(dateString))
}

export function formatShortDate(dateString: string): string {
  return new Intl.DateTimeFormat('en-PH', {
    month: 'short',
    day: 'numeric',
  }).format(new Date(dateString))
}

export function getMonthName(month: number): string {
  return new Intl.DateTimeFormat('en-PH', { month: 'long' }).format(
    new Date(2000, month - 1, 1)
  )
}

export function getCurrentMonth(): { month: number; year: number } {
  const now = new Date()
  return { month: now.getMonth() + 1, year: now.getFullYear() }
}

export function getDaysInMonth(month: number, year: number): number {
  return new Date(year, month, 0).getDate()
}
