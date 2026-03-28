-- CreateTable
CREATE TABLE "OnboardingStepConfig" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "icon" TEXT,
    "targetRoute" TEXT,
    "ctaLabel" TEXT,
    "ctaRoute" TEXT,
    "completionRule" TEXT NOT NULL,
    "roles" JSONB NOT NULL DEFAULT '[]',
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OnboardingStepConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OnboardingState" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "completedSteps" JSONB NOT NULL DEFAULT '[]',
    "dismissedSteps" JSONB NOT NULL DEFAULT '[]',
    "currentStep" TEXT,
    "isDismissed" BOOLEAN NOT NULL DEFAULT false,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OnboardingState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OnboardingAnalytics" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "stepKey" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OnboardingAnalytics_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OnboardingStepConfig_projectId_key_key" ON "OnboardingStepConfig"("projectId", "key");

-- CreateIndex
CREATE INDEX "OnboardingStepConfig_projectId_isEnabled_order_idx" ON "OnboardingStepConfig"("projectId", "isEnabled", "order");

-- CreateIndex
CREATE UNIQUE INDEX "OnboardingState_userId_projectId_key" ON "OnboardingState"("userId", "projectId");

-- CreateIndex
CREATE INDEX "OnboardingState_userId_projectId_idx" ON "OnboardingState"("userId", "projectId");

-- CreateIndex
CREATE INDEX "OnboardingState_projectId_idx" ON "OnboardingState"("projectId");

-- CreateIndex
CREATE INDEX "OnboardingAnalytics_projectId_stepKey_action_idx" ON "OnboardingAnalytics"("projectId", "stepKey", "action");

-- CreateIndex
CREATE INDEX "OnboardingAnalytics_projectId_createdAt_idx" ON "OnboardingAnalytics"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "OnboardingAnalytics_userId_projectId_idx" ON "OnboardingAnalytics"("userId", "projectId");

-- AddForeignKey
ALTER TABLE "OnboardingStepConfig" ADD CONSTRAINT "OnboardingStepConfig_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OnboardingState" ADD CONSTRAINT "OnboardingState_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OnboardingState" ADD CONSTRAINT "OnboardingState_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OnboardingAnalytics" ADD CONSTRAINT "OnboardingAnalytics_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
