// Auth helpers + React hook. Supports email/password, Google (Lovable managed),
// and silent Telegram Mini-App sign-in via the `tg-auth` edge function.

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Session, User } from "@supabase/supabase-js";
import { getTg, isInTelegram } from "@/lib/telegram";

export type AuthUser = User;

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Always subscribe FIRST, then read once.
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
    });
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  return { session, user: session?.user ?? null, loading, signOut };
}

/**
 * Returns the internal app user id (public.tg_users.id) for the current session,
 * creating the row on first use. This id is what user-owned tables
 * (trades, watchlist, alerts) reference via foreign key.
 */
export async function getAppUserId(): Promise<string | null> {
  const { data, error } = await supabase.rpc("ensure_app_user");
  if (error) {
    console.error("[ensure_app_user]", error);
    return null;
  }
  return (data as string) ?? null;
}

export async function signInEmail(email: string, password: string) {
  return supabase.auth.signInWithPassword({ email, password });
}

export async function signUpEmail(email: string, password: string, displayName?: string) {
  return supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${window.location.origin}/`,
      data: { display_name: displayName },
    },
  });
}

export async function sendReset(email: string) {
  return supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/reset-password`,
  });
}

export async function signInGoogle() {
  const { lovable } = await import("@/integrations/lovable");
  return lovable.auth.signInWithOAuth("google", {
    redirect_uri: window.location.origin,
    extraParams: { prompt: "select_account" },
  });
}

/**
 * Silent Telegram Mini-App auth.
 * Calls our edge function `tg-auth` which verifies initData (HMAC) and returns
 * Supabase session tokens. Then we hand them to supabase-js via setSession().
 */
export async function ensureTelegramSession(): Promise<boolean> {
  if (!isInTelegram()) return false;
  const { data: existing } = await supabase.auth.getSession();
  if (existing.session) return true;
  const tg = getTg();
  if (!tg?.initData) return false;
  try {
    const { data, error } = await supabase.functions.invoke("tg-auth", {
      body: { initData: tg.initData },
    });
    if (error || !data?.access_token) {
      console.warn("[tg-auth]", error ?? data);
      return false;
    }
    await supabase.auth.setSession({
      access_token: data.access_token,
      refresh_token: data.refresh_token,
    });
    return true;
  } catch (e) {
    console.warn("[tg-auth] failed", e);
    return false;
  }
}