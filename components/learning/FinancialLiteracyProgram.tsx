'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  Award,
  BookOpen,
  CalendarCheck,
  CheckCircle2,
  Flame,
  GraduationCap,
  History,
  RotateCcw,
  XCircle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Separator } from '@/components/ui/separator'
import {
  financialLiteracyFoundationsQuestions,
  type FoundationQuestion,
  type QuizChoice,
} from '@/lib/financialLiteracyFoundations'
import { cn } from '@/lib/utils'

type QuizAnswer = {
  questionId: number
  selectedChoiceId: QuizChoice['id']
  isCorrect: boolean
  answeredAt: string
}

type QuizProgress = {
  answers: Record<number, QuizAnswer>
}

const STORAGE_KEY = 'budgetJournal.financialLiteracyFoundations.v1'
const totalQuestions = financialLiteracyFoundationsQuestions.length

function todayKey(date = new Date()) {
  return date.toISOString().slice(0, 10)
}

function parseProgress(): QuizProgress {
  if (typeof window === 'undefined') return { answers: {} }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return { answers: {} }
    const parsed = JSON.parse(raw) as QuizProgress
    return parsed && typeof parsed === 'object' && parsed.answers ? parsed : { answers: {} }
  } catch {
    return { answers: {} }
  }
}

function saveProgress(progress: QuizProgress) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(progress))
}

function daysBetween(a: string, b: string) {
  const first = new Date(`${a}T00:00:00`).getTime()
  const second = new Date(`${b}T00:00:00`).getTime()
  return Math.round((second - first) / 86400000)
}

function computeStreak(answers: QuizAnswer[]) {
  const uniqueDays = Array.from(new Set(answers.map((answer) => todayKey(new Date(answer.answeredAt))))).sort().reverse()
  if (uniqueDays.length === 0) return 0

  const today = todayKey()
  const startDayGap = daysBetween(uniqueDays[0], today)
  if (startDayGap > 1) return 0

  let streak = 1
  for (let index = 1; index < uniqueDays.length; index += 1) {
    if (daysBetween(uniqueDays[index], uniqueDays[index - 1]) === 1) {
      streak += 1
    } else {
      break
    }
  }
  return streak
}

function getInitialQuestionId(progress: QuizProgress) {
  return financialLiteracyFoundationsQuestions.find((question) => !progress.answers[question.id])?.id
    ?? financialLiteracyFoundationsQuestions[totalQuestions - 1].id
}

export function FinancialLiteracyProgram() {
  const [isReady, setIsReady] = useState(false)
  const [progress, setProgress] = useState<QuizProgress>({ answers: {} })
  const [activeQuestionId, setActiveQuestionId] = useState(financialLiteracyFoundationsQuestions[0].id)

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const storedProgress = parseProgress()
      setProgress(storedProgress)
      setActiveQuestionId(getInitialQuestionId(storedProgress))
      setIsReady(true)
    }, 0)

    return () => window.clearTimeout(timer)
  }, [])

  const answers = useMemo(
    () => Object.values(progress.answers).sort((a, b) => b.answeredAt.localeCompare(a.answeredAt)),
    [progress.answers]
  )
  const completedCount = answers.length
  const correctCount = answers.filter((answer) => answer.isCorrect).length
  const incorrectCount = completedCount - correctCount
  const accuracy = completedCount > 0 ? Math.round((correctCount / completedCount) * 100) : 0
  const completion = Math.round((completedCount / totalQuestions) * 100)
  const streak = computeStreak(answers)
  const isComplete = completedCount === totalQuestions
  const activeQuestion = financialLiteracyFoundationsQuestions.find((question) => question.id === activeQuestionId)
    ?? financialLiteracyFoundationsQuestions[0]
  const activeAnswer = progress.answers[activeQuestion.id]
  const hasAnsweredToday = answers.some((answer) => todayKey(new Date(answer.answeredAt)) === todayKey())
  const achievements = getAchievements({ completedCount, correctCount, streak, isComplete })

  if (!isReady) {
    return (
      <section className="rounded-2xl border border-border bg-card p-5 space-y-3">
        <div className="flex items-center gap-2">
          <GraduationCap className="w-4 h-4 text-primary" />
          <h2 className="text-sm font-semibold">Financial Literacy Foundations</h2>
        </div>
        <p className="text-sm text-muted-foreground">Loading your learning progress...</p>
      </section>
    )
  }

  const answerQuestion = (question: FoundationQuestion, selectedChoiceId: QuizChoice['id']) => {
    if (progress.answers[question.id]) return

    const nextProgress = {
      answers: {
        ...progress.answers,
        [question.id]: {
          questionId: question.id,
          selectedChoiceId,
          isCorrect: selectedChoiceId === question.correctChoiceId,
          answeredAt: new Date().toISOString(),
        },
      },
    }

    saveProgress(nextProgress)
    setProgress(nextProgress)
  }

  const moveToNextQuestion = () => {
    const nextQuestion = financialLiteracyFoundationsQuestions.find((question) => !progress.answers[question.id])
    if (nextQuestion) setActiveQuestionId(nextQuestion.id)
  }

  const resetProgram = () => {
    const nextProgress = { answers: {} }
    saveProgress(nextProgress)
    setProgress(nextProgress)
    setActiveQuestionId(financialLiteracyFoundationsQuestions[0].id)
  }

  return (
    <section className="space-y-5">
      <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <GraduationCap className="w-4 h-4 text-primary" />
                <h2 className="text-sm font-semibold">Financial Literacy Foundations</h2>
              </div>
              <p className="text-sm leading-6 text-muted-foreground">
                A beginner program with 30 short questions that teach income, expenses, assets, liabilities,
                budgeting, saving, debt, loans, credit cards, and financial responsibility.
              </p>
            </div>
            <span className={cn(
              'inline-flex items-center rounded-xl px-3 py-1.5 text-xs font-semibold',
              isComplete ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400' : 'bg-primary/10 text-primary'
            )}>
              {isComplete ? 'Completed' : 'Beginner'}
            </span>
          </div>

          <Separator />

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <StatCard label="Questions Completed" value={`${completedCount} / ${totalQuestions}`} />
            <StatCard label="Correct Answers" value={String(correctCount)} />
            <StatCard label="Incorrect Answers" value={String(incorrectCount)} />
            <StatCard label="Accuracy" value={`${accuracy}%`} />
            <StatCard label="Current Learning Streak" value={`${streak} Day${streak === 1 ? '' : 's'}`} />
            <StatCard label="Program Completion" value={`${completion}%`} />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Completion</p>
              <p className="text-xs font-semibold text-muted-foreground">{completion}%</p>
            </div>
            <Progress value={completion} />
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Award className="w-4 h-4 text-primary" />
            <h2 className="text-sm font-semibold">Achievements</h2>
          </div>
          <Separator />
          <div className="grid gap-2">
            {achievements.map((achievement) => (
              <div
                key={achievement.label}
                className={cn(
                  'flex items-center gap-3 rounded-xl px-3 py-2.5',
                  achievement.earned ? 'bg-primary/10 text-foreground' : 'bg-accent/50 text-muted-foreground'
                )}
              >
                <achievement.icon className={cn('w-4 h-4 flex-shrink-0', achievement.earned && 'text-primary')} />
                <div>
                  <p className="text-sm font-semibold">{achievement.label}</p>
                  <p className="text-xs">{achievement.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <CalendarCheck className="w-4 h-4 text-primary" />
              <h2 className="text-sm font-semibold">Daily Financial Quiz</h2>
            </div>
            <p className="text-sm text-muted-foreground">Today&apos;s question is pulled from Financial Literacy Foundations.</p>
          </div>
          <span className="rounded-xl bg-accent/50 px-3 py-1.5 text-xs font-semibold text-muted-foreground">
            Question {activeQuestion.id} of {totalQuestions}
          </span>
        </div>

        <Separator />

        {isComplete ? (
          <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-4">
            <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">Financial Literacy Foundations Completed</p>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              You finished all 30 beginner questions. Revisit the explanations any time, or reset the program to practice again.
            </p>
          </div>
        ) : (
          <QuestionPanel
            question={activeQuestion}
            answer={activeAnswer}
            hasAnsweredToday={hasAnsweredToday}
            onAnswer={answerQuestion}
            onNext={moveToNextQuestion}
          />
        )}

        <div className="flex justify-end">
          <Button type="button" variant="outline" className="rounded-xl gap-2" onClick={resetProgram}>
            <RotateCcw className="w-4 h-4" />
            Reset Program
          </Button>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
        <div className="flex items-center gap-2">
          <History className="w-4 h-4 text-primary" />
          <h2 className="text-sm font-semibold">Quiz History</h2>
        </div>
        <Separator />
        {answers.length === 0 ? (
          <p className="text-sm text-muted-foreground">No quiz answers yet. Answer today&apos;s question to start your history.</p>
        ) : (
          <div className="space-y-2">
            {answers.map((answer) => {
              const question = financialLiteracyFoundationsQuestions.find((item) => item.id === answer.questionId)
              if (!question) return null
              return (
                <div key={answer.questionId} className="rounded-xl bg-accent/50 p-3">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Question {question.id} - {question.category}
                      </p>
                      <p className="text-sm font-semibold">{question.question}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Answered {new Date(answer.answeredAt).toLocaleDateString('en-PH', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })}
                      </p>
                    </div>
                    <span className={cn(
                      'inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold',
                      answer.isCorrect
                        ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                        : 'bg-rose-500/10 text-rose-700 dark:text-rose-400'
                    )}>
                      {answer.isCorrect ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
                      {answer.isCorrect ? 'Correct' : 'Incorrect'}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </section>
  )
}

function QuestionPanel({
  question,
  answer,
  hasAnsweredToday,
  onAnswer,
  onNext,
}: {
  question: FoundationQuestion
  answer?: QuizAnswer
  hasAnsweredToday: boolean
  onAnswer: (question: FoundationQuestion, selectedChoiceId: QuizChoice['id']) => void
  onNext: () => void
}) {
  const isAnswered = Boolean(answer)

  return (
    <div className="space-y-4">
      {hasAnsweredToday && !isAnswered && (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-3">
          <p className="text-sm font-semibold text-amber-700 dark:text-amber-400">Today&apos;s quiz is already done.</p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            You can continue practicing foundations questions, but your daily streak already counted for today.
          </p>
        </div>
      )}

      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{question.category}</p>
        <h3 className="text-lg font-bold leading-7">{question.question}</h3>
      </div>

      <div className="grid gap-2">
        {question.choices.map((choice) => {
          const isSelected = answer?.selectedChoiceId === choice.id
          const isCorrect = choice.id === question.correctChoiceId
          return (
            <button
              key={choice.id}
              type="button"
              disabled={isAnswered}
              onClick={() => onAnswer(question, choice.id)}
              className={cn(
                'flex items-start gap-3 rounded-xl border border-border bg-accent/50 px-3 py-3 text-left transition-colors',
                !isAnswered && 'hover:bg-accent',
                isAnswered && isCorrect && 'border-emerald-500/30 bg-emerald-500/10',
                isAnswered && isSelected && !isCorrect && 'border-rose-500/30 bg-rose-500/10'
              )}
            >
              <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-background text-xs font-bold">
                {choice.id}
              </span>
              <span className="text-sm font-medium">{choice.text}</span>
            </button>
          )
        })}
      </div>

      {answer && (
        <div className={cn(
          'rounded-xl border p-4',
          answer.isCorrect
            ? 'border-emerald-500/25 bg-emerald-500/10'
            : 'border-rose-500/25 bg-rose-500/10'
        )}>
          <p className={cn(
            'flex items-center gap-2 text-sm font-semibold',
            answer.isCorrect ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400'
          )}>
            {answer.isCorrect ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
            {answer.isCorrect ? 'Correct' : 'Incorrect'}
          </p>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{question.explanation}</p>
          <div className="mt-4">
            <Button type="button" className="rounded-xl" onClick={onNext}>
              Next Foundation Question
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-accent/50 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-bold tabular-nums">{value}</p>
    </div>
  )
}

function getAchievements({
  completedCount,
  correctCount,
  streak,
  isComplete,
}: {
  completedCount: number
  correctCount: number
  streak: number
  isComplete: boolean
}) {
  return [
    {
      label: 'First Quiz',
      description: 'Answer your first foundations question.',
      earned: completedCount >= 1,
      icon: BookOpen,
    },
    {
      label: '7-Day Learning Streak',
      description: 'Answer questions across seven learning days.',
      earned: streak >= 7,
      icon: Flame,
    },
    {
      label: 'Financial Foundations Graduate',
      description: 'Complete all 30 beginner questions.',
      earned: isComplete,
      icon: GraduationCap,
    },
    {
      label: 'Budgeting Beginner',
      description: 'Reach the budgeting section.',
      earned: completedCount >= 13,
      icon: CalendarCheck,
    },
    {
      label: 'Debt Awareness',
      description: 'Reach the debt, loans, and credit cards section.',
      earned: completedCount >= 25,
      icon: Award,
    },
    {
      label: 'Careful Learner',
      description: 'Get at least five answers correct.',
      earned: correctCount >= 5,
      icon: CheckCircle2,
    },
  ]
}
