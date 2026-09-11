-- CreateTable
CREATE TABLE "services" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "duration_minutes" INTEGER NOT NULL,
    "price" DECIMAL(10,2) NOT NULL,
    "capacity" INTEGER NOT NULL DEFAULT 1,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "services_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "resources" (
    "id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "resources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_resources" (
    "id" UUID NOT NULL,
    "service_id" UUID NOT NULL,
    "resource_type" TEXT NOT NULL,

    CONSTRAINT "service_resources_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "resources" ADD CONSTRAINT "resources_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_resources" ADD CONSTRAINT "service_resources_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE CASCADE ON UPDATE CASCADE;
