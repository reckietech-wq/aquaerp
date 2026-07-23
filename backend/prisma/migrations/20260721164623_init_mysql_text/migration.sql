-- AlterTable
ALTER TABLE `Client` MODIFY `address` TEXT NOT NULL;

-- AlterTable
ALTER TABLE `Delivery` MODIFY `notes` TEXT NULL;

-- AlterTable
ALTER TABLE `InventoryLog` MODIFY `note` TEXT NULL;

-- AlterTable
ALTER TABLE `Invoice` MODIFY `paymentQrData` TEXT NULL;

-- AlterTable
ALTER TABLE `MonthlyBill` MODIFY `pdfPath` TEXT NULL;
