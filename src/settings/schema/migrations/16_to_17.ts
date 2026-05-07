import { DEFAULT_ASSISTANT_ICON } from '../../../utils/assistant-icon'
import { SettingMigration } from '../setting.types'

export const migrateFrom16To17: SettingMigration['migrate'] = (data) => {
  const newData = { ...data }
  newData.version = 17

  // Add default icons to existing assistants
  if (Array.isArray(newData.assistants)) {
    newData.assistants = newData.assistants.map((assistant) => {
      if (!assistant || typeof assistant !== 'object') {
        return assistant
      }

      const assistantObj = assistant as Record<string, unknown>

      // If the assistant already has an icon, keep it unchanged
      if (assistantObj.icon) {
        return assistantObj
      }

      // Otherwise add the default icon
      return {
        ...assistantObj,
        icon: DEFAULT_ASSISTANT_ICON,
      }
    })
  }

  return newData
}
