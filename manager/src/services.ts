import { deepEqual } from "assert";
import { CronJob } from "cron";
import * as crypto from "crypto";
import * as request from "request-promise-native";

import { Application } from "./app";
import {
  ApiKey,
  Assertion,
  AssertionResult,
  Checklist,
  Flow,
  IFlowRunSummary,
  Schedule,
  Snapshot,
  Webhook,
  WebhookEventType,
} from "./entities";

const noop = (): void => { /* do nothing */ };

const log = (...args: any[]): void => {
  // tslint:disable-next-line:no-console
  console.log(...args);
};

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

  public entityFromRow(row: { id: number; worker_url: string; api_key_id: number }): Checklist {
    return new Checklist(row.id, row.worker_url, row.api_key_id);
  }

  public async create(apiKeyId: number, workerUrl: string): Promise<Checklist> {
    const result = await this.app.database.query(
      `insert into checklists (api_key_id, worker_url) values ($1, $2) returning *`,
      [apiKeyId, workerUrl],
    );
    return this.entityFromRow(result.rows[0]);
  }

  public async update(checklist: Checklist) {
    await this.app.database.query(`update checklists set worker_url = $2 where id = $1`, [
      checklist.id,
      checklist.workerUrl,
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

  public async find(id: number, apiKeyId?: number): Promise<Checklist> {
    let query = `select * from checklists where id = $1`;
    const params = [id];
    if (apiKeyId) {
      query += ` and api_key_id = $2`;
      params.push(apiKeyId);
    }
    const result = await this.app.database.query(query, params);
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
      json: true,
      uri: checklist.workerUrl,
    });

    for (const flow of result) {
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
          assertion.result = AssertionResult.New;
        } else {
          // An snapshot already exists, let's compare them
          try {
            const value = JSON.parse(assertion.snapshot);
            const expectedValue = JSON.parse(databaseAssertion.snapshot);
            deepEqual(value, expectedValue);
            assertion.result = AssertionResult.Match;
          } catch (e) {
            assertion.result = AssertionResult.Miss;
          }
          if (assertion.result === AssertionResult.Miss) {
            assertion.expectedSnapshot = databaseAssertion.snapshot;
          }
        }

        // Augment worker response with saved snapshot data & summary + result
        assertion.name = assertionName;
        flow.summary[assertion.result.toLowerCase()]++;
      }
    }

    return result as Flow[];
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

  public entityFromRow(row: {
    id: number; checklist_id: number, cron: string, last_ran_at: Date, next_run_at: Date,
  }): Schedule {
    return new Schedule(row.id, row.checklist_id, row.cron, row.last_ran_at, row.next_run_at);
  }

  public async create(checklistId: number, cron: string, nextRunAt?: Date): Promise<Schedule> {
    const result = await this.app.database.query(
      `insert into schedules (checklist_id, cron, last_ran_at, next_run_at) values ($1, $2, now(), $3) returning *`,
      [checklistId, cron, nextRunAt || null],
    );
    return this.entityFromRow(result.rows[0]);
  }

  public async update(schedule: Schedule): Promise<void> {
    const query = `update schedules set cron = $2, last_ran_at = $3, next_run_at = $4 where id = $1`;
    await this.app.database.query(query, [schedule.id, schedule.cron, schedule.lastRanAt, schedule.nextRunAt]);
  }

  public async delete(id: number) {
    await this.app.database.query(`delete from schedules where id = $1`, [id]);
  }

  public async find(id: number, apiKeyId: number): Promise<Schedule> {
    const query = `select * from schedules where id = $1
      and checklist_id in (select id from checklists where api_key_id = $2)`;
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

  public startCron() {
    setInterval(() => {
      this.scheduleSchedules().catch((e) => log("scheduleSchedules:", e));
      this.runPendingSchedules().catch((e) => log("runPendingSchedules:", e));
    }, 1000);
  }

  // When schedules are ran, the next_run_at field is set to null to indicate
  // to guarantee that no other server/process can pick up the task at the
  // same moment.
  // This means that we need to periodically go through schedules that just ran
  // and re-compute a next_run_at date for them.
  private async scheduleSchedules() {
    // Here we add a delay of 1 second before allowing a schedule to get
    // it's next_run_at schedule computed to avoid the case of a cron job
    // that would run multiple times in the space of a second
    const result = await this.app.database.query(`select * from schedules
      where next_run_at is null
      and now() - '1 second'::interval > last_ran_at`);
    const schedules = result.rows.map(this.entityFromRow);

    for (const schedule of schedules) {
      const job = new CronJob(schedule.cron, noop);
      schedule.nextRunAt = job.nextDates();
      await this.update(schedule);
    }
  }

  private async runPendingSchedules() {
    const result = await this.app.database.query(`update schedules
      set last_ran_at = now(), next_run_at = null
      where now() >= next_run_at returning *`);
    const schedules = result.rows.map(this.entityFromRow);

    for (const schedule of schedules) {
      // Run in setTimeout so that other schedules can all start right on time
      // (given checklists could take time to run)
      setTimeout(async () => {
        const checklist = await this.app.checklistService.find(schedule.checklistId);
        const webhooks = await this.app.webhookService.findAll(checklist.apiKeyId);

        log("running schedule:", schedule, webhooks);

        // Send "START" webhooks
        for (const webhook of webhooks) {
          if (webhook.eventType === WebhookEventType.ScheduledChecklistStart) {
            request.post({
              body: {
                checklistId: checklist.id,
                eventType: webhook.eventType,
                scheduleId: schedule.id,
                webhookId: webhook.id,
              },
              json: true,
              uri: webhook.url,
            }).catch((e) => log("webhook: scheduled start:", e));
          }
        }

        const flows = await this.app.checklistService.run(checklist);
        const results = { match: 0, miss: 0, new: 0 } as IFlowRunSummary;
        for (const flow of flows) {
          results.match += flow.summary.match;
          results.miss += flow.summary.miss;
          results.new += flow.summary.new;
        }

        // Send "END" webhooks
        for (const webhook of webhooks) {
          if (webhook.eventType === WebhookEventType.ScheduledChecklistEnd) {
            request.post({
              body: {
                checklistId: checklist.id,
                eventType: webhook.eventType,
                results,
                scheduleId: schedule.id,
                webhookId: webhook.id,
              },
              json: true,
              uri: webhook.url,
            }).catch((e) => log("webhook: scheduled end:", e));
          }
        }
      }, 0);
    }
  }
}

export class WebhookService {
  public app: Application;

  constructor(app: Application) {
    this.app = app;
  }

  public entityFromRow(row: { id: number; event_type: WebhookEventType, url: string }): Webhook {
    return new Webhook(row.id, row.event_type, row.url);
  }

  public async create(apiKeyId: number, eventType: string, url: string): Promise<Webhook> {
    const result = await this.app.database.query(
      `insert into webhooks (api_key_id, event_type, url) values ($1, $2, $3) returning *`,
      [apiKeyId, eventType, url],
    );
    return this.entityFromRow(result.rows[0]);
  }

  public async update(webhook: Webhook): Promise<void> {
    const query = `update webhooks set event_type = $2, url = $3 where id = $1`;
    await this.app.database.query(query, [webhook.id, webhook.eventType, webhook.url]);
  }

  public async delete(id: number) {
    await this.app.database.query(`delete from webhooks where id = $1`, [id]);
  }

  public async find(id: number, apiKeyId: number): Promise<Webhook> {
    const query = `select * from webhooks where id = $1 and api_key_id = $2`;
    const result = await this.app.database.query(query, [id, apiKeyId]);
    if (result.rows.length === 0) {
      return null;
    }
    return this.entityFromRow(result.rows[0]);
  }

  public async findAll(apiKeyId: number): Promise<Webhook[]> {
    const query = `select * from webhooks where api_key_id = $1 order by id`;
    const result = await this.app.database.query(query, [apiKeyId]);
    return result.rows.map(this.entityFromRow);
  }
}
