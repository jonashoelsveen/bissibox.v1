export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace("#", "");
  if (h.length !== 6) return { r: 0, g: 0, b: 0 };
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

export function withAlpha(color: string, alpha: number): string {
  if (color.startsWith("rgba(")) return color;
  const { r, g, b } = hexToRgb(color);
  return `rgba(${r},${g},${b},${alpha})`;
}
