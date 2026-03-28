CREATE TABLE "ProjectBranding" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "organizationName" TEXT,
    "productName" TEXT,
    "logoUrl" TEXT,
    "faviconUrl" TEXT,
    "accentColor" TEXT NOT NULL DEFAULT '#22c55e',
    "supportEmail" TEXT,
    "supportUrl" TEXT,
    "helpCenterUrl" TEXT,
    "customDomain" TEXT,
    "loginHeadline" TEXT,
    "loginSubcopy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectBranding_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProjectPermissionRule" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "areaId" TEXT,
    "role" TEXT NOT NULL,
    "permission" TEXT NOT NULL,
    "effect" TEXT NOT NULL DEFAULT 'allow',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectPermissionRule_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OnboardingGuide" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "audienceRole" TEXT,
    "summary" TEXT,
    "content" JSONB NOT NULL,
    "isPublished" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OnboardingGuide_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProjectBranding_projectId_key" ON "ProjectBranding"("projectId");
CREATE INDEX "ProjectBranding_customDomain_idx" ON "ProjectBranding"("customDomain");

CREATE UNIQUE INDEX "ProjectPermissionRule_projectId_areaId_role_permission_key" ON "ProjectPermissionRule"("projectId", "areaId", "role", "permission");
CREATE INDEX "ProjectPermissionRule_projectId_role_idx" ON "ProjectPermissionRule"("projectId", "role");
CREATE INDEX "ProjectPermissionRule_projectId_areaId_role_idx" ON "ProjectPermissionRule"("projectId", "areaId", "role");

CREATE UNIQUE INDEX "OnboardingGuide_projectId_slug_key" ON "OnboardingGuide"("projectId", "slug");
CREATE INDEX "OnboardingGuide_projectId_audienceRole_isPublished_idx" ON "OnboardingGuide"("projectId", "audienceRole", "isPublished");
CREATE INDEX "OnboardingGuide_projectId_order_idx" ON "OnboardingGuide"("projectId", "order");

ALTER TABLE "ProjectBranding" ADD CONSTRAINT "ProjectBranding_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProjectPermissionRule" ADD CONSTRAINT "ProjectPermissionRule_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectPermissionRule" ADD CONSTRAINT "ProjectPermissionRule_areaId_fkey" FOREIGN KEY ("areaId") REFERENCES "Area"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "OnboardingGuide" ADD CONSTRAINT "OnboardingGuide_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OnboardingGuide" ADD CONSTRAINT "OnboardingGuide_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;