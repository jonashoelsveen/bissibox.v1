import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { SignInModal, type SignInContext } from "@/components/SignInModal";
import { CreateEntityModal } from "@/components/CreateEntityModal";
import { GetRoleModal } from "@/components/GetRoleModal";

const HELVETICA =
  '-apple-system, BlinkMacSystemFont, "Helvetica Neue", Helvetica, Arial, sans-serif';

export function CloudFooter() {
  const { user } = useAuth();
  const [signInOpen, setSignInOpen] = useState(false);
  const [signInContext, setSignInContext] = useState<SignInContext>("cloud");
  const [createEntityOpen, setCreateEntityOpen] = useState(false);
  const [getRoleOpen, setGetRoleOpen] = useState(false);
  const [pendingEntity, setPendingEntity] = useState(false);
  const [pendingRole, setPendingRole] = useState(false);

  const handleEntity = () => {
    if (user) {
      setCreateEntityOpen(true);
    } else {
      setPendingEntity(true);
      setSignInContext("entity");
      setSignInOpen(true);
    }
  };
  const handleRole = () => {
    if (user) {
      setGetRoleOpen(true);
    } else {
      setPendingRole(true);
      setSignInContext("role");
      setSignInOpen(true);
    }
  };

  useEffect(() => {
    if (!user) return;
    if (pendingEntity) {
      setPendingEntity(false);
      setSignInOpen(false);
      setCreateEntityOpen(true);
    } else if (pendingRole) {
      setPendingRole(false);
      setSignInOpen(false);
      setGetRoleOpen(true);
    }
  }, [user, pendingEntity, pendingRole]);

  const linkStyle: React.CSSProperties = {
    fontFamily: HELVETICA,
    fontSize: 13,
    color: "#6e6e73",
    background: "none",
    border: "none",
    padding: 0,
    cursor: "pointer",
    textDecoration: "none",
  };

  return (
    <footer
      style={{
        backgroundColor: "#f5f5f7",
        borderTop: "1px solid #d2d2d7",
        fontFamily: HELVETICA,
      }}
    >
      <div className="mx-auto max-w-[1600px] px-6 py-8">
        <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-3">
          <button
            type="button"
            onClick={handleEntity}
            className="footer-link"
            style={linkStyle}
          >
            Register your organization
          </button>
          <button
            type="button"
            onClick={handleRole}
            className="footer-link"
            style={linkStyle}
          >
            Get a role
          </button>
        </div>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
          <span style={{ ...linkStyle, cursor: "default" }}>
            Copyright © {new Date().getFullYear()} Aponna Inc. All rights reserved.
          </span>
          <a href="/privacy" className="footer-link" style={linkStyle}>
            Privacy
          </a>
          <a href="/legal" className="footer-link" style={linkStyle}>
            Legal
          </a>
        </div>
      </div>
      <style>{`
        .footer-link:hover { text-decoration: underline; }
      `}</style>

      <SignInModal
        open={signInOpen}
        onClose={() => {
          setSignInOpen(false);
          setPendingEntity(false);
          setPendingRole(false);
        }}
        context={signInContext}
      />
      <CreateEntityModal
        open={createEntityOpen}
        onClose={() => setCreateEntityOpen(false)}
      />
      <GetRoleModal
        open={getRoleOpen}
        onClose={() => setGetRoleOpen(false)}
      />
    </footer>
  );
}
