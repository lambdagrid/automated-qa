const { Client } = require("pg");
const connectionString = process.env.DATABASE_URL || "postgresql://admin:admin@localhost:5432/automatedqa";

async function setupDatabase() {
  const client = new Client({ connectionString });
  await client.connect();

  await client.query(`create table api_keys (
    id serial primary key,
    key text
  )`);
  await client.query(`create index api_keys_key_idx on api_keys (key)`);

  await client.query(`create table checklists (
    id serial primary key,
    api_key_id integer references api_keys (id),
    worker_origin text not null
  )`);

  await client.query(`create table flows (
    id serial primary key,
    checklist_id integer references checklists (id),
    name text not null
  )`);

  await client.query(`create table snapshots (
    id serial primary key,
    flow_id integer references flows (id),
    name text not null,
    value text not null,
    unique (flow_id, name)
  )`);

  await client.query(`create table schedules (
    id serial primary key,
    checklist_id integer references checklists (id),
    cron text not null
  )`);

  await client.query(`create table webhooks (
    id serial primary key,
    api_key_id integer references api_keys (id),
    event_type text not null,
    url text not null
  )`);
  console.log("Database tables api_keys, checklists, flows, snapshots, schedules and webhooks created.");
  client.end();
}
setupDatabase().catch((err) => {
  console.error(err);
  process.exit(1);
});
