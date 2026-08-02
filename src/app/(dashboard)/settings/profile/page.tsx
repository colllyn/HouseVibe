import { getAuthenticatedUser } from "@/features/auth/session";
import { createClient } from "@/lib/supabase/server";
import { ProfileForm } from "@/components/ui/profile-form";
import { updateProfileAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const user = await getAuthenticatedUser();
  if (!user) return null;
  const supabase = await createClient();

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("full_name, phone, city, avatar_url")
    .eq("id", user.id)
    .single();

  return (
    <ProfileForm
      initialData={
        profile
          ? {
              fullName: profile.full_name,
              phone: profile.phone,
              city: profile.city,
              avatarUrl: profile.avatar_url,
            }
          : null
      }
      loadError={error ? "加载个人资料失败" : null}
      onRetryLoad={undefined}
      onSubmit={updateProfileAction}
    />
  );
}
