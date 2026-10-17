export interface SetupStep {
  name: 'Install' | 'Sign in' | 'Ready'
  status: 'done' | 'now' | 'todo'
  hint: string
}

/** Where a provider is on the way to being usable: install it, sign in to it, then it is ready. What each step asks of the person is its hint. */
export function setupSteps(state: string, o: { version?: string; installing?: boolean; signingIn?: boolean }): SetupStep[] {
  const installed = state !== 'not-installed'
  const ready = state === 'ready'
  return [
    { name: 'Install', status: installed ? 'done' : 'now', hint: installed ? (o.version ? `Installed v${o.version}` : 'Installed') : o.installing ? 'The installer is running below' : 'Run the installer here, or copy its command' },
    { name: 'Sign in', status: ready ? 'done' : installed ? 'now' : 'todo', hint: ready ? 'Signed in' : o.signingIn ? 'Open the page, copy the code, paste it in the terminal below' : 'Open a terminal and sign in with your own account' },
    { name: 'Ready', status: ready ? 'done' : 'todo', hint: ready ? 'Agents can use it' : 'Shows here by itself' }
  ]
}
