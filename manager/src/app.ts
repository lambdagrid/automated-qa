import * as Ajv from "ajv";
import * as bodyParser from "body-parser";
import * as crypto from "crypto";
import * as express from "express";
import * as pg from "pg";
import * as request from "request-promise-native";
import { V1SnapshotsUpdatePayload } from "./schemas";

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

  constructor() {
    this.apiKeyService = new ApiKeyService(this);
    this.checklistService = new ChecklistService(this);
    this.flowService = new FlowService(this);
    this.snapshotService = new SnapshotService(this);
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
  public workerOrigin: string;

  constructor(id: number, workerOrigin: string) {
    this.id = id;
    this.workerOrigin = workerOrigin;
  }
}

interface IFlowRunSummary {
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

class ApiKeyService {
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

class ChecklistService {
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
    await this.app.database.query(`delete from checklists where id = $1`, [id]);
  }

  public async deleteByApiKeyId(id: number) {
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

class FlowService {
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

class SnapshotService {
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

function handleNotFound(app: Application, req: express.Request, res: express.Response) {
  res.status(404).json({
    error: Application.Errors.NotFound,
  });
}

export default new Application();
