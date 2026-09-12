-- AlterTable services
ALTER TABLE "services" ADD COLUMN IF NOT EXISTS "description" TEXT;
ALTER TABLE "services" ADD COLUMN IF NOT EXISTS "buffer_time_minutes" INTEGER DEFAULT 0;

-- AlterTable waitlist
ALTER TABLE "waitlist" ADD COLUMN IF NOT EXISTS "reservation_id" UUID;

-- AlterTable appointments
ALTER TABLE "appointments" ADD COLUMN IF NOT EXISTS "reminder_sent_at" TIMESTAMP(3);

-- Update appointments idempotency key index
DROP INDEX IF EXISTS "appointments_idempotency_key_key";
CREATE UNIQUE INDEX IF NOT EXISTS "appointments_user_id_idempotency_key_key" ON "appointments"("user_id", "idempotency_key");

-- Update reservations slot index (remove unique constraint for capacity > 1 support)
DROP INDEX IF EXISTS "reservations_branch_service_slot_unique";
CREATE INDEX IF NOT EXISTS "reservations_branch_id_service_id_slot_date_slot_time_idx" ON "reservations"("branch_id", "service_id", "slot_date", "slot_time");

-- Update appointments cascade to restrict on branch and service
ALTER TABLE "appointments" DROP CONSTRAINT IF EXISTS "appointments_branch_id_fkey";
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "appointments" DROP CONSTRAINT IF EXISTS "appointments_service_id_fkey";
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
