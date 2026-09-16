import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { AuditEntity, Person, Profile } from "@/lib/types";

export type Session = {
  supabase: Awaited<ReturnType<typeof createClient>>;
  userId: string;
  email: string;
  profile: Profile;
};

/** Loads the signed-in user's profile (and so their business_id). Redirects to /login when absent. */
export async function requireSession(): Promise<Session> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("id, business_id, display_name, role").eq("id", user.id).maybeSingle();
  if (!profile) {
    await supabase.auth.signOut();
    redirect("/login?error=no-profile");
  }

  return { supabase, userId: user.id, email: user.email ?? "", profile: profile as Profile };
}

export function isAdmin(session: Pick<Session, "profile">): boolean {
  return session.profile.role === "admin";
}

export function personOf(session: Pick<Session, "profile">): Person {
  return session.profile.display_name === "Sai" ? "sai" : "mike";
}

/** The other founder, for "who owes whom" copy. */
export function partnerOf(session: Pick<Session, "profile">): Person {
  return personOf(session) === "sai" ? "mike" : "sai";
}

/** Writes a "denied" audit row for an attempt the role does not allow. */
export async function recordDenied(session: Pick<Session, "supabase" | "profile">, entity: AuditEntity, entityId?: string | null, detail?: Record<string, unknown>): Promise<void> {
  await session.supabase.rpc("record_action", { p_action: "denied", p_entity_type: entity, p_entity_id: entityId ?? null, p_before: null, p_after: { role: session.profile.role, ...detail } });
}

/**
 * Admin-only server work. A contributor's attempt is written to the audit log
 * as "denied" and they are sent to a safe page.
 */
export async function requireAdmin(entity: AuditEntity, entityId?: string | null, fallback = "/more?denied=1"): Promise<Session> {
  const session = await requireSession();
  if (session.profile.role !== "admin") {
    await recordDenied(session, entity, entityId);
    redirect(fallback);
  }
  return session;
}
