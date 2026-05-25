# Budget Journal

A modern, mobile-first personal finance journaling app built with Next.js 15, Supabase, and TypeScript.

## Features

- **Authentication** — Email/password & Google OAuth via Supabase Auth
- **Dashboard** — Monthly overview with spending stats, charts, and recent transactions
- **Expense Logging** — Ultra-fast expense entry with category picker and floating action button
- **Expense History** — Searchable, filterable expense list with edit/delete
- **Budget Tracking** — Category budgets with progress bars and overspending alerts
- **Analytics** — Spending by category (bar chart), breakdown percentages, and auto-generated insights
- **Settings** — Theme toggle (light/dark/system), profile view, logout
- **Dark Mode** — Full dark theme support
- **Mobile-first** — Bottom navigation, touch-friendly UI, responsive layout

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 15 (App Router) |
| Language | TypeScript |
| Styling | Tailwind CSS + shadcn/ui |
| Backend/Auth | Supabase |
| Database | PostgreSQL (Supabase) |
| Charts | Recharts |
| State | Zustand |
| Deployment | Vercel |

## Getting Started

### 1. Install dependencies

```bash
npm install
```

### 2. Set up Supabase

1. Create a new project at [supabase.com](https://supabase.com)
2. Go to **SQL Editor** and run `supabase/schema.sql`
3. Enable **Google OAuth** in Authentication → Providers (optional)
4. Copy your project URL and anon key

### 3. Environment variables

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

### 4. Run locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

---

## Database Schema

Run `supabase/schema.sql` in your Supabase SQL editor.

Tables: `expenses`, `budgets`, `categories`

All tables have Row Level Security (RLS) enabled — users can only access their own data.

## Deployment (Vercel)

```bash
vercel --prod
```

Add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` in your Vercel project settings.

## Project Structure

```
/app            - Next.js pages (login, dashboard, expenses, budgets, analytics, settings)
/components     - Reusable UI components
/lib/supabase   - Supabase client helpers
/services       - CRUD service functions
/hooks          - React hooks (useExpenses, useBudgets)
/store          - Zustand state store
/types          - TypeScript types
/utils          - Formatters
/supabase       - SQL schema & seed files
```

---

## Dev server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
