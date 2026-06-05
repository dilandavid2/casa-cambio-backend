-- AlterTable
ALTER TABLE "OperationPayment" ADD COLUMN     "requiresVerification" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "verifiedAt" TIMESTAMP(3);
