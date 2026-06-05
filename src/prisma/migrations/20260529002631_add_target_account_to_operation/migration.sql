-- AlterTable
ALTER TABLE "Operation" ADD COLUMN     "targetAccountId" INTEGER;

-- AddForeignKey
ALTER TABLE "Operation" ADD CONSTRAINT "Operation_targetAccountId_fkey" FOREIGN KEY ("targetAccountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
