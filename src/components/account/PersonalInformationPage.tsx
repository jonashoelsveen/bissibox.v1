import { useMemo, useState } from "react";
import { toast } from "sonner";
import { AccountDeleteAccount } from "@/components/account/AccountDeleteAccount";
import { AccountEmailChangePanel } from "@/components/account/AccountEmailChangePanel";
import { AccountPasswordChangePanel } from "@/components/account/AccountPasswordChangePanel";
import {
  AccountBirthDateFields,
  AccountFormSkeleton,
  AccountPageHeader,
  AccountTextField,
} from "@/components/account/AccountFormFields";
import { useAccountFormDraft } from "@/hooks/useAccountFormDraft";
import { useAccountProfile } from "@/hooks/useAccountProfile";
import { useAuth } from "@/lib/auth";
import { birthDateFromMetadata, normalizeBirthDate } from "@/lib/birth-date";
import { HELVETICA_STACK } from "@/lib/cloud-landing-design";
import { isEntityFeatureEnabled } from "@/lib/features";

type PersonalInfoDraft = {
  first_name: string;
  last_name: string;
  birth_date: string | null;
};

export function PersonalInformationPage() {
  const { user } = useAuth();
  const { profile, loading, updateProfile, changePassword, accountEmail, reload } =
    useAccountProfile();
  const [saving, setSaving] = useState(false);

  const saved = useMemo<PersonalInfoDraft | null>(() => {
    if (!profile) return null;
    return {
      first_name: profile.first_name ?? "",
      last_name: profile.last_name ?? "",
      birth_date:
        normalizeBirthDate(profile.birth_date) ??
        birthDateFromMetadata(
          (user?.user_metadata ?? {}) as Record<string, unknown>,
        ),
    };
  }, [profile, user?.user_metadata]);

  const { values, isDirty, cancel, patch } = useAccountFormDraft(saved);

  const handleSave = async () => {
    if (!values) return;
    setSaving(true);
    const result = await updateProfile({
      first_name: values.first_name.trim() || null,
      last_name: values.last_name.trim() || null,
      birth_date: values.birth_date,
    });
    setSaving(false);

    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success("Your account info was saved.");
  };

  if (loading || !profile || !values) {
    return (
      <section style={{ fontFamily: HELVETICA_STACK }}>
        <AccountPageHeader title="Account info" />
        <AccountFormSkeleton />
        <AccountDeleteAccount />
      </section>
    );
  }

  return (
    <section style={{ fontFamily: HELVETICA_STACK }}>
      <AccountPageHeader
        title="Account info"
        dirty={isDirty}
        saving={saving}
        onCancel={cancel}
        onSave={() => void handleSave()}
      />

      {/** Account first name, surname, date of birth — Bucket A: currently live, hidden this round. */}
      {isEntityFeatureEnabled("entityExtendedProfileFields") ? (
      <>
      <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2">
        <AccountTextField
          label="First name"
          value={values.first_name}
          onChange={(first_name) => patch({ first_name })}
        />
        <AccountTextField
          label="Surname"
          value={values.last_name}
          onChange={(last_name) => patch({ last_name })}
        />
      </div>

      <div className="mt-6 max-w-xl">
        <AccountBirthDateFields
          value={values.birth_date}
          onChange={(birth_date) => patch({ birth_date })}
        />
      </div>
      </>
      ) : null}

      <div className="mt-6 max-w-xl space-y-6">
        <AccountEmailChangePanel email={accountEmail} onChanged={reload} />
        <AccountPasswordChangePanel onChangePassword={changePassword} />
      </div>

      <AccountDeleteAccount />
    </section>
  );
}
