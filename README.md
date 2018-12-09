# Automated QA for API products

Are you tired of your users discovering your bugs before you do? What about your coworkers, or your CEO, discovering your bugs first? Are you tired of introducing regressions when you deploy new code? This can help.

Automated QA is a QA assistant which tests API requests and responses for staging and projection systems.

## Rationale

We want to create the following benefits for engineering teams:
* **Confidence**: Know your code is working as expected, even after adding new features, integrating vendor APIs, implementing invasive database migrations, doing big refactors, and removing legacy code.
* **Relief**: Sleep better at night knowing that Automated QA constantly monitors your end-to-end functionality, and that you'll be alerted when something breaks.
* **Velocity**: Deploy your code more frequently. Allow new developers to contribute more quickly, without breaking anything.

## What distinguishes Automated QA from other testing solutions?

Automated QA is a QA assistant.

It distinguishes itself from manual QA, QA agencies, and on-demand QA solutions with the following:
* **Automation**: These other solutions are all manual, and Automated QA is, well, automated. Script your tests once and trigger your scripts to run anytime.
* **Speed**: Automated tests are faster than manual tests.
* **Monitoring**: Schedule regular testing of your application's health, as frequently as every minute if needed.

This project distinguishes itself from popular open source libraries for unit testing, integration testing, and e2e testing with the following:
* **Test the system from the user's point of view**: The system is a black box to the users, so Automated QA treats your system like a black box too for more accurate, helpful tests.
* **Minimal setup or configuration required**: Clone the repo, script some QA flows, and deploy the service. Or wait for the hosted version so you don't have to manage it yourself. (Email <support@lambdagrid.com> to be notified when the hosted version is ready.)
* **Any junior developer can write QA tests**: Scripts with Automated QA are designed to be accessible to entry-level developers.
* **Easy to maintain the tests**: We use snapshot testing inspired by Facebook's [Jest](https://jestjs.io/) library to minimize maintenance costs.

Given that snapshot testing is a key design decision for Automated QA, we also want to talk about how a QA assistant distinguishes itself from Facebook's Jest library:
* **Focus on QA**: Jest is a generalist tool with a broad scope, while Automated QA is a specialized tool with a narrow scope. Jest could be used for unit tests, or stretched for e2e tests. Automated QA aims to be excellent at only automating QA.
* **Ease of monitoring**: Monitoring production environments is not a first class concern for Jest, but it is for Automated QA. Jest's primary runtime environment is a developer's local environment. You could stretch it to run in CI or other environments, but you'll be largely on your own to make it work. Automated QA is extremely concerned with being easy to run in CI and also easy to schedule for a production environment.

<img src="https://i.imgur.com/wCPlswA.png" alt="Nabis uses Automated QA by LambdaGrid" style="max-width:400px;"/>

Engineers at Nabis, a cannabis startup based in Oakland, CA, trust Automated QA to deploy more frequently and confidently.

# Architecture: How it works

## Primitives

**Observations** are values that the QA assistant sees from the application's empirical behavior. **Snapshots** are values that the QA assistant has on record for the application's expected behavior. Verifying whether an observation matches a snapshot is an **assertion**.

**Actions** are user events that cause the application to react and allow Automated QA to capture observations. For instance, an action could be to send a login request for an auth token with invalid login credentials. Then we can observe the response, pull up the previous snapshot, and assert that the observation matches the snapshot.

**Flows** are linear sequences of actions and observations. An example of a flow could be to log in with invalid credentials, observe the failed login request's response, then log in with valid credentials, and finally observe the successful login request's response. Flows are used to connect related actions and assertions together, typically like a user flow in a feature.

**Checklists** are Node.js scripts which have one or more flows. The output of the checklists is observations grouped by flows.

## Components

The two components of Automated QA are the worker service and the manager service.

### The worker service

The worker's job is to run the checklists, and that's it. The checklists are Node.js scripts written by the user. The worker is designed to be extremely simple and stateless.

### The manager service

The manager's job is to, well, manage. It manages the workers by telling them when to run their checklists and to serve observations. It also manages the snapshots, creating and updating and deleting them as needed. It manages the assertion process, by diffing observations against snapshots. And lastly, it manages schedules of checklists, and communication to any subscribing services via webhooks.

### How managers and workers interact

Currently managers will send requests to workers via HTTP requests. The reason for this was due to development velocity. However, we're considering reworking the managers and workers to communicate via message queues instead to simplify the architecture and increase scalability.

# Roadmap

We have big goals for where Automated QA will go.

## Hosted version of Automated QA

A hosted version of Automated QA is in the works. This will include a web dashboard, reporting, alerting, and an SLA. Email <support@lambdagrid.com> if you want us to notify you when it's ready for you to use!

## Testing more than just APIs

We plan to expand beyond API testing and eventually test the following:
* Web UIs
* Mobile UIs
* Emails
* Text files
* Generated PDFs and images

## Improving the core capabilities

We'd also like to improve our current capabilities in several ways:
* Parallelize the execution of QA checklist workers for more speed
* Connect worker and manager services with message queues instead of HTTP for more scalability
* Rearchitect the scheduler for more resiliency
