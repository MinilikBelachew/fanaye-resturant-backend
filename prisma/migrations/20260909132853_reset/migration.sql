/*
  Warnings:

  - You are about to drop the `role` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `session` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `status` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `user` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "session" DROP CONSTRAINT "session_userId_fkey";

-- DropForeignKey
ALTER TABLE "user" DROP CONSTRAINT "user_photoId_fkey";

-- DropForeignKey
ALTER TABLE "user" DROP CONSTRAINT "user_roleId_fkey";

-- DropForeignKey
ALTER TABLE "user" DROP CONSTRAINT "user_statusId_fkey";

-- DropTable
DROP TABLE "role";

-- DropTable
DROP TABLE "session";

-- DropTable
DROP TABLE "status";

-- DropTable
DROP TABLE "user";

-- RenameIndex
ALTER INDEX "uq_app_users__photo" RENAME TO "app_users_photo_id_key";

-- RenameIndex
ALTER INDEX "uq_bills__table_session" RENAME TO "bills_table_session_id_key";

-- RenameIndex
ALTER INDEX "uq_cash_drop_disputes__drop" RENAME TO "cash_drop_disputes_cash_drop_id_key";

-- RenameIndex
ALTER INDEX "uq_cashier_financial_sessions__shift" RENAME TO "cashier_financial_sessions_shift_session_id_key";

-- RenameIndex
ALTER INDEX "uq_cashier_reconciliations__session" RENAME TO "cashier_reconciliations_cashier_financial_session_id_key";

-- RenameIndex
ALTER INDEX "uq_transfer_receipts__payment" RENAME TO "transfer_receipts_payment_id_key";
