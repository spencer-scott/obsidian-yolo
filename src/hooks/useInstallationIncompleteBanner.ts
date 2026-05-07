import { useEffect, useState } from 'react'

import { usePlugin } from '../contexts/plugin-context'

export function useInstallationIncompleteBanner(): {
  detail: {
    bakedVersion: string
    manifestVersion: string
  } | null
  dismissed: boolean
  dismiss: () => void
} {
  const plugin = usePlugin()
  const [detail, setDetail] = useState(
    () => plugin.installationIncompleteDetail,
  )
  const [dismissed, setDismissed] = useState(() =>
    plugin.isInstallationIncompleteBannerDismissed(),
  )

  useEffect(() => {
    const sync = () => {
      setDetail(plugin.installationIncompleteDetail)
      setDismissed(plugin.isInstallationIncompleteBannerDismissed())
    }
    // Align timing with onload notify: sync once first to avoid the subscription being later than notify, which would cause the banner to never show
    sync()
    return plugin.addInstallationIncompleteListener(sync)
  }, [plugin])

  return {
    detail,
    dismissed,
    dismiss: () => {
      plugin.dismissInstallationIncompleteBanner()
    },
  }
}
