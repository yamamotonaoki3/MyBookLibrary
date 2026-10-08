# Layer boundaries

This application remains one Next.js application. `src/app` routes are framework adapters: they authenticate/request-bind, call backend use cases, and render or return the result.

`src/backend` is server-only code. It may import Prisma, repositories, and `src/shared`; it must not import React components, client hooks, or `src/frontend`.

`src/frontend` contains browser/UI code. It may import `src/shared` and UI components, but must not import Prisma, backend modules, or repositories. `src/shared` contains serializable contracts and pure helpers only; it imports neither frontend nor backend.

The first migrated read path is the dashboard's recent-reading-record query. `backend/dashboard/recentReads` maps Prisma records to `shared/dashboard`'s serializable `RecentRead` contract, which `frontend/dashboard/RecentReadCard` consumes.
