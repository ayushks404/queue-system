-- AlterTable
ALTER TABLE "appointments" ADD COLUMN "notes" TEXT;
ALTER TABLE "appointments" ALTER COLUMN "status" SET DEFAULT 'CONFIRMED';

-- AlterTable
ALTER TABLE "waitlist" DROP COLUMN IF EXISTS "position";

-- AlterTable
ALTER TABLE "audit_logs" ADD COLUMN "reason" TEXT;
