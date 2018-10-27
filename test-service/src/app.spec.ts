import * as assert from "assert";
import * as supertest from "supertest";
import app, { ApiKey, Application } from "./app";

const apiKeyIdSubquery = `(select id from api_keys where key = $1)`;

function authorizationHeaderForKey(key: string) {
  return "Basic " + Buffer.from(key + ":").toString("base64");
}

before(async () => {
  await app.setup();
  await app.database.query(`truncate api_keys, todos`);
});

describe("App", () => {
  it("Index (GET /)", () =>
    supertest(app.httpServer)
      .get("/")
      .set("Accept", "application/json")
      .expect("Content-Type", /json/)
      .expect(200));

  it("Not Found Page (GET /404)", async () => {
    const response = await supertest(app.httpServer)
      .get("/404")
      .set("Accept", "application/json")
      .expect("Content-Type", /json/)
      .expect(404);
    assert(typeof response.body.error === "object");
    assert.deepEqual(response.body.error, Application.Errors.NotFound);
  });
});

describe("API Keys", () => {
  let apiKey: string = null;

  it("Create (POST /api-keys)", async () => {
    const response = await supertest(app.httpServer)
      .post("/api-keys")
      .set("Accept", "application/json")
      .expect("Content-Type", /json/)
      .expect(201);
    assert(typeof response.body.data === "object");
    assert(typeof response.body.data.api_key === "string");
    apiKey = response.body.data.api_key;
  });

  it("Delete (DELETE /api-keys)", async () => {
    await app.database.query(
      `insert into todos (text, done, api_key_id) values ('#1', false, ` + apiKeyIdSubquery + `)`,
      [apiKey],
    );

    const response = await supertest(app.httpServer)
      .delete("/api-keys")
      .set("Authorization", authorizationHeaderForKey(apiKey))
      .set("Accept", "application/json")
      .expect("Content-Type", /json/)
      .expect(200);
    assert(response.body.message === "Successfully deleted.");

    const result = await app.database.query(`select * from todos where api_key_id = ` + apiKeyIdSubquery, [apiKey]);
    assert(result.rows.length === 0);
  });

  it("Delete (DELETE /api-keys) - Unauthorized", async () => {
    const response = await supertest(app.httpServer)
      .delete("/api-keys")
      .set("Accept", "application/json")
      .expect("Content-Type", /json/)
      .expect(401);
    assert(typeof response.body.error === "object");
    assert.deepEqual(response.body.error, Application.Errors.Unauthorized);
  });
});

describe("Todos", () => {
  let apiKey: ApiKey = null;

  before(async () => {
    apiKey = await app.apiKeyService.create();
  });

  beforeEach(async () => {
    await app.database.query(`truncate todos`);
  });

  it("List (GET /todos) - No Todo", async () => {
    const response = await supertest(app.httpServer)
      .get("/todos")
      .set("Authorization", authorizationHeaderForKey(apiKey.key))
      .set("Accept", "application/json")
      .expect("Content-Type", /json/)
      .expect(200);
    assert.deepEqual(response.body, { data: { todos: [] } });
  });

  it("List (GET /todos) - Multiple Todos", async () => {
    const result = await app.database.query(
      `insert into todos (text, done, api_key_id) values ('#1', true, $1), ('#2', false, $1) returning *`,
      [apiKey.id],
    );
    const todos = result.rows.map((r: { id: number; text: string; done: boolean }) => ({
      done: r.done,
      id: r.id,
      text: r.text,
    }));

    const response = await supertest(app.httpServer)
      .get("/todos")
      .set("Authorization", authorizationHeaderForKey(apiKey.key))
      .set("Accept", "application/json")
      .expect("Content-Type", /json/)
      .expect(200);
    assert.deepEqual(response.body, { data: { todos } });
  });

  it("Create (POST /todos)", async () => {
    const response = await supertest(app.httpServer)
      .post("/todos")
      .set("Authorization", authorizationHeaderForKey(apiKey.key))
      .set("Accept", "application/json")
      .send({ text: "#1" })
      .expect("Content-Type", /json/)
      .expect(201);
    const todos = await app.todoService.findAll(apiKey.id);
    assert.deepEqual(response.body, { data: { todo: todos[0] } });
  });

  it("Create (POST /todos) - Bad Request", async () => {
    const response = await supertest(app.httpServer)
      .post("/todos")
      .set("Authorization", authorizationHeaderForKey(apiKey.key))
      .set("Accept", "application/json")
      .send({ text: 100 })
      .expect("Content-Type", /json/)
      .expect(400);
    assert.deepEqual(response.body.error, Application.Errors.BadRequest);
  });

  it("Update (PUT /todos/<id>)", async () => {
    const todo = await app.todoService.create("#1", false, apiKey.id);
    todo.text = "#1 - Updated";
    todo.done = true;

    const response = await supertest(app.httpServer)
      .put("/todos/" + String(todo.id))
      .set("Authorization", authorizationHeaderForKey(apiKey.key))
      .set("Accept", "application/json")
      .send({ text: todo.text, done: todo.done })
      .expect("Content-Type", /json/)
      .expect(200);
    assert.deepEqual(response.body, { data: { todo } });
  });

  it("Update (PUT /todos/<id>) - Bad Request", async () => {
    const todo = await app.todoService.create("#1", false, apiKey.id);

    const response = await supertest(app.httpServer)
      .put("/todos/" + String(todo.id))
      .set("Authorization", authorizationHeaderForKey(apiKey.key))
      .set("Accept", "application/json")
      .send({ text: 100 })
      .expect("Content-Type", /json/)
      .expect(400);
    assert.deepEqual(response.body.error, Application.Errors.BadRequest);
  });

  it("Update (PUT /todos/<id>) - Not Found", async () => {
    const response = await supertest(app.httpServer)
      .put("/todos/1")
      .set("Authorization", authorizationHeaderForKey(apiKey.key))
      .set("Accept", "application/json")
      .send({ text: "" })
      .expect("Content-Type", /json/)
      .expect(404);
    assert.deepEqual(response.body.error, Application.Errors.NotFound);
  });

  it("Update (PUT /todos/<id>) - Not Found with existing todo id", async () => {
    // Create a todo the api key we are using doesn't own
    const otherApiKey = await app.apiKeyService.create();
    const todo = await app.todoService.create("#1", false, otherApiKey.id);

    const response = await supertest(app.httpServer)
      .put("/todos/" + String(todo.id))
      .set("Authorization", authorizationHeaderForKey(apiKey.key))
      .set("Accept", "application/json")
      .send({ text: "" })
      .expect("Content-Type", /json/)
      .expect(404);
    assert.deepEqual(response.body.error, Application.Errors.NotFound);
  });

  it("Delete (DELETE /todos/<id>)", async () => {
    const todo = await app.todoService.create("#1", false, apiKey.id);

    const response = await supertest(app.httpServer)
      .delete("/todos/" + String(todo.id))
      .set("Authorization", authorizationHeaderForKey(apiKey.key))
      .set("Accept", "application/json")
      .expect("Content-Type", /json/)
      .expect(200);
    assert.deepEqual(response.body, { message: "Successfully deleted." });

    const todos = await app.todoService.findAll(apiKey.id);
    assert(todos.length === 0);
  });

  it("Delete (DELETE /todos/<id>) - Not Found", async () => {
    const response = await supertest(app.httpServer)
      .delete("/todos/1")
      .set("Authorization", authorizationHeaderForKey(apiKey.key))
      .set("Accept", "application/json")
      .expect("Content-Type", /json/)
      .expect(404);
    assert.deepEqual(response.body.error, Application.Errors.NotFound);
  });

  it("Delete (DELETE /todos/<id>) - Not Found with no api key", async () => {
    const response = await supertest(app.httpServer)
      .delete("/todos/1")
      .set("Accept", "application/json")
      .expect("Content-Type", /json/)
      .expect(404);
    assert.deepEqual(response.body.error, Application.Errors.NotFound);
  });
});
