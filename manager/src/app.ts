import * as bodyParser from "body-parser";
import * as crypto from "crypto";
import * as express from "express";
import * as pg from "pg";

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

  constructor() {
    this.apiKeyService = new ApiKeyService(this);
    this.checklistService = new ChecklistService(this);
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
  public summary: IFlowRunSummary;

  constructor(id: number, name: string) {
    this.id = id;
    this.name = name;
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
  }
}

function middlewareLog(app: Application, req: express.Request, res: express.Response, next: () => void) {
  if (app.config.get("env") !== "test") {
    // tslint:disable-next-line:no-console
    console.log("%s %s", req.method, req.url);
  }
  next();
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

function handleNotFound(app: Application, req: express.Request, res: express.Response) {
  res.status(404).json({
    error: Application.Errors.NotFound,
  });
}

export default new Application();
