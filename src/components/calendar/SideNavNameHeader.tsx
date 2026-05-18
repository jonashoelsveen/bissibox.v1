/**
 * SideNavNameHeader — name label rendered above the mini-calendar in the
 * Calendar/Diary left rail. Matches the main ViewTitle font, size and
 * vertical position (`mb-3` like the header in YearCalendarView) so the
 * baseline aligns with the month/week title on the right. Long names fade
 * out at the right edge instead of clipping.
 */

export function SideNavNameHeader({ name }: { name: string }) {
  const fontStyle = { fontFamily: 'Helvetica, "Helvetica Neue", Arial, sans-serif' };
  return (
    <div className="mb-3 flex h-7 items-center overflow-hidden">
      <h2
        className="min-w-0 whitespace-nowrap text-xl font-semibold text-ink [mask-image:linear-gradient(to_right,black_calc(100%-20px),transparent)] [-webkit-mask-image:linear-gradient(to_right,black_calc(100%-20px),transparent)]"
        style={fontStyle}
        title={name}
      >
        {name}
      </h2>
    </div>
  );
}
