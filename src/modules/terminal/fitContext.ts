import { createContext, useContext } from 'react';

/** Set by the Terminal when panels are sized to the screen (wide desktop layouts). */
export interface TerminalFit {
  /** Visible height available to panels. */
  height: number;
  /** Height of the bottom row (positions, orders…), 0 when there isn't one. */
  bottomH: number;
}
export const TerminalFitContext = createContext<TerminalFit | null>(null);
export const useTerminalFit = () => useContext(TerminalFitContext);
