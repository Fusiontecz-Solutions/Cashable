-- Idempotent, additive: registry of PearSign-hosted document templates.
-- No existing table or column is changed.

CREATE TABLE IF NOT EXISTS "PearSignTemplate" (
    "id" UUID NOT NULL,
    "funderProfileId" UUID NOT NULL,
    "documentType" TEXT NOT NULL,
    "ownerCount" INTEGER NOT NULL DEFAULT 1,
    "state" TEXT,
    "frequency" TEXT,
    "layoutKey" TEXT NOT NULL,
    "sourcePdfUrl" TEXT,
    "sourcePdfSha256" TEXT,
    "pearsignTemplateId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "fieldCount" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PearSignTemplate_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PearSignTemplate_pearsignTemplateId_key"
    ON "PearSignTemplate" ("pearsignTemplateId");

CREATE INDEX IF NOT EXISTS "PearSignTemplate_funderProfileId_documentType_ownerCount_isActive_idx"
    ON "PearSignTemplate" ("funderProfileId", "documentType", "ownerCount", "isActive");
