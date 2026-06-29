import { useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { SeoHead } from "@/components/SeoHead";
import { Bell, Construction, BellRing } from "lucide-react";
import { toast } from "sonner";

export default function Alerts() {
  const [notified, setNotified] = useState(false);

  return (
    <div className="space-y-4">
      <SeoHead title="Алерти · Скоро" description="Цінові алерти крипто з push-сповіщеннями — незабаром." />
      <PageHeader title="Алерти" subtitle="Незабаром" />

      <section className="surface p-6 text-center">
        <div
          className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl"
          style={{ background: "rgba(231,182,80,.10)" }}
        >
          <Construction size={28} className="text-[var(--gold)]" />
        </div>
        <h2 className="display text-lg font-semibold">Скоро у наступному оновленні</h2>
        <p className="mx-auto mt-2 max-w-sm text-sm text-[var(--text-muted)]">
          Працюємо над системою цінових алертів: сповіщення коли ціна перетне поріг,
          відсоткові зміни за добу, push прямо в Telegram. Запустимо найближчим часом.
        </p>

        <button
          onClick={() => {
            if (notified) return;
            setNotified(true);
            toast.success("Дякуємо! Сповістимо в Telegram-каналі.");
          }}
          disabled={notified}
          className="mt-5 inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-[#1A0F00] disabled:opacity-60"
          style={{ background: "var(--grad-active)" }}
        >
          <BellRing size={15} />
          {notified ? "Підписку прийнято" : "Сповістити мене"}
        </button>

        <div className="mt-6 grid grid-cols-1 gap-2 text-left sm:grid-cols-2">
          <Feature title="Цінові пороги" desc="Сигнал коли ціна вище або нижче за вашу позначку." />
          <Feature title="Зміна за добу" desc="Реакція на різкі рухи у %." />
          <Feature title="Push у Telegram" desc="Миттєво у месенджер без зайвих API." />
          <Feature title="Одноразові та повторні" desc="Гнучке налаштування під стратегію." />
        </div>
      </section>
    </div>
  );
}

function Feature({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="rounded-xl border border-[var(--line)] p-3">
      <div className="flex items-center gap-2 text-sm font-medium">
        <Bell size={13} className="text-[var(--gold)]" /> {title}
      </div>
      <div className="mt-1 text-[11px] text-[var(--text-muted)]">{desc}</div>
    </div>
  );
}
