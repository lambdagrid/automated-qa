import * as Ajv from "ajv";
import * as bodyParser from "body-parser";
import { CronJob } from "cron";
import * as express from "express";
import * as pg from "pg";

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
import { V1SnapshotsUpdatePayload } from "./schemas";
import {
  ApiKeyService,
  ChecklistService,
  FlowService,
  ScheduleService,
  SnapshotService,
  WebhookService,
} from "./services";

const noop = (): void => { /* do nothing */ };

declare global {
  namespace Express {
    // tslint:disable-next-line:interface-name
    interface Request {
      currentApiKey?: ApiKey;
    }
  }
}

export class Application {
  public static Errors = {
    BadRequest: {
      cause: "The request's payload is either missing or malformed.",
      code: 4001,
      message: "Missing or invalid request payload.",
    },
    NotFound: {
      cause: "The request's URI points to a resource which does not exist.",
      code: 4002,
      message: "Requested resource not found",
    },
    Unauthorized: {
      cause: "The API key is either missing, is no longer active, or malformed.",
      code: 4000,
      message: "Missing or invalid API key.",
    },
  };

  public config: Map<string, string>;
  public httpServer: express.Application;
  public router: express.Router;
  public database: pg.Pool;

  public apiKeyService: ApiKeyService;
  public checklistService: ChecklistService;
  public flowService: FlowService;
  public snapshotService: SnapshotService;
  public scheduleService: ScheduleService;
  public webhookService: WebhookService;

  constructor() {
    this.apiKeyService = new ApiKeyService(this);
    this.checklistService = new ChecklistService(this);
    this.flowService = new FlowService(this);
    this.snapshotService = new SnapshotService(this);
    this.scheduleService = new ScheduleService(this);
    this.webhookService = new WebhookService(this);
  }

  public setupConfig() {
    this.config = new Map();
    this.config.set("env", process.env.NODE_ENV || "development");
    this.config.set("port", process.env.PORT || "3002");
    this.config.set("databaseUrl", process.env.DATABASE_URL || "postgresql://admin:admin@localhost:5432/automatedqa");
  }

  public setupRoutes() {
    const r = (this.router = express.Router());
    this.httpServer = express();
    this.httpServer.use(bodyParser.json());
    this.httpServer.use("/", this.router);

    r.use(middlewareLog.bind(null, this));
    r.use(middlewareError.bind(null, this));
    r.use(middlewareAuthenticate.bind(null, this));

    r.get("/", handleIndex.bind(null, this));
    r.post("/api-keys", handleApiKeysCreate.bind(null, this));

    const authenticate = middlewareRequireApiKey.bind(null, this);
    r.delete("/api-keys", authenticate, handleApiKeysDelete.bind(null, this));

    r.get("/v1/checklists", authenticate, handleChecklistsList.bind(null, this));
    r.post("/v1/checklists", authenticate, handleChecklistsCreate.bind(null, this));
    r.put("/v1/checklists/:id", authenticate, handleChecklistsUpdate.bind(null, this));
    r.delete("/v1/checklists/:id", authenticate, handleChecklistsDelete.bind(null, this));
    r.post("/v1/checklists/:id/run", authenticate, handleChecklistsRun.bind(null, this));
    r.post("/v1/checklists/:id/snapshots", authenticate, handleSnapshotsUpdate.bind(null, this));

    r.get("/v1/schedules", authenticate, handleSchedulesList.bind(null, this));
    r.post("/v1/schedules", authenticate, handleSchedulesCreate.bind(null, this));
    r.put("/v1/schedules/:id", authenticate, handleSchedulesUpdate.bind(null, this));
    r.delete("/v1/schedules/:id", authenticate, handleSchedulesDelete.bind(null, this));

    r.use(handleNotFound.bind(null, this));
  }

  public async setupDatabase() {
    const connectionString = this.config.get("databaseUrl");
    this.database = new pg.Pool({ connectionString });
    await this.database.connect();
  }

  public async setup() {
    this.setupConfig();
    this.setupRoutes();
    await this.setupDatabase();
  }

  public async start() {
    await this.setup();

    const port = this.config.get("port");
    this.httpServer.listen(port, (err: Error) => {
      if (err) {
        // tslint:disable-next-line:no-console
        return console.log(err);
      }
      // tslint:disable-next-line:no-console
      console.log(`server is listening on ${port}`);
    });
  }
}

function middlewareLog(app: Application, req: express.Request, res: express.Response, next: () => void) {
  if (app.config.get("env") !== "test") {
    // tslint:disable-next-line:no-console
    console.log("%s %s", req.method, req.url);
  }
  next();
}

function middlewareError(app: Application, req: express.Request, res: express.Response, next: () => void, err: any) {
  if (app.config.get("env") !== "test") {
    // tslint:disable-next-line:no-console
    console.error(err);
  }
  res.status(500).json({
    cause: "An unknow error occured while processing this request.",
    code: 5000,
    message: "Internal server error.",
  });
}

async function middlewareAuthenticate(
  app: Application,
  req: express.Request,
  res: express.Response,
  next: () => void,
): Promise<void> {
  const authHeader = (req.headers.authorization || "").split(" ")[1] || "";
  const key = Buffer.from(authHeader, "base64")
    .toString()
    .split(":")[0];
  req.currentApiKey = await app.apiKeyService.findByKey(key);
  next();
}

function middlewareRequireApiKey(app: Application, req: express.Request, res: express.Response, next: () => void) {
  if (!req.currentApiKey) {
    // If the user requested a specific ressource but didn't authenticate
    // show a 404 error
    if (req.params.id) {
      return res.status(404).json({
        error: Application.Errors.NotFound,
      });
    }

    return res.status(401).json({
      error: Application.Errors.Unauthorized,
    });
  }
  next();
}

function handleIndex(app: Application, req: express.Request, res: express.Response) {
  res.json({});
}

async function handleApiKeysCreate(app: Application, req: express.Request, res: express.Response) {
  const apiKey = await app.apiKeyService.create();
  res.status(201).json({
    data: { api_key: apiKey.key },
  });
}

async function handleApiKeysDelete(app: Application, req: express.Request, res: express.Response) {
  await app.checklistService.deleteByApiKeyId(req.currentApiKey.id);
  await app.apiKeyService.delete(req.currentApiKey.id);
  res.status(200).json({
    message: "Successfully deleted.",
  });
}

async function handleChecklistsList(app: Application, req: express.Request, res: express.Response) {
  const checklists = await app.checklistService.findAll(req.currentApiKey.id);
  res.status(200).json({
    data: { checklists },
  });
}

async function handleChecklistsCreate(app: Application, req: express.Request, res: express.Response) {
  if (!req.body || typeof req.body.workerOrigin !== "string") {
    return res.status(400).json({ error: Application.Errors.BadRequest });
  }
  const checklist = await app.checklistService.create(req.currentApiKey.id, req.body.workerOrigin);
  res.status(201).json({
    data: { checklist },
  });
}

async function handleChecklistsUpdate(app: Application, req: express.Request, res: express.Response) {
  if (!req.body || typeof req.body.workerOrigin !== "string") {
    return res.status(400).json({ error: Application.Errors.BadRequest });
  }

  // Find requested checklist
  const checklist = await app.checklistService.find(req.params.id, req.currentApiKey.id);
  if (!checklist) {
    return res.status(404).json({ error: Application.Errors.NotFound });
  }

  // Update matching checklist fields and save changes to the database
  checklist.workerOrigin = req.body.workerOrigin;
  await app.checklistService.update(checklist);

  res.status(200).json({
    data: { checklist },
  });
}

async function handleChecklistsDelete(app: Application, req: express.Request, res: express.Response) {
  // Find requested checklist
  const checklist = await app.checklistService.find(req.params.id, req.currentApiKey.id);
  if (!checklist) {
    return res.status(404).json({ error: Application.Errors.NotFound });
  }
  await app.checklistService.delete(checklist.id);
  res.status(200).json({ message: "Successfully deleted." });
}

async function handleChecklistsRun(app: Application, req: express.Request, res: express.Response) {
  // Find requested checklist
  const checklist = await app.checklistService.find(req.params.id, req.currentApiKey.id);
  if (!checklist) {
    return res.status(404).json({ error: Application.Errors.NotFound });
  }
  const flows = await app.checklistService.run(checklist);
  res.status(200).json({ data: { flows } });
}

interface ISnapshotsUpdatePayloadSnapshot {
  name: string;
  value: string;
}

interface ISnapshotsUpdatePayloadFlow {
  name: string;
  snapshots: ISnapshotsUpdatePayloadSnapshot[];
}

async function handleSnapshotsUpdate(app: Application, req: express.Request, res: express.Response) {
  const isValid = new Ajv().validate(V1SnapshotsUpdatePayload, req.body);
  if (!isValid) {
    return res.status(400).json({ error: Application.Errors.BadRequest });
  }

  // Find requested checklist
  const checklist = await app.checklistService.find(req.params.id, req.currentApiKey.id);
  if (!checklist) {
    return res.status(404).json({ error: Application.Errors.NotFound });
  }

  for (const flow of req.body.flows as ISnapshotsUpdatePayloadFlow[]) {
    for (const snapshot of flow.snapshots) {
      await app.snapshotService.update(checklist.id, flow.name, snapshot.name, snapshot.value);
    }
  }
  res.status(201).json({ data: { flows: req.body.flows } });
}

async function handleSchedulesList(app: Application, req: express.Request, res: express.Response) {
  const schedules = await app.scheduleService.findAll(req.currentApiKey.id);
  res.status(200).json({ data: { schedules } });
}

async function handleSchedulesCreate(app: Application, req: express.Request, res: express.Response) {
  if (!req.body || typeof req.body.cron !== "string" || typeof req.body.checklistId !== "number") {
    return res.status(400).json({ error: Application.Errors.BadRequest });
  }
  // Verify the provided cron spec is valid
  try {
    const job = new CronJob(req.body.cron, noop);
  } catch (e) {
    return res.status(400).json({ error: Application.Errors.BadRequest });
  }
  // Verify the current api key owns the target checklistId
  const checklist = await app.checklistService.find(req.body.checklistId, req.currentApiKey.id);
  if (!checklist) {
    return res.status(404).json({ error: Application.Errors.NotFound });
  }

  const schedule = await app.scheduleService.create(req.body.checklistId, req.body.cron);
  res.status(201).json({ data: { schedule } });
}

async function handleSchedulesUpdate(app: Application, req: express.Request, res: express.Response) {
  if (!req.body || typeof req.body.cron !== "string") {
    return res.status(400).json({ error: Application.Errors.BadRequest });
  }

  // Verify the provided cron spec is valid
  try {
    const job = new CronJob(req.body.cron, noop);
  } catch (e) {
    return res.status(400).json({ error: Application.Errors.BadRequest });
  }
  // Find requested schedule
  const schedule = await app.scheduleService.find(req.params.id, req.currentApiKey.id);
  if (!schedule) {
    return res.status(404).json({ error: Application.Errors.NotFound });
  }

  // Update matching schedule fields and save changes to the database
  schedule.cron = req.body.cron;
  // TODO update next run
  await app.scheduleService.update(schedule);

  res.status(200).json({ data: { schedule } });
}

async function handleSchedulesDelete(app: Application, req: express.Request, res: express.Response) {
  // Find requested schedule
  const schedule = await app.scheduleService.find(req.params.id, req.currentApiKey.id);
  if (!schedule) {
    return res.status(404).json({ error: Application.Errors.NotFound });
  }
  await app.scheduleService.delete(schedule.id);
  res.status(200).json({ message: "Successfully deleted." });
}

function handleNotFound(app: Application, req: express.Request, res: express.Response) {
  res.status(404).json({
    error: Application.Errors.NotFound,
  });
}

export default new Application();
