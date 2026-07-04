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

  if (groupNames.length === 0) {
    return classData;
  }

  const transformedCategories: Record<string, any> = {};
  const transformedScores: any[] = [];

  groupNames.forEach((groupName) => {
    const group = groups[groupName];
    if (!group) return;

    const groupWeight = parseFloat(group.weight) || 0;
    const hasNestedCategories = group.categories && Object.keys(group.categories).length > 0;

    if (!hasNestedCategories) {
      const categoryName = groupNames.length > 1 ? `Major Grade - ${groupName}` : groupName;
      const categoryWeight = groupWeight;
      const grade = parseFloat(group.grade) || 0;

      transformedCategories[categoryName] = {
        categoryWeight: categoryWeight.toFixed(2),
        percent: grade.toFixed(3),
        studentsPoints: 0,
        maximumPoints: 0,
      };

      if (group.scores && Array.isArray(group.scores)) {
        group.scores.forEach((score: any) => {
          transformedScores.push({ ...score, category: categoryName });
        });
      }
    } else {
      Object.entries(group.categories).forEach(([catName, catData]: [string, any]) => {
        const nestedCatWeight = parseFloat(catData.weight) || 1;
        const effectiveWeight = (groupWeight * nestedCatWeight) / 100;

        const categoryName = groupNames.length > 1 ? `${groupName} - ${catName}` : catName;

        const grade = parseFloat(catData.grade) || 0;

        transformedCategories[categoryName] = {
          categoryWeight: effectiveWeight.toFixed(2),
          percent: grade.toFixed(3),
          studentsPoints: 0,
          maximumPoints: 0,
        };

        if (catData.scores && Array.isArray(catData.scores)) {
          catData.scores.forEach((score: any) => {
            transformedScores.push({ ...score, category: categoryName });
          });
        }
      });

      if (group.scores && Array.isArray(group.scores) && group.scores.length > 0) {
        const categoryName =
          groupNames.length > 1 ? `Major Grade - ${groupName}` : `${groupName} - Other`;

        if (!transformedCategories[categoryName]) {
          transformedCategories[categoryName] = {
            categoryWeight: groupWeight.toFixed(2),
            percent: '0.000',
            studentsPoints: 0,
            maximumPoints: 0,
          };
        }

        group.scores.forEach((score: any) => {
          transformedScores.push({ ...score, category: categoryName });
        });
      }
    }
  });

  return {
    ...classData,
    categories: transformedCategories,
    scores: transformedScores.length > 0 ? transformedScores : classData.scores || [],
  };
}
