const { Client } = require("pg");
const connectionString = process.env.DATABASE_URL || "postgresql://admin:admin@localhost:5432/todos";

async function setupDatabase() {
  const client = new Client({ connectionString });
  await client.connect();
  await client.query(`create table api_keys (
        id serial primary key,
        key text)`);
  await client.query(`create index api_keys_key_idx on api_keys (key)`);
  await client.query(`create table todos (
        id serial primary key,
        text text,
        done boolean,
        api_key_id integer references api_keys (id))`);
  console.log("Database tables api_keys and todos created.");
  client.end();
}
setupDatabase().catch((err) => {
  console.error(err);
  process.exit(1);
});
