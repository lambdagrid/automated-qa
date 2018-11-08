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
  public todoService: TodoService;

  constructor() {
    this.apiKeyService = new ApiKeyService(this);
    this.todoService = new TodoService(this);
  }

  public setupConfig() {
    this.config = new Map();
    this.config.set("env", process.env.NODE_ENV || "development");
    this.config.set("port", process.env.PORT || "3001");
    this.config.set("databaseUrl", process.env.DATABASE_URL || "postgresql://admin:admin@localhost:5432/todos");
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
    r.get("/todos", authenticate, handleTodosList.bind(null, this));
    r.post("/todos", authenticate, handleTodosCreate.bind(null, this));
    r.put("/todos/:id", authenticate, handleTodosUpdate.bind(null, this));
    r.delete("/todos/:id", authenticate, handleTodosDelete.bind(null, this));

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

export class Todo {
  public id: number;
  public text: string;
  public done: boolean;
  public apiKeyId: number;

  constructor(id: number, text: string, done: boolean) {
    this.id = id;
    this.text = text;
    this.done = done;
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

class TodoService {
  public app: Application;

  constructor(app: Application) {
    this.app = app;
  }

  public entityFromRow(row: { id: number; text: string; done: boolean }): Todo {
    return new Todo(row.id, row.text, row.done);
  }

  public async create(text: string, done: boolean, apiKeyId: number): Promise<Todo> {
    const result = await this.app.database.query(
      `insert into todos (text, done, api_key_id) values ($1, $2, $3) returning *`,
      [text, done, apiKeyId],
    );
    return this.entityFromRow(result.rows[0]);
  }

  public async update(todo: Todo) {
    await this.app.database.query(`update todos set text = $2, done = $3 where id = $1`, [
      todo.id,
      todo.text,
      todo.done,
    ]);
  }

  public async delete(id: number) {
    await this.app.database.query(`delete from todos where id = $1`, [id]);
  }

  public async deleteByApiKeyId(id: number) {
    await this.app.database.query(`delete from todos where api_key_id = $1`, [id]);
  }

  public async find(id: number, apiKeyId: number): Promise<Todo> {
    const result = await this.app.database.query(`select * from todos where id = $1 and api_key_id = $2`, [
      id,
      apiKeyId,
    ]);
    if (result.rows.length === 0) {
      return null;
    }
    return this.entityFromRow(result.rows[0]);
  }

  public async findAll(apiKeyId: number): Promise<Todo[]> {
    const result = await this.app.database.query(`select * from todos where api_key_id = $1 order by id`, [apiKeyId]);
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
  await app.todoService.deleteByApiKeyId(req.currentApiKey.id);
  await app.apiKeyService.delete(req.currentApiKey.id);
  res.status(200).json({
    message: "Successfully deleted.",
  });
}

async function handleTodosList(app: Application, req: express.Request, res: express.Response) {
  const todos = await app.todoService.findAll(req.currentApiKey.id);
  res.status(200).json({
    data: { todos },
  });
}

async function handleTodosCreate(app: Application, req: express.Request, res: express.Response) {
  if (!req.body || typeof req.body.text !== "string") {
    return res.status(400).json({ error: Application.Errors.BadRequest });
  }
  const todo = await app.todoService.create(req.body.text, Boolean(req.body.done), req.currentApiKey.id);
  res.status(201).json({
    data: { todo },
  });
}

async function handleTodosUpdate(app: Application, req: express.Request, res: express.Response) {
  if (!req.body || (req.body.text && typeof req.body.text !== "string")) {
    return res.status(400).json({ error: Application.Errors.BadRequest });
  }

  // Find requested todo
  const todo = await app.todoService.find(req.params.id, req.currentApiKey.id);
  if (!todo) {
    return res.status(404).json({ error: Application.Errors.NotFound });
  }

  // Update matching todo fields and save changes to the database
  if (req.body.text) {
    todo.text = req.body.text;
  }
  if (req.body.done) {
    todo.done = true;
  }
  await app.todoService.update(todo);

  res.status(200).json({
    data: { todo },
  });
}

async function handleTodosDelete(app: Application, req: express.Request, res: express.Response) {
  // Find requested todo
  const todo = await app.todoService.find(req.params.id, req.currentApiKey.id);
  if (!todo) {
    return res.status(404).json({ error: Application.Errors.NotFound });
  }
  await app.todoService.delete(todo.id);
  res.status(200).json({ message: "Successfully deleted." });
}

function handleNotFound(app: Application, req: express.Request, res: express.Response) {
  res.status(404).json({
    error: Application.Errors.NotFound,
  });
}

export default new Application();
