export type LearningNavigationTarget =
  | { type: 'home' }
  | {
      type: 'project'
      projectId: string
      tab: 'cards'
      cardMode: 'study' | 'browse'
    }

export type LearningNavigationHandler = (
  target: LearningNavigationTarget,
) => void
