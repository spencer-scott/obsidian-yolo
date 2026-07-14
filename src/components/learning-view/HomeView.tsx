import * as Popover from '@radix-ui/react-popover'
import {
  ArrowRight,
  CheckCircle2,
  Clock,
  Import,
  PauseCircle,
  PlayCircle,
  Plus,
  RotateCcw,
  Sparkles,
  Target,
  Trash2,
} from 'lucide-react'
import { Notice, TFile, TFolder } from 'obsidian'
import {
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'

import { useApp } from '../../contexts/app-context'
import { useLanguage } from '../../contexts/language-context'
import { usePlugin } from '../../contexts/plugin-context'
import type {
  LearningProjectAction,
  LearningProjectStats,
} from '../../core/learning/learningStats'
import type { LearningStatsSnapshot } from '../../core/learning/learningStatsService'
import type {
  ProjectStatus,
  Project as VaultProject,
} from '../../core/learning/types'
import { YoloPopoverContent } from '../common/popover/YoloPopoverContent'
import { ConfirmModal } from '../modals/ConfirmModal'

import { formatLearningText } from './i18n'
import { Pill, ProgressBar, SelectMenu } from './primitives'

type ProjectSort = 'recent' | 'created' | 'progress'

export function HomeView({
  projects,
  statsSnapshot,
  onOpenProject,
  onStartReview,
  onNewProject,
  onImportAnki,
}: {
  projects: readonly VaultProject[]
  statsSnapshot: LearningStatsSnapshot
  onOpenProject: (id: string) => void
  onStartReview: (id: string) => void
  onNewProject: () => void
  onImportAnki: () => void
}) {
  const app = useApp()
  const plugin = usePlugin()
  const { language, t } = useLanguage()
  const [sortValue, setSortValue] = useState<ProjectSort>('recent')
  const [pendingProjectSlug, setPendingProjectSlug] = useState<string | null>(
    null,
  )
  const sortOptions = [
    { value: 'recent', label: t('learning.home.sortRecent', 'Most recent') },
    { value: 'created', label: t('learning.home.sortCreated', 'Created date') },
    { value: 'progress', label: t('learning.home.sortProgress', 'Progress') },
  ]
  const statsByProject = statsSnapshot.byProject
  const isProjectPaused = (project: VaultProject) =>
    statsByProject.get(project.id)?.paused ??
    statsSnapshot.pausedProjectIds.has(project.id)
  const statsReady = !statsSnapshot.loading
  const totalDueCards = statsReady
    ? projects.reduce(
        (total, project) =>
          total +
          (isProjectPaused(project)
            ? 0
            : (statsByProject.get(project.id)?.dueCards ?? 0)),
        0,
      )
    : null
  const recentlyActiveProjects = useMemo(
    () =>
      projects
        .filter((project) => statsByProject.has(project.id))
        .map((project, index) => ({ project, index }))
        .sort((left, right) => {
          const leftActive =
            statsByProject.get(left.project.id)?.lastActiveAt ?? 0
          const rightActive =
            statsByProject.get(right.project.id)?.lastActiveAt ?? 0
          return rightActive - leftActive || left.index - right.index
        })
        .map(({ project }) => project),
    [projects, statsByProject],
  )
  const activeProjects = recentlyActiveProjects.filter(
    (project) => !isProjectPaused(project),
  )
  const recentProject = activeProjects[0]
  const recentStats = recentProject
    ? statsByProject.get(recentProject.id)
    : undefined
  const dueProjects = activeProjects.filter(
    (project) => (statsByProject.get(project.id)?.dueCards ?? 0) > 0,
  )
  const firstDueProject = dueProjects[0]
  const sortedProjects = useMemo(() => {
    return projects
      .map((project, index) => ({ project, index }))
      .sort((left, right) => {
        const leftStats = statsByProject.get(left.project.id)
        const rightStats = statsByProject.get(right.project.id)
        const leftValue = resolveSortValue(sortValue, leftStats)
        const rightValue = resolveSortValue(sortValue, rightStats)
        return rightValue - leftValue || left.index - right.index
      })
      .map(({ project }) => project)
  }, [projects, sortValue, statsByProject])

  const setProjectPaused = async (project: VaultProject, paused: boolean) => {
    setPendingProjectSlug(project.slug)
    try {
      const store = plugin.getLearningSrsStore()
      if (paused) await store.pauseProject(project.slug, new Date())
      else await store.resumeProject(project.slug, new Date())
      new Notice(
        paused
          ? t('learning.home.pauseSuccess', 'Learning plan paused')
          : t('learning.home.resumeSuccess', 'Learning plan resumed'),
      )
    } catch (error) {
      console.error(
        '[YOLO] Failed to update learning project pause state:',
        error,
      )
      new Notice(
        paused
          ? t(
              'learning.home.pauseFailed',
              'Could not pause the learning plan. Try again.',
            )
          : t(
              'learning.home.resumeFailed',
              'Could not resume the learning plan. Try again.',
            ),
      )
    } finally {
      setPendingProjectSlug(null)
    }
  }

  const deleteProject = async (project: VaultProject, wasPaused: boolean) => {
    setPendingProjectSlug(project.slug)
    let projectTrashed = false
    try {
      const folder = app.vault.getAbstractFileByPath(project.folderPath)
      if (!(folder instanceof TFolder)) {
        throw new Error(
          `Learning project folder not found: ${project.folderPath}`,
        )
      }
      const store = plugin.getLearningSrsStore()
      await store.pauseProject(project.slug, new Date())
      const statePath = await store.getProjectStateFilePath(project.slug)
      const stateFile = app.vault.getAbstractFileByPath(statePath)
      const stateExists = await app.vault.adapter.exists(statePath)
      await store.runExclusive(async () => {
        await app.fileManager.trashFile(folder)
        projectTrashed = true
        if (stateFile instanceof TFile)
          await app.fileManager.trashFile(stateFile)
        else if (stateExists) {
          const trashed = await app.vault.adapter.trashSystem(statePath)
          if (!trashed) await app.vault.adapter.trashLocal(statePath)
        }
      })
      new Notice(
        t('learning.home.deleteSuccess', 'Learning plan moved to the trash'),
      )
    } catch (error) {
      console.error('[YOLO] Failed to delete learning project:', error)
      if (!projectTrashed && !wasPaused) {
        try {
          await plugin
            .getLearningSrsStore()
            .resumeProject(project.slug, new Date())
        } catch (resumeError) {
          console.error(
            '[YOLO] Failed to restore learning project pause state after delete failure:',
            resumeError,
          )
        }
      }
      new Notice(
        projectTrashed
          ? t(
              'learning.home.deleteStateFailed',
              'The learning plan was moved to the trash, but its review data could not be removed',
            )
          : t(
              'learning.home.deleteFailed',
              'Could not delete the learning plan. Try again.',
            ),
      )
    } finally {
      setPendingProjectSlug(null)
    }
  }

  const confirmDeleteProject = (project: VaultProject) => {
    new ConfirmModal(app, {
      title: t('learning.home.deleteConfirmTitle', 'Delete learning plan'),
      message: formatLearningText(
        t(
          'learning.home.deleteConfirmMessage',
          'Move “{project}” and all of its review data to the trash?',
        ),
        { project: project.topic },
      ),
      ctaText: t('learning.home.deleteProject', 'Delete'),
      onConfirm: () => void deleteProject(project, isProjectPaused(project)),
    }).open()
  }

  return (
    <div className="yolo-learning-home">
      <header className="yolo-learning-home-header">
        <div className="yolo-learning-home-heading">
          <div className="yolo-learning-home-greeting">
            <Sparkles size={16} aria-hidden />
            {resolveGreeting(new Date().getHours(), t)}
          </div>
          <h1 className="yolo-learning-home-title">
            {t('learning.home.title', 'Learning Center')}
          </h1>
          <p className="yolo-learning-home-subtitle">
            {formatLearningText(
              t(
                'learning.home.summary',
                'You have {projects} learning projects and {due} cards due today.',
              ),
              {
                projects: projects.length,
                due: totalDueCards ?? '—',
              },
            )}
          </p>
        </div>
        <div className="yolo-learning-home-create-actions">
          <button
            type="button"
            onClick={onImportAnki}
            className="yolo-learning-home-import-button"
            title={t('learning.anki.entry', 'Import from Anki')}
            aria-label={t('learning.anki.entry', 'Import from Anki')}
          >
            <Import size={16} aria-hidden />
          </button>
          <button
            type="button"
            onClick={onNewProject}
            className="yolo-learning-home-new-button"
          >
            <Plus size={16} aria-hidden />
            {t('learning.home.createPlan', 'Create learning plan')}
          </button>
        </div>
      </header>

      <div className="yolo-learning-home-focus-grid">
        <section className="yolo-learning-home-focus-card">
          <div className="yolo-learning-home-card-heading">
            <span className="yolo-learning-home-card-title">
              <PlayCircle size={17} aria-hidden />
              {t('learning.home.continueLearning', 'Continue learning')}
            </span>
            {recentProject && (
              <Pill tone="primary" className="yolo-learning-home-status-pill">
                {projectStatusLabel(recentProject.status, t)}
              </Pill>
            )}
          </div>

          {recentProject && recentStats ? (
            <div className="yolo-learning-home-focus-body">
              <div className="yolo-learning-home-focus-project">
                <div className="yolo-learning-home-focus-identity">
                  <h2>{recentProject.topic}</h2>
                  <p>{recentProject.goal}</p>
                </div>
              </div>

              <div className="yolo-learning-home-focus-progress">
                <ProgressBar value={recentStats.targetCardProgress} />
                <span>{recentStats.targetCardProgress}%</span>
              </div>

              <div className="yolo-learning-home-focus-action">
                <div className="yolo-learning-home-focus-action-copy">
                  <span>{t('learning.home.todayPlan', "Today's plan")}</span>
                  <strong>
                    {recentStats.nextAction
                      ? formatProjectActionTitle(recentStats.nextAction, t)
                      : t(
                          'learning.home.openProject',
                          'Open the project and continue learning',
                        )}
                  </strong>
                </div>
                <button
                  type="button"
                  className="yolo-learning-home-continue-button"
                  onClick={() =>
                    recentStats.dueCards > 0
                      ? onStartReview(recentProject.id)
                      : onOpenProject(recentProject.id)
                  }
                >
                  {t('learning.home.continue', 'Continue')}
                  <ArrowRight size={16} aria-hidden />
                </button>
              </div>

              <div className="yolo-learning-home-mini-stats">
                <MiniStat
                  icon={<CheckCircle2 aria-hidden />}
                  value={`${recentStats.targetCards}/${recentStats.totalCards}`}
                  label={t('learning.home.targetCards', 'Cards on target')}
                  tone="success"
                />
                <MiniStat
                  icon={<Target aria-hidden />}
                  value={`${recentStats.estimatedRetention}%`}
                  label={t(
                    'learning.home.retention30Days',
                    '30-day estimated retention',
                  )}
                  tone="warning"
                />
                <MiniStat
                  icon={<RotateCcw aria-hidden />}
                  value={recentStats.dueCards}
                  label={t('learning.home.cardsDue', 'Cards due')}
                  tone="primary"
                />
              </div>
            </div>
          ) : (
            <FocusEmpty
              loading={statsSnapshot.loading && projects.length > 0}
              hasProjects={projects.length > 0}
              allPaused={
                statsReady && projects.length > 0 && activeProjects.length === 0
              }
              onNewProject={onNewProject}
              t={t}
            />
          )}
        </section>

        <section className="yolo-learning-home-due-card">
          <div className="yolo-learning-home-card-heading">
            <span className="yolo-learning-home-card-title">
              <RotateCcw size={17} aria-hidden />
              {t('learning.home.todayReview', 'Due today')}
            </span>
            <Pill
              tone={totalDueCards && totalDueCards > 0 ? 'warning' : 'neutral'}
              className="yolo-learning-home-due-count"
            >
              {formatLearningText(t('learning.home.items', '{count} cards'), {
                count: totalDueCards ?? '—',
              })}
            </Pill>
          </div>

          <div className="yolo-learning-home-due-list">
            {dueProjects.slice(0, 3).map((project) => {
              const stats = statsByProject.get(project.id)
              if (!stats) return null
              return (
                <button
                  type="button"
                  key={project.id}
                  className="yolo-learning-home-due-row"
                  onClick={() => onStartReview(project.id)}
                >
                  <span className="yolo-learning-home-due-project">
                    <strong>{project.topic}</strong>
                    <span>{project.goal}</span>
                  </span>
                  <Pill tone="neutral">{stats.dueCards}</Pill>
                </button>
              )
            })}
            {dueProjects.length === 0 && (
              <div className="yolo-learning-home-due-empty">
                {statsSnapshot.loading
                  ? t('learning.home.statsLoading', 'Updating learning data')
                  : t('learning.home.reviewMetaEmpty', 'No reviews due')}
              </div>
            )}
          </div>

          <div className="yolo-learning-home-due-footer">
            <button
              type="button"
              className="yolo-learning-home-start-review"
              disabled={statsSnapshot.loading || !firstDueProject}
              onClick={() => {
                if (firstDueProject) onStartReview(firstDueProject.id)
              }}
            >
              {t('learning.home.startReview', "Start today's review")}
            </button>
            {statsSnapshot.failedProjectIds.size > 0 && (
              <div className="yolo-learning-home-stats-error">
                {formatLearningText(
                  t(
                    'learning.home.statsUnavailable',
                    'Statistics unavailable for {count} projects',
                  ),
                  { count: statsSnapshot.failedProjectIds.size },
                )}
              </div>
            )}
          </div>
        </section>
      </div>

      <section className="yolo-learning-home-projects">
        <div className="yolo-learning-home-section-bar">
          <h2 className="yolo-learning-home-section-title">
            {t('learning.home.learningPlans', 'Learning plans')}{' '}
            <span>({projects.length})</span>
          </h2>
          <SelectMenu
            value={sortValue}
            options={sortOptions}
            onChange={(value) => setSortValue(value as ProjectSort)}
          />
        </div>

        <div className="yolo-learning-home-project-grid">
          {sortedProjects.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              onClick={() => onOpenProject(project.id)}
              onPause={() => void setProjectPaused(project, true)}
              onResume={() => void setProjectPaused(project, false)}
              onDelete={() => confirmDeleteProject(project)}
              pending={pendingProjectSlug === project.slug}
              paused={isProjectPaused(project)}
              stats={statsByProject.get(project.id)}
              language={language}
              t={t}
            />
          ))}
          <button
            type="button"
            onClick={onNewProject}
            className="yolo-learning-home-add-card"
          >
            <span className="yolo-learning-home-add-icon">
              <Plus size={20} aria-hidden />
            </span>
            <span className="yolo-learning-home-add-copy">
              <strong>
                {t('learning.home.newLearningProject', 'New learning project')}
              </strong>
              <span>
                {t(
                  'learning.home.newProjectHint',
                  'Tell YOLO what you want to learn and generate an outline',
                )}
              </span>
            </span>
          </button>
        </div>
      </section>
    </div>
  )
}

function MiniStat({
  icon,
  value,
  label,
  tone,
}: {
  icon: React.ReactNode
  value: React.ReactNode
  label: string
  tone: 'primary' | 'success' | 'warning'
}) {
  return (
    <div className={`yolo-learning-home-mini-stat is-${tone}`}>
      <span className="yolo-learning-home-mini-stat-icon">{icon}</span>
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  )
}

function FocusEmpty({
  loading,
  hasProjects,
  allPaused,
  onNewProject,
  t,
}: {
  loading: boolean
  hasProjects: boolean
  allPaused: boolean
  onNewProject: () => void
  t: (keyPath: string, fallback?: string) => string
}) {
  return (
    <div className="yolo-learning-home-focus-empty">
      <span>
        {loading
          ? t('learning.home.statsLoading', 'Updating learning data')
          : allPaused
            ? t(
                'learning.home.allProjectsPaused',
                'All learning plans are paused',
              )
            : hasProjects
              ? t(
                  'learning.home.statsUnavailableEmpty',
                  'Project statistics are temporarily unavailable',
                )
              : t('learning.home.noProjects', 'No learning plans yet')}
      </span>
      {!hasProjects && !loading && (
        <button type="button" onClick={onNewProject}>
          {t(
            'learning.home.createFirstPlan',
            'Create your first learning plan',
          )}
        </button>
      )}
    </div>
  )
}

function ProjectCard({
  project,
  onClick,
  onPause,
  onResume,
  onDelete,
  pending,
  paused,
  stats,
  language,
  t,
}: {
  project: VaultProject
  onClick: () => void
  onPause: () => void
  onResume: () => void
  onDelete: () => void
  pending: boolean
  paused: boolean
  stats?: LearningProjectStats
  language: 'en' | 'it' | 'zh'
  t: (keyPath: string, fallback?: string) => string
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const cardRef = useRef<HTMLButtonElement>(null)
  const menuAnchorRef = useRef({
    getBoundingClientRect: () => DOMRect.fromRect(),
  })
  const pressTimerRef = useRef<number | null>(null)
  const pressStartRef = useRef<{ x: number; y: number } | null>(null)
  const suppressClickRef = useRef(false)
  const suppressClickTimerRef = useRef<number | null>(null)
  const suppressContextMenuUntilRef = useRef(0)
  const clearPress = useCallback(() => {
    if (pressTimerRef.current !== null) {
      window.clearTimeout(pressTimerRef.current)
      pressTimerRef.current = null
    }
    pressStartRef.current = null
  }, [])

  const openMenuAt = useCallback((x: number, y: number) => {
    menuAnchorRef.current = {
      getBoundingClientRect: () => DOMRect.fromRect({ x, y }),
    }
    setMenuOpen(true)
  }, [])

  useEffect(() => {
    const scroller = cardRef.current?.closest('.yolo-learning-page.is-home')
    scroller?.addEventListener('scroll', clearPress, { passive: true })
    return () => {
      clearPress()
      scroller?.removeEventListener('scroll', clearPress)
      if (suppressClickTimerRef.current !== null) {
        window.clearTimeout(suppressClickTimerRef.current)
      }
    }
  }, [clearPress])

  const suppressNextClick = () => {
    suppressClickRef.current = true
    if (suppressClickTimerRef.current !== null) {
      window.clearTimeout(suppressClickTimerRef.current)
    }
    suppressClickTimerRef.current = window.setTimeout(() => {
      suppressClickRef.current = false
      suppressClickTimerRef.current = null
    }, 800)
  }

  const handlePointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (
      event.pointerType !== 'touch' ||
      !event.isPrimary ||
      event.button !== 0
    ) {
      return
    }
    clearPress()
    pressStartRef.current = { x: event.clientX, y: event.clientY }
    pressTimerRef.current = window.setTimeout(() => {
      const start = pressStartRef.current
      pressTimerRef.current = null
      pressStartRef.current = null
      if (!start) return
      suppressNextClick()
      suppressContextMenuUntilRef.current = Date.now() + 1_000
      openMenuAt(start.x, start.y)
    }, 420)
  }

  const handlePointerMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const start = pressStartRef.current
    if (!start) return
    if (
      Math.abs(event.clientX - start.x) > 8 ||
      Math.abs(event.clientY - start.y) > 8
    ) {
      clearPress()
    }
  }

  const handleContextMenu = (event: ReactMouseEvent<HTMLButtonElement>) => {
    event.preventDefault()
    if (Date.now() < suppressContextMenuUntilRef.current) return
    const rect = event.currentTarget.getBoundingClientRect()
    const keyboardTriggered = event.clientX === 0 && event.clientY === 0
    openMenuAt(
      keyboardTriggered ? rect.left + 16 : event.clientX,
      keyboardTriggered ? rect.top + 16 : event.clientY,
    )
  }

  const runMenuAction = (action: () => void) => {
    setMenuOpen(false)
    action()
  }

  return (
    <Popover.Root open={menuOpen} onOpenChange={setMenuOpen}>
      <Popover.Anchor virtualRef={menuAnchorRef} />
      <button
        ref={cardRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        onClick={(event) => {
          if (suppressClickRef.current) {
            event.preventDefault()
            event.stopPropagation()
            suppressClickRef.current = false
            return
          }
          onClick()
        }}
        onContextMenu={handleContextMenu}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={clearPress}
        onPointerCancel={clearPress}
        className={`yolo-learning-home-project-card${paused ? ' is-paused' : ''}`}
      >
        <div className="yolo-learning-home-project-header">
          <div className="yolo-learning-home-project-identity">
            <h3>{project.topic}</h3>
            <p>{project.goal}</p>
          </div>
          <Pill tone={paused ? 'neutral' : 'primary'}>
            {paused
              ? t('learning.home.statusPaused', 'Paused')
              : projectStatusLabel(project.status, t)}
          </Pill>
        </div>

        <div className="yolo-learning-home-project-progress">
          <ProgressBar value={stats?.targetCardProgress ?? 0} />
          <span>{stats ? `${stats.targetCardProgress}%` : '—'}</span>
        </div>

        {stats?.nextAction && <ProjectAction action={stats.nextAction} t={t} />}

        <div className="yolo-learning-home-project-meta">
          <span>
            <CheckCircle2 aria-hidden />
            {stats
              ? formatLearningText(
                  t(
                    'learning.home.targetCount',
                    '{completed}/{total} on target',
                  ),
                  {
                    completed: stats.targetCards,
                    total: stats.totalCards,
                  },
                )
              : '—'}
          </span>
          <span>
            <RotateCcw aria-hidden />
            {stats
              ? formatLearningText(t('learning.home.dueCount', '{count} due'), {
                  count: stats.dueCards,
                })
              : '—'}
          </span>
          <span>
            <Clock aria-hidden />
            {stats
              ? formatRelativeTime(stats.lastActiveAt, language)
              : t('learning.home.statsLoadingShort', 'Updating')}
          </span>
        </div>
      </button>
      <YoloPopoverContent
        anchorRef={cardRef}
        variant="default"
        minWidth={172}
        maxWidth={232}
        sideOffset={4}
        align="start"
        collisionPadding={10}
        className="yolo-learning-project-menu"
        onCloseAutoFocus={(event) => event.preventDefault()}
      >
        <div className="yolo-learning-project-menu-list" role="menu">
          {paused ? (
            <button
              type="button"
              role="menuitem"
              className="yolo-learning-project-menu-item"
              disabled={pending}
              onClick={() => runMenuAction(onResume)}
            >
              <PlayCircle size={15} aria-hidden />
              <span>{t('learning.home.resumeProject', 'Resume learning')}</span>
            </button>
          ) : (
            <button
              type="button"
              role="menuitem"
              className="yolo-learning-project-menu-item"
              disabled={pending}
              onClick={() => runMenuAction(onPause)}
            >
              <PauseCircle size={15} aria-hidden />
              <span>{t('learning.home.pauseProject', 'Pause learning')}</span>
            </button>
          )}
          <button
            type="button"
            role="menuitem"
            className="yolo-learning-project-menu-item is-danger"
            disabled={pending}
            onClick={() => runMenuAction(onDelete)}
          >
            <Trash2 size={15} aria-hidden />
            <span>{t('learning.home.deleteProject', 'Delete')}</span>
          </button>
        </div>
      </YoloPopoverContent>
    </Popover.Root>
  )
}

function ProjectAction({
  action,
  t,
}: {
  action: LearningProjectAction
  t: (keyPath: string, fallback?: string) => string
}) {
  return (
    <div className="yolo-learning-home-project-action">
      <span className="yolo-learning-home-project-action-label">
        {action.kind === 'review'
          ? t('learning.home.priorityReview', 'Priority review')
          : t('learning.home.nextLearning', 'Next to learn')}
      </span>
      <strong>{formatProjectActionTitle(action, t)}</strong>
    </div>
  )
}

function resolveSortValue(
  sort: ProjectSort,
  stats: LearningProjectStats | undefined,
) {
  if (!stats) return Number.NEGATIVE_INFINITY
  if (sort === 'created') return stats.createdAt
  if (sort === 'progress') return stats.targetCardProgress
  return stats.lastActiveAt
}

function resolveGreeting(
  hour: number,
  t: (keyPath: string, fallback?: string) => string,
) {
  const suffix = t(
    'learning.home.greetingSuffix',
    'What would you like to learn?',
  )
  const greeting =
    hour < 12
      ? t('learning.home.greetingMorning', 'Good morning')
      : hour < 18
        ? t('learning.home.greetingAfternoon', 'Good afternoon')
        : t('learning.home.greetingEvening', 'Good evening')
  return `${greeting}, ${suffix}`
}

function projectStatusLabel(
  status: ProjectStatus,
  t: (keyPath: string, fallback?: string) => string,
) {
  if (status === 'studying')
    return t('learning.home.statusStudying', 'Learning')
  if (status === 'building')
    return t('learning.home.statusBuilding', 'Generating')
  return t('learning.home.statusOutlining', 'Planning')
}

function formatProjectActionTitle(
  action: LearningProjectAction,
  t: (keyPath: string, fallback?: string) => string,
) {
  const template =
    action.kind === 'review'
      ? t('learning.home.reviewKnowledgePoint', 'Review “{point}”')
      : action.started
        ? t('learning.home.continueKnowledgePoint', 'Continue “{point}”')
        : t('learning.home.startKnowledgePoint', 'Start “{point}”')
  return formatLearningText(template, { point: action.knowledgePointTitle })
}

function formatRelativeTime(timestamp: number, language: 'en' | 'it' | 'zh') {
  if (timestamp <= 0) return '—'
  const locale =
    language === 'zh' ? 'zh-CN' : language === 'it' ? 'it-IT' : 'en-US'
  const elapsed = Date.now() - timestamp
  const formatter = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' })
  const minute = 60_000
  const hour = 60 * minute
  const day = 24 * hour

  if (elapsed < minute) return formatter.format(0, 'minute')
  if (elapsed < hour)
    return formatter.format(-Math.floor(elapsed / minute), 'minute')
  if (elapsed < day)
    return formatter.format(-Math.floor(elapsed / hour), 'hour')
  if (elapsed < 7 * day)
    return formatter.format(-Math.floor(elapsed / day), 'day')
  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(timestamp)
}
