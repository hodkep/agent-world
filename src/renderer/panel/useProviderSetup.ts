import { useCallback, useEffect, useRef, useState } from 'react'
import type { ProviderId, ProviderInfo } from '../../shared/types'

/** How often the tools are looked for again while an installer or a sign-in terminal is open. */
export const WATCH_MS = 3000

const plain = (err: unknown) => (err instanceof Error ? err.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : String(err))

/**
 * The installer and the sign-in of a provider, each run in a terminal the person can see. While one is open the app looks again by itself
 * (the installer may be finished with its terminal still up), and the terminal goes away once its work shows: the tool is found, or it is ready.
 * Setup and Settings share this, so a card means the same wherever it is.
 */
export function useProviderSetup(providers: ProviderInfo[], onRescan: () => void | Promise<void>) {
  const [install, setInstall] = useState<{ provider: ProviderId; pty: string } | null>(null)
  const [installNote, setInstallNote] = useState<{ provider: ProviderId; text: string } | null>(null)
  const [signIn, setSignIn] = useState<{ provider: ProviderId; pty: string } | null>(null)
  const rescan = useRef(onRescan)
  rescan.current = onRescan
  const looking = useRef(false)
  const look = useCallback(async () => {
    if (looking.current) return
    looking.current = true
    try {
      await rescan.current()
    } finally {
      looking.current = false
    }
  }, [])

  const stopInstall = useCallback((pty: string) => (window.aw.closeShell(pty), setInstall(null)), [])
  const stopSignIn = useCallback((pty: string) => (window.aw.closeShell(pty), setSignIn(null)), [])

  const runInstall = async (p: ProviderInfo) => {
    setInstallNote(null)
    try {
      setInstall({ provider: p.id, pty: await window.aw.installProvider(p.id) })
    } catch (err) {
      setInstallNote({ provider: p.id, text: plain(err) })
    }
  }
  const openSignIn = async (provider: ProviderId) => {
    if (signIn) window.aw.closeShell(signIn.pty)
    setSignIn({ provider, pty: await window.aw.openSignIn(provider) })
  }
  const doneSigningIn = () => {
    if (signIn) stopSignIn(signIn.pty)
    void look()
  }

  // The terminal ended: look again; the card then says what was found, or that the tool is still not there.
  const installPty = install?.pty
  useEffect(() => {
    if (!install) return
    const { provider, pty } = install
    return window.aw.onPtyExit((id) => {
      if (id !== pty) return
      setInstall(null)
      void look().then(() => setInstallNote({ provider, text: '' }))
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [installPty])
  const signInPty = signIn?.pty
  useEffect(() => {
    if (!signIn) return
    const { pty } = signIn
    return window.aw.onPtyExit((id) => {
      if (id !== pty) return
      setSignIn(null)
      void look()
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signInPty])

  // While a terminal is open, look every few seconds.
  const open = !!install || !!signIn
  useEffect(() => {
    if (!open) return
    const t = setInterval(() => void look(), WATCH_MS)
    return () => clearInterval(t)
  }, [open, look])

  // What the looking found: an installer whose tool is now there is done, and so is a sign-in whose tool is ready.
  useEffect(() => {
    if (install && providers.find((p) => p.id === install.provider)?.detection.state !== 'not-installed') stopInstall(install.pty)
    if (signIn && providers.find((p) => p.id === signIn.provider)?.detection.state === 'ready') stopSignIn(signIn.pty)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [providers])

  return { install, installNote, signIn, runInstall, openSignIn, doneSigningIn }
}
