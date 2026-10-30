ALTER TABLE "Theme" ADD COLUMN "userId" TEXT;
ALTER TABLE "Page" ADD COLUMN "userId" TEXT;

DROP INDEX "Theme_slug_key";
DROP INDEX "Page_slug_key";

CREATE UNIQUE INDEX "Theme_userId_slug_key" ON "Theme"("userId", "slug");
CREATE UNIQUE INDEX "Page_userId_slug_key" ON "Page"("userId", "slug");

ALTER TABLE "Theme"
ADD CONSTRAINT "Theme_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Page"
ADD CONSTRAINT "Page_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
