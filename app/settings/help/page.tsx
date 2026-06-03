import Link from 'next/link'
import type { Metadata } from 'next'
import type { LucideIcon } from 'lucide-react'
import {
  ArrowLeft,
  BadgeQuestionMark,
  BanknoteArrowDown,
  BanknoteArrowUp,
  BookOpen,
  CheckCircle2,
  CircleDollarSign,
  CreditCard,
  GraduationCap,
  HandCoins,
  Landmark,
  ListChecks,
  PiggyBank,
  Receipt,
  Scale,
  ShieldCheck,
  Sparkles,
  Target,
  Wallet,
} from 'lucide-react'
import { Separator } from '@/components/ui/separator'
import { FinancialLiteracyProgram } from '@/components/learning/FinancialLiteracyProgram'

export const metadata: Metadata = {
  title: 'Help & Learning',
  description: 'Learn how to use Budget Journal and understand basic financial concepts.',
}

const quickStart = [
  'Create your accounts',
  'Record your income',
  'Record your expenses',
  'Review your balances',
  'Set a budget',
  'Monitor your progress',
]

const financialBasics: LearningCardData[] = [
  {
    title: 'What is an Asset?',
    icon: Wallet,
    body: 'An asset is something you own that has value.',
    examples: ['Cash', 'Savings Accounts', 'E-wallets', 'Investments'],
  },
  {
    title: 'What is a Liability?',
    icon: CreditCard,
    body: 'A liability is money you owe.',
    examples: ['Loans', 'Credit Card Balances', 'Borrowed Money'],
  },
  {
    title: 'What is Income?',
    icon: BanknoteArrowDown,
    body: 'Income is money you receive.',
    examples: ['Salary', 'Business Earnings', 'Allowance', 'Freelance Work'],
  },
  {
    title: 'What is an Expense?',
    icon: BanknoteArrowUp,
    body: 'An expense is money you spend.',
    examples: ['Food', 'Transportation', 'Bills', 'Subscriptions'],
  },
  {
    title: 'What is a Budget?',
    icon: PiggyBank,
    body: 'A budget is a spending plan that helps you control where your money goes.',
  },
]

const appConcepts: LearningCardData[] = [
  {
    title: 'Expenses',
    icon: Receipt,
    body: 'Use Expenses to track where your money goes.',
  },
  {
    title: 'Income',
    icon: BanknoteArrowDown,
    body: 'Use Income to record money coming into your accounts.',
  },
  {
    title: 'Accounts',
    icon: Landmark,
    body: 'Use Accounts to organize your money.',
    examples: ['Cash', 'Bank Accounts', 'E-Wallets', 'Credit Cards'],
  },
  {
    title: 'Balances',
    icon: Scale,
    body: 'Use Balances to track money owed to you, money you owe, loans, and credit card obligations.',
  },
  {
    title: 'Budgets',
    icon: Target,
    body: 'Use Budgets to set spending limits.',
  },
  {
    title: 'Wishlist',
    icon: Sparkles,
    body: 'Use Wishlist to plan future purchases.',
  },
]

const scenarios = [
  {
    scenario: 'Friend Owes Me Money',
    solution: 'Record a shared expense and assign participant shares.',
  },
  {
    scenario: 'I Borrowed Money',
    solution: 'Create a loan record.',
  },
  {
    scenario: 'I Lent Money',
    solution: 'Create a loan receivable.',
  },
  {
    scenario: 'I Want to Track My Credit Card',
    solution: 'Create a credit card account and record purchases normally.',
  },
  {
    scenario: 'I Want to Know Where My Salary Went',
    solution: 'Record income and track expenses consistently.',
  },
]

const literacyTopics: LearningCardData[] = [
  {
    title: 'Needs vs Wants',
    icon: ListChecks,
    body: 'Needs are things you must pay for, like food, rent, transport, and basic bills. Wants are nice to have, but can usually wait.',
  },
  {
    title: 'Emergency Funds',
    icon: ShieldCheck,
    body: 'An emergency fund is money set aside for surprise costs. Start small, then build it over time.',
  },
  {
    title: 'Budgeting Basics',
    icon: PiggyBank,
    body: 'A budget gives your money a plan before you spend it. It helps you avoid guessing at the end of the month.',
  },
  {
    title: 'Debt Management',
    icon: HandCoins,
    body: 'Debt becomes easier to handle when you know how much you owe, who you owe, and when payments are due.',
  },
  {
    title: 'Responsible Credit Card Usage',
    icon: CreditCard,
    body: 'A credit card is borrowed money. Track purchases, know your due date, and avoid spending more than you can repay.',
  },
  {
    title: 'Saving Habits',
    icon: CircleDollarSign,
    body: 'Saving works best when it becomes a routine. Even small amounts can help when saved consistently.',
  },
  {
    title: 'Goal-Based Spending',
    icon: Target,
    body: 'Before spending, ask what goal the money supports. This makes it easier to choose what matters most.',
  },
  {
    title: 'Financial Accountability',
    icon: CheckCircle2,
    body: 'Accountability means being honest about where money goes. Shared records can help groups stay clear and fair.',
  },
]

const faqs = [
  {
    question: 'Do I need accounting knowledge?',
    answer: 'No. Budget Journal is designed for everyday users.',
  },
  {
    question: 'Should I record every expense?',
    answer: 'Recording expenses consistently improves financial visibility.',
  },
  {
    question: 'What if I forget transactions?',
    answer: 'Add them as soon as possible to maintain accurate records.',
  },
]

export default function HelpLearningPage() {
  return (
    <div className="p-4 lg:p-6 pb-24 lg:pb-6 space-y-5 max-w-4xl">
      <div className="space-y-2">
        <Link href="/settings" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-3.5 h-3.5" />
          Settings
        </Link>
        <div className="flex items-center gap-2">
          <GraduationCap className="w-5 h-5 text-primary" />
          <h1 className="text-xl font-bold">Help & Learning</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Simple lessons for using Budget Journal and understanding everyday money decisions.
        </p>
      </div>

      <section className="rounded-2xl border border-border bg-card p-5 space-y-4">
        <SectionHeading icon={BookOpen} title="New to Budget Journal?" />
        <Separator />
        <p className="text-sm leading-6 text-muted-foreground">
          Budget Journal helps you understand where your money comes from, where it goes, and how your financial
          decisions affect your future.
        </p>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {quickStart.map((step, index) => (
            <div key={step} className="flex items-start gap-3 rounded-xl bg-accent/50 px-3 py-3">
              <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                {index + 1}
              </span>
              <span className="text-sm font-medium">{step}</span>
            </div>
          ))}
        </div>
      </section>

      <FinancialLiteracyProgram />

      <section className="space-y-3">
        <SectionHeading icon={Wallet} title="Financial Basics" />
        <div className="grid gap-3 md:grid-cols-2">
          {financialBasics.map((item) => (
            <LearningCard key={item.title} {...item} />
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <SectionHeading icon={Landmark} title="Understanding Budget Journal" />
        <div className="grid gap-3 md:grid-cols-2">
          {appConcepts.map((item) => (
            <LearningCard key={item.title} {...item} />
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-card p-5 space-y-4">
        <SectionHeading icon={BadgeQuestionMark} title="Common Real-Life Scenarios" />
        <Separator />
        <div className="grid gap-3">
          {scenarios.map(({ scenario, solution }) => (
            <div key={scenario} className="rounded-xl bg-accent/50 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Scenario</p>
              <p className="text-sm font-semibold">{scenario}</p>
              <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Solution</p>
              <p className="text-sm leading-6 text-muted-foreground">{solution}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <SectionHeading icon={GraduationCap} title="Financial Literacy Center" />
        <div className="grid gap-3 md:grid-cols-2">
          {literacyTopics.map((item) => (
            <LearningCard key={item.title} {...item} />
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-card p-5 space-y-4">
        <SectionHeading icon={BadgeQuestionMark} title="FAQ" />
        <Separator />
        <div className="grid gap-3">
          {faqs.map(({ question, answer }) => (
            <div key={question} className="rounded-xl bg-accent/50 p-3">
              <p className="text-sm font-semibold">Q: {question}</p>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">A: {answer}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-primary/20 bg-primary/10 p-5 space-y-3">
        <SectionHeading icon={Sparkles} title="Product Philosophy" />
        <p className="text-sm leading-6 text-muted-foreground">
          Financial literacy begins with financial visibility.
        </p>
        <p className="text-sm leading-6 text-muted-foreground">
          You cannot improve what you cannot see.
        </p>
        <p className="text-sm leading-6 text-muted-foreground">
          Budget Journal exists to help people understand money, develop healthy financial habits, and make better
          financial decisions through visibility, accountability, and collaboration.
        </p>
      </section>
    </div>
  )
}

type LearningCardData = {
  title: string
  icon: LucideIcon
  body: string
  examples?: string[]
}

function SectionHeading({ icon: Icon, title }: { icon: LucideIcon; title: string }) {
  return (
    <div className="flex items-center gap-2">
      <Icon className="w-4 h-4 text-primary" />
      <h2 className="text-sm font-semibold">{title}</h2>
    </div>
  )
}

function LearningCard({ title, icon: Icon, body, examples }: LearningCardData) {
  return (
    <article className="rounded-2xl border border-border bg-card p-5 space-y-3">
      <div className="flex items-center gap-2">
        <Icon className="w-4 h-4 text-primary" />
        <h3 className="text-sm font-semibold">{title}</h3>
      </div>
      <p className="text-sm leading-6 text-muted-foreground">{body}</p>
      {examples && (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Examples</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {examples.map((example) => (
              <div key={example} className="flex items-center gap-2 rounded-xl bg-accent/50 px-3 py-2">
                <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0 text-primary" />
                <span className="text-sm font-medium">{example}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </article>
  )
}
