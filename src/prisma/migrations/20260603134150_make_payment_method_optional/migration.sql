-- DropForeignKey
ALTER TABLE "OperationPayment" DROP CONSTRAINT "OperationPayment_paymentMethodId_fkey";

-- AlterTable
ALTER TABLE "OperationPayment" ALTER COLUMN "paymentMethodId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "OperationPayment" ADD CONSTRAINT "OperationPayment_paymentMethodId_fkey" FOREIGN KEY ("paymentMethodId") REFERENCES "PaymentMethod"("id") ON DELETE SET NULL ON UPDATE CASCADE;
