import type { Category } from '@/types'

export const DEFAULT_CATEGORIES: Omit<Category, 'id' | 'user_id' | 'is_default' | 'created_at'>[] = [
  { name: 'Food',           icon: '🍜', color: '#F97316' },
  { name: 'Transportation', icon: '🚗', color: '#3B82F6' },
  { name: 'Bills',          icon: '📄', color: '#EF4444' },
  { name: 'Shopping',       icon: '🛍️', color: '#A855F7' },
  { name: 'Entertainment',  icon: '🎬', color: '#EC4899' },
  { name: 'Health',         icon: '💊', color: '#10B981' },
  { name: 'Others',         icon: '📦', color: '#6B7280' },
]

export const PRESET_COLORS = [
  '#F97316', '#EF4444', '#3B82F6', '#10B981',
  '#A855F7', '#EC4899', '#F59E0B', '#06B6D4',
  '#84CC16', '#6366F1', '#14B8A6', '#6B7280',
]

export const PRESET_EMOJIS_CATEGORIES = [
  '🍜','🍕','🍔','☕','🥗','🍣','🥤','🍰',
  '🚗','🚌','✈️','🛵','⛽','🚇','🏠','📦',
  '💡','💧','📱','📡','🌐','🔌','🔧','🏗️',
  '🛍️','👟','👗','💎','🎒','🧴','🛒','🏷️',
  '🎬','🎮','🎵','🎲','🎭','📚','🏊','🏋️',
  '💊','🏥','💪','🧘','🩺','🌿','🐶','🐱',
  '💰','📈','🏦','💸','🎁','🌟','📸','✂️',
]

export const DEFAULT_INCOME_SOURCES = [
  { name: 'Salary',      emoji: '💼', color: '#3B82F6', is_default: true },
  { name: 'Freelance',   emoji: '💻', color: '#8B5CF6', is_default: true },
  { name: 'Bonus',       emoji: '🎁', color: '#F59E0B', is_default: true },
  { name: 'Investments', emoji: '📈', color: '#10B981', is_default: true },
  { name: 'Business',    emoji: '🏢', color: '#EF4444', is_default: true },
]

export const PRESET_EMOJIS_INCOME = [
  '💼','💻','🎁','📈','🏢','💰','🏦','🪙',
  '🍪','🛒','🎨','✂️','📷','🎵','🏠','🚗',
  '💡','🌐','📦','🎯','🏆','⭐','🎪','🎓',
]

export const BASE_CURRENCY_CODE = 'PHP'

export const CURRENCIES = [
  { code: 'PHP', label: 'Philippine Peso', symbol: '₱' },
  { code: 'USD', label: 'US Dollar',       symbol: '$' },
  { code: 'JPY', label: 'Japanese Yen',    symbol: '¥' },
  { code: 'KRW', label: 'Korean Won',      symbol: '₩' },
  { code: 'EUR', label: 'Euro',            symbol: '€' },
  { code: 'GBP', label: 'British Pound',   symbol: '£' },
  { code: 'SGD', label: 'Singapore Dollar', symbol: 'S$' },
  { code: 'AUD', label: 'Australian Dollar', symbol: 'A$' },
  { code: 'HKD', label: 'Hong Kong Dollar', symbol: 'HK$' },
  { code: 'CNY', label: 'Chinese Yuan',    symbol: '¥' },
] as const

export function getCurrencySymbol(code: string): string {
  return CURRENCIES.find((c) => c.code === code)?.symbol ?? code
}

export function isForeignCurrency(currencyCode?: string | null, baseCurrencyCode?: string | null): boolean {
  return !!currencyCode && currencyCode !== (baseCurrencyCode ?? BASE_CURRENCY_CODE)
}

export const ACCOUNT_TYPES = [
  { value: 'cash',       label: 'Cash',        emoji: '💵', category: 'asset'     },
  { value: 'bank',       label: 'Bank',        emoji: '🏦', category: 'asset'     },
  { value: 'ewallet',    label: 'E-Wallet',    emoji: '📱', category: 'asset'     },
  { value: 'savings',    label: 'Savings',     emoji: '🏧', category: 'asset'     },
  { value: 'investment', label: 'Investment',  emoji: '📈', category: 'asset'     },
  { value: 'credit',     label: 'Credit Card', emoji: '💳', category: 'liability' },
  { value: 'loan',       label: 'Loan',        emoji: '💸', category: 'liability' },
] as const

export const LIABILITY_ACCOUNT_TYPES = ['credit', 'loan'] as const

export function isLiabilityType(type: string): boolean {
  return (LIABILITY_ACCOUNT_TYPES as readonly string[]).includes(type)
}

export const PRESET_EMOJIS_ACCOUNTS = [
  '💵','🏦','📱','💳','🏧','📈','💰','🪙',
  '🏢','💼','💎','🎯','🏠','🚀','⭐','🔐',
]

// Backwards-compat lookup maps (used by charts / analytics that receive raw text values)
export const CATEGORY_COLORS: Record<string, string> = {
  ...Object.fromEntries(DEFAULT_CATEGORIES.map((c) => [c.name, c.color])),
  Settlement: '#6366F1',
  'Transfer Fees': '#6366F1',
}

export const CATEGORY_ICONS: Record<string, string> = {
  ...Object.fromEntries(DEFAULT_CATEGORIES.map((c) => [c.name, c.icon])),
  Settlement: '💸',
  'Transfer Fees': '🏦',
}
