import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function pathMerge(...paths: string[]) {
  return paths
    .map((path, index) => {
      if (index === 0) return path.replace(/\/+$/g, '');
      else return path.replace(/^\/+|\/+$/g, '');
    })
    .filter((path) => path.length > 0)
    .join('/');
}

/**
 * Transforms API "groups" into separate categories for schools whose backend
 * returns nested group/category data instead of a flat categories map (e.g.
 * Skyward). When a class has multiple groups, each becomes its own category
 * formatted as "Major Grade - {groupName}" (or just the nested category name
 * when there's only one group), with weight = groupWeight * categoryWeight.
 */
export function transformGroupsToCategories(classData: any) {
  if (!classData || !classData.groups || typeof classData.groups !== 'object') {
    return classData;
  }

  const groups = classData.groups;
  const groupNames = Object.keys(groups);
  if (groupNames.length === 0) return classData;

  const multi = groupNames.length > 1;
  const categories: Record<string, any> = {};
  const scores: any[] = [];

  for (const groupName of groupNames) {
    const group = groups[groupName];
    if (!group) continue;
    const catKey = (catName: string) => (multi ? `${groupName} - ${catName}` : catName);

    // Keep each nested category's real stats (points / percent / weight).
    if (group.categories && typeof group.categories === 'object') {
      for (const [catName, catData] of Object.entries(group.categories)) {
        categories[catKey(catName)] = { ...(catData as any) };
      }
    }

    // Assign every assignment to its own (group-prefixed) category, matching the
    // nested category it belongs to instead of collapsing them into one bucket.
    const groupScores = Array.isArray(group.scores) ? group.scores : [];
    for (const sc of groupScores) {
      const cat = catKey(sc.category || 'Other');
      if (!categories[cat]) {
        categories[cat] = {
          categoryWeight: (parseFloat(group.weight) || 0).toFixed(2),
          percent: '0.000',
          studentsPoints: '0',
          maximumPoints: '0',
        };
      }
      scores.push({ ...sc, category: cat });
    }
  }

  return {
    ...classData,
    categories,
    scores: scores.length > 0 ? scores : classData.scores || [],
  };
}
