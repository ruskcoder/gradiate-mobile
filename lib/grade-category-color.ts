const CATEGORY_COLORS: Record<string, string> = {
  major: '#a855f7',
  'application grade': '#a855f7',
  minor: '#22c55e',
  'minor grade': '#22c55e',
  other: '#eab308',
  'major grade': '#eab308',
};

export function categoryColor(category: string): string {
  return CATEGORY_COLORS[category.toLowerCase()] ?? '#6b7280';
}
