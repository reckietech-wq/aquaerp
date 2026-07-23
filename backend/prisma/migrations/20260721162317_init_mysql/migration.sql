-- CreateTable
CREATE TABLE `User` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NULL,
    `mobile` VARCHAR(191) NOT NULL,
    `role` ENUM('ADMIN', 'DRIVER') NOT NULL,
    `loginId` VARCHAR(191) NOT NULL,
    `passwordHash` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `User_email_key`(`email`),
    UNIQUE INDEX `User_loginId_key`(`loginId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Driver` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `vehicleNumber` VARCHAR(191) NOT NULL,
    `vehicleType` VARCHAR(191) NOT NULL,
    `route` VARCHAR(191) NOT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `Driver_userId_key`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Client` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `mobile` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NULL,
    `address` VARCHAR(191) NOT NULL,
    `assignedDriverId` VARCHAR(191) NOT NULL,
    `route` VARCHAR(191) NOT NULL,
    `tempoNumber` VARCHAR(191) NOT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Delivery` (
    `id` VARCHAR(191) NOT NULL,
    `clientId` VARCHAR(191) NOT NULL,
    `driverId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NULL,
    `deliveryDate` DATETIME(3) NOT NULL,
    `filledBottlesDelivered` INTEGER NOT NULL,
    `emptyBottlesCollected` INTEGER NOT NULL,
    `status` ENUM('PENDING', 'COMPLETED') NOT NULL DEFAULT 'PENDING',
    `notes` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `MonthlyBill` (
    `id` VARCHAR(191) NOT NULL,
    `clientId` VARCHAR(191) NOT NULL,
    `month` INTEGER NOT NULL,
    `year` INTEGER NOT NULL,
    `totalBottlesDelivered` INTEGER NOT NULL,
    `totalEmptyCollected` INTEGER NOT NULL,
    `ratePerBottle` DECIMAL(10, 2) NOT NULL,
    `totalAmount` DECIMAL(10, 2) NOT NULL,
    `status` ENUM('DRAFT', 'SENT', 'PAID') NOT NULL DEFAULT 'DRAFT',
    `whatsappSentAt` DATETIME(3) NULL,
    `paidAt` DATETIME(3) NULL,
    `pdfPath` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `MonthlyBill_clientId_month_year_key`(`clientId`, `month`, `year`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Invoice` (
    `id` VARCHAR(191) NOT NULL,
    `clientId` VARCHAR(191) NOT NULL,
    `deliveryId` VARCHAR(191) NOT NULL,
    `invoiceNumber` VARCHAR(191) NOT NULL,
    `bottlesTakenSinceLastPaid` INTEGER NOT NULL,
    `amountPerBottle` DECIMAL(10, 2) NOT NULL,
    `totalAmount` DECIMAL(10, 2) NOT NULL,
    `isPaid` BOOLEAN NOT NULL DEFAULT false,
    `paidAt` DATETIME(3) NULL,
    `paymentQrData` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `Invoice_deliveryId_key`(`deliveryId`),
    UNIQUE INDEX `Invoice_invoiceNumber_key`(`invoiceNumber`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `BottleInventory` (
    `id` INTEGER NOT NULL,
    `totalFilledBottles` INTEGER NOT NULL DEFAULT 0,
    `totalEmptyBottles` INTEGER NOT NULL DEFAULT 0,
    `lastUpdatedAt` DATETIME(3) NOT NULL,
    `updatedBy` VARCHAR(191) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `InventoryLog` (
    `id` VARCHAR(191) NOT NULL,
    `type` ENUM('DELIVERY_OUT', 'COLLECTION_IN', 'ADMIN_RESTOCK', 'ADMIN_EMPTY_DISPATCH', 'MANUAL_ADJUSTMENT') NOT NULL,
    `filledChange` INTEGER NOT NULL,
    `emptyChange` INTEGER NOT NULL,
    `filledBalanceAfter` INTEGER NOT NULL,
    `emptyBalanceAfter` INTEGER NOT NULL,
    `referenceId` VARCHAR(191) NULL,
    `note` VARCHAR(191) NULL,
    `createdBy` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Driver` ADD CONSTRAINT `Driver_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Client` ADD CONSTRAINT `Client_assignedDriverId_fkey` FOREIGN KEY (`assignedDriverId`) REFERENCES `Driver`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Delivery` ADD CONSTRAINT `Delivery_clientId_fkey` FOREIGN KEY (`clientId`) REFERENCES `Client`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Delivery` ADD CONSTRAINT `Delivery_driverId_fkey` FOREIGN KEY (`driverId`) REFERENCES `Driver`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Delivery` ADD CONSTRAINT `Delivery_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MonthlyBill` ADD CONSTRAINT `MonthlyBill_clientId_fkey` FOREIGN KEY (`clientId`) REFERENCES `Client`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Invoice` ADD CONSTRAINT `Invoice_clientId_fkey` FOREIGN KEY (`clientId`) REFERENCES `Client`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Invoice` ADD CONSTRAINT `Invoice_deliveryId_fkey` FOREIGN KEY (`deliveryId`) REFERENCES `Delivery`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
