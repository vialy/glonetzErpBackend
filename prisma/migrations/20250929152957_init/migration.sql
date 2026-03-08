-- CreateTable
CREATE TABLE `User` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `deleted` BOOLEAN NOT NULL DEFAULT false,
    `email` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `User_email_key`(`email`),
    INDEX `User_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Transaction` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `userId` VARCHAR(191) NOT NULL,
    `narration` VARCHAR(191) NOT NULL DEFAULT '',
    `type` VARCHAR(191) NOT NULL,
    `transactionId` VARCHAR(191) NOT NULL,
    `amount` DECIMAL(20, 4) NOT NULL DEFAULT 0.00,
    `deleted` BOOLEAN NOT NULL DEFAULT false,
    `openingBalance` DECIMAL(20, 4) NOT NULL DEFAULT 0.00,
    `closingBalance` DECIMAL(20, 4) NOT NULL DEFAULT 0.00,
    `currencyCode` VARCHAR(191) NOT NULL DEFAULT 'XAF',
    `reference` VARCHAR(191) NULL,
    `accountId` INTEGER NOT NULL,
    `status` INTEGER NOT NULL DEFAULT 10,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `completedAt` DATETIME(3) NULL,
    `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `Transaction_createdAt_idx`(`createdAt`),
    INDEX `Transaction_narration_idx`(`narration`),
    INDEX `Transaction_userId_idx`(`userId`),
    INDEX `Transaction_reference_idx`(`reference`),
    INDEX `Transaction_transactionId_idx`(`transactionId`),
    INDEX `Transaction_amount_idx`(`amount`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Account` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `userId` VARCHAR(191) NOT NULL,
    `accountId` VARCHAR(191) NOT NULL,
    `narration` VARCHAR(191) NOT NULL DEFAULT '',
    `deleted` BOOLEAN NOT NULL DEFAULT false,
    `balance` DECIMAL(20, 4) NOT NULL DEFAULT 0.00,
    `type` VARCHAR(191) NOT NULL DEFAULT 'primary',
    `currencyCode` VARCHAR(191) NOT NULL DEFAULT 'XAF',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `Account_accountId_idx`(`accountId`),
    INDEX `Account_createdAt_idx`(`createdAt`),
    INDEX `Account_narration_idx`(`narration`),
    INDEX `Account_userId_idx`(`userId`),
    INDEX `Account_type_idx`(`type`),
    INDEX `Account_balance_idx`(`balance`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Transaction` ADD CONSTRAINT `Transaction_accountId_fkey` FOREIGN KEY (`accountId`) REFERENCES `Account`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
