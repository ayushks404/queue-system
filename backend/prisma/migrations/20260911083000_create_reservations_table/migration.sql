-- CreateTable reservations
CREATE TABLE "reservations" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "service_id" UUID NOT NULL,
    "slot_date" DATE NOT NULL,
    "slot_time" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reservations_pkey" PRIMARY KEY ("id")
);

-- Unique index for slot locking
CREATE UNIQUE INDEX "reservations_branch_service_slot_unique" ON "reservations" ("branch_id", "service_id", "slot_date", "slot_time");

-- Foreign key constraints
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE CASCADE ON UPDATE CASCADE;
