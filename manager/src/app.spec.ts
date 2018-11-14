import * as assert from "assert";
import * as supertest from "supertest";
import app, { ApiKey, Application } from "./app";

const apiKeyIdSubquery = `(select id from api_keys where key = $1)`;

function authorizationHeaderForKey(key: string) {
  return "Basic " + Buffer.from(key + ":").toString("base64");
}

before(async () => {
  await app.setup();
  await app.database.query(`truncate api_keys, checklists, flows, snapshots`);
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
      `insert into checklists (api_key_id, worker_origin) values (` + apiKeyIdSubquery + `, 'http://1')`,
      [apiKey],
    );

    const response = await supertest(app.httpServer)
      .delete("/api-keys")
      .set("Authorization", authorizationHeaderForKey(apiKey))
      .set("Accept", "application/json")
      .expect("Content-Type", /json/)
      .expect(200);
    assert(response.body.message === "Successfully deleted.");

    const query = `select * from checklists where api_key_id = ` + apiKeyIdSubquery;
    const result = await app.database.query(query, [apiKey]);
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

describe("Checklists", () => {
  let apiKey: ApiKey = null;

  before(async () => {
    apiKey = await app.apiKeyService.create();
  });

  beforeEach(async () => {
    await app.database.query(`truncate checklists, flows, snapshots`);
  });

  it("List (GET /v1/checklists) - No Checklist", async () => {
    const response = await supertest(app.httpServer)
      .get("/v1/checklists")
      .set("Authorization", authorizationHeaderForKey(apiKey.key))
      .set("Accept", "application/json")
      .expect("Content-Type", /json/)
      .expect(200);
    assert.deepEqual(response.body, { data: { checklists: [] } });
  });

  it("List (GET /v1/checklists) - Multiple Checklists", async () => {
    const result = await app.database.query(
      `insert into checklists (api_key_id, worker_origin) values ($1, 'http://1'), ($1, 'http://2') returning *`,
      [apiKey.id],
    );
    const checklists = result.rows.map((r: { id: number; worker_origin: string }) => ({
      id: r.id,
      workerOrigin: r.worker_origin,
    }));

    const response = await supertest(app.httpServer)
      .get("/v1/checklists")
      .set("Authorization", authorizationHeaderForKey(apiKey.key))
      .set("Accept", "application/json")
      .expect("Content-Type", /json/)
      .expect(200);
    assert.deepEqual(response.body, { data: { checklists } });
  });

  it("Create (POST /v1/checklists)", async () => {
    const response = await supertest(app.httpServer)
      .post("/v1/checklists")
      .set("Authorization", authorizationHeaderForKey(apiKey.key))
      .set("Accept", "application/json")
      .send({ workerOrigin: "http://acme.com" })
      .expect("Content-Type", /json/)
      .expect(201);
    const checklists = await app.checklistService.findAll(apiKey.id);
    assert.deepEqual(response.body, { data: { checklist: checklists[0] } });
  });

  it("Create (POST /v1/checklists) - Bad Request", async () => {
    const response = await supertest(app.httpServer)
      .post("/v1/checklists")
      .set("Authorization", authorizationHeaderForKey(apiKey.key))
      .set("Accept", "application/json")
      .send({ workerOrigin: 100 })
      .expect("Content-Type", /json/)
      .expect(400);
    assert.deepEqual(response.body.error, Application.Errors.BadRequest);
  });

  it("Update (PUT /v1/checklists/<id>)", async () => {
    const checklist = await app.checklistService.create(apiKey.id, "http://localhost:3000");
    checklist.workerOrigin = "http://localhost:8888";

    const response = await supertest(app.httpServer)
      .put("/v1/checklists/" + String(checklist.id))
      .set("Authorization", authorizationHeaderForKey(apiKey.key))
      .set("Accept", "application/json")
      .send({ workerOrigin: checklist.workerOrigin })
      .expect("Content-Type", /json/)
      .expect(200);
    assert.deepEqual(response.body, { data: { checklist } });
  });

  it("Update (PUT /v1/checklists/<id>) - Bad Request", async () => {
    const checklist = await app.checklistService.create(apiKey.id, "http://localhost:3000");

    const response = await supertest(app.httpServer)
      .put("/v1/checklists/" + String(checklist.id))
      .set("Authorization", authorizationHeaderForKey(apiKey.key))
      .set("Accept", "application/json")
      .send({ workerOrigin: 100 })
      .expect("Content-Type", /json/)
      .expect(400);
    assert.deepEqual(response.body.error, Application.Errors.BadRequest);
  });

  it("Update (PUT /v1/checklists/<id>) - Not Found", async () => {
    const response = await supertest(app.httpServer)
      .put("/v1/checklists/1")
      .set("Authorization", authorizationHeaderForKey(apiKey.key))
      .set("Accept", "application/json")
      .send({ workerOrigin: "http://acme.com" })
      .expect("Content-Type", /json/)
      .expect(404);
    assert.deepEqual(response.body.error, Application.Errors.NotFound);
  });

  it("Update (PUT /v1/checklists/<id>) - Not Found with existing checklist id", async () => {
    // Create a checklist the api key we are using doesn't own
    const otherApiKey = await app.apiKeyService.create();
    const checklist = await app.checklistService.create(otherApiKey.id, "http://localhost:3000");

    const response = await supertest(app.httpServer)
      .put("/v1/checklists/" + String(checklist.id))
      .set("Authorization", authorizationHeaderForKey(apiKey.key))
      .set("Accept", "application/json")
      .send({ workerOrigin: "http://acme.com" })
      .expect("Content-Type", /json/)
      .expect(404);
    assert.deepEqual(response.body.error, Application.Errors.NotFound);
  });

  it("Delete (DELETE /v1/checklists/<id>)", async () => {
    const checklist = await app.checklistService.create(apiKey.id, "http://localhost:3000");

    const response = await supertest(app.httpServer)
      .delete("/v1/checklists/" + String(checklist.id))
      .set("Authorization", authorizationHeaderForKey(apiKey.key))
      .set("Accept", "application/json")
      .expect("Content-Type", /json/)
      .expect(200);
    assert.deepEqual(response.body, { message: "Successfully deleted." });

    const checklists = await app.checklistService.findAll(apiKey.id);
    assert(checklists.length === 0);
  });

  it("Delete (DELETE /v1/checklists/<id>) - Not Found", async () => {
    const response = await supertest(app.httpServer)
      .delete("/v1/checklists/1")
      .set("Authorization", authorizationHeaderForKey(apiKey.key))
      .set("Accept", "application/json")
      .expect("Content-Type", /json/)
      .expect(404);
    assert.deepEqual(response.body.error, Application.Errors.NotFound);
  });

  it("Delete (DELETE /v1/checklists/<id>) - Not Found with no api key", async () => {
    const response = await supertest(app.httpServer)
      .delete("/v1/checklists/1")
      .set("Accept", "application/json")
      .expect("Content-Type", /json/)
      .expect(404);
    assert.deepEqual(response.body.error, Application.Errors.NotFound);
  });

  it("Run (POST /v1/checklists/<id>/run)", async () => {
    const checklist = await app.checklistService.create(apiKey.id, "http://localhost:3000");

    const response = await supertest(app.httpServer)
      .post("/v1/checklists/" + String(checklist.id) + "/run")
      .set("Authorization", authorizationHeaderForKey(apiKey.key))
      .set("Accept", "application/json")
      .expect("Content-Type", /json/)
      .expect(200);
    assert.deepEqual(response.body, {
      data: {
        flows: [{
          assertions: [{
            name: "returns 404 not found",
            result: "NEW",
          }, {
            name: "returns 401 not authorized",
            result: "NEW",
          }, {
            name: "list should be empty",
            result: "NEW",
          }, {
            name: "invalid todos should return 4xx",
            result: "NEW",
          }, {
            name: "returns a 201",
            result: "NEW",
          }, {
            name: "list should have one todo",
            result: "NEW",
          }, {
            name: "list should have two items",
            result: "NEW",
          }, {
            name: "first todo should be done",
            result: "NEW",
          }, {
            name: "second todo has new text",
            result: "NEW",
          }, {
            name: "second list should be empty",
            result: "NEW",
          }, {
            name: "first todo is deleted",
            result: "NEW",
          }, {
            name: "second todo is deleted",
            result: "NEW",
          }, {
            name: "second key should be invalid",
            result: "NEW",
          }, {
            name: "first key should be invalid",
            result: "NEW",
          }],
          name: "Basic API functionality",
        }],
      },
    });
  });
});
