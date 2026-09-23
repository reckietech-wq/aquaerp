-- AlterTable
ALTER TABLE `Client` ADD COLUMN `totalBottlesCollected` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `totalBottlesDelivered` INTEGER NOT NULL DEFAULT 0;
