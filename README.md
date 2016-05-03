This NodeJS App will go through all open PRs in your repos and it will show you which PRs have new commits after your the last time you have commented or which of the PRs you're the author are not mergeable

GitHub API v3 doesn't support Reactions, so your reactions will be ignored 

## Installation

Copy data.json.tmpl as data.json and add your config there.
data.json has 3 sections

1. General setup

 * slackHookUrl: well, the slack hook url
 * slackToken: Your auth token
 * debug: Whether the app should print the activity in the console or not
 * outputToSlack: If false the result will be printed on the console
 * slackIcon: Your favorite slack icon
 
2. Repos
It's the list of repos this app should look at

3. Reviewers
Here you can specify all your reviewers and set which repos they should be look at

## Usage

Run the node app :)

## License

MIT © [Dario Kondratiuk]()
