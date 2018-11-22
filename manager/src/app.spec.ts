import * as assert from "assert";
import * as supertest from "supertest";
import app, { Application } from "./app";
import { ApiKey, WebhookEventType } from "./entities";

// tslint:disable:max-line-length

const apiKeyIdSubquery = `(select id from api_keys where key = $1)`;

function authorizationHeaderForKey(key: string) {
  return "Basic " + Buffer.from(key + ":").toString("base64");
}

before(async () => {
  await app.setup();
  await app.database.query(`truncate api_keys, checklists, flows, snapshots, schedules, webhooks`);
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
    await app.database.query(`truncate checklists, flows, snapshots, schedules`);
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
    assert.deepEqual(response.body, { data: { checklist: checklists[0].toJSON() } });
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
    assert.deepEqual(response.body, { data: { checklist: checklist.toJSON() } });
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

  async function callRun(checklistId: number) {
    return await supertest(app.httpServer)
      .post("/v1/checklists/" + String(checklistId) + "/run")
      .set("Authorization", authorizationHeaderForKey(apiKey.key))
      .set("Accept", "application/json")
      .expect("Content-Type", /json/)
      .expect(200);
  }

  it("Run (POST /v1/checklists/<id>/run) - All New", async () => {
    const checklist = await app.checklistService.create(apiKey.id, "http://localhost:3000");

    const response = await callRun(checklist.id);
    assert.deepEqual(response.body, {
      data: {
        flows: [{
          assertions: [{
            name: "returns 404 not found",
            result: "NEW",
            snapshot: "{\"error\":{\"cause\":\"The request's URI points to a resource which does not exist.\",\"code\":4002,\"message\":\"Requested resource not found\"}}",
          }, {
            name: "returns 401 not authorized",
            result: "NEW",
            snapshot: "{\"error\":{\"cause\":\"The API key is either missing, is no longer active, or malformed.\",\"code\":4000,\"message\":\"Missing or invalid API key.\"}}",
          }, {
            name: "list should be empty",
            result: "NEW",
            snapshot: "{\"data\":{\"todos\":[]}}",
          }, {
            name: "invalid todos should return 4xx",
            result: "NEW",
            snapshot: "{\"error\":{\"cause\":\"The request's payload is either missing or malformed.\",\"code\":4001,\"message\":\"Missing or invalid request payload.\"}}",
          }, {
            name: "returns a 201",
            result: "NEW",
            snapshot: "{\"data\":{\"todo\":{\"text\":\"brush teeth\",\"done\":false}}}",
          }, {
            name: "list should have one todo",
            result: "NEW",
            snapshot: "{\"data\":{\"todos\":[{\"text\":\"brush teeth\",\"done\":false}]}}",
          }, {
            name: "list should have two items",
            result: "NEW",
            snapshot: "{\"data\":{\"todos\":[{\"text\":\"brush teeth\",\"done\":false},{\"text\":\"wash face\",\"done\":false}]}}",
          }, {
            name: "first todo should be done",
            result: "NEW",
            snapshot: "{\"data\":{\"todos\":[{\"text\":\"brush teeth\",\"done\":true},{\"text\":\"wash face\",\"done\":false}]}}",
          }, {
            name: "second todo has new text",
            result: "NEW",
            snapshot: "{\"data\":{\"todos\":[{\"text\":\"brush teeth\",\"done\":true},{\"text\":\"wash face gently\",\"done\":false}]}}",
          }, {
            name: "second list should be empty",
            result: "NEW",
            snapshot: "{\"data\":{\"todos\":[]}}",
          }, {
            name: "first todo is deleted",
            result: "NEW",
            snapshot: "{\"data\":{\"todos\":[{\"text\":\"wash face gently\",\"done\":false}]}}",
          }, {
            name: "second todo is deleted",
            result: "NEW",
            snapshot: "{\"data\":{\"todos\":[]}}",
          }, {
            name: "second key should be invalid",
            result: "NEW",
            snapshot: "{\"error\":{\"cause\":\"The API key is either missing, is no longer active, or malformed.\",\"code\":4000,\"message\":\"Missing or invalid API key.\"}}",
          }, {
            name: "first key should be invalid",
            result: "NEW",
            snapshot: "{\"error\":{\"cause\":\"The API key is either missing, is no longer active, or malformed.\",\"code\":4000,\"message\":\"Missing or invalid API key.\"}}",
          }],
          name: "Basic API functionality",
          summary: {
            match: 0, miss: 0, new: 14,
          },
        }],
      },
    });

    const flowsResult = await app.database.query(`select * from flows`);
    assert.equal(flowsResult.rows.length, 1);
    const snapshotsResult = await app.database.query(`select * from snapshots`);
    assert.equal(snapshotsResult.rows.length, 14);
  });

  it("Run (POST /v1/checklists/<id>/run) - All Match", async () => {
    const checklist = await app.checklistService.create(apiKey.id, "http://localhost:3000");
    await callRun(checklist.id);
    const response = await callRun(checklist.id);
    assert.deepEqual(response.body.data.flows[0].summary, {
      match: 14, miss: 0, new: 0,
    });
  });

  it("Run (POST /v1/checklists/<id>/run) - One Miss", async () => {
    const checklist = await app.checklistService.create(apiKey.id, "http://localhost:3000");

    await callRun(checklist.id);
    await app.database.query(`update snapshots set value = '!' where name = $1`, ["first key should be invalid"]);

    const response = await callRun(checklist.id);
    assert.deepEqual(response.body.data.flows[0].summary, {
      match: 13, miss: 1, new: 0,
    });
    const assertions = response.body.data.flows[0].assertions;
    assert.deepEqual(assertions[assertions.length - 1], {
      expectedSnapshot: "!",
      name: "first key should be invalid",
      result: "MISS",
      snapshot: "{\"error\":{\"cause\":\"The API key is either missing, is no longer active, or malformed.\",\"code\":4000,\"message\":\"Missing or invalid API key.\"}}",
    });
  });
});

describe("Snapshots", () => {
  let apiKey: ApiKey = null;

  before(async () => {
    apiKey = await app.apiKeyService.create();
  });

  beforeEach(async () => {
    await app.database.query(`truncate checklists, flows, snapshots, schedules`);
  });

  it("Update (POST /v1/checklists/<id>/snapshots)", async () => {
    const checklist = await app.checklistService.create(apiKey.id, "http://localhost:3000");
    const flow = await app.flowService.create(checklist.id, "API 1");
    const snapshot1 = await app.snapshotService.create(flow.id, "Assertion 1", "!");
    const snapshot2 = await app.snapshotService.create(flow.id, "Assertion 2", "@");

    const flows = [{
      name: flow.name,
      snapshots: [{
        name: snapshot2.name,
        value: "###",
      }],
    }];

    const response = await supertest(app.httpServer)
      .post("/v1/checklists/" + String(checklist.id) + "/snapshots")
      .set("Authorization", authorizationHeaderForKey(apiKey.key))
      .set("Accept", "application/json")
      .send({ flows })
      .expect("Content-Type", /json/)
      .expect(201);

    assert.deepEqual(response.body, { data: { flows } });

    const snapshots = await app.snapshotService.findAllByFlow(flow.id);
    assert.deepEqual(snapshots.map((s) => s.value), ["!", "@"]);
  });
});

describe("Schedules", () => {
  let apiKey: ApiKey = null;
  let checklistId: number = null;

  before(async () => {
    apiKey = await app.apiKeyService.create();
    const result = await app.database.query(
      `insert into checklists (api_key_id, worker_origin) values ($1, 'http://1') returning *`,
      [apiKey.id],
    );
    checklistId = result.rows[0].id;
  });

  beforeEach(async () => {
    await app.database.query(`truncate schedules`);
  });

  it("List (GET /v1/schedules) - No item", async () => {
    const response = await supertest(app.httpServer)
      .get("/v1/schedules")
      .set("Authorization", authorizationHeaderForKey(apiKey.key))
      .set("Accept", "application/json")
      .expect("Content-Type", /json/)
      .expect(200);
    assert.deepEqual(response.body, { data: { schedules: [] } });
  });

  it("List (GET /v1/schedules) - Multiple items", async () => {
    const result = await app.database.query(
      `insert into schedules (checklist_id, cron, last_ran_at)
        values ($1, '0 */15 * * * *', now()), ($1, '0 * 1 * * *', now()) returning *`,
      [checklistId],
    );
    const schedules = result.rows.map((r: { id: number; cron: string }) => ({
      checklistId,
      cron: r.cron,
      id: r.id,
    }));

    const response = await supertest(app.httpServer)
      .get("/v1/schedules")
      .set("Authorization", authorizationHeaderForKey(apiKey.key))
      .set("Accept", "application/json")
      .expect("Content-Type", /json/)
      .expect(200);
    assert.deepEqual(response.body, { data: { schedules } });
  });

  it("Create (POST /v1/schedules)", async () => {
    const response = await supertest(app.httpServer)
      .post("/v1/schedules")
      .set("Authorization", authorizationHeaderForKey(apiKey.key))
      .set("Accept", "application/json")
      .send({ checklistId, cron: "* * * * * *" })
      .expect("Content-Type", /json/)
      .expect(201);
    const schedules = await app.scheduleService.findAll(apiKey.id);
    assert.deepEqual(response.body, { data: { schedule: schedules[0].toJSON() } });
  });

  it("Create (POST /v1/schedules) - Bad Request", async () => {
    const response = await supertest(app.httpServer)
      .post("/v1/schedules")
      .set("Authorization", authorizationHeaderForKey(apiKey.key))
      .set("Accept", "application/json")
      .send({ cron: 0 })
      .expect("Content-Type", /json/)
      .expect(400);
    assert.deepEqual(response.body.error, Application.Errors.BadRequest);
  });

  it("Create (POST /v1/schedules) - Not our checklist", async () => {
    const response = await supertest(app.httpServer)
      .post("/v1/schedules")
      .set("Authorization", authorizationHeaderForKey(apiKey.key))
      .set("Accept", "application/json")
      .send({ checklistId: 0, cron: "* * * * * *" })
      .expect("Content-Type", /json/)
      .expect(404);
    assert.deepEqual(response.body.error, Application.Errors.NotFound);
  });

  it("Update (PUT /v1/schedules/<id>)", async () => {
    const schedule = await app.scheduleService.create(checklistId, "0 30 * * * *");
    schedule.cron = "0 0 * * * *";

    const response = await supertest(app.httpServer)
      .put("/v1/schedules/" + String(schedule.id))
      .set("Authorization", authorizationHeaderForKey(apiKey.key))
      .set("Accept", "application/json")
      .send({ cron: schedule.cron })
      .expect("Content-Type", /json/)
      .expect(200);
    assert.deepEqual(response.body, { data: { schedule: schedule.toJSON() } });
  });

  it("Update (PUT /v1/schedules/<id>) - Bad Request", async () => {
    const schedule = await app.scheduleService.create(checklistId, "* * * * * *");

    const response = await supertest(app.httpServer)
      .put("/v1/schedules/" + String(schedule.id))
      .set("Authorization", authorizationHeaderForKey(apiKey.key))
      .set("Accept", "application/json")
      .send({ cron: 0 })
      .expect("Content-Type", /json/)
      .expect(400);
    assert.deepEqual(response.body.error, Application.Errors.BadRequest);
  });

  it("Update (PUT /v1/schedules/<id>) - Not Found", async () => {
    const response = await supertest(app.httpServer)
      .put("/v1/schedules/1")
      .set("Authorization", authorizationHeaderForKey(apiKey.key))
      .set("Accept", "application/json")
      .send({ cron: "* * * * * *" })
      .expect("Content-Type", /json/)
      .expect(404);
    assert.deepEqual(response.body.error, Application.Errors.NotFound);
  });

  it("Delete (DELETE /v1/schedules/<id>)", async () => {
    const schedule = await app.scheduleService.create(checklistId, "* * * * * *");

    const response = await supertest(app.httpServer)
      .delete("/v1/schedules/" + String(schedule.id))
      .set("Authorization", authorizationHeaderForKey(apiKey.key))
      .set("Accept", "application/json")
      .expect("Content-Type", /json/)
      .expect(200);
    assert.deepEqual(response.body, { message: "Successfully deleted." });

    const schedules = await app.scheduleService.findAll(apiKey.id);
    assert(schedules.length === 0);
  });

  it("Delete (DELETE /v1/schedules/<id>) - Not Found", async () => {
    const response = await supertest(app.httpServer)
      .delete("/v1/schedules/1")
      .set("Authorization", authorizationHeaderForKey(apiKey.key))
      .set("Accept", "application/json")
      .expect("Content-Type", /json/)
      .expect(404);
    assert.deepEqual(response.body.error, Application.Errors.NotFound);
  });
});

describe("Webhooks", () => {
  let apiKey: ApiKey = null;

  before(async () => {
    apiKey = await app.apiKeyService.create();
  });

  beforeEach(async () => {
    await app.database.query(`truncate webhooks`);
  });

  it("List (GET /v1/webhooks) - No item", async () => {
    const response = await supertest(app.httpServer)
      .get("/v1/webhooks")
      .set("Authorization", authorizationHeaderForKey(apiKey.key))
      .set("Accept", "application/json")
      .expect("Content-Type", /json/)
      .expect(200);
    assert.deepEqual(response.body, { data: { webhooks: [] } });
  });

  it("List (GET /v1/webhooks) - Multiple items", async () => {
    const result = await app.database.query(
      `insert into webhooks (api_key_id, event_type, url)
        values ($1, 'start', 'http://1'), ($1, 'end', 'http://2') returning *`,
      [apiKey.id],
    );
    const webhooks = result.rows.map((r: { id: number; event_type: string, url: string }) => ({
      eventType: r.event_type,
      id: r.id,
      url: r.url,
    }));

    const response = await supertest(app.httpServer)
      .get("/v1/webhooks")
      .set("Authorization", authorizationHeaderForKey(apiKey.key))
      .set("Accept", "application/json")
      .expect("Content-Type", /json/)
      .expect(200);
    assert.deepEqual(response.body, { data: { webhooks } });
  });

  it("Create (POST /v1/webhooks)", async () => {
    const response = await supertest(app.httpServer)
      .post("/v1/webhooks")
      .set("Authorization", authorizationHeaderForKey(apiKey.key))
      .set("Accept", "application/json")
      .send({ eventType: WebhookEventType.ScheduledChecklistStart, url: "http://1" })
      .expect("Content-Type", /json/)
      .expect(201);
    const webhooks = await app.webhookService.findAll(apiKey.id);
    assert.deepEqual(response.body, { data: { webhook: webhooks[0] } });
  });

  it("Create (POST /v1/webhooks) - Bad Request", async () => {
    const response = await supertest(app.httpServer)
      .post("/v1/webhooks")
      .set("Authorization", authorizationHeaderForKey(apiKey.key))
      .set("Accept", "application/json")
      .send({ url: "", eventType: "something else" })
      .expect("Content-Type", /json/)
      .expect(400);
    assert.deepEqual(response.body.error, Application.Errors.BadRequest);
  });

  it("Update (PUT /v1/webhooks/<id>)", async () => {
    const webhook = await app.webhookService.create(
      apiKey.id,
      WebhookEventType.ScheduledChecklistStart,
      "http://localhost:3001",
    );
    webhook.url = "http://prod";

    const response = await supertest(app.httpServer)
      .put("/v1/webhooks/" + String(webhook.id))
      .set("Authorization", authorizationHeaderForKey(apiKey.key))
      .set("Accept", "application/json")
      .send({ url: webhook.url })
      .expect("Content-Type", /json/)
      .expect(200);
    assert.deepEqual(response.body, { data: { webhook } });
  });

  it("Update (PUT /v1/webhooks/<id>) - Bad Request", async () => {
    const webhook = await app.webhookService.create(
      apiKey.id,
      WebhookEventType.ScheduledChecklistStart,
      "http://localhost:3001",
    );

    const response = await supertest(app.httpServer)
      .put("/v1/webhooks/" + String(webhook.id))
      .set("Authorization", authorizationHeaderForKey(apiKey.key))
      .set("Accept", "application/json")
      .send({ url: 0 })
      .expect("Content-Type", /json/)
      .expect(400);
    assert.deepEqual(response.body.error, Application.Errors.BadRequest);
  });

  it("Update (PUT /v1/webhooks/<id>) - Not Found", async () => {
    const response = await supertest(app.httpServer)
      .put("/v1/webhooks/1")
      .set("Authorization", authorizationHeaderForKey(apiKey.key))
      .set("Accept", "application/json")
      .send({ cron: "* * * * * *" })
      .expect("Content-Type", /json/)
      .expect(404);
    assert.deepEqual(response.body.error, Application.Errors.NotFound);
  });

  it("Delete (DELETE /v1/webhooks/<id>)", async () => {
    const webhook = await app.webhookService.create(
      apiKey.id,
      WebhookEventType.ScheduledChecklistStart,
      "http://localhost:3001",
    );

    const response = await supertest(app.httpServer)
      .delete("/v1/webhooks/" + String(webhook.id))
      .set("Authorization", authorizationHeaderForKey(apiKey.key))
      .set("Accept", "application/json")
      .expect("Content-Type", /json/)
      .expect(200);
    assert.deepEqual(response.body, { message: "Successfully deleted." });

    const webhooks = await app.webhookService.findAll(apiKey.id);
    assert(webhooks.length === 0);
  });

  it("Delete (DELETE /v1/webhooks/<id>) - Not Found", async () => {
    const response = await supertest(app.httpServer)
      .delete("/v1/webhooks/1")
      .set("Authorization", authorizationHeaderForKey(apiKey.key))
      .set("Accept", "application/json")
      .expect("Content-Type", /json/)
      .expect(404);
    assert.deepEqual(response.body.error, Application.Errors.NotFound);
  });
});
