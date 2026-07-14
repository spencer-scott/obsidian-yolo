import cx from 'clsx'
import { ArrowRight, Check, RotateCcw, X } from 'lucide-react'
import { TFile, normalizePath } from 'obsidian'
import { useEffect, useMemo, useState } from 'react'

import { useApp } from '../../contexts/app-context'
import { useLanguage } from '../../contexts/language-context'
import { scanMarkdownEntries } from '../../core/learning/markdownScanner'
import type { Project as VaultProject } from '../../core/learning/types'

import { formatLearningText } from './i18n'
import { Pill, Segmented, SelectMenu } from './primitives'

type Exercise = {
  id: string
  pointId: string | null
  pointTitle: string
  chapterId: string
  chapterTitle: string
  question: string
  practiced: boolean
}

type PracticeScope = { kind: 'global' } | { kind: 'chapter'; chapterId: string }

export function ExercisesView({ project }: { project: VaultProject | null }) {
  const { t } = useLanguage()
  const { exercises, loading } = useProjectExercises(project)
  const practiceCount = exercises.filter(
    (exercise) => !exercise.practiced,
  ).length
  const [mode, setMode] = useState<'browse' | 'practice'>('browse')
  const [practiceScope, setPracticeScope] = useState<PracticeScope>({
    kind: 'global',
  })

  const enterPractice = (scope: PracticeScope = { kind: 'global' }) => {
    setPracticeScope(scope)
    setMode('practice')
  }
  const modeLabels: Record<'browse' | 'practice', string> = {
    browse: t('learning.common.browse', 'Browse'),
    practice: t('learning.exercises.practice', 'Practice'),
  }

  return (
    <div className="yolo-learning-exercises">
      <div className="yolo-learning-exercises-modebar">
        <Segmented
          options={['browse', 'practice'] as const}
          value={mode}
          onChange={(nextMode) => {
            setMode(nextMode)
            if (nextMode === 'practice') setPracticeScope({ kind: 'global' })
          }}
          badges={practiceCount > 0 ? { practice: practiceCount } : undefined}
          getLabel={(option) => modeLabels[option]}
        />
      </div>

      {mode === 'browse' ? (
        <BrowseMode
          project={project}
          exercises={exercises}
          loading={loading}
          onPracticeChapter={(chapterId) =>
            enterPractice({ kind: 'chapter', chapterId })
          }
        />
      ) : (
        <PracticeMode
          exercises={exercises}
          scope={practiceScope}
          onExit={() => {
            setMode('browse')
            setPracticeScope({ kind: 'global' })
          }}
        />
      )}
    </div>
  )
}

function useProjectExercises(project: VaultProject | null) {
  const app = useApp()
  const [exercises, setExercises] = useState<Exercise[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      if (!project) {
        setExercises([])
        setLoading(false)
        return
      }
      setLoading(true)
      const nextExercises: Exercise[] = []
      const pointByUuid = new Map(
        project.knowledgePoints.map((point) => [point.uuid, point]),
      )
      const chapterById = new Map(
        project.chapters.map((chapter) => [chapter.id, chapter]),
      )
      for (const chapter of project.chapters) {
        const file = app.vault.getAbstractFileByPath(
          normalizePath(`${chapter.folderPath}/exercises.md`),
        )
        if (!(file instanceof TFile)) continue
        const content = await app.vault.cachedRead(file)
        const entries = scanMarkdownEntries(content).filter(
          (entry) => entry.type === 'ex' && entry.uuid,
        )
        for (const entry of entries) {
          const point = entry.kpUuid ? pointByUuid.get(entry.kpUuid) : undefined
          const pointChapter = point
            ? chapterById.get(point.chapterId)
            : undefined
          nextExercises.push({
            id: entry.uuid,
            pointId: point?.id ?? null,
            pointTitle: point?.title ?? entry.title,
            chapterId: pointChapter?.id ?? chapter.id,
            chapterTitle: pointChapter?.title ?? chapter.title,
            question: entry.body || entry.title,
            practiced: false,
          })
        }
      }
      if (!cancelled) {
        setExercises(nextExercises)
        setLoading(false)
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [app, project])

  return { exercises, loading }
}

function BrowseMode({
  project,
  exercises,
  loading,
  onPracticeChapter,
}: {
  project: VaultProject | null
  exercises: Exercise[]
  loading: boolean
  onPracticeChapter: (chapterId: string) => void
}) {
  const { t } = useLanguage()
  const [chapterFilter, setChapterFilter] = useState('all-chapters')
  const [statusFilter, setStatusFilter] = useState('all-statuses')

  const visibleChapters = useMemo(() => {
    return (project?.chapters ?? [])
      .filter(
        (chapter) =>
          chapterFilter === 'all-chapters' || chapter.title === chapterFilter,
      )
      .map((chapter) => ({
        ...chapter,
        exercises: exercises.filter((exercise) => {
          if (exercise.chapterId !== chapter.id) return false
          if (statusFilter === 'practiced') return exercise.practiced
          if (statusFilter === 'unpracticed') return !exercise.practiced
          return true
        }),
      }))
      .filter((chapter) => chapter.exercises.length > 0)
  }, [chapterFilter, exercises, project, statusFilter])

  return (
    <>
      <div className="yolo-learning-exercises-filters">
        <SelectMenu
          value={chapterFilter}
          options={[
            {
              value: 'all-chapters',
              label: t('learning.common.allChapters', 'All chapters'),
            },
            ...(project?.chapters.map((chapter) => chapter.title) ?? []),
          ]}
          onChange={setChapterFilter}
        />
        <SelectMenu
          value={statusFilter}
          options={[
            {
              value: 'all-statuses',
              label: t('learning.exercises.allStatus', 'All statuses'),
            },
            {
              value: 'practiced',
              label: t('learning.exercises.practiced', 'Practiced'),
            },
            {
              value: 'unpracticed',
              label: t('learning.exercises.unpracticed', 'Unpracticed'),
            },
          ]}
          onChange={setStatusFilter}
        />
      </div>

      <div className="yolo-learning-exercises-chapter-list">
        {loading ? (
          <p className="yolo-learning-exercises-empty">
            {t('learning.common.loading', 'Loading…')}
          </p>
        ) : visibleChapters.length === 0 ? (
          <p className="yolo-learning-exercises-empty">
            {t(
              'learning.exercises.empty',
              'No exercises yet. Once knowledge points are generated, you can create exercises from them.',
            )}
          </p>
        ) : (
          visibleChapters.map((chapter, index) => (
            <ChapterExerciseCard
              key={chapter.id}
              chapterIndex={index + 1}
              chapter={chapter}
              onPracticeChapter={() => onPracticeChapter(chapter.id)}
            />
          ))
        )}
      </div>
    </>
  )
}

function ChapterExerciseCard({
  chapter,
  chapterIndex,
  onPracticeChapter,
}: {
  chapter: { id: string; title: string; exercises: Exercise[] }
  chapterIndex: number
  onPracticeChapter: () => void
}) {
  const { t } = useLanguage()
  const practiced = chapter.exercises.filter(
    (exercise) => exercise.practiced,
  ).length
  const pending = chapter.exercises.length - practiced

  return (
    <article className="yolo-learning-exercise-chapter-card">
      <div className="yolo-learning-exercise-chapter-header">
        <div className="yolo-learning-exercise-chapter-title-wrap">
          <h3 className="yolo-learning-exercise-chapter-title">
            {formatLearningText(
              t('learning.exercises.chapterTitle', 'Chapter {index} · {title}'),
              {
                index: chapterIndex,
                title: chapter.title,
              },
            )}
          </h3>
          <p className="yolo-learning-exercise-chapter-meta">
            {formatLearningText(
              t(
                'learning.exercises.practicedCount',
                '{done}/{total} practiced',
              ),
              {
                done: practiced,
                total: chapter.exercises.length,
              },
            )}
            {pending > 0 && (
              <span className="yolo-learning-exercise-pending-text">
                {' · '}
                {formatLearningText(
                  t('learning.exercises.pendingCount', '{count} pending'),
                  {
                    count: pending,
                  },
                )}
              </span>
            )}
          </p>
        </div>
        <button
          type="button"
          onClick={onPracticeChapter}
          className="yolo-learning-exercise-primary-button yolo-learning-exercise-chapter-action"
        >
          {t('learning.exercises.practice', 'Practice')}{' '}
          <ArrowRight size={14} />
        </button>
      </div>

      <ul className="yolo-learning-exercise-point-list">
        {chapter.exercises.map((exercise) => (
          <li key={exercise.id} className="yolo-learning-exercise-point-row">
            <span className="yolo-learning-exercise-point-title">
              {exercise.pointTitle} · {exercise.question.split('\n')[0]}
            </span>
            <div className="yolo-learning-exercise-point-status">
              {exercise.practiced ? (
                <Pill tone="success">
                  <Check size={11} />{' '}
                  {t('learning.exercises.completed', 'Done')}
                </Pill>
              ) : (
                <Pill tone="primary">
                  {t('learning.exercises.unpracticed', 'Unpracticed')}
                </Pill>
              )}
            </div>
          </li>
        ))}
      </ul>
    </article>
  )
}

function PracticeMode({
  exercises,
  scope,
  onExit,
}: {
  exercises: Exercise[]
  scope: PracticeScope
  onExit: () => void
}) {
  const { t } = useLanguage()
  const queue = useMemo(() => {
    if (scope.kind === 'chapter') {
      return exercises.filter(
        (exercise) => exercise.chapterId === scope.chapterId,
      )
    }
    return exercises
  }, [exercises, scope])
  const [index, setIndex] = useState(0)
  const [answer, setAnswer] = useState('')
  const exercise = queue[index]
  const done = index >= queue.length
  const progress = done ? 100 : ((index + 1) / queue.length) * 100

  useEffect(() => {
    setIndex(0)
    setAnswer('')
  }, [scope])

  if (queue.length === 0) {
    return (
      <div className="yolo-learning-exercise-complete">
        <p className="yolo-learning-exercise-complete-title">
          {t(
            'learning.exercises.noPracticeExercises',
            'No exercises to practice yet',
          )}
        </p>
        <button
          type="button"
          onClick={onExit}
          className="yolo-learning-exercise-primary-button yolo-learning-exercise-complete-button"
        >
          {t('learning.cards.backToBrowse', 'Back to browse')}
        </button>
      </div>
    )
  }

  if (done) {
    return (
      <div className="yolo-learning-exercise-complete">
        <p className="yolo-learning-exercise-complete-title">
          {t('learning.exercises.practiceDone', 'Practice complete')}
        </p>
        <p className="yolo-learning-exercise-complete-meta">
          {formatLearningText(
            t(
              'learning.exercises.practiceDoneCount',
              'Completed {count} exercises',
            ),
            {
              count: queue.length,
            },
          )}
        </p>
        <button
          type="button"
          onClick={onExit}
          className="yolo-learning-exercise-primary-button yolo-learning-exercise-complete-button"
        >
          {t('learning.cards.backToBrowse', 'Back to browse')}
        </button>
      </div>
    )
  }

  return (
    <div className="yolo-learning-exercise-practice">
      <div className="yolo-learning-exercise-practice-topbar">
        <span className="yolo-learning-exercise-practice-count">
          {index + 1}{' '}
          <span className="yolo-learning-exercise-practice-count-total">
            / {queue.length}
          </span>
        </span>
        <div className="yolo-learning-exercise-practice-progress">
          <div
            className="yolo-learning-exercise-practice-progress-fill"
            style={{ width: `${progress}%` }}
          />
        </div>
        <button
          type="button"
          onClick={onExit}
          className="yolo-learning-exercise-exit-button"
        >
          <X size={15} /> {t('learning.exercises.exit', 'Exit')}
        </button>
      </div>

      <div className="yolo-learning-exercise-practice-content is-visible">
        <div className="yolo-learning-exercise-card yolo-learning-exercise-question-card">
          <div className="yolo-learning-exercise-question-point">
            {exercise.chapterTitle} · {exercise.pointTitle}
          </div>
          <pre className="yolo-learning-exercise-question yolo-learning-exercise-question-large">
            {exercise.question}
          </pre>
        </div>

        <div className="yolo-learning-exercise-card yolo-learning-exercise-answer-card">
          <textarea
            rows={6}
            value={answer}
            onChange={(event) => setAnswer(event.target.value)}
            className="yolo-learning-exercise-answer-input"
            placeholder={t(
              'learning.exercises.answerPlaceholder',
              'Type your answer here...',
            )}
          />
          <div className="yolo-learning-exercise-answer-footer">
            <span>
              {formatLearningText(
                t(
                  'learning.exercises.answerChars',
                  '{count} characters entered',
                ),
                {
                  count: answer.length,
                },
              )}
            </span>
          </div>
        </div>
      </div>

      <div className="yolo-learning-exercise-practice-bottombar">
        <div className={cx('yolo-learning-exercise-actions')}>
          <button
            type="button"
            onClick={() => {
              setIndex((current) => current + 1)
              setAnswer('')
            }}
            className="yolo-learning-exercise-primary-button yolo-learning-exercise-submit-button"
          >
            {t('learning.exercises.nextQuestion', 'Next question')}{' '}
            <ArrowRight size={15} />
          </button>
          <button
            type="button"
            onClick={() => setAnswer('')}
            className="yolo-learning-exercise-secondary-button"
          >
            <RotateCcw size={14} /> {t('learning.exercises.retry', 'Retry')}
          </button>
        </div>

        <div className="yolo-learning-exercise-shortcuts">
          {t(
            'learning.exercises.mvpNoEvaluation',
            'Automatic evaluation is not yet available in the MVP stage',
          )}
        </div>
      </div>
    </div>
  )
}
