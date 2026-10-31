/**
 * Whether the office is out of the window: the person hid it, there is an agent whose chat can take the room, and the grid is not showing
 * (the grid replaces the office with a layout of its own, and with no agent the office is where one is hired).
 */
export const officeHidden = (chosen: boolean, agents: number, grid: boolean) => chosen && agents > 0 && !grid
