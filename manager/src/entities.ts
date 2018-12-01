export class ApiKey {
  public id: number;
  public key: string;

  constructor(id: number, key: string) {
    this.id = id;
    this.key = key;
  }
}

export class Checklist {
  public id: number;
  public apiKeyId: number;
  public workerUrl: string;

  constructor(id: number, workerUrl: string, apiKeyId?: number) {
    this.id = id;
    this.workerUrl = workerUrl;
    this.apiKeyId = apiKeyId;
  }

  public toJSON() {
    return {
      id: this.id,
      workerUrl: this.workerUrl,
    };
  }
}

export interface IFlowRunSummary {
  match: number;
  miss: number;
  new: number;
}

export class Flow {
  public id: number;
  public name: string;
  public assertions: Assertion[];
  public summary: IFlowRunSummary;

  constructor(id: number, name: string) {
    this.id = id;
    this.name = name;
    this.assertions = [];
    this.summary = { match: 0, miss: 0, new: 0 } as IFlowRunSummary;
  }
}

export enum AssertionResult {
  Unknown = "UNKNOWN",
  New = "NEW",
  Match = "MATCH",
  Miss = "MISS",
}

export class Assertion {
  public id: number;
  public name: string;
  public snapshot: string;
  public expectedSnapshot: string;
  public result: string;

  constructor(id: number, name: string, snapshot: string, expectedSnapshot: string, result: string) {
    this.id = id;
    this.name = name;
    this.snapshot = snapshot;
    this.expectedSnapshot = expectedSnapshot;
    this.result = result;
  }

  // Stips the `[2]` from the end of the snapshot name (like `1 + 1 is equal to 2 [2]`
  public nameWithoutNumber() {
    const parts = this.name.split("[");
    if (parts.length > 1) {
      return parts.slice(0, -1).join("[");
    }
    return this.name;
  }
}

export class Snapshot {
  public id: number;
  public name: string;
  public value: string;

  constructor(id: number, name: string, value: string) {
    this.id = id;
    this.name = name;
    this.value = value;
  }

  public toAssertion(): Assertion {
    return new Assertion(this.id, this.name, this.value, "", "");
  }
}

export class Schedule {
  public id: number;
  public checklistId: number;
  public cron: string;
  public lastRanAt: Date;
  public nextRunAt: Date;

  constructor(id: number, checklistId: number, cron: string, lastRanAt: Date, nextRunAt: Date) {
    this.id = id;
    this.checklistId = checklistId;
    this.cron = cron;
    this.lastRanAt = lastRanAt;
    this.nextRunAt = nextRunAt;
  }

  public toJSON() {
    return {
      checklistId: this.checklistId,
      cron: this.cron,
      id: this.id,
    };
  }
}

export enum WebhookEventType {
  ScheduledChecklistStart = "SCHEDULED_CHECKLIST_START",
  ScheduledChecklistEnd = "SCHEDULED_CHECKLIST_END",
}
export const WebhookEventTypes = [
  WebhookEventType.ScheduledChecklistStart,
  WebhookEventType.ScheduledChecklistEnd,
];

export class Webhook {
  public id: number;
  public eventType: WebhookEventType;
  public url: string;

  constructor(id: number, eventType: WebhookEventType, url: string) {
    this.id = id;
    this.eventType = eventType;
    this.url = url;
  }
}
