import { type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { CLOUD_FOOTER_BG, CLOUD_PAGE_BG } from "@/lib/cloud-landing-design";
import { isEntityFeatureEnabled } from "@/lib/features";

const HELVETICA =
  '-apple-system, BlinkMacSystemFont, "Helvetica Neue", Helvetica, Arial, sans-serif';

/**
 * Full-height page shell: white content grows above a grey footer pinned to
 * the bottom with no white gap underneath.
 */
export function CloudPageWithFooter({
  children,
  className,
  style,
  showAudienceLinks = false,
  showLegalLinks = true,
}: {
  children: ReactNode;
  className?: string;
  style?: React.CSSProperties;
  showAudienceLinks?: boolean;
  showLegalLinks?: boolean;
}) {
  return (
    <div className="flex min-h-full w-full flex-col">
      <div
        className={`flex-1 ${className ?? ""}`.trim()}
        style={{ backgroundColor: CLOUD_PAGE_BG, ...style }}
      >
        {children}
      </div>
      <CloudFooter showAudienceLinks={showAudienceLinks} showLegalLinks={showLegalLinks} />
    </div>
  );
}

export function CloudFooter({
  showAudienceLinks = false,
  showLegalLinks = true,
}: {
  showAudienceLinks?: boolean;
  showLegalLinks?: boolean;
}) {
  const linkStyle: React.CSSProperties = {
    fontFamily: HELVETICA,
    fontSize: 13,
    color: "#6e6e73",
    background: "none",
    border: "none",
    padding: 0,
    cursor: "pointer",
  };

  return (
    <footer
      style={{
        backgroundColor: CLOUD_FOOTER_BG,
        borderTop: "1px solid #d2d2d7",
        fontFamily: HELVETICA,
      }}
    >
      <div className="mx-auto max-w-[1600px] px-6 py-8">
        {showAudienceLinks ? (
          <div className="mb-6 flex flex-wrap items-center justify-center gap-x-8 gap-y-3">
            <Link to="/cloud/individuals" className="footer-link" style={linkStyle}>
              Bissibox
            </Link>
            {/** Footer “Aponna cloud for entities” link — Bucket A: currently live, hidden this round. */}
            {isEntityFeatureEnabled("entityMarketing") ? (
            <Link to="/cloud/entities" className="footer-link" style={linkStyle}>
              Bissibox for entities
            </Link>
            ) : null}
          </div>
        ) : null}
        <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
          <span style={{ ...linkStyle, cursor: "default" }}>
            Copyright © {new Date().getFullYear()} Bissibox
          </span>
          {showLegalLinks ? (
            <>
              <a href="/privacy" className="footer-link" style={linkStyle}>
                Privacy
              </a>
              <a href="/legal" className="footer-link" style={linkStyle}>
                Legal
              </a>
            </>
          ) : null}
        </div>
      </div>
      <style>{`
        .footer-link { text-decoration: none; }
        .footer-link:hover { text-decoration: underline; }
      `}</style>
    </footer>
  );
}
