import pg from "pg";
const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
try {
  const r = await c.query(process.argv[2]);
  for (const x of [].concat(r)) if (x.rows?.length) console.table(x.rows); else console.log(x.command, x.rowCount);
} catch (e) {
  console.error("ERR", e.code, e.message);
}
await c.end();
