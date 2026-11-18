-- Payoff / prepay discount configuration (Settings -> Payoff Discount)
CREATE TABLE "PayoffDiscountSetting" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "tiers" JSONB,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayoffDiscountSetting_pkey" PRIMARY KEY ("id")
);
