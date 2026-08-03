-- AlterTable
ALTER TABLE `Client` ADD COLUMN `outstandingBalance` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    ADD COLUMN `ratePerBottle` DECIMAL(10, 2) NOT NULL DEFAULT 50;

-- AlterTable
ALTER TABLE `Invoice` ADD COLUMN `amountPaid` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    ADD COLUMN `paymentMethod` VARCHAR(191) NULL;

-- CreateTable
CREATE TABLE `PaymentHistory` (
    `id` VARCHAR(191) NOT NULL,
    `clientId` VARCHAR(191) NOT NULL,
    `invoiceId` VARCHAR(191) NULL,
    `amountPaid` DECIMAL(10, 2) NOT NULL,
    `paymentMethod` VARCHAR(191) NOT NULL,
    `balanceBefore` DECIMAL(10, 2) NOT NULL,
    `balanceAfter` DECIMAL(10, 2) NOT NULL,
    `recordedBy` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `PaymentHistory` ADD CONSTRAINT `PaymentHistory_clientId_fkey` FOREIGN KEY (`clientId`) REFERENCES `Client`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
