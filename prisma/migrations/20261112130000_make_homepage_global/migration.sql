CREATE TABLE "AppSettings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "homepagePageId" TEXT,
    CONSTRAINT "AppSettings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AppSettings_homepagePageId_key"
ON "AppSettings"("homepagePageId");

INSERT INTO "AppSettings" ("id", "homepagePageId")
SELECT 1, "homepagePageId"
FROM "User"
WHERE "homepagePageId" IS NOT NULL
ORDER BY "homepagePageId"
LIMIT 1
ON CONFLICT ("id") DO NOTHING;

ALTER TABLE "AppSettings"
ADD CONSTRAINT "AppSettings_homepagePageId_fkey"
FOREIGN KEY ("homepagePageId") REFERENCES "Page"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "User"
DROP CONSTRAINT "User_homepagePageId_fkey";

ALTER TABLE "User"
DROP COLUMN "homepagePageId";
