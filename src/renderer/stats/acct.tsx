import { acctKey } from '../../shared/ledger'
import { isProviderId, type Prefs, type ProviderInfo } from '../../shared/types'
import { accountColor, accountName, colorAt } from '../accounts'
import { ProviderLogo } from '../panel/ProviderLogo'

/** One account of one program as the stats screens draw it: a colour for the account, the program's logo, and a name. */
export interface AcctView {
  key: string
  provider: string
  account: string
  name: string
  color: string
  /** The program keeps accounts apart; one that does not is named after itself and takes the program's colour. */
  keeps: boolean
}

/** Every account worth showing: those of each ready program (the program's own login first), then any that only the history knows. */
export function acctViews(providers: ProviderInfo[], accounts: Prefs['accounts'], seen: { provider: string; account: string }[], own?: Prefs['ownNames']): AcctView[] {
  const out = new Map<string, AcctView>()
  const put = (provider: string, account: string) => {
    const key = acctKey(provider, account)
    if (out.has(key)) return
    const p = providers.find((x) => x.id === provider)
    const keeps = !!p?.capabilities.accounts
    out.set(key, { key, provider, account, keeps, name: keeps ? accountName(accounts, account, provider, own) : (p?.label ?? provider), color: keeps ? accountColor(accounts, account) : colorAt(accounts.length + 1 + [...out.values()].filter((v) => !v.keeps).length) })
  }
  for (const p of providers.filter((x) => x.detection.state === 'ready')) {
    put(p.id, '')
    if (p.capabilities.accounts) accounts.filter((a) => a.provider === p.id).forEach((a) => put(p.id, a.id))
  }
  seen.forEach((s) => put(s.provider, s.account))
  return [...out.values()]
}

/** The account's colour square, its program's logo and its name, in a line. */
export function AcctName({ v, size = 14 }: { v: AcctView; size?: number }) {
  return (
    <span className="acct-name" title={`${v.name}${v.keeps ? ` · ${v.provider}` : ''}`}>
      <i className="acct-dot" style={{ background: v.color }} />
      {isProviderId(v.provider) && <ProviderLogo id={v.provider} size={size} tint />}
      <span>{v.name}</span>
    </span>
  )
}
