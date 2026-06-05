-- CreateEnum
CREATE TYPE "OperationPaymentStatus" AS ENUM ('PAID', 'PARTIAL', 'PENDING');

-- AlterTable
ALTER TABLE "Operation" ADD COLUMN     "amountPaid" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "paymentStatus" "OperationPaymentStatus" NOT NULL DEFAULT 'PAID',
ADD COLUMN     "pendingAmount" DOUBLE PRECISION NOT NULL DEFAULT 0;
