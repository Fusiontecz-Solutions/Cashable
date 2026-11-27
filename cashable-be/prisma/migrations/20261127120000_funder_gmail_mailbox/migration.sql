-- Funder-wise outbound email provider (Settings → Funders → Edit).
--
-- * FunderProfile.sendgridFromEmail / sendgridFromName: the funder's verified
--   SendGrid sender. Null = the server default (SENDGRID_FROM_EMAIL / NAME).
-- * FunderProfile.mailProvider: 'sendgrid' (default, unchanged behaviour) or
--   'gmail'. Gmail is opted into per funder once its mailbox is verified.
-- * FunderMailbox: one Google mailbox per funder. The refresh token is stored
--   AES-256-GCM encrypted (`enc:v1:` prefix, src/utils/fieldEncryption.ts).
--
-- Additive only: no existing column is dropped or rewritten.

ALTER TABLE "FunderProfile"
    ADD COLUMN IF NOT EXISTS "sendgridFromEmail" TEXT,
    ADD COLUMN IF NOT EXISTS "sendgridFromName" TEXT,
    ADD COLUMN IF NOT EXISTS "mailProvider" TEXT NOT NULL DEFAULT 'sendgrid';

CREATE TABLE IF NOT EXISTS "FunderMailbox" (
    "id" UUID NOT NULL,
    "funderProfileId" UUID NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'gmail',
    "email" TEXT,
    "sendAsEmail" TEXT,
    "refreshTokenEnc" TEXT,
    "oauthClientId" TEXT,
    "scopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" TEXT NOT NULL DEFAULT 'disconnected',
    "verifiedAt" TIMESTAMP(3),
    "connectedById" UUID,
    "connectedAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "lastErrorAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "FunderMailbox_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "FunderMailbox_funderProfileId_key"
    ON "FunderMailbox"("funderProfileId");
CREATE INDEX IF NOT EXISTS "FunderMailbox_email_idx" ON "FunderMailbox"("email");
CREATE INDEX IF NOT EXISTS "FunderMailbox_status_idx" ON "FunderMailbox"("status");

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FunderMailbox_funderProfileId_fkey') THEN
        ALTER TABLE "FunderMailbox"
            ADD CONSTRAINT "FunderMailbox_funderProfileId_fkey"
            FOREIGN KEY ("funderProfileId") REFERENCES "FunderProfile"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FunderMailbox_connectedById_fkey') THEN
        ALTER TABLE "FunderMailbox"
            ADD CONSTRAINT "FunderMailbox_connectedById_fkey"
            FOREIGN KEY ("connectedById") REFERENCES "User"("id")
            ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;
