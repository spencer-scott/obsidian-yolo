import { ChevronLeft } from 'lucide-react'
import { type ReactNode, useCallback, useEffect, useState } from 'react'

import { useLanguage } from '../../contexts/language-context'
import type { Project as VaultProject } from '../../core/learning/types'

import { type CardMode, CardsView, cardModes } from './CardsView'
import type { CardGenerationWorkspace } from './cardsWorkspace'
import { ExercisesView } from './ExercisesView'
import { OutlineView } from './OutlineView'
import { Pill, Segmented } from './primitives'
import { type TabKey, tabs } from './tabs'

export function Workspace({
  project,
  onBack,
  activeTab,
  onTabChange,
  selectedPointId,
  onSelectPoint,
  knowledgeMap,
  cardGeneration,
  cardMode,
  onCardModeChange,
  projectPaused,
}: {
  project: VaultProject | null
  onBack: () => void
  activeTab: TabKey
  onTabChange: (t: TabKey) => void
  selectedPointId: string | null
  onSelectPoint: (id: string) => void
  knowledgeMap: ReactNode
  cardGeneration: CardGenerationWorkspace | null
  cardMode: CardMode
  onCardModeChange: (mode: CardMode) => void
  projectPaused: boolean
}) {
  const { t } = useLanguage()
  const [studyCardCount, setStudyCardCount] = useState(0)
  const handleStudyCardCountChange = useCallback(
    (count: number) => setStudyCardCount(count),
    [],
  )
  const tabLabels: Record<TabKey, string> = {
    outline: t('learning.tabs.outline', 'Outline'),
    'knowledge-map': t('learning.tabs.knowledgeMap', 'Knowledge map'),
    cards: t('learning.tabs.cards', 'Cards'),
    exercises: t('learning.tabs.exercises', 'Exercises'),
  }
  const cardModeLabels: Record<CardMode, string> = {
    study: t('learning.cards.study', 'Learn'),
    browse: t('learning.common.browse', 'Browse'),
  }
  const visibleTabs = project?.kind === 'cards' ? (['cards'] as const) : tabs

  useEffect(() => {
    if (projectPaused && cardMode === 'study') onCardModeChange('browse')
  }, [cardMode, onCardModeChange, projectPaused])

  return (
    <div className="yolo-learning-workspace-shell">
      <header className="yolo-learning-workspace-header">
        <button
          type="button"
          onClick={onBack}
          aria-label={t(
            'learning.workspace.backToHome',
            'Back to learning center',
          )}
          className="yolo-learning-workspace-back"
        >
          <ChevronLeft size={18} strokeWidth={2} />
        </button>
        <div className="yolo-learning-workspace-divider" />
        <h1 className="yolo-learning-workspace-project-name">
          {project?.topic ??
            t('learning.workspace.missingProject', 'Project not found')}
        </h1>
        <Pill
          tone={projectPaused ? 'neutral' : 'primary'}
          className="yolo-learning-workspace-progress-pill"
        >
          {projectPaused
            ? t('learning.home.statusPaused', 'Paused')
            : `${t('learning.workspace.learned', 'Learned')} 0%`}
        </Pill>
        {activeTab === 'cards' && (
          <Segmented<CardMode>
            options={cardModes}
            value={cardMode}
            onChange={onCardModeChange}
            disabledOptions={projectPaused ? ['study'] : undefined}
            badges={{ study: studyCardCount }}
            getLabel={(mode) => cardModeLabels[mode]}
            className="yolo-learning-workspace-card-mode"
          />
        )}
        <div className="yolo-learning-workspace-header-spacer" />
        <Segmented
          options={visibleTabs}
          value={activeTab}
          onChange={onTabChange}
          disabledOptions={['exercises']}
          getLabel={(tab) => (
            <>
              {tabLabels[tab]}
              {tab === 'exercises' && (
                <span className="yolo-learning-workspace-coming-soon">
                  {t('learning.common.comingSoon', 'Coming soon')}
                </span>
              )}
            </>
          )}
        />
      </header>
      <main
        className={`yolo-learning-workspace-main ${activeTab === 'outline' ? 'is-outline yolo-learning-scrollbar-thin' : ''}`}
      >
        {activeTab === 'outline' &&
          (project?.kind === 'outline' ? (
            <OutlineView
              project={project}
              selectedPointId={selectedPointId}
              onSelectPoint={onSelectPoint}
            />
          ) : (
            <div className="yolo-learning-outline-empty">
              {t(
                'learning.workspace.projectNotFound',
                'The project does not exist or has not finished scanning',
              )}
            </div>
          ))}
        {activeTab === 'knowledge-map' &&
          project?.kind === 'outline' &&
          knowledgeMap}
        {activeTab === 'cards' && (
          <CardsView
            project={project}
            generation={cardGeneration}
            mode={cardMode}
            onModeChange={onCardModeChange}
            onStudyCountChange={handleStudyCardCountChange}
            projectPaused={projectPaused}
          />
        )}
        {activeTab === 'exercises' && <ExercisesView project={project} />}
      </main>
    </div>
  )
}
