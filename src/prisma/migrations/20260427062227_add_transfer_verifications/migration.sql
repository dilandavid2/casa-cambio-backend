-- CreateTable
CREATE TABLE "TransferVerification" (
    "id" SERIAL NOT NULL,
    "operationId" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "reason" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verifiedAt" TIMESTAMP(3),
    "verifiedById" INTEGER,

    CONSTRAINT "TransferVerification_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "TransferVerification" ADD CONSTRAINT "TransferVerification_operationId_fkey" FOREIGN KEY ("operationId") REFERENCES "Operation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransferVerification" ADD CONSTRAINT "TransferVerification_verifiedById_fkey" FOREIGN KEY ("verifiedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
