# Automated QA for API products

Are you tired of your users discovering bugs before you do? Are you tired of introducing regressions when you deploy new code? We want to help you with this project.

Automated QA is a project which tests API requests and responses for staging and projection systems.

## Rationale

We want to create the following benefits for engineering teams:
* **Confidence**: Know your code is working as expected, even after adding new features, doing big refactors, and removing legacy code.
* **Relief**: Sleep better at night knowing that Automated QA constantly monitors your end-to-end functionality, and that you'll be alerted when something breaks.
* **Velocity**: Deploy your code more frequently. Allow new developers to contribute more quickly, without breaking anything.

## What distinguishes Automated QA from other testing solutions?

Automated QA distinguishes itself from manual QA, QA agencies, and on-demand QA solutions with the following:
* **Automation**: These other solutions are all manual, and Automated QA is, well, automated. Script your tests once and trigger your scripts to run anytime.
* **Speed**: Automated tests are faster than manual tests.
* **Monitoring**: Schedule regular testing of your application's health, as frequently as every minute if needed.

This project distinguishes itself from popular open source libraries for unit testing, integration testing, and e2e testing with the following:
* **Test the system from the user's point of view**: The system is a black box to the users, so Automated QA treats your system like a black box too for more accurate, helpful tests.
* **Minimal setup or configuration required**: Clone the repo, script some QA flows, and deploy the service. Or wait for the hosted version so you don't have to manage it yourself.
* **Any junior developer can write QA tests**: Scripts with Automated QA are designed to be accessible to entry-level developers.
* **Easy to maintain the tests**: We use snapshot testing inspired by Facebook's [Jest](https://jestjs.io/) library to minimize maintenance costs.

Given that snapshot testing is a key design decision for Automated QA, we also want to talk about how this project distinguishes itself from Facebook's Jest library:
* **Focus on QA**: Jest is a generalist tool with a broad scope, while Automated QA is a specialized tool with a narrow scope. Jest could be used for unit tests, or stretched for e2e tests. Automated QA to be excellent at only automating QA.
* **Ease of monitoring**: Monitoring production environments is not a first class concern for Jest, but it is for Automated QA. Jest's primary runtime environment is a developer's local environment. You could stretch it to run in CI or other environments, but you'll be largely on your own to make it work. Automated QA is extremely concerned with being easy to run in CI and also easy to schedule for a production environment.
