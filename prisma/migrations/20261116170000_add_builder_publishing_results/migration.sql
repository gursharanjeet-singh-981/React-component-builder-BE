CREATE TABLE "BuilderPublishingResult" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "resultJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BuilderPublishingResult_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BuilderPublishingResult_userId_documentId_key"
ON "BuilderPublishingResult"("userId", "documentId");
CREATE INDEX "BuilderPublishingResult_userId_updatedAt_idx"
ON "BuilderPublishingResult"("userId", "updatedAt");

ALTER TABLE "BuilderPublishingResult"
ADD CONSTRAINT "BuilderPublishingResult_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
