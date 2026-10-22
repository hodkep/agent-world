import { remoteReader } from '../shared/remoteScreen'

/** agy prints "Open https://antigravity.google.com/r/<id>-v2 on another device to take over." once remote control is on. */
export const agyRemote = remoteReader(/https:\/\/antigravity\.google\.com\/r\/[\w-]+/)
