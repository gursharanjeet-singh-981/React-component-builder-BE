CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "vercelProjectId" TEXT,
    "deploymentJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Page" ADD COLUMN "projectId" TEXT;

CREATE UNIQUE INDEX "Project_userId_slug_key" ON "Project"("userId", "slug");
CREATE INDEX "Project_userId_createdAt_idx" ON "Project"("userId", "createdAt");
CREATE INDEX "Page_projectId_idx" ON "Page"("projectId");

ALTER TABLE "Project"
ADD CONSTRAINT "Project_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Page"
ADD CONSTRAINT "Page_projectId_fkey"
FOREIGN KEY ("projectId") REFERENCES "Project"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
