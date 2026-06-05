-- AlterTable
ALTER TABLE "OperationPayment" ADD COLUMN     "accountId" INTEGER,
ADD COLUMN     "currencyId" INTEGER,
ADD COLUMN     "paymentDate" TIMESTAMP(3);

-- AddForeignKey
ALTER TABLE "OperationPayment" ADD CONSTRAINT "OperationPayment_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationPayment" ADD CONSTRAINT "OperationPayment_currencyId_fkey" FOREIGN KEY ("currencyId") REFERENCES "Currency"("id") ON DELETE SET NULL ON UPDATE CASCADE;
