const { Pool } = require('pg');
const { from } = require('pg-copy-streams');
const { Readable } = require('node:stream');
const { pipeline } = require('node:stream/promises');
const { Prisma } = require('@prisma/client');

const columns = {
  corpus_game_stage: ['hash', 'whiteName', 'blackName', 'whiteElo', 'blackElo', 'playedAt',
    'event', 'result', 'pgn', 'gzip', 'opening', 'eco', 'startFen', 'originalHash'],
  corpus_position_stage: ['key', 'gameId', 'ply', 'fenCore', 'vector'],
};

function csvCell(value) {
  return value == null ? '' : '"' + String(value).replaceAll('"', '""') + '"';
}

function copyDatabase(url) {
  const target = new URL(url);
  const schema = target.searchParams.get('schema') || 'public';
  if (!/^[a-z][a-z0-9_]{0,62}$/.test(schema)) throw Error('Invalid database schema');
  target.searchParams.delete('schema');
  const pool = new Pool({ connectionString: target.href, options: '-c search_path=' + schema, max: 1 });
  return {
    close: () => pool.end(),
    async $transaction(run) {
      const connection = await pool.connect();
      const query = (parts, ...values) => {
        const sql = Array.isArray(parts) ? Prisma.sql(parts, ...values) : parts;
        return connection.query(sql.text, sql.values);
      };
      try {
        await connection.query('BEGIN');
        const result = await run({
          $queryRaw: async (...args) => (await query(...args)).rows,
          $executeRaw: async (...args) => (await query(...args)).rowCount,
          async stage(table, rows) {
            const fields = columns[table];
            if (!fields) throw Error('Unknown COPY stage');
            await connection.query('TRUNCATE ' + table);
            function* csv() {
              for (const row of rows) yield fields.map(field => csvCell(row[field])).join(',') + '\n';
            }
            await pipeline(Readable.from(csv()), connection.query(from('COPY ' + table + ' FROM STDIN WITH (FORMAT csv)')));
          },
        });
        await connection.query('COMMIT');
        return result;
      } catch (error) {
        await connection.query('ROLLBACK').catch(() => {});
        throw error;
      } finally { connection.release(); }
    },
  };
}

module.exports = { copyDatabase };
