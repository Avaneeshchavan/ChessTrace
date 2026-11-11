const { PrismaClient } = require('@prisma/client');
const { findExactMatch, findSimilarPositions, fenCoreToFullFen } = require('../src/search');
const { Chess } = require('chess.js');

async function main() {
  const prisma = new PrismaClient();
  
  console.log('Finding a baseline position from the DB...');
  // Grab a random position that has castling rights so it's early in the game (more pieces)
  const randomPosition = await prisma.position.findFirst({
    where: { halfMove: { gt: 5 } }
  });

  if (!randomPosition) {
    console.log('No positions found in DB. Did the ingestion complete?');
    await prisma.$disconnect();
    return;
  }

  const fenCore = randomPosition.fenCore;
  console.log(`\n=== Testing Exact Match ===`);
  console.log(`Target fenCore: ${fenCore}`);
  
  const exactMatches = await findExactMatch(prisma, fenCore);
  console.log(`Exact matches found: ${exactMatches.length}`);
  if (exactMatches.length > 0) {
    console.log(`First match - gameId: ${exactMatches[0].gameId}, halfMove: ${exactMatches[0].halfMove}`);
  } else {
    console.log('FAILED: Could not find exact match.');
  }

  // Generate a slightly modified position by making one legal move
  const fullFen = fenCoreToFullFen(fenCore);
  const chess = new Chess(fullFen);
  const moves = chess.moves();
  if (moves.length > 0) {
    chess.move(moves[0]); // Just pick the first legal move
  }
  
  const modifiedFenParts = chess.fen().split(' ');
  const modifiedFenCore = `${modifiedFenParts[0]} ${modifiedFenParts[1]} ${modifiedFenParts[2]}`;
  
  console.log(`\n=== Testing Similarity Search ===`);
  console.log(`Modified fenCore (1 move later): ${modifiedFenCore}`);
  
  const similar = await findSimilarPositions(prisma, modifiedFenCore, 5);
  console.log(`Similar positions found: ${similar.length}`);
  
  const isOriginalInResults = similar.some(p => p.id === randomPosition.id || p.fenCore === fenCore);
  console.log(`Is the original position in the top 5 similarity results? ${isOriginalInResults ? 'YES' : 'NO'}`);
  
  console.log('\nTop 3 closest positions:');
  similar.slice(0, 3).forEach(p => {
    console.log(`- Distance: ${p.distance.toFixed(4)} | fenCore: ${p.fenCore}`);
  });

  await prisma.$disconnect();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
