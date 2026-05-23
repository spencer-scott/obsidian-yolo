import { App } from 'obsidian'
import React from 'react'

import YoloPlugin from '../../../main'
import { AgentSection } from '../sections/AgentSection'

type AgentTabProps = {
  app: App
  plugin: YoloPlugin
}

export function AgentTab({ app }: AgentTabProps) {
  return <AgentSection app={app} />
}
