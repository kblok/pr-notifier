var GitHubApi = require("github");
var data = require("../data.json");
var _ = require("lodash");
var _maxBy = require("lodash.maxby");
var async = require("async");
var github;
var Slack = require('node-slack');
var hook_url = data.slackHookUrl;
var slack = new Slack(hook_url);
var debug = data.debg;
var outputToSlack = data.outputToSlack;

function createGithubClient() {
    github = new GitHubApi({
        // required
        version: "3.0.0",
        // optional
        debug: false,
        protocol: "https",
        host: "api.github.com", // should be api.github.com for GitHub
        pathPrefix: "", // for some GHEs; none for GitHub
        timeout: 5000,
        headers: {
            "user-agent": "My-Cool-GitHub-App" // GitHub is happy with a unique user agent
        }
    });

    github.authenticate({
        type: "token",
        token: data.githubToken
    });
    
    return github;
}

function initUsers() {
    _.forEach(data.reviewers, function(reviewer) {
        _.forEach(reviewer.repos, function(repo) {
            repo.prs = [];
        });
        reviewer.prs = [];
    });
}

function loadComments(repo, pr, callback) {
    github.issues.getComments({
        // optional:
        // headers: {
        //     "cookie": "blahblah"
        // },
        user: repo.owner,
        repo: repo.name,
        number: pr.number
    }, function(err, res) {
        if(err) {
            return callback(err);
        }
        pr.comments = res;
        callback(null, null);
    });
};

function loadPr(repo, pr, callback) {
    github.pullRequests.get({
        // optional:
        // headers: {
        //     "cookie": "blahblah"
        // },
        user: repo.owner,
        repo: repo.name,
        number: pr.number
    }, function(err, res) {
        if(err) {
            return callback(err);
        }
        pr = _.merge(pr, res);
        loadComments(repo, pr, callback);
    });
};

function loadPrs(repo, callback) {
    github.pullRequests.getAll({
        // optional:
        // headers: {
        //     "cookie": "blahblah"
        // },
        user: repo.owner,
        repo: repo.name,
        state: "open"
    }, function(err, res) {
        if(err) {
            return callback(err);
        }
        repo.prs = res;
        
        var prAwaitList = [];
        
        _.forEach(repo.prs, function(pr) {
            prAwaitList.push(function(callback) {
                loadPr(repo, pr, callback);
            });
        });
        
        async.parallel(prAwaitList, function(err, result) {
            if (err)
                return console.log(err);
            callback(null, null);
        });
    });
}

function evalNeededAction(reviewer, pr, repoData) {
    var userComments = _.filter(pr.comments, function(comment) { 
        return comment.user.login === reviewer.username
    }),
    lastComment = _maxBy(userComments, function(comment) { return comment.updated_at}),
    lastCommentFromAnyone = _maxBy(_.filter(pr.comments, function(comment){ 
        return comment.body.indexOf("+1") === -1 && comment.body.indexOf("👍") === -1 && comment.user.login !== reviewer.username;}), 
        function(comment){ return comment.updated_at});
    
    if(debug) console.log("%s should take a look at %s in %s", reviewer.name, pr.number, repoData.name);
    
    if(pr.user.login !== reviewer.username) {
        if(userComments.length) {
            if(lastComment.updated_at > pr.head.repo.pushed_at) {
                if(debug) console.log("%s has commented on %s", reviewer.username, lastComment.updated_at);
            } else {
                if(debug) console.log("%s has commented on %s but the comment is old (%s)", reviewer.username, lastComment.updated_at, pr.head.repo.pushed_at);
                reviewer.prs.push(pr);
            }  
        } else {
            if(debug) console.log("%s needs to look at this PR", reviewer.username);
            reviewer.prs.push(pr);
        } 
    } else if(!pr.mergeable) {
        if(debug) console.log("%s we're conflicted here");
        reviewer.prs.push(pr);
    } else {
        if(lastCommentFromAnyone && lastCommentFromAnyone.updated_at > pr.head.repo.pushed_at) {
            if(debug) console.log("Someone has made a comment in your PR");
            reviewer.prs.push(pr);
        } else {
            if(debug) console.log("You're the author and we're ok");
        }
        
    }
}

function sendMessage(reviewer) {
    var message = "Hey " + reviewer.slackUser + " we need you to take a look at these PRs: \n";
    
    if(reviewer.prs.length) {
        _.forEach(reviewer.prs, function(pr) {
            message += " * PR" + pr.number + " " + pr.html_url + "\n";
        });
        
        if(outputToSlack) {
            slack.send({
                text: message,
                channel: reviewer.slackChannel,
                username: 'PR notifier',
                icon_emoji: ':ninja:',
                link_names: "1"
            });
        } else {
            console.log(message);
        }
        
    }
}

function run() {
    var github = createGithubClient();
    initUsers();
    var calls = [];
    
    //Get all open PRs
    _.forEach(data.repos, function(repo) {
        calls.push(function(callback) {
            loadPrs(repo, callback);
        });
    });
    
    async.parallel(calls, function(err, result) {
        if (err)
            return console.log(err);

        //I get all reviewers
        _.forEach(data.reviewers, function(reviewer) {
            //I get all repos this reviewer has to look at
            _.forEach(reviewer.repos, function(repo){
                var repoData = _.find(data.repos, function(item) {
                    return item.name === repo.repo;
                });
                
                //I check which PRs he should loot at
                _.forEach(repoData.prs, function(pr) {
                    evalNeededAction(reviewer, pr, repoData);
                });
            });
            sendMessage(reviewer);
        });
    });
}

run();

