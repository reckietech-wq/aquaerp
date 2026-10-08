-- AlterTable
ALTER TABLE `PaymentHistory` ADD COLUMN `customerId` VARCHAR(191) NULL;

-- AddForeignKey
ALTER TABLE `PaymentHistory` ADD CONSTRAINT `PaymentHistory_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `Customer`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
