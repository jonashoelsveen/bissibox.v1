import { LinearGradient } from "expo-linear-gradient";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  Text,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { useTheme } from "@/lib/theme";

export const PAGE_HEADER_HEIGHT = 48;
export const PAGE_HEADER_PADDING_H = 16;

const FADE_WIDTH = 88;

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace("#", "");
  if (h.length !== 6) return { r: 0, g: 0, b: 0 };
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

function fadeGradientColors(bg: string) {
  const { r, g, b } = hexToRgb(bg);
  return [
    `rgba(${r},${g},${b},0)`,
    `rgba(${r},${g},${b},0)`,
    `rgba(${r},${g},${b},0.18)`,
    `rgba(${r},${g},${b},0.5)`,
    `rgba(${r},${g},${b},0.78)`,
    `rgba(${r},${g},${b},1)`,
  ] as const;
}

function estimateTextWidth(text: string, fontSize: number, fontWeight: TextStyle["fontWeight"]) {
  const factor = fontWeight === "700" || fontWeight === "bold" ? 0.58 : 0.52;
  return text.length * fontSize * factor;
}

type TitleMetrics = {
  text: string;
  fontSize: number;
  fontWeight: TextStyle["fontWeight"];
  containerWidth: number;
};

type PageHeaderContextValue = {
  reportTitleMetrics: (metrics: TitleMetrics | null) => void;
};

const PageHeaderContext = createContext<PageHeaderContextValue | null>(null);

function HeaderEdgeFade({ insetRight, backgroundColor }: { insetRight: number; backgroundColor: string }) {
  return (
    <LinearGradient
      colors={fadeGradientColors(backgroundColor)}
      locations={[0, 0.12, 0.35, 0.58, 0.82, 1]}
      start={{ x: 0, y: 0.5 }}
      end={{ x: 1, y: 0.5 }}
      style={{
        position: "absolute",
        right: insetRight,
        top: 0,
        bottom: 0,
        width: FADE_WIDTH,
        zIndex: 10,
        elevation: 10,
      }}
      pointerEvents="none"
    />
  );
}

export function PageHeaderControl({ children }: { children: ReactNode }) {
  return (
    <View
      style={{
        zIndex: 30,
        elevation: 30,
        flexShrink: 0,
        position: "relative",
        marginLeft: 8,
      }}
    >
      {children}
    </View>
  );
}

export function PageHeader({
  children,
  trailing,
  paddingHorizontal = PAGE_HEADER_PADDING_H,
  fadeInsetRight = 0,
  backgroundColor,
  style,
}: {
  children: ReactNode;
  /** Trailing controls (e.g. +) — rendered above the title fade. */
  trailing?: ReactNode;
  paddingHorizontal?: number;
  fadeInsetRight?: number;
  /** Defaults to page background; use `C.inputBg` for grouped section headers. */
  backgroundColor?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const { C } = useTheme();
  const headerBg = backgroundColor ?? C.bg;
  const [titleMetrics, setTitleMetrics] = useState<TitleMetrics | null>(null);
  const [naturalWidth, setNaturalWidth] = useState(0);

  const reportTitleMetrics = useCallback((metrics: TitleMetrics | null) => {
    setTitleMetrics(metrics);
  }, []);

  const contextValue = useMemo(
    () => ({ reportTitleMetrics }),
    [reportTitleMetrics],
  );

  const estimatedWidth = titleMetrics
    ? estimateTextWidth(titleMetrics.text, titleMetrics.fontSize, titleMetrics.fontWeight)
    : 0;

  const fadeActive =
    titleMetrics != null &&
    titleMetrics.containerWidth > 0 &&
    (naturalWidth > titleMetrics.containerWidth + 1 || estimatedWidth > titleMetrics.containerWidth + 1);

  useEffect(() => {
    setNaturalWidth(0);
  }, [titleMetrics?.text, titleMetrics?.fontSize, titleMetrics?.fontWeight]);

  const measureTextStyle: TextStyle = titleMetrics
    ? {
        color: C.text,
        fontSize: titleMetrics.fontSize,
        fontWeight: titleMetrics.fontWeight,
        letterSpacing: titleMetrics.fontSize >= 20 ? -0.3 : undefined,
      }
    : {};

  const trailingInset = trailing != null ? fadeInsetRight : 0;

  return (
    <PageHeaderContext.Provider value={contextValue}>
      <View
        style={[
          {
            height: PAGE_HEADER_HEIGHT,
            paddingHorizontal,
            borderBottomWidth: 1,
            borderBottomColor: C.separator,
            backgroundColor: headerBg,
            flexDirection: "row",
            alignItems: "center",
            overflow: "hidden",
            position: "relative",
          },
          style,
        ]}
      >
        <View style={{ flex: 1, minWidth: 0, zIndex: 0 }}>
          {children}
        </View>
        {trailing != null ? (
          <PageHeaderControl>{trailing}</PageHeaderControl>
        ) : null}
        {fadeActive ? <HeaderEdgeFade insetRight={trailingInset} backgroundColor={headerBg} /> : null}
        {titleMetrics ? (
          <Text
            style={[measureTextStyle, { position: "absolute", opacity: 0, top: -9999, left: 0 }]}
            onTextLayout={(e) => {
              const width = e.nativeEvent.lines.reduce(
                (max, line) => Math.max(max, line.x + line.width),
                0,
              );
              if (width > 0) setNaturalWidth(width);
            }}
          >
            {titleMetrics.text}
          </Text>
        ) : null}
      </View>
    </PageHeaderContext.Provider>
  );
}

type FadedTitleProps = {
  text: string;
  fontSize?: number;
  fontWeight?: TextStyle["fontWeight"];
  flex?: boolean;
  style?: StyleProp<TextStyle>;
};

export function FadedTitle({
  text,
  fontSize = 17,
  fontWeight = "600",
  flex = true,
  style,
}: FadedTitleProps) {
  const { C } = useTheme();
  const header = useContext(PageHeaderContext);
  const [containerWidth, setContainerWidth] = useState(0);

  const textStyle: TextStyle = {
    color: C.text,
    fontSize,
    fontWeight,
    letterSpacing: fontSize >= 20 ? -0.3 : undefined,
  };

  useLayoutEffect(() => {
    if (!header || containerWidth <= 0) return;
    header.reportTitleMetrics({ text, fontSize, fontWeight, containerWidth });
  }, [header, text, fontSize, fontWeight, containerWidth]);

  useEffect(() => {
    return () => header?.reportTitleMetrics(null);
  }, [header]);

  return (
    <View
      style={[
        { minWidth: 0, position: "relative" },
        flex ? { flex: 1 } : { alignSelf: "stretch", width: "100%" },
      ]}
      onLayout={(e) => setContainerWidth(e.nativeEvent.layout.width)}
    >
      <Text
        numberOfLines={1}
        ellipsizeMode="clip"
        style={[textStyle, style, { flexShrink: 0 }]}
      >
        {text}
      </Text>
    </View>
  );
}
