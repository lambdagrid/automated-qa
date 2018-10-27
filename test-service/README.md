## Todo API

_A simple Todo API to demonstrate hosted end-to-end testing._

### Description

This API server exposes a service that allows any client create an API key and
start managing a list of todo items.

And API key can be created using the `/api-key` endpoint and all subsequent
requests will require it to perform any operation on your list of todos.

The todos are persisted in a database for retrieval at a later point, but,
will all be erased when the API key associated with them is deleted.

**Endpoints**

method|path
-:|:-|
`POST`|`/api-key`
`DELETE`|`/api-key`
`GET`|`/todos`
`POST`|`/todos`
`PUT`|`/todos/<id>`
`DELETE`|`/todos/<id>`

### Design decisions

This application is made of 4 types of components if we can call them that:

1. **Application**: There is only one of these and it's job is to hold
    references to all other componets. It'll contain things like configuration
    routes, a database connection, service instances and the web server &
    it's router.
1. **Entities**: Entities are simple datatypes that represent database entities
    but dont expect many methods to be attached to them other than presentational
    ones dealing only with the fields available on itself.
1. **Services**: Services, one per entity, expose all the necessary methods
    to find and change entities stored in the database. This abstraction makes
    it trivial to add more than one way to interact with the application's data
    in the future. HTTP for now, but CLIs, background jobs and RPC messages at
    some point.
1. **Middlewares**: Middlewares take care of utility every or most http request
    need. Stuff like logging, catching errors or authentication & authorization.
1. **Handlers**: In this case HTTP handlers contain the logic to be executed for
    a given endpoint, it'll make sure it received a valid payload and call
    service methods to accomplish what it's meat to do.

### Developing

**Setup**

First, make sure you have a recent version of `node` and `npm` installed
then, install the required dependecies using:

```
npm install
```

If this is the first time you are running this application make sure that
you have a local PostgreSQL server running and have access to the `psql`
utility. Next, run the following:

```
npm run dbsetup
```

If ever you want to clear your database and start with a blank slate, use:

```
npm run dbreset
```

**Running**

To run the application locally and try it out, make sure you've ran the
"setup" steps then use:

```
npm start
```

**Developing**

If you want make some changes to the code, you can run the application in
development mode so that the server is restarted when you make changes. Use:

```
npm run dev
```

**Testing**

Is simply:

```
npm test
```

**Linting**

Can be acomplished with:

```
npm run lint
```

### Deploying

This application is made to be deployed using Heroku.

**Deploying**

Deploying a new version consists of:

1. Make sure you commited all your changes in a git commit
2. Run `git push heroku master`
3. Done!

**Setting up**

If you are setting up Heroku to host this application, use
the following commands (requires you to have the Heroku
Toolbelt installed):

```
$ heroku create
Creating app... done, ⬢ secret-shelf-10462
https://secret-shelf-10462.herokuapp.com/ | https://git.heroku.com/secret-shelf-10462.git

$ heroku addons:create heroku-postgresql:hobby-dev
Creating heroku-postgresql:hobby-dev on ⬢ kiasaki-todos... free
Database has been created and is available
 ! This database is empty. If upgrading, you can transfer
 ! data from another database with pg:copy
Created postgresql-vertical-34745 as DATABASE_URL
Use heroku addons:docs heroku-postgresql to view documentation

$ git push heroku master
Counting objects: 25, done.
Delta compression using up to 4 threads.
Compressing objects: 100% (22/22), done.
Writing objects: 100% (25/25), 40.64 KiB | 5.08 MiB/s, done.
Total 25 (delta 1), reused 0 (delta 0)
remote: Compressing source files... done.
remote: Building source:
remote:
remote: -----> Node.js app detected
[...]

$ heroku run node scripts/setupDatabase.js
Running node scripts/setupDatabase.js on ⬢ kiasaki-todos... up, run.4559 (Free)
Database tables api_keys and todos created.
```

### License

GPL. See `LICENSE.txt` file.
