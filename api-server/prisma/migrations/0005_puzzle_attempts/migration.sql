BEGIN;

ALTER TABLE "SavedPuzzle" ADD COLUMN "mateIn" INTEGER;

CREATE TABLE "Attempt" (
    "id" TEXT NOT NULL,
    "puzzleId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "moveUci" TEXT NOT NULL,
    "correct" BOOLEAN NOT NULL,
    "usedHint" BOOLEAN NOT NULL,
    "evalLoss" INTEGER,
    "millis" INTEGER NOT NULL,
    "motifs" TEXT[] NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Attempt_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Attempt_puzzleId_fkey" FOREIGN KEY ("puzzleId") REFERENCES "SavedPuzzle"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Attempt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "Attempt_userId_createdAt_idx" ON "Attempt"("userId", "createdAt");
CREATE INDEX "Attempt_puzzleId_idx" ON "Attempt"("puzzleId");

COMMIT;
