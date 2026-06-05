-- AlterTable
ALTER TABLE "Operation" ADD COLUMN     "sourceAccountId" INTEGER;

-- AddForeignKey
ALTER TABLE "Operation" ADD CONSTRAINT "Operation_sourceAccountId_fkey" FOREIGN KEY ("sourceAccountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
