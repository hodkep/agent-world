import { ownName } from '../shared/ownAccount'
import type { Prefs } from '../shared/types'

/** Colours that tell accounts apart at a glance, from the office palette: cyan, brass, raspberry sofa, leaf. */
const COLORS = ['#6ad0e0', '#f2c230', '#b03f5e', '#3f8f4f']

/** The first entry is always this computer's own login (id ''), so each account keeps its colour as others come and go. */
export const accountColor = (accounts: Prefs['accounts'], id: string | undefined) => COLORS[(id ? accounts.findIndex((a) => a.id === id) + 1 : 0) % COLORS.length]!
/** What an account is called: an added one by its label, a program's own login by the name given to it, or the default one. */
export const accountName = (accounts: Prefs['accounts'], id: string | undefined, provider: string, own?: Prefs['ownNames']) => (id ? (accounts.find((a) => a.id === id)?.name ?? 'Removed account') : ownName(own, provider))

/** The nth colour of the same palette, for a program that keeps no accounts of its own, so it never shares a colour with an account. */
export const colorAt = (i: number) => COLORS[i % COLORS.length]!

/** The account a hire runs on: the one picked (the program's own login, '', included) while it still exists, else the program's default, else its own login. */
export const chosenAccount = (mine: { id: string }[], picked: string | null, preferred: string | undefined) =>
  picked !== null && (picked === '' || mine.some((a) => a.id === picked)) ? picked : (mine.find((a) => a.id === preferred)?.id ?? '')
