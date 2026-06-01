/**
 * Canonical Strava sport-type color map.
 * Keys are the exact Strava sport_type strings (PascalCase).
 * This is the single source of truth — consumed by the diary side-nav,
 * settings page, calendar tiles, and anywhere else a Strava color is needed.
 */
export const STRAVA_SPORT_COLORS: Record<string, string> = {
  // Foot Sports — Red family
  Run:          '#FF0000',
  TrailRun:     '#FF4D4D',
  Walk:         '#FF6666',
  Hike:         '#FF8080',
  Wheelchair:   '#CC0000',
  VirtualRun:   '#FF9999',

  // Cycle Sports — Green family
  Ride:              '#008000',
  MountainBikeRide:  '#006400',
  GravelRide:        '#228B22',
  EBikeRide:         '#32CD32',
  EMountainBikeRide: '#00FF00',
  Handcycle:         '#2E8B57',
  Velomobile:        '#3CB371',
  VirtualRide:       '#90EE90',

  // Water Sports — Blue family
  Swim:               '#0000FF',
  Surfing:            '#1E90FF',
  StandUpPaddling:    '#00BFFF',
  Kayaking:           '#4169E1',
  Canoeing:           '#4682B4',
  Rowing:             '#00008B',
  Windsurf:           '#00F5FF',
  Kitesurf:           '#00CED1',
  Sailing:            '#48D1CC',

  // Winter Sports — Very Light Blue family
  AlpineSki:       '#E0FFFF',
  BackcountrySki:  '#CCFFFF',
  NordicSki:       '#ADD8E6',
  Snowboard:       '#B0E0E6',
  Snowshoe:        '#AFEEEE',
  IceSkate:        '#E6F2FF',

  // Racquet Sports — Yellow family
  Tennis:       '#FFFF00',
  Pickleball:   '#FFD700',
  Padel:        '#EEEE00',
  Badminton:    '#F0E68C',
  Squash:       '#DAA520',
  Racquetball:  '#B8860B',
  TableTennis:  '#FFF8DC',

  // Team & Ball Sports — Orange family
  Soccer:      '#FF8C00',
  Basketball:  '#FF4500',
  Volleyball:  '#FFA500',
  Cricket:     '#FFB732',

  // Gym & Studio Fitness — Periwinkle/Purple family
  Workout:          '#B8B8FF',
  WeightTraining:   '#9999FF',
  Crossfit:         '#7A7AFF',
  HIIT:             '#8A2BE2',
  Yoga:             '#FFC0CB',
  Pilates:          '#E6E6FA',
  Dance:            '#D8BFD8',
  PhysicalTherapy:  '#CCCCFF',

  // Machines & Other Sports — Gray family
  StairStepper:  '#808080',
  Elliptical:    '#A9A9A9',
  RockClimbing:  '#696969',
  Skateboard:    '#D3D3D3',
  InlineSkate:   '#C0C0C0',
  RollerSki:     '#E0E0E0',
  Golf:          '#BEBEBE',
};

/** Fallback color for unknown sport types. */
const FALLBACK_COLOR = '#D1D1E0';

/**
 * Returns the canonical display color for a Strava sport_type string.
 * Handles PascalCase and case-insensitive lookup gracefully.
 */
export function colorForStravaSportType(sportType: string | null | undefined): string {
  if (!sportType) return FALLBACK_COLOR;
  if (STRAVA_SPORT_COLORS[sportType]) return STRAVA_SPORT_COLORS[sportType];
  const lower = sportType.toLowerCase();
  const key = Object.keys(STRAVA_SPORT_COLORS).find(k => k.toLowerCase() === lower);
  if (key) return STRAVA_SPORT_COLORS[key];
  return FALLBACK_COLOR;
}

// ─── Legacy aliases kept for backward compatibility ─────────────────────────
export const ACTIVITY_COLORS = {
  running:      STRAVA_SPORT_COLORS.Run,
  swimming:     STRAVA_SPORT_COLORS.Swim,
  cycling:      STRAVA_SPORT_COLORS.Ride,
  track:        '#FF755E',
  strength:     STRAVA_SPORT_COLORS.WeightTraining,
  strengthCore: '#ADADAD',
  else:         FALLBACK_COLOR,
} as const;

export type ActivityKind = keyof typeof ACTIVITY_COLORS;

/** @deprecated Use colorForStravaSportType instead. */
export function colorForStravaSession(
  sportType: string | null | undefined,
  _name?: string | null,
): string {
  return colorForStravaSportType(sportType);
}

/** @deprecated Use colorForStravaSportType instead. */
export function colorForActivity(activity?: string | null): string {
  const a = (activity || '').toLowerCase();
  if (a === 'running')                                         return STRAVA_SPORT_COLORS.Run;
  if (a === 'cycling' || a === 'cycle' || a === 'bike' || a === 'ride') return STRAVA_SPORT_COLORS.Ride;
  if (a === 'swimming' || a === 'swim')                       return STRAVA_SPORT_COLORS.Swim;
  if (a === 'weighttraining' || a === 'weight_training' || a === 'strength' || a === 'lifting' || a === 'max') return STRAVA_SPORT_COLORS.WeightTraining;
  if (a === 'yoga')                                            return STRAVA_SPORT_COLORS.Yoga;
  return FALLBACK_COLOR;
}

/** @deprecated */
export function activityFromStravaSport(sport: string | null | undefined): ActivityKind {
  const s = (sport || '').toLowerCase();
  if (s.includes('run'))   return 'running';
  if (s.includes('swim'))  return 'swimming';
  if (s.includes('ride') || s.includes('cycl') || s.includes('bike')) return 'cycling';
  if (s.includes('weight') || s.includes('strength')) return 'strength';
  return 'else';
}
