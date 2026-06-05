-- CreateTable
CREATE TABLE "OperationSplit" (
    "id" SERIAL NOT NULL,
    "operationId" INTEGER NOT NULL,
    "targetCurrencyId" INTEGER NOT NULL,
    "accountId" INTEGER,
    "amount" DOUBLE PRECISION NOT NULL,
    "valueCOP" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OperationSplit_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "OperationSplit" ADD CONSTRAINT "OperationSplit_operationId_fkey" FOREIGN KEY ("operationId") REFERENCES "Operation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationSplit" ADD CONSTRAINT "OperationSplit_targetCurrencyId_fkey" FOREIGN KEY ("targetCurrencyId") REFERENCES "Currency"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationSplit" ADD CONSTRAINT "OperationSplit_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
