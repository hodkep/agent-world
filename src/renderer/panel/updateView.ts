import type { InstallState } from '../../shared/updateInstall'
import type { UpdateInfo } from './UpdateChip'

export type UpdateAction = { id: 'download' | 'cancel' | 'install' | 'later' | 'retry' | 'page' | 'changes' | 'finder' | 'log'; label: string; primary?: boolean }

/** What the popover under the chip, and the Updates page of Settings, show for a newer version: all of it said here, so the two cannot differ. */
export interface UpdateView {
  /** The chip's text: the new version, or how far the download is. */
  chip: string
  title: string
  body?: string
  progress?: { fraction: number; label: string; ok?: boolean }
  ticks?: string[]
  /** What the new version holds (the release's own text), shown before it is downloaded or installed. */
  notes?: string
  warning?: string
  error?: string
  actions: UpdateAction[]
}

const mb = (bytes: number) => Math.round(bytes / (1024 * 1024))
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/** The note about agents that a restart puts to sleep: those at work, and those waiting for an answer. */
function asleep(a: { working: number; waiting: number }): string | undefined {
  const n = a.working + a.waiting
  if (n === 0) return undefined
  const what =
    a.working > 0 && a.waiting > 0
      ? `${plural(a.working, 'agent is', 'agents are')} working and ${a.waiting} ${a.waiting === 1 ? 'is' : 'are'} waiting for your answer.`
      : a.working > 0
        ? `${plural(a.working, 'agent is', 'agents are')} working.`
        : `${plural(a.waiting, 'agent is', 'agents are')} waiting for your answer.`
  return `${what} ${n === 1 ? 'It' : 'They'} will be asleep after the restart; wake ${n === 1 ? 'it' : 'them'} to resume.`
}

/** What going to an older release costs: the line under its title. */
const GOING_BACK = 'Going back replaces the beta you have; settings made in the beta may not be read by the stable version.'
const SWITCHING = 'Switching replaces the version you have with an older one; settings made in it may not be read by this one.'
/** Where the file came from, when a mirror was in play: said after the number or after "Downloaded". */
const fromWhere = (i: { source?: 'mirror' | 'github'; fellBack?: boolean }, lead: string) => (i.source === 'mirror' ? `${lead}from the mirror` : i.fellBack ? `${lead}from GitHub, the mirror did not answer` : '')
const isBeta = (v?: string) => /-beta\.\d+$/.test(v ?? '')
const PAGE: UpdateAction = { id: 'page', label: 'Open the release page' }

/** Null when there is nothing to show: no newer version, or a build that cannot be told about one. */
export function updateView(info: UpdateInfo, agents: { working: number; waiting: number }): UpdateView | null {
  if (info.state !== 'available' || !info.latest) return null
  const latest = info.latest
  const chip = `↑ ${latest}`
  const install: InstallState | undefined = info.install
  const older = info.rel === 'older'
  // An older stable, from a beta, is a way back; any other older release is a switch.
  const toStable = older && info.channel !== 'beta' && isBeta(info.current)
  const caution = older ? (toStable ? GOING_BACK : SWITCHING) : undefined
  const offer = (): UpdateView => ({
    chip,
    title: older ? (toStable ? `Back to stable ${latest}` : `Switch to ${latest}, older than your version`) : `Agent World ${latest} is available`,
    ...(caution && { warning: caution }),
    body: `${info.current ? `You have ${info.current}. ` : ''}It is downloaded from this project's mirror or its GitHub release and checked before it is used.${info.channel === 'beta' && !isBeta(info.current) ? ' Installing a beta replaces the stable app you have.' : ''}${info.homebrew && info.channel !== 'beta' ? ` Homebrew installed this copy; its record of the version may still say ${info.current ?? 'the old one'} afterwards, which does no harm.` : ''}`,
    ...(info.notes && { notes: info.notes }),
    actions: info.tag ? [{ id: 'download', label: older ? (toStable ? `Back to stable ${latest}` : `Switch to ${latest}`) : 'Download', primary: true }, { id: 'changes', label: 'What changed' }] : [{ ...PAGE, primary: true }]
  })
  if (!install || install.phase === 'idle') return offer()
  switch (install.phase) {
    case 'downloading':
      return { chip: `↓ ${Math.round((install.received / install.total) * 100)}%`, title: `Downloading ${install.version}`, progress: { fraction: install.received / install.total, label: `${mb(install.received)} of ${mb(install.total)} MB${fromWhere(install, ', ')}` }, ...(info.notes && { notes: info.notes }), actions: [{ id: 'cancel', label: 'Cancel' }] }
    case 'ready':
      return {
        chip,
        title: `${install.version} is ready to install`,
        progress: { fraction: 1, label: '', ok: true },
        ticks: [`Downloaded${fromWhere(install, ' ')}`, "Checksum matches the release's"],
        ...(info.notes && { notes: info.notes }),
        body: 'Agent World closes, puts the new version in place of this one, and opens again. It takes a few seconds.',
        warning: [caution, asleep(agents)].filter(Boolean).join(' ') || undefined,
        actions: [{ id: 'install', label: 'Install and restart', primary: true }, { id: 'later', label: 'Later' }]
      }
    case 'installing':
      return { chip, title: `Installing ${install.version}…`, body: 'If something goes wrong the old version is put back and opened, with the reason.', ...(info.notes && { notes: info.notes }), actions: [] }
    case 'failed': {
      const v = install.version ?? latest
      const again = (label: string): UpdateAction[] => [{ id: 'retry', label, primary: true }, PAGE]
      switch (install.kind) {
        case 'cancelled':
          return offer()
        case 'network':
          return { chip, title: `Could not download ${v}`, error: install.reason, actions: again('Try again') }
        case 'checksum':
        case 'size':
        case 'host':
          return { chip, title: 'The download was not used', error: `${install.reason} Nothing was installed. Try again; if it happens twice, download it from the release page.`, actions: again('Download again') }
        case 'blocked':
          return { chip, title: `${v} is downloaded, but cannot be installed from here`, error: install.reason, actions: install.file ? [{ id: 'finder', label: 'Show in Finder', primary: true }, PAGE] : [{ ...PAGE, primary: true }] }
        case 'install':
          return { chip, title: 'The update was not installed', error: install.reason, actions: [{ ...PAGE, primary: true }, { id: 'log', label: 'Show the log' }] }
        default:
          return { chip, title: 'Could not use this release', error: install.reason, actions: [{ ...PAGE, primary: true }] }
      }
    }
  }
}

/**
 * The Check now button of Settings > Updates. Once a download has started (or finished, until the app restarts) it is greyed with the reason rather than gone,
 * because pressing it would look again and start the same download over.
 */
export function checkNowButton(info: UpdateInfo): { label: string; disabled: boolean; reason?: string } {
  const install = info.install
  if (install?.phase === 'downloading') return { label: 'Check now', disabled: true, reason: 'A download is under way.' }
  if (install?.phase === 'ready') return { label: 'Check now', disabled: true, reason: `${install.version} is downloaded; restart to install it.` }
  if (install?.phase === 'installing') return { label: 'Check now', disabled: true, reason: `${install.version} is being installed.` }
  if (info.state === 'checking') return { label: 'Checking…', disabled: true, reason: 'Looking for a newer version.' }
  return { label: 'Check now', disabled: false }
}
