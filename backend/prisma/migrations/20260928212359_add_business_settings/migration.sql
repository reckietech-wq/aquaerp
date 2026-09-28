-- CreateTable
CREATE TABLE `BusinessSettings` (
    `id` INTEGER NOT NULL DEFAULT 1,
    `signaturePath` TEXT NULL,
    `stampPath` TEXT NULL,
    `updatedAt` DATETIME(3) NOT NULL,
    `updatedBy` VARCHAR(191) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
