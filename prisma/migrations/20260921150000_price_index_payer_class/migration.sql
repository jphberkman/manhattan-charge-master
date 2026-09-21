-- Payer-class columns on the skinny PriceIndex.
-- negotiatedCents is commercial-only going forward; Medicare/Medicaid are separate.

ALTER TABLE "PriceIndex" ADD COLUMN IF NOT EXISTS "commercialCents" INTEGER;
ALTER TABLE "PriceIndex" ADD COLUMN IF NOT EXISTS "medicareCents" INTEGER;
ALTER TABLE "PriceIndex" ADD COLUMN IF NOT EXISTS "medicaidCents" INTEGER;
