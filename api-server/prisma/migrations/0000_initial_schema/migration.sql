-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "vector";

-- CreateEnum
CREATE TYPE "ActivityType" AS ENUM ('LENS_SEARCH', 'SANDBOX_SESSION', 'TURNING_POINTS_RUN', 'PUZZLE_SAVED', 'PUZZLE_REVIEWED');

-- CreateTable
CREATE TABLE "Game" (
    "id" SERIAL NOT NULL,
    "whiteName" TEXT NOT NULL,
    "blackName" TEXT NOT NULL,
    "whiteElo" INTEGER,
    "blackElo" INTEGER,
    "playedAt" TIMESTAMP(3),
    "event" TEXT,
    "result" TEXT NOT NULL,
    "pgn" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Game_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Position" (
    "id" BIGSERIAL NOT NULL,
    "gameId" INTEGER NOT NULL,
    "halfMove" INTEGER NOT NULL,
    "fenCore" VARCHAR(90) NOT NULL,
    "vector" vector(32),

    CONSTRAINT "Position_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "displayName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SavedPuzzle" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fen" TEXT NOT NULL,
    "initialMove" TEXT,
    "solutionPgn" TEXT,
    "reviewStatus" TEXT NOT NULL DEFAULT 'DUE_TODAY',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SavedPuzzle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tag" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Tag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActivityLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "ActivityType" NOT NULL,
    "refId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActivityLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_PuzzleTags" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateIndex
CREATE INDEX "Game_whiteName_idx" ON "Game"("whiteName");

-- CreateIndex
CREATE INDEX "Game_blackName_idx" ON "Game"("blackName");

-- CreateIndex
CREATE INDEX "Game_event_idx" ON "Game"("event");

-- CreateIndex
CREATE INDEX "idx_position_fencore_hash" ON "Position" USING HASH ("fenCore");

-- CreateIndex
CREATE INDEX "Position_gameId_idx" ON "Position"("gameId");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Tag_name_key" ON "Tag"("name");

-- CreateIndex
CREATE INDEX "ActivityLog_userId_createdAt_idx" ON "ActivityLog"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "_PuzzleTags_AB_unique" ON "_PuzzleTags"("A", "B");

-- CreateIndex
CREATE INDEX "_PuzzleTags_B_index" ON "_PuzzleTags"("B");

-- AddForeignKey
ALTER TABLE "Position" ADD CONSTRAINT "Position_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedPuzzle" ADD CONSTRAINT "SavedPuzzle_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityLog" ADD CONSTRAINT "ActivityLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_PuzzleTags" ADD CONSTRAINT "_PuzzleTags_A_fkey" FOREIGN KEY ("A") REFERENCES "SavedPuzzle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_PuzzleTags" ADD CONSTRAINT "_PuzzleTags_B_fkey" FOREIGN KEY ("B") REFERENCES "Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;
