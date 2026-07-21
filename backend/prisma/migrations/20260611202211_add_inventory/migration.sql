-- CreateEnum
CREATE TYPE "InventoryLogType" AS ENUM ('DELIVERY_OUT', 'COLLECTION_IN', 'ADMIN_RESTOCK', 'ADMIN_EMPTY_DISPATCH', 'MANUAL_ADJUSTMENT');

-- CreateTable
CREATE TABLE "BottleInventory" (
    "id" INTEGER NOT NULL,
    "totalFilledBottles" INTEGER NOT NULL DEFAULT 0,
    "totalEmptyBottles" INTEGER NOT NULL DEFAULT 0,
    "lastUpdatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT NOT NULL,

    CONSTRAINT "BottleInventory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryLog" (
    "id" TEXT NOT NULL,
    "type" "InventoryLogType" NOT NULL,
    "filledChange" INTEGER NOT NULL,
    "emptyChange" INTEGER NOT NULL,
    "filledBalanceAfter" INTEGER NOT NULL,
    "emptyBalanceAfter" INTEGER NOT NULL,
    "referenceId" TEXT,
    "note" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryLog_pkey" PRIMARY KEY ("id")
);
