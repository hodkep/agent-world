import type { ScreenAdapter } from '../ports'
import { driveAnswers, parseAsk } from './askMenu'
import { btwOverlay } from './btw'
import { driveRewind, genericMenu, openRewindList, rewindList } from './menus'
import { autoUnavailable, readMode, setMode } from './modes'
import { answerMenu, answerTrust, anyMenu, inputReady, looksWorking, planMenu, trustPrompt } from './prompts'

export const claudeScreen: ScreenAdapter = {
  trustPrompt, answerTrust, inputReady, looksWorking, anyMenu, planMenu, genericMenu, answerMenu, parseAsk, driveAnswers,
  readMode, setMode, autoUnavailable, rewindList, openRewindList, driveRewind, btwOverlay,
  // What is waiting in the input box: the words after the "❯" of its prompt line.
  typedText: (screen) => screen.split('\n').find((l) => /^❯[ \u00a0]/.test(l))?.slice(2).trim() ?? ''
}
