# Cashable CRM

- `cashable-be/`: backend (Node/TypeScript, Prisma)
- `cashable-fe/`: frontend (Vite + React)

Secrets (`.env`, CLEAR S2S credentials and `.pfx` certificates, Google service-account keys) are not stored in this repo. Supply them through environment variables (see `cashable-be/src/utils/CLEAR_Connection_Info/README.md`).
