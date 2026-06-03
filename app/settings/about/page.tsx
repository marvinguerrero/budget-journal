import Link from 'next/link'
import type { Metadata } from 'next'
import {
  ArrowLeft,
  BadgeCheck,
  BookOpen,
  CheckCircle2,
  Compass,
  Flag,
  Goal,
  Handshake,
  HeartHandshake,
  Lightbulb,
  Scale,
  ShieldCheck,
  Sparkles,
  Target,
  UserRound,
  WalletCards,
} from 'lucide-react'
import { Separator } from '@/components/ui/separator'
import packageJson from '@/package.json'

export const metadata: Metadata = {
  title: 'About Budget Journal',
  description: 'Learn about the purpose, vision, mission, philosophy, and long-term direction of Budget Journal.',
}

const questions = [
  'Where their money comes from',
  'Where their money goes',
  'What they own',
  'What they owe',
  'Who owes them',
  'How their financial decisions affect their future',
]

const moneyMovements = [
  'Salary comes in',
  'Bills get paid',
  'Credit cards get used',
  'Friends borrow money',
  'Shared expenses happen',
  'Subscriptions renew',
  'Loans get forgotten',
]

const principles = [
  {
    title: 'Financial Visibility',
    quote: 'You cannot improve what you cannot see.',
    body: 'Users should always understand where money came from, where money went, what they own, what they owe, and who owes them.',
    icon: Lightbulb,
  },
  {
    title: 'Accountability',
    quote: 'Financial relationships should be transparent and traceable.',
    body: 'Shared expenses, balances, loans, and obligations should be clear to all involved parties.',
    icon: ShieldCheck,
  },
  {
    title: 'Practicality',
    quote: 'The application should solve real-world financial problems.',
    body: 'Every feature should provide meaningful value to users.',
    icon: Target,
  },
  {
    title: 'Simplicity',
    quote: 'Complex financial concepts should be understandable by everyone.',
    body: 'Financial management should not require accounting expertise.',
    icon: Sparkles,
  },
]

const collaborators = [
  'Families',
  'Partners',
  'Friends',
  'Roommates',
  'Travel Groups',
  'Communities',
]

const philosophy = [
  'Every peso should have a story.',
  'Money should never disappear without explanation.',
  'Financial decisions become easier when financial information is clear.',
  'Financial literacy begins with financial visibility.',
  'Financial growth becomes stronger when people learn together.',
]

const features = [
  'Expenses',
  'Income',
  'Financial Accounts',
  'Transfers',
  'Budgets',
  'Shared Budgets',
  'Shared Expenses',
  'Receivables',
  'Payables',
  'Loans',
  'Credit Cards',
  'Wishlist Planning',
  'Analytics',
  'Notifications',
  'Settlements',
  'Contacts and Collaboration',
]

const longTermGoals = [
  'Understand money',
  'Build financial discipline',
  'Improve financial literacy',
  'Collaborate responsibly',
  'Make better financial decisions',
]

export default function AboutBudgetJournalPage() {
  return (
    <div className="p-4 lg:p-6 pb-24 lg:pb-6 space-y-5 max-w-4xl">
      <div className="space-y-2">
        <Link href="/settings" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-3.5 h-3.5" />
          Settings
        </Link>
        <div className="flex items-center gap-2">
          <BookOpen className="w-5 h-5 text-primary" />
          <h1 className="text-xl font-bold">About Budget Journal</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Purpose, vision, mission, philosophy, values, and long-term direction.
        </p>
      </div>

      <section className="rounded-2xl border border-border bg-card p-5 space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Application Overview</p>
            <h2 className="text-2xl font-bold">Budget Journal</h2>
            <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
              Budget Journal is a personal and collaborative financial management platform designed to help people
              understand, track, manage, and improve their financial lives.
            </p>
          </div>
          <div className="rounded-xl border border-border bg-muted/40 px-3 py-2 text-left sm:text-right">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Version</p>
            <p className="text-sm font-bold">v{packageJson.version}</p>
          </div>
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        <StatementCard
          icon={Compass}
          title="Vision"
          text="To empower people to achieve financial literacy through visibility, accountability, and collaboration, enabling better financial decisions for individuals, families, friends, and communities."
        />
        <StatementCard
          icon={Flag}
          title="Mission"
          text="To provide an accessible and practical financial management platform that helps people understand money, track financial activity, manage obligations responsibly, and build healthy financial habits through both personal and collaborative financial experiences."
        />
      </div>

      <section className="rounded-2xl border border-border bg-card p-5 space-y-4">
        <SectionHeading icon={HeartHandshake} title="Why Budget Journal Exists" />
        <Separator />
        <p className="text-sm leading-6 text-muted-foreground">
          Financial literacy should not be limited to financial experts, accountants, or wealthy individuals.
        </p>
        <Checklist items={questions} />
        <p className="text-sm leading-6 text-muted-foreground">
          Budget Journal exists to make financial awareness, financial responsibility, and financial literacy accessible to everyone.
        </p>
      </section>

      <section className="rounded-2xl border border-border bg-card p-5 space-y-4">
        <SectionHeading icon={Scale} title="The Problem We Are Solving" />
        <Separator />
        <p className="text-sm leading-6 text-muted-foreground">
          Many people work hard and earn enough to live comfortably, yet still struggle to understand where their money goes.
        </p>
        <Checklist items={moneyMovements} />
        <div className="rounded-xl border border-primary/20 bg-primary/10 p-4">
          <p className="text-sm font-semibold text-primary">Where did my money go?</p>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">Budget Journal was built to answer that question.</p>
        </div>
      </section>

      <section className="space-y-3">
        <SectionHeading icon={BadgeCheck} title="Core Principles" />
        <div className="grid gap-3 md:grid-cols-2">
          {principles.map(({ title, quote, body, icon: Icon }) => (
            <div key={title} className="rounded-2xl border border-border bg-card p-5 space-y-3">
              <div className="flex items-center gap-2">
                <Icon className="w-4 h-4 text-primary" />
                <h3 className="text-sm font-semibold">{title}</h3>
              </div>
              <p className="text-sm font-medium">{quote}</p>
              <p className="text-sm leading-6 text-muted-foreground">{body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-card p-5 space-y-4">
        <SectionHeading icon={Handshake} title="Collaborative Financial Literacy" />
        <Separator />
        <p className="text-sm leading-6 text-muted-foreground">
          Financial literacy is often viewed as a personal journey. Budget Journal believes it can also be a shared journey.
        </p>
        <Checklist items={collaborators} />
        <p className="text-sm leading-6 text-muted-foreground">
          Through shared budgets, expense tracking, balances, loans, settlements, and financial collaboration, Budget Journal
          encourages transparency, accountability, and learning together.
        </p>
        <p className="text-sm leading-6 text-muted-foreground">
          The goal is not only to help individuals understand money, but to help people build healthy financial habits collectively.
        </p>
      </section>

      <section className="rounded-2xl border border-border bg-card p-5 space-y-4">
        <SectionHeading icon={WalletCards} title="Product Philosophy" />
        <Separator />
        <div className="grid gap-2">
          {philosophy.map((item) => (
            <p key={item} className="rounded-xl bg-accent/50 px-3 py-2.5 text-sm font-medium">
              {item}
            </p>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-card p-5 space-y-4">
        <SectionHeading icon={CheckCircle2} title="Features" />
        <Separator />
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((feature) => (
            <div key={feature} className="flex items-center gap-2 rounded-xl bg-accent/50 px-3 py-2.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              <span className="text-sm font-medium">{feature}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-card p-5 space-y-4">
        <SectionHeading icon={Goal} title="Long-Term Goal" />
        <Separator />
        <p className="text-sm leading-6 text-muted-foreground">
          Budget Journal aims to become more than a finance tracker. Its long-term goal is to become a platform that helps people:
        </p>
        <Checklist items={longTermGoals} />
        <p className="text-sm leading-6 text-muted-foreground">both individually and collectively.</p>
      </section>

      <section className="rounded-2xl border border-border bg-card p-5 space-y-4">
        <SectionHeading icon={UserRound} title="Developer" />
        <Separator />
        <div className="grid gap-3 sm:grid-cols-[1fr_2fr]">
          <div className="rounded-xl bg-accent/50 px-3 py-2.5">
            <p className="text-xs text-muted-foreground">Developer</p>
            <p className="text-sm font-semibold">Marvin Guerrero</p>
          </div>
          <div className="rounded-xl bg-accent/50 px-3 py-2.5">
            <p className="text-xs text-muted-foreground">Roles</p>
            <p className="text-sm font-semibold">Product Owner, Solution Architect, Lead Developer</p>
          </div>
        </div>
      </section>
    </div>
  )
}

function SectionHeading({ icon: Icon, title }: { icon: typeof BookOpen; title: string }) {
  return (
    <div className="flex items-center gap-2">
      <Icon className="w-4 h-4 text-primary" />
      <h2 className="text-sm font-semibold">{title}</h2>
    </div>
  )
}

function StatementCard({ icon: Icon, title, text }: { icon: typeof BookOpen; title: string; text: string }) {
  return (
    <section className="rounded-2xl border border-border bg-card p-5 space-y-3">
      <SectionHeading icon={Icon} title={title} />
      <Separator />
      <p className="text-sm leading-6 text-muted-foreground">{text}</p>
    </section>
  )
}

function Checklist({ items }: { items: string[] }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {items.map((item) => (
        <div key={item} className="flex items-start gap-2 rounded-xl bg-accent/50 px-3 py-2.5">
          <CheckCircle2 className="mt-0.5 w-3.5 h-3.5 flex-shrink-0 text-primary" />
          <span className="text-sm font-medium">{item}</span>
        </div>
      ))}
    </div>
  )
}
