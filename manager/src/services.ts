import * as crypto from "crypto";
import * as request from "request-promise-native";

import { Application } from "./app";
import {
  ApiKey,
  Assertion,
  Checklist,
  Flow,
  IFlowRunSummary,
  Schedule,
  Snapshot,
  Webhook,
  WebhookEventType,
} from "./entities";

export class ApiKeyService {
  public app: Application;

  constructor(app: Application) {
    this.app = app;
  }

  public entityFromRow(row: { id: number; key: string }): ApiKey {
    return new ApiKey(row.id, row.key);
  }

  public async create() {
    const time = new Date().getTime().toString();
    const key = crypto
      .createHash("md5")
      .update(time)
      .digest("hex");
    const result = await this.app.database.query(`insert into api_keys (key) values ($1) returning *`, [key]);
    return this.entityFromRow(result.rows[0]);
  }

  public async delete(id: number) {
    await this.app.database.query(`delete from api_keys where id = $1`, [id]);
  }

  public async findByKey(key: string): Promise<ApiKey> {
    const result = await this.app.database.query(`select * from api_keys where key = $1`, [key]);
    if (result.rows.length === 0) {
      return null;
    }
    return this.entityFromRow(result.rows[0]);
  }
}

export class ChecklistService {
  public app: Application;

  constructor(app: Application) {
    this.app = app;
  }

  public entityFromRow(row: { id: number; worker_origin: string }): Checklist {
    return new Checklist(row.id, row.worker_origin);
  }

  public async create(apiKeyId: number, workerOrigin: string): Promise<Checklist> {
    const result = await this.app.database.query(
      `insert into checklists (api_key_id, worker_origin) values ($1, $2) returning *`,
      [apiKeyId, workerOrigin],
    );
    return this.entityFromRow(result.rows[0]);
  }

  public async update(checklist: Checklist) {
    await this.app.database.query(`update checklists set worker_origin = $2 where id = $1`, [
      checklist.id,
      checklist.workerOrigin,
    ]);
  }

  public async delete(id: number) {
    await this.app.database.query(`delete from snapshots where flow_id in
      (select id from flows where checklist_id = $1)`, [id]);
    await this.app.database.query(`delete from flows where checklist_id = $1`, [id]);
    await this.app.database.query(`delete from checklists where id = $1`, [id]);
  }

  public async deleteByApiKeyId(id: number) {
    await this.app.database.query(`delete from snapshots where flow_id in
      (select id from flows where checklist_id in
        (select id from checklists where api_key_id = $1))`, [id]);
    await this.app.database.query(`delete from flows where checklist_id in
      (select id from checklists where api_key_id = $1)`, [id]);
    await this.app.database.query(`delete from checklists where api_key_id = $1`, [id]);
  }

  public async find(id: number, apiKeyId: number): Promise<Checklist> {
    const result = await this.app.database.query(`select * from checklists where id = $1 and api_key_id = $2`, [
      id,
      apiKeyId,
    ]);
    if (result.rows.length === 0) {
      return null;
    }
    return this.entityFromRow(result.rows[0]);
  }

  public async findAll(apiKeyId: number): Promise<Checklist[]> {
    const query = `select * from checklists where api_key_id = $1 order by id`;
    const result = await this.app.database.query(query, [apiKeyId]);
    return result.rows.map(this.entityFromRow);
  }

  public async run(checklist: Checklist): Promise<Flow[]> {
    const flows = await this.app.flowService.findAllByChecklist(checklist.id);
    for (const flow of flows) {
      const snapshots = await this.app.snapshotService.findAllByFlow(flow.id);
      flow.assertions = snapshots.map((s) => s.toAssertion());
    }
    const result = await request.post({
      body: {
        flows: flows.map((f) => ({
          assertions: f.assertions.map((a) => ({
            name: a.nameWithoutNumber(),
            snapshot: a.snapshot,
          })),
          name: f.name,
        })),
      },
      json: true,
      uri: checklist.workerOrigin + "/v0/run",
    });

    for (const flow of result.flows) {
      flow.summary = { match: 0, miss: 0, new: 0 } as IFlowRunSummary;

      let databaseFlow = flows.find((f) => f.name === flow.name);
      if (!databaseFlow) {
        databaseFlow = await this.app.flowService.create(checklist.id, flow.name);
      }

      const assertionsSeen = new Map<string, number>();
      for (const assertion of flow.assertions) {
        // Compute assertion name (accounting for duplicates)
        let assertionName = assertion.name;
        if (assertionsSeen.get(assertion.name) > 0) {
          assertionName += "[" + String(assertionsSeen.get(assertion.name) + 1) + "]";
        }
        assertionsSeen.set(assertion.Name, assertionsSeen.get(assertion.Name) + 1);

        // Create missing / new snapshots
        let databaseAssertion = databaseFlow.assertions.find((a) => a.name === assertionName);
        if (!databaseAssertion) {
          const snapshot = await this.app.snapshotService.create(
            databaseFlow.id, assertionName, assertion.snapshot,
          );
          databaseAssertion = snapshot.toAssertion();
        }

        // Augment worker response with saved snapshot data & summary
        assertion.name = assertionName;
        if (assertion.result === "MISS") {
          assertion.expectedSnapshot = databaseAssertion.snapshot;
        }
        flow.summary[assertion.result.toLowerCase()]++;
      }
    }

    return result.flows as Flow[];
  }
}

export class FlowService {
  public app: Application;

  constructor(app: Application) {
    this.app = app;
  }

  public entityFromRow(row: { id: number; name: string }): Flow {
    return new Flow(row.id, row.name);
  }

  public async create(checklistId: number, name: string): Promise<Flow> {
    const result = await this.app.database.query(
      `insert into flows (checklist_id, name) values ($1, $2) returning *`,
      [checklistId, name],
    );
    return this.entityFromRow(result.rows[0]);
  }

  public async findAllByChecklist(checklistId: number): Promise<Flow[]> {
    const query = `select * from flows where checklist_id = $1 order by id`;
    const result = await this.app.database.query(query, [checklistId]);
    return result.rows.map(this.entityFromRow);
  }
}

export class SnapshotService {
  public app: Application;

  constructor(app: Application) {
    this.app = app;
  }

  public entityFromRow(row: { id: number; name: string, value: string }): Snapshot {
    return new Snapshot(row.id, row.name, row.value);
  }

  public async create(flowId: number, name: string, value: string): Promise<Snapshot> {
    const result = await this.app.database.query(
      `insert into snapshots (flow_id, name, value) values ($1, $2, $3) returning *`,
      [flowId, name, value],
    );
    return this.entityFromRow(result.rows[0]);
  }

  public async update(checklistId: number, flowName: string, name: string, value: string): Promise<void> {
    const query = `insert into snapshots (flow_id, name, value)
      values ((select id from flows where checklist_id = $1 and name = $2), $3, $4)
      on conflict (flow_id, name) do nothing`;
    await this.app.database.query(query, [checklistId, flowName, name, value]);
  }

  public async findAllByFlow(flowId: number): Promise<Snapshot[]> {
    const query = `select * from snapshots where flow_id = $1 order by id`;
    const result = await this.app.database.query(query, [flowId]);
    return result.rows.map(this.entityFromRow);
  }
}

export class ScheduleService {
  public app: Application;

  constructor(app: Application) {
    this.app = app;
  }

  public entityFromRow(row: { id: number; checklist_id: number, cron: string }): Schedule {
    return new Schedule(row.id, row.checklist_id, row.cron);
  }

  public async create(checklistId: number, cron: string): Promise<Schedule> {
    const result = await this.app.database.query(
      `insert into schedules (checklist_id, cron) values ($1, $2) returning *`,
      [checklistId, cron],
    );
    return this.entityFromRow(result.rows[0]);
  }

  public async update(schedule: Schedule): Promise<void> {
    const query = `update schedules set cron = $2 where id = $1`;
    await this.app.database.query(query, [schedule.id, schedule.cron]);
  }

  public async delete(id: number) {
    await this.app.database.query(`delete from schedules where id = $1`, [id]);
  }

  public async find(id: number, apiKeyId: number): Promise<Schedule> {
    const query = `select * from schedules where id = $1
      and checklist_id in (select id from checklists where api_key_id = $2)
      order by id`;
    const result = await this.app.database.query(query, [id, apiKeyId]);
    if (result.rows.length === 0) {
      return null;
    }
    return this.entityFromRow(result.rows[0]);
  }

  public async findAll(apiKeyId: number): Promise<Schedule[]> {
    const query = `select * from schedules
      where checklist_id in (select id from checklists where api_key_id = $1)
      order by id`;
    const result = await this.app.database.query(query, [apiKeyId]);
    return result.rows.map(this.entityFromRow);
  }
}

export class WebhookService {
  public app: Application;

  constructor(app: Application) {
    this.app = app;
  }

  public entityFromRow(row: { id: number; eventType: WebhookEventType, url: string }): Webhook {
    return new Webhook(row.id, row.eventType, row.url);
  }
}
