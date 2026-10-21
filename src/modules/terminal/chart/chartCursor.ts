/**
 * Where the mouse is on a chart (symbol + price under the crosshair), for keyboard actions such as
 * Alt+A (alert here) and Alt+Shift+B / S (buy / sell here). A plain object, not state: it changes
 * on every mouse move and nothing needs to re-render for it.
 */
export const chartCursor: { symbol: string | null; price: number | null } = { symbol: null, price: null };

/** Ask the focused chart to go back to the live edge at its default zoom (Alt+R). */
export const CHART_RESET_EVENT = 'aztex:chart-reset';
