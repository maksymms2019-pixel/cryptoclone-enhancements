import { useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useAuth, signInEmail, signUpEmail, signInGoogle } from "@/lib/auth";
import { BrandLogo, BrandWordmark } from "@/components/BrandLogo";
import { SeoHead } from "@/components/SeoHead";
import { Mail, Lock, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Navigate } from "react-router-dom";

export default function Auth() {
  const { session, loading: authLoading } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  if (!authLoading && session) {
    const to = (loc.state as { from?: string } | null)?.from ?? "/";
    return <Navigate to={to} replace />;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      if (mode === "signin") {
        const { error } = await signInEmail(email, password);
        if (error) { toast.error(translateAuthError(error.message)); return; }
        toast.success("З поверненням!");
        nav("/", { replace: true });
      } else {
        const { data, error } = await signUpEmail(email, password, name || undefined);
        if (error) { toast.error(translateAuthError(error.message)); return; }

        // Автопідтвердження увімкнено — сесія приходить одразу.
        if (data?.session) {
          toast.success("Реєстрація успішна! Вітаємо.");
          nav("/", { replace: true });
        } else {
          // Резерв: якщо сесія не прийшла, спробуємо одразу увійти.
          const { error: signErr } = await signInEmail(email, password);
          if (signErr) {
            toast.success("Акаунт створено! Увійди, будь ласка.");
            setMode("signin");
          } else {
            toast.success("Реєстрація успішна! Вітаємо.");
            nav("/", { replace: true });
          }
        }
      }
    } finally {
      setBusy(false);
    }
  }

  async function google() {
    if (busy) return;
    setBusy(true);
    try {
      const r = await signInGoogle();
      if (r.error) { toast.error("Не вдалось увійти через Google"); return; }
      if (r.redirected) return;
      toast.success("З поверненням!");
      nav("/", { replace: true });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <SeoHead title="Вхід / Реєстрація" description="Увійди в CryptoTime — слідкуй за крипто-ринком, веди портфоліо, отримуй алерти." />

      <header className="flex flex-col items-center text-center pt-4">
        <BrandLogo size={64} />
        <div className="mt-3 display text-[28px] font-bold"><BrandWordmark /></div>
        <p className="mt-2 text-xs text-[var(--text-muted)] max-w-[280px]">
          Крипто-огляд, портфоліо, алерти в Telegram. Все в одному місці.
        </p>
      </header>

      <div className="surface p-5">
        <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-[var(--bg)] mb-4">
          {(["signin", "signup"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`py-2 text-sm font-medium rounded-lg transition-colors ${
                mode === m ? "bg-[var(--bg-elev)] text-[var(--gold)]" : "text-[var(--text-muted)]"
              }`}
            >
              {m === "signin" ? "Вхід" : "Реєстрація"}
            </button>
          ))}
        </div>

        <form onSubmit={submit} className="space-y-3">
          {mode === "signup" && (
            <Field>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Імʼя (опційно)"
                className="w-full bg-transparent outline-none text-sm"
              />
            </Field>
          )}
          <Field icon={<Mail size={15} />}>
            <input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="email@example.com"
              className="w-full bg-transparent outline-none text-sm"
            />
          </Field>
          <Field icon={<Lock size={15} />}>
            <input
              type="password"
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Пароль (мін. 6 символів)"
              className="w-full bg-transparent outline-none text-sm"
            />
          </Field>

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-xl py-2.5 text-sm font-semibold text-[#1A0F00] disabled:opacity-60 flex items-center justify-center gap-2"
            style={{ background: "var(--grad-active)" }}
          >
            {busy && <Loader2 size={14} className="animate-spin" />}
            {mode === "signin" ? "Увійти" : "Створити акаунт"}
          </button>

        </form>

        <div className="my-4 flex items-center gap-3 text-[10px] uppercase tracking-wider text-[var(--text-dim)]">
          <div className="flex-1 h-px bg-[var(--line)]" />
          або
          <div className="flex-1 h-px bg-[var(--line)]" />
        </div>

        <button
          type="button"
          onClick={google}
          disabled={busy}
          className="w-full rounded-xl py-2.5 text-sm font-semibold border border-[var(--line-strong)] bg-white/[.03] hover:bg-white/[.06] flex items-center justify-center gap-2"
        >
          <GoogleIcon />
          Продовжити з Google
        </button>
      </div>

      <p className="text-center text-[11px] text-[var(--text-dim)]">
        Реєструючись, ти погоджуєшся з умовами використання.
      </p>
    </div>
  );
}

function translateAuthError(msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes("invalid login credentials")) return "Невірний email або пароль.";
  if (m.includes("already registered") || m.includes("already been registered") || m.includes("user already"))
    return "Акаунт з таким email вже існує. Спробуй увійти.";
  if (m.includes("email not confirmed")) return "Email ще не підтверджено.";
  if (m.includes("password should be at least") || m.includes("at least 6"))
    return "Пароль має містити щонайменше 6 символів.";
  if (m.includes("unable to validate email") || m.includes("invalid email"))
    return "Невірний формат email.";
  if (m.includes("rate limit") || m.includes("too many"))
    return "Забагато спроб. Зачекай хвилину й спробуй знову.";
  if (m.includes("pwned") || m.includes("compromised") || m.includes("data breach"))
    return "Цей пароль скомпрометований. Обери надійніший.";
  return msg;
}

function Field({ icon, children }: { icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-[var(--line)] bg-[var(--bg)] px-3 py-2.5 focus-within:border-[var(--gold)] transition-colors">
      {icon && <span className="text-[var(--text-muted)]">{icon}</span>}
      {children}
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 48 48"><path fill="#FFC107" d="M43.6 20.5h-1.9V20H24v8h11.3c-1.6 4.7-6 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.1 8 3l5.7-5.7C34.1 6.1 29.3 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.6 16 18.9 13 24 13c3.1 0 5.9 1.1 8 3l5.7-5.7C34.1 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.5-5.2l-6.2-5.3C29.3 35 26.8 36 24 36c-5.3 0-9.7-3.3-11.3-8l-6.5 5C9.6 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.2 4.3-4 5.7l6.2 5.3c-.4.4 6.5-4.8 6.5-15 0-1.3-.1-2.4-.4-3.5z"/></svg>
  );
}