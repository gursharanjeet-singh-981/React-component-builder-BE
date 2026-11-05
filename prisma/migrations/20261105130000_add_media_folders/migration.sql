CREATE TABLE "MediaFolder" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MediaFolder_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MediaFolder_userId_path_key" ON "MediaFolder"("userId", "path");
CREATE INDEX "MediaFolder_userId_createdAt_idx" ON "MediaFolder"("userId", "createdAt");

ALTER TABLE "MediaFolder"
ADD CONSTRAINT "MediaFolder_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
