# Interview Planner

Schedule short online interviews for a large group of students across many teachers.
A static, responsive web app (works on phones, tablets and desktops) hosted on GitHub Pages, with [Supabase](https://supabase.com) (Postgres + Auth) as the backend.

## How it works

Three roles, all signed in:

| Role | Can do |
| --- | --- |
| **Administrator** | Create interview sessions (start date, end date), invite teachers (and optionally students) by email, open/close booking, see the full schedule, export CSV, cancel bookings. |
| **Teacher** | Add 1-hour availability slots within the session dates, hide/publish them, and see which students booked each 5-minute interview. |
| **Student** | Pick one free 5-minute time from all published slots, **without seeing the teacher**, and change it **once**. |

Each 1-hour slot is split into **10 interviews of 5 minutes, followed by a 10-minute buffer**.
The interview itself happens outside the app.

### Rules enforced in the database

The frontend is public, so every rule lives in Postgres (row-level security + `SECURITY DEFINER` functions):

- Students can't read slots or teachers; they only get free times through `available_subslots()`.
- When several teachers offer the same time, students see it once and get a random free interview at that time.
- `book_subslot()` books atomically (no double booking) and allows exactly one change per student per session.
- Teachers only see their own slots and the students booked in them.
- A slot with bookings can't be deleted or moved; slots must fall inside the session dates; a teacher's slots can't overlap.
- Students can only book in sessions that are **open** and where they are invited (or, in "open" sessions, whose email matches an optional domain such as `upb.ro`).

Session lifecycle: **draft** (teachers add slots, students don't see it) → **open** (students book) → **closed** (read-only).

## Setup

### 1. Supabase project

1. Create a free project at [supabase.com](https://supabase.com/dashboard).
2. Open **SQL Editor**, paste [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql) and run it.
3. Make yourself the first administrator (use the email you will sign in with):
   ```sql
   insert into public.admin_emails (email) values ('you@upb.ro');
   ```
4. **Authentication → URL Configuration**: set *Site URL* to `https://razvand.github.io/interview-planner/` and add it (plus `http://localhost:5173/` for development) to *Redirect URLs*.

> Free projects pause after a week without activity; resume them from the dashboard.

### 2. Sign-in providers

Enable them under **Authentication → Sign In / Providers**. The callback URL to register with each provider is `https://<project-ref>.supabase.co/auth/v1/callback`.

- **Microsoft (UPB)** – provider *Azure*. Register an app in Microsoft Entra ID (the UPB tenant, which may need tenant admin consent), add the callback URL as a *Web* redirect URI, create a client secret, and paste the client ID, secret and tenant URL (`https://login.microsoftonline.com/<tenant-id>`) into Supabase.
- **Google** – create an OAuth client (type *Web application*) in Google Cloud Console with the callback URL, and paste the client ID and secret into Supabase.
- **Email link** – enabled by default. Supabase's built-in mailer is heavily rate-limited, so for many students configure **custom SMTP** (Authentication → Emails → SMTP Settings).

Choose which buttons the app shows with `VITE_AUTH_PROVIDERS` (below).

Teachers and invited students are matched **by the email they sign in with**, so invite the address their provider reports (e.g. the UPB Microsoft address).

### 3. GitHub Pages

1. **Settings → Pages → Build and deployment → Source: Deploy from a branch**, branch `gh-pages`, folder `/ (root)`. The workflow builds the app and publishes it to that branch.
2. Set the Supabase URL and publishable key in [`src/config.js`](src/config.js), or override them with **Settings → Secrets and variables → Actions → Variables**:

   | Variable | Value |
   | --- | --- |
   | `VITE_SUPABASE_URL` | `https://<project-ref>.supabase.co` |
   | `VITE_SUPABASE_ANON_KEY` | the project's public *anon* / *publishable* key |
   | `VITE_AUTH_PROVIDERS` | e.g. `azure,google,email` (order = button order) |
   | `VITE_AZURE_LABEL` | optional, defaults to `UPB Microsoft account` |

   The anon key is meant to be public; row-level security protects the data. **Never** put the `service_role` key in the repo or the app.
3. Push to `main` (or run the workflow manually). The app is published at `https://razvand.github.io/interview-planner/`.

## Development

```bash
cp .env.example .env.local   # fill in your Supabase URL and anon key
npm install
npm run dev                  # http://localhost:5173
npm run test:db              # database smoke test in an in-memory Postgres (PGlite)
npm run build
```

## Project layout

```
supabase/migrations/   database schema, security policies and API functions
src/pages/             Login, Home, AdminSession, Admins, TeacherSession, StudentSession, Profile
tests/db.test.mjs      database flow test (admin → teacher → student)
.github/workflows/     GitHub Pages deployment
```

## Contributing

Issues and pull requests are welcome.

## License

[MIT](LICENSE)
