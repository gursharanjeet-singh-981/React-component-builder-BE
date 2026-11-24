DROP INDEX "Page_userId_slug_key";

CREATE UNIQUE INDEX "Page_userId_slug_standalone_key"
ON "Page"("userId", "slug")
WHERE "projectId" IS NULL;

CREATE UNIQUE INDEX "Page_projectId_slug_key"
ON "Page"("projectId", "slug")
WHERE "projectId" IS NOT NULL;
