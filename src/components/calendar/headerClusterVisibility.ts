/** Matches `gap-1.5` on the header action cluster. */
export const HEADER_CLUSTER_GAP_PX = 6;
/** Extra room required before a hidden control is shown again (anti-flicker). */
export const HEADER_CLUSTER_SHOW_SLACK_PX = 8;

export type HeaderClusterHiding = {
  hideToday: boolean;
  hideViewType: boolean;
};

/**
 * Which header chips to drop so prev/next arrows stay uncovered.
 *
 * Week/day (clock present): Today first, then the view-type tab, clock last.
 * Month (no clock): only Today yields so the view-type tab stays on the right.
 */
export function nextHeaderClusterHiding(args: {
  available: number;
  clockWidth: number;
  todayWidth: number;
  viewTypeWidth: number;
  hideToday: boolean;
  hideViewType: boolean;
  gap?: number;
  slack?: number;
}): HeaderClusterHiding {
  const gap = args.gap ?? HEADER_CLUSTER_GAP_PX;
  const slack = args.slack ?? HEADER_CLUSTER_SHOW_SLACK_PX;
  const clock = Math.max(0, args.clockWidth);
  const today = Math.max(0, args.todayWidth);
  const view = Math.max(0, args.viewTypeWidth);

  const hysteretic = (currentlyHidden: boolean, needed: number) =>
    currentlyHidden
      ? needed > args.available - slack
      : needed > args.available + 0.5;

  if (clock <= 0) {
    return {
      hideToday: hysteretic(args.hideToday, today + gap + view),
      hideViewType: false,
    };
  }

  const clockAndView = clock + gap + view;
  const hideViewType = hysteretic(args.hideViewType, clockAndView);
  const hideToday = hideViewType
    ? true
    : hysteretic(args.hideToday, clock + gap + today + gap + view);

  return { hideToday, hideViewType };
}
