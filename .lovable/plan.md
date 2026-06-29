# Відвʼязати проєкт від Lovable AI Gateway та Lovable Emails

Ціль: сайт залежить тільки від Supabase (бекенд) та Google Gemini (AI). Жодних викликів `ai.gateway.lovable.dev`, жодних Lovable email-хуків, жодного підтвердження email.

## Що змінюю

### 1. Edge Function `translate-uk`
Зараз шле запити на `https://ai.gateway.lovable.dev/v1/chat/completions` з `LOVABLE_API_KEY` — саме звідти прийшов лист «Low Balance». Переписую `callGateway` на прямий виклик Google Gemini (`generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent`) з ключем `GEMINI_API_KEY`, який ти вже дав. Кеш через `translation_cache` лишається.

### 2. Edge Function `news-aggregator` (функція `translateOne`)
Та сама заміна: прямий Gemini замість Lovable Gateway. Логіку батчів по 6 і ліміт 250 не чіпаю.

### 3. Edge Function `ai-assistant`
Вже працює напряму через Gemini — нічого не міняю.

### 4. Lovable Emails / підтвердження email
- Викликаю `email_domain--toggle_project_emails` з `enabled: false`, щоб вимкнути будь-яку email-обвʼязку Lovable.
- Викликаю `supabase--configure_auth`, щоб увімкнути авто-підтвердження email (`mailer_autoconfirm: true`) — користувач реєструється і одразу заходить, ніяких листів.
- Перевіряю чи в коді є `email-hook`/шаблони листів; якщо є — видаляю.

### 5. Секрет `LOVABLE_API_KEY`
Після правок він більше нікому не потрібен. Видаляю через `secrets--delete_secret`, щоб з проєкту не текли ліміти Lovable AI.

### 6. Re-deploy
Деплою `translate-uk` та `news-aggregator` з новим кодом.

## Технічні деталі

- Формат Gemini API: `{ contents: [{ role: "user", parts: [{ text }] }], systemInstruction: { parts: [{ text: SYSTEM }] }, generationConfig: { temperature: 0.2, responseMimeType: "application/json" } }` для перекладу новин (JSON-режим) і без `responseMimeType` для `translate-uk`.
- Заголовок: `x-goog-api-key: ${GEMINI_API_KEY}`.
- Fallback-моделі: `gemini-2.5-flash` → `gemini-2.0-flash` → `gemini-1.5-flash` (як уже зроблено в `ai-assistant`).
- Таймаути та обробку помилок зберігаю.

## Що НЕ зачіпаю
Фронтенд, БД, RLS, Telegram-auth, маркет-функції, дизайн — все лишається як є. Це чисто бекенд-чистка від Lovable-залежностей.