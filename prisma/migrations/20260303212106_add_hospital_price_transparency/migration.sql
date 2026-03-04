-- CreateTable
CREATE TABLE "Hospital" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "borough" TEXT NOT NULL DEFAULT 'Manhattan',
    "sourceFile" TEXT NOT NULL,
    "lastSeeded" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Procedure" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "cptCode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT ''
);

-- CreateTable
CREATE TABLE "PriceEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "hospitalId" TEXT NOT NULL,
    "procedureId" TEXT NOT NULL,
    "payerName" TEXT NOT NULL,
    "payerType" TEXT NOT NULL,
    "priceInCents" INTEGER NOT NULL,
    "priceType" TEXT NOT NULL,
    "rawCode" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PriceEntry_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PriceEntry_procedureId_fkey" FOREIGN KEY ("procedureId") REFERENCES "Procedure" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Procedure_cptCode_key" ON "Procedure"("cptCode");

-- CreateIndex
CREATE INDEX "PriceEntry_procedureId_idx" ON "PriceEntry"("procedureId");

-- CreateIndex
CREATE INDEX "PriceEntry_procedureId_payerType_idx" ON "PriceEntry"("procedureId", "payerType");
