-- AlterTable
ALTER TABLE `Delivery` ADD COLUMN `isHistorical` BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE `Invoice` ADD COLUMN `isHistorical` BOOLEAN NOT NULL DEFAULT false;
