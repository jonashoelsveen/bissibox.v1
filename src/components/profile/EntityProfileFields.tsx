import type { Ref } from "react";
import { useEffect, useRef, useState } from "react";
import { Check, Copy, Trash2 } from "lucide-react";
import type { UserGroup, UserGroupPatch } from "@/hooks/useUserGroups";
import { copyTextToClipboard } from "@/lib/entity-code";
import { ENTITY_PROFILE_NAME_MAX, clipProfileName } from "@/lib/profileName";

export const PROFILE_FIELD =
  "account-field w-full rounded-[10px] bg-muted/70 px-3 font-sans text-sm text-ink outline-none placeholder:text-muted-foreground/70";
export const PROFILE_INPUT = `${PROFILE_FIELD} h-10`;
export const PROFILE_TEXTAREA = `${PROFILE_FIELD} min-h-[7.5rem] resize-y py-2.5`;
export const PROFILE_FIELD_ON_PANEL =
  "account-field w-full rounded-[10px] bg-[#e5e5ea] px-3 font-sans text-sm text-ink outline-none placeholder:text-muted-foreground/70";
export const PROFILE_INPUT_ON_PANEL = `${PROFILE_FIELD_ON_PANEL} h-10`;
export const PROFILE_TEXTAREA_ON_PANEL = `${PROFILE_FIELD_ON_PANEL} min-h-[7.5rem] resize-y py-2.5`;

function EntityIdField({
  value,
  fieldClassName,
}: {
  value: string;
  fieldClassName: string;
}) {
  const [copied, setCopied] = useState(false);
  const copiedTimer = useRef<number>(0);

  useEffect(() => {
    return () => {
      if (copiedTimer.current) window.clearTimeout(copiedTimer.current);
    };
  }, []);

  const handleCopy = async () => {
    const ok = await copyTextToClipboard(value);
    if (!ok) return;
    setCopied(true);
    if (copiedTimer.current) window.clearTimeout(copiedTimer.current);
    copiedTimer.current = window.setTimeout(() => setCopied(false), 4000);
  };

  return (
    <div>
      <ProfileThinLabel>Entity request-ID</ProfileThinLabel>
      <button
        type="button"
        onClick={(e) => {
          e.currentTarget.blur();
          void handleCopy();
        }}
        aria-label={copied ? "Entity request-ID copied" : "Copy Entity request-ID"}
        className={`group flex cursor-default select-none items-center gap-2 text-left outline-none ${fieldClassName.replace(/\baccount-field\b/g, "")}`}
        style={{ boxShadow: "none" }}
      >
        <span className="min-w-0 flex-1 cursor-default truncate text-ink" title={value}>
          {value}
        </span>
        <span
          className={
            "grid h-5 w-5 shrink-0 place-items-center text-muted-foreground transition-opacity " +
            (copied ? "opacity-100" : "opacity-0 group-hover:opacity-100")
          }
          aria-hidden
        >
          {copied ? (
            <Check className="h-3.5 w-3.5" strokeWidth={1.75} />
          ) : (
            <Copy className="h-3.5 w-3.5" strokeWidth={1.75} />
          )}
        </span>
      </button>
    </div>
  );
}

export function ProfileThinLabel({ children }: { children: string }) {
  return <label className="mb-1.5 block font-sans text-sm text-ink">{children}</label>;
}

export function ProfileThinTextField({
  label,
  value,
  onChange,
  placeholder,
  inputRef,
  maxLength,
  type = "text",
  inputMode,
  inputClassName = PROFILE_INPUT,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  inputRef?: Ref<HTMLInputElement>;
  maxLength?: number;
  type?: string;
  inputMode?: "url" | "text";
  inputClassName?: string;
}) {
  return (
    <div>
      <ProfileThinLabel>{label}</ProfileThinLabel>
      <input
        ref={inputRef}
        type={type}
        inputMode={inputMode}
        value={value}
        maxLength={maxLength}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={inputClassName}
      />
    </div>
  );
}

export function EntityProfileFields({
  group,
  onPatch,
  nameInputRef,
  onPanel = false,
  onDelete,
}: {
  group: UserGroup;
  onPatch: (patch: UserGroupPatch) => void;
  nameInputRef?: Ref<HTMLInputElement>;
  onPanel?: boolean;
  onDelete?: () => void;
}) {
  const inputClass = onPanel ? PROFILE_INPUT_ON_PANEL : PROFILE_INPUT;
  const textareaClass = onPanel ? PROFILE_TEXTAREA_ON_PANEL : PROFILE_TEXTAREA;
  return (
    <div className="space-y-5">
      <ProfileThinTextField
        label="Entity profile name"
        value={group.name}
        maxLength={ENTITY_PROFILE_NAME_MAX}
        inputRef={nameInputRef}
        inputClassName={inputClass}
        onChange={(value) => onPatch({ name: clipProfileName(value, ENTITY_PROFILE_NAME_MAX) })}
      />
      <div>
        <ProfileThinLabel>Description</ProfileThinLabel>
        <textarea
          value={group.description ?? ""}
          onChange={(e) => onPatch({ description: e.target.value })}
          rows={5}
          className={textareaClass}
        />
      </div>
      <ProfileThinTextField
        label="URL"
        value={group.website ?? ""}
        inputMode="url"
        placeholder="https://"
        inputClassName={inputClass}
        onChange={(value) => onPatch({ website: value })}
      />
      {group.entityCode ? <EntityIdField value={group.entityCode} fieldClassName={inputClass} /> : null}
      {onDelete ? (
        <button
          type="button"
          onClick={onDelete}
          className="inline-flex cursor-pointer items-center gap-1.5 pt-1 font-sans text-sm"
          style={{ color: "#ff3b30" }}
        >
          <Trash2 className="h-4 w-4" strokeWidth={1.75} />
          Delete
        </button>
      ) : null}
    </div>
  );
}
