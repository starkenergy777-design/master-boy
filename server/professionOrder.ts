const PROFESSION_DISPLAY_PRIORITY = [
  'prof-electrician',
  'prof-plumber',
  'prof-ac',
  'prof-gas-water-heater',
  'prof-heating',
  'prof-masonry',
  'prof-sewer-cleaning',
  'prof-tiler',
  'prof-welder',
  'prof-carpenter',
  'prof-painter',
  'prof-drywall',
  'prof-locksmith',
  'prof-window-door',
  'prof-door-lock',
  'prof-cctv-alarm',
  'prof-plasterer',
  'prof-demolition-drill',
  'prof-waste-removal',
  'prof-stretch-ceiling',
] as const;

const priorityById = new Map<string, number>(PROFESSION_DISPLAY_PRIORITY.map((id, index) => [id, index]));

/**
 * Keep the directory order stable across the database-backed catalog and the
 * local fallback. Unknown future professions stay after known ones in their
 * original order until they are intentionally prioritized.
 */
export function sortProfessionsByDemand<T extends { id: string }>(professions: readonly T[]): T[] {
  return professions
    .map((profession, originalIndex) => ({
      profession,
      originalIndex,
      priority: priorityById.get(profession.id),
    }))
    .sort((a, b) => {
      if (a.priority === undefined && b.priority === undefined) return a.originalIndex - b.originalIndex;
      if (a.priority === undefined) return 1;
      if (b.priority === undefined) return -1;
      return a.priority - b.priority;
    })
    .map(({ profession }) => profession);
}
