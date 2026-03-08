/*
  Warnings:

  - You are about to alter the column `balance` on the `account` table. The data in that column could be lost. The data in that column will be cast from `Decimal(20,4)` to `Decimal(20,2)`.
  - You are about to alter the column `amount` on the `transaction` table. The data in that column could be lost. The data in that column will be cast from `Decimal(20,4)` to `Decimal(20,2)`.
  - You are about to alter the column `openingBalance` on the `transaction` table. The data in that column could be lost. The data in that column will be cast from `Decimal(20,4)` to `Decimal(20,2)`.
  - You are about to alter the column `closingBalance` on the `transaction` table. The data in that column could be lost. The data in that column will be cast from `Decimal(20,4)` to `Decimal(20,2)`.

*/
-- AlterTable
ALTER TABLE `account` MODIFY `balance` DECIMAL(20, 2) NOT NULL DEFAULT 0.00;

-- AlterTable
ALTER TABLE `transaction` MODIFY `amount` DECIMAL(20, 2) NOT NULL DEFAULT 0.00,
    MODIFY `openingBalance` DECIMAL(20, 2) NOT NULL DEFAULT 0.00,
    MODIFY `closingBalance` DECIMAL(20, 2) NOT NULL DEFAULT 0.00;
