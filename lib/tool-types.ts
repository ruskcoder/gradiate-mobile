export type ToolType = 'whatif' | 'impacts' | 'history' | 'timeline' | 'timetravel';

export const TOOL_TITLES: Record<ToolType, string> = {
  whatif: 'What If',
  impacts: 'Impacts',
  history: 'History',
  timeline: 'Timeline',
  timetravel: 'TimeTravel',
};
