/**
 * SideNavNameHeader — name label above the mini-calendar in the
 * Calendar/Diary left rail. Matches the main ViewTitle font/size and
 * vertical position. Applies a right-edge fade ONLY when the name actually
 * overflows the rail width.
 */

import { useEffect, useLayoutEffect, useRef, useState } from "react";

export function SideNavNameHeader({
  name,
  weight = "semibold",
}: {
  name: string;
  weight?: "semibold" | "normal";
}) {
  const fontStyle = { fontFamily: 'Helvetica, "Helvetica Neue", Arial, sans-serif' };
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const textRef = useRef<HTMLSpanElement | null>(null);
  const [overflow, setOverflow] = useState(false);

  useLayoutEffect(() => {
    const measure = () => {
      const wrap = wrapRef.current;
      const text = textRef.current;
      if (!wrap || !text) return;
      setOverflow(text.scrollWidth > wrap.clientWidth + 0.5);
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (wrapRef.current) ro.observe(wrapRef.current);
    if (textRef.current) ro.observe(textRef.current);
    return () => ro.disconnect();
  }, [name]);

  useEffect(() => {
    const onResize = () => {
      const wrap = wrapRef.current;
      const text = textRef.current;
      if (!wrap || !text) return;
      setOverflow(text.scrollWidth > wrap.clientWidth + 0.5);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const fadeStyle = overflow
    ? {
        maskImage:
          "linear-gradient(to right, black calc(100% - 20px), transparent)",
        WebkitMaskImage:
          "linear-gradient(to right, black calc(100% - 20px), transparent)",
      }
    : undefined;

  return (
    <div ref={wrapRef} className="mb-3 flex h-7 items-center overflow-hidden">
      <h2
        className={`min-w-0 whitespace-nowrap text-xl text-ink ${weight === "normal" ? "font-normal" : "font-semibold"}`}
        style={{ ...fontStyle, ...fadeStyle }}
        title={name}
      >
        <span ref={textRef}>{name}</span>
      </h2>
    </div>
  );
}
