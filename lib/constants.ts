import type { Category, PaymentMethod } from '@/types'

export const DEFAULT_CATEGORIES: Omit<Category, 'id' | 'user_id' | 'is_default' | 'created_at'>[] = [
  { name: 'Food',           icon: '🍜', color: '#F97316' },
  { name: 'Transportation', icon: '🚗', color: '#3B82F6' },
  { name: 'Bills',          icon: '📄', color: '#EF4444' },
  { name: 'Shopping',       icon: '🛍️', color: '#A855F7' },
  { name: 'Entertainment',  icon: '🎬', color: '#EC4899' },
  { name: 'Health',         icon: '💊', color: '#10B981' },
  { name: 'Others',         icon: '📦', color: '#6B7280' },
]

export const DEFAULT_PAYMENT_METHODS: Omit<PaymentMethod, 'id' | 'user_id' | 'is_default' | 'created_at'>[] = [
  { name: 'Cash',          emoji: '💵' },
  { name: 'Credit Card',   emoji: '💳' },
  { name: 'Debit Card',    emoji: '💳' },
  { name: 'GCash',         emoji: '📱' },
  { name: 'Maya',          emoji: '💸' },
  { name: 'Bank Transfer', emoji: '🏦' },
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

export const PRESET_EMOJIS_PAYMENT = [
  '💵','💳','📱','🏦','💸','🔵','🟡','🟠',
  '💴','💶','💷','🏧','💰','🪙','💎','🔑',
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

export const ACCOUNT_TYPES = [
  { value: 'cash',       label: 'Cash',        emoji: '💵' },
  { value: 'bank',       label: 'Bank',        emoji: '🏦' },
  { value: 'ewallet',    label: 'E-Wallet',    emoji: '📱' },
  { value: 'credit',     label: 'Credit Card', emoji: '💳' },
  { value: 'savings',    label: 'Savings',     emoji: '🏧' },
  { value: 'investment', label: 'Investment',  emoji: '📈' },
] as const

export const PRESET_EMOJIS_ACCOUNTS = [
  '💵','🏦','📱','💳','🏧','📈','💰','🪙',
  '🏢','💼','💎','🎯','🏠','🚀','⭐','🔐',
]

// Backwards-compat lookup maps (used by charts / analytics that receive raw text values)
export const CATEGORY_COLORS: Record<string, string> = Object.fromEntries(
  DEFAULT_CATEGORIES.map((c) => [c.name, c.color])
)

export const CATEGORY_ICONS: Record<string, string> = Object.fromEntries(
  DEFAULT_CATEGORIES.map((c) => [c.name, c.icon])
)
