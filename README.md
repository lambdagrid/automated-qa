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

<img src="https://i.imgur.com/wCPlswA.png" alt="Nabis uses Automated QA by LambdaGrid" style="max-width:400px;"/>

Engineers at Nabis, a cannabis startup based in Oakland, CA, trust Automated QA to deploy more frequently and confidently.

# Roadmap

We have big goals for where Automated QA will go.

We plan to expand beyond API testing and eventually test the following:
* Web UIs
* Mobile UIs
* Emails
* Text files
* Generated PDFs and images

We'd also like to improve our current capabilities in several ways:
* Parallelize the execution of QA checklist workers for more speed
* Connect worker and manager services with message queues instead of HTTP for more scalability
* Rearchitect the scheduler for more resiliency

<!-- Begin Mailchimp Signup Form -->
<div id="mc_embed_signup">
<form action="https://lambdagrid.us19.list-manage.com/subscribe/post?u=0cdb6c21f97589e36e252107e&amp;id=1888bc2206" method="post" id="mc-embedded-subscribe-form" name="mc-embedded-subscribe-form" class="validate" target="_blank" novalidate>
    <div id="mc_embed_signup_scroll">
	<h2>Add your email if you want a hosted version of Automated QA</h2>
<div class="mc-field-group">
	<label for="mce-EMAIL">Email Address </label>
	<input type="email" value="" name="EMAIL" class="required email" id="mce-EMAIL">
</div>
	<div id="mce-responses" class="clear">
		<div class="response" id="mce-error-response" style="display:none"></div>
		<div class="response" id="mce-success-response" style="display:none"></div>
	</div>    <!-- real people should not fill this in and expect good things - do not remove this or risk form bot signups-->
    <div style="position: absolute; left: -5000px;" aria-hidden="true"><input type="text" name="b_0cdb6c21f97589e36e252107e_1888bc2206" tabindex="-1" value=""></div>
    <div class="clear"><input type="submit" value="Subscribe" name="subscribe" id="mc-embedded-subscribe" class="button"></div>
    </div>
</form>
</div>

<!--End mc_embed_signup-->
