/**
 * How long a spec waits for the app to show something an agent made: its first reply, a tool line, a file link.
 * The fake agent answers in a fraction of a second, but it is a program of its own starting next to an Electron app, and on a busy machine
 * (a CI Mac running two of them at once) that took 10 to 15 seconds now and then. A passing run does not wait longer: this is only the limit.
 */
export const SLOW = 45_000
