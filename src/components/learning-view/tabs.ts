export const tabs = ['outline', 'knowledge-map', 'cards', 'exercises'] as const
export type TabKey = (typeof tabs)[number]
