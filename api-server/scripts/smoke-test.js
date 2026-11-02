const { Chess } = require('chess.js');
const { checkSyntacticLegality } = require('../src/legality');
const { computeStructuralVector, toPgvectorLiteral } = require('../src/vector');

function main() {
  const chess = new Chess();
  // Play a quick 5-ply (2.5 move) game (Ruy Lopez opening)
  chess.move('e4');
  chess.move('e5');
  chess.move('Nf3');
  chess.move('Nc6');
  chess.move('Bb5');

  const fen = chess.fen();
  console.log('--- FEN ---');
  console.log(fen);

  const legality = checkSyntacticLegality(fen);
  console.log('\n--- Legality Check ---');
  console.log(legality);

  try {
    const vector = computeStructuralVector(fen);
    console.log('\n--- Generated Vector Literal ---');
    console.log(toPgvectorLiteral(vector));
  } catch (err) {
    console.error('\n--- Vector Error ---');
    console.error(err.message);
  }
}

main();
