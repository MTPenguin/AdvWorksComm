/**
 * This is the main entrypoint to your Probot app
 * @param {import('probot').Probot} app
 */
const { encode } = require('js-base64')
const semver = require('semver')
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser')
const { Octokit } = require('octokit')
const session = require('express-session')
const fetch = require('node-fetch')
const path = require('path')
const thisFile = 'index.js'
const { exec } = require('child_process')

module.exports = (app, { getRouter }) => {
  // const consoleLog = app.log.info
  const consoleLog = console.log
  consoleLog(thisFile, "Yay, the app was loaded!");

  /************************************************************************************************************************
    API & GUI routes
  *************************************************************************************************************************/
  const flybotURI = '/flybot'

  const router = getRouter(flybotURI)
  router.use(session({
    secret: process.env.CLIENT_SECRET,
    resave: true,
    saveUninitialized: true
  }));
  router.use(bodyParser.urlencoded({ extended: true }));
  router.use(bodyParser.json());
  router.use(bodyParser.raw());
  router.use(cookieParser())

  router.get('/test.js', async (req, res) => {
    const scriptFile = path.join(__dirname, '../issue-ui/test.js')
    consoleLog(thisFile, 'scriptFile:', scriptFile)
    return res.sendFile(scriptFile);
  })

  router.get('/issue-ui/index.js', async (req, res) => {
    if (req.session.loggedIn) {
      const scriptFile = path.join(__dirname, '../issue-ui/index.js')
      consoleLog(thisFile, 'scriptFile:', scriptFile)
      return res.sendFile(scriptFile);
    }
    else {
      return res.redirect(flybotURI + '/login')
    }
  })

  router.get('/issue-ui/index.css', async (req, res) => {
    if (req.session.loggedIn) {
      const scriptFile = path.join(__dirname, '../issue-ui/index.css')
      consoleLog(thisFile, 'scriptFile:', scriptFile)
      return res.sendFile(scriptFile);
    }
    else {
      return res.redirect(flybotURI + '/login')
    }
  })

  router.get('/', async (req, res) => {
    const { body, query: { owner, repo } } = req
    consoleLog(thisFile, '/ req.cookies:', req.cookies)
    consoleLog(thisFile, '/ req.query:', req.query)
    consoleLog(thisFile, '/ owner, repo:', owner, repo)
    const o = owner || req.cookies.owner
    const r = repo || req.cookies.repo
    if (!(o && r)) {
      return res.status(404).send("Need both owner and repo params.  E.g. flybot?owner=MTPenguin&repo=AdvWorksComm")
    } else {
      res.cookie(`owner`, o);
      res.cookie(`repo`, r);
    }
    // http://72.250.142.109:3000/flybot?owner=MTPenguin&repo=AdvWorksComm
    // http://72.250.142.109:3000/flybot/logout
    if (req.session.loggedIn) {
      const flybotPath = path.join(__dirname, '/flybot.html')
      consoleLog(thisFile, 'flybotPath:', flybotPath)
      return res.sendFile(flybotPath);
      // return res.json({ loggedIn: req.session.loggedIn })
    }
    else {
      consoleLog(thisFile, '/ !loggedIn body:', body)
      consoleLog(thisFile, '/ req.session:', req.session)
      consoleLog(thisFile, '/ req.cookies:', req.cookies)
      return res.redirect(flybotURI + '/login')
    }
  })

  router.get('/login', async (req, res) => {
    consoleLog(thisFile, '/login cookies:', req.cookies)

    const searchParams = new URLSearchParams({
      client_id: process.env.CLIENT_ID
    });

    const url = `https://github.com/login/oauth/authorize?${searchParams.toString()}`
    res.redirect(url)
  })

  router.get('/logout', async (req, res) => {
    consoleLog(thisFile, '/logout req.session:', req.session)

    req.session.destroy(() => {
      consoleLog(thisFile, '/logout POST destroy req.session:', req.session)

      res.redirect('https://github.com/logout')
    })
  })

  router.get('/login/cb', async (req, res) => {
    consoleLog(thisFile, '/login/cb req.query.code:', req.query.code)
    consoleLog(thisFile, '/login/cb req.query:', req.query)
    consoleLog(thisFile, '/login/cb req.cookies:', req.cookies)

    // Exchange our "code" and credentials for a real token
    fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        "Content-Type": "application/json",
        accept: "application/json"
        // 'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: JSON.stringify({ client_id: process.env.CLIENT_ID, client_secret: process.env.CLIENT_SECRET, code: req.query.code })
    })
      .then(async res => {
        consoleLog(thisFile, '/login/cb res.status:', res.status)
        // const json = await res.json()
        const text = await res.text()
        consoleLog(thisFile, '/login/cb text:', text)
        return JSON.parse(text)
      }) // expecting a json response
      .then(async json => {
        console.log(thisFile, '/login/cb THEN json:', json)
        // Authenticate our Octokit client with the new token
        const token = json.access_token
        const octokit = new Octokit({ auth: token })

        // Get the currently authenticated user
        const user = await octokit.rest.users.getAuthenticated()
        consoleLog(thisFile, '***********   user.data.login:', user.data.login) // <-- This is what we want!
        consoleLog(thisFile, '***********   req.cookies:', req.cookies) // <-- This is what we want!
        req.session.loggedIn = true
        req.session.user = user
        req.session.token = token
        return res.redirect(flybotURI)
      })
      .catch(error => {
        console.error(error.message, error)
      })

  })

  router.post('/:owner/:repo/createIssue', async (req, res) => {
    const { body, params: { owner, repo } } = req
    consoleLog(thisFile, '/createIssue req.cookies:', req.cookies)
    consoleLog(thisFile, '/createIssue req.query:', req.query)
    consoleLog(thisFile, '/createIssue owner, repo:', owner, repo)
    consoleLog(thisFile, '/createIssue body:', body)

    if (!req.session.loggedIn) {
      consoleLog(thisFile, '/createIssue !loggedIn body:', body)
      consoleLog(thisFile, '/createIssue req.session:', req.session)
      consoleLog(thisFile, '/createIssue req.cookies:', req.cookies)
      return res.redirect(flybotURI + '/login')
    }

    // Probot / GH App octokit
    const octokit = await app.auth()
    let raw
    const { data: authData } = raw = await octokit.apps.getAuthenticated()
    // consoleLog(thisFile, '/createIssue raw:', raw)
    consoleLog(thisFile, '/createIssue authData:', authData)


    const o = owner || req.cookies.owner
    const r = repo || req.cookies.repo
    const b = (body && JSON.stringify(Object.assign({}, body, { user: req.session.user.data.login }))) || req.cookies.body
    if (!(o && r)) {
      return res.status(404).send("Need both owner and repo params")
    } else {
      res.cookie(`owner`, o)
      res.cookie(`repo`, r)
      res.cookie('body', b)
    }
    // http://72.250.142.109:3000/flybot?owner=MTPenguin&repo=AdvWorksComm
    // http://72.250.142.109:3000/flybot/logout?owner=MTPenguin&repo=AdvWorksComm

    // installationId option is required for installation authentication.
    // To create issue from external event
    const { data: { id } } = raw = await octokit.apps.getRepoInstallation({
      owner,
      repo,
    });
    // consoleLog(thisFile, '/createIssue raw:', raw)
    consoleLog(thisFile, '/createIssue id:', id)

    const installationOctokit = await app.auth(id)


    result = await installationOctokit.rest.issues.create({
      owner,
      repo,
      title: 'Issue created by UI',
      body: `Issue Body \`\`\`${b}\`\`\``
    });
    consoleLog(thisFile, '/createIssue issue create result:', result)
    res.json(result)
  })

  router.get('/whoami', async (req, res) => {
    const octokit = await app.auth()
    const { data } = await octokit.apps.getAuthenticated()
    res.json(data)
  })



  /************************************************************************************************************************************
  Event handlers
  ************************************************************************************************************************************/
  app.on("issues.opened", async (context) => {
    const octokit = context.octokit
    const payload = context.payload
    const repo = payload.repository
    const issueBody = payload.issue.body
    const repoOwner = repo.owner.login
    const repoName = repo.name

    const DEBUG = false

    // consoleLog(thisFile
    //   , `\npayload:`, payload
    //   // , `\nrepo:`, repo
    //   , `\nissueBody:`, issueBody
    //   , `\nrepoOwner:`, repoOwner
    //   , `\nrepoName:`, repoName
    // )

    /**
     * Does issue body contain valid json?
     */
    const firstT = issueBody.indexOf('```')
    const lastT = issueBody.lastIndexOf('```')
    let jsonBody
    if (~firstT && ~lastT) {
      try {
        jsonBody = issueBody.substr(firstT + 3, (lastT - firstT) - 3)
        DEBUG && consoleLog(thisFile, 'jsonBody:', jsonBody)
        jsonBody = JSON.parse(jsonBody)
      } catch (error) {
        console.error('Throwing:', error.message)
        throw error
      }
      DEBUG && consoleLog(thisFile, 'jsonBody:', jsonBody)
    } else {
      DEBUG && consoleLog(thisFile, 'firstT:', firstT, 'lastT:', lastT)
      throw new Error('No JSON body')
    }

    if (!(jsonBody.jira && jsonBody.scope)) throw new Error('Missing parameter(s) jsonBody.jira && jsonBody.scope ' + JSON.stringify(jsonBody))

    /**
     * Get current version
     */
    const tags = await octokit.request(repo.tags_url)
    DEBUG && consoleLog(thisFile, 'tags:', tags)
    const tagsSorted = semver.rsort(tags.data.map(d => d.name))
    DEBUG && consoleLog(thisFile, 'tagsSorted:', tagsSorted)
    const currentVersion = tagsSorted[0]
    DEBUG && consoleLog(thisFile, 'currentVersion:', currentVersion)

    /**
    * Flyway Date Stamp yyyy-MM-dd HH:mm:ss
    */
    const dateNow = new Date()
    const dateStamp = dateNow.getUTCFullYear() + String(dateNow.getUTCMonth() + 1).padStart(2, '0') + String(dateNow.getUTCDate()).padStart(2, '0')
      + String(dateNow.getUTCHours()).padStart(2, '0') + String(dateNow.getUTCMinutes()).padStart(2, '0') + String(dateNow.getUTCSeconds()).padStart(2, '0')
    DEBUG && consoleLog(thisFile, 'dateStamp:', dateStamp)

    let level
    let newVersion
    const currentMajor = semver.major(currentVersion)
    const currentMinor = semver.minor(currentVersion)
    switch (jsonBody.scope) {
      case 'data':
        level = 'patch'
        newVersion = currentMajor + '.' + currentMinor + '.' + dateStamp
        break
      case 'refData':
        level = 'minor'
        newVersion = semver.inc(currentVersion, level)
        break
      case 'schema':
        level = 'major'
        newVersion = semver.inc(currentVersion, level)
    }
    DEBUG && consoleLog(thisFile, 'level:', level)
    DEBUG && consoleLog(thisFile, 'newVersion:', newVersion)

    /**
     * In order to create a new branch off of default, we first have to get the sha of mergeBranch
     */
    const mergeBranch = await octokit.request(repo.branches_url, { branch: repo.default_branch })
    DEBUG && consoleLog(thisFile, 'mergeBranch:', mergeBranch)

    /* DEBUG ADD LIGHT TAG REF */
    // await octokit.git.createRef({
    //   owner: repoOwner,
    //   repo: repoName,
    //   ref: 'refs/tags/v1.0.' + dateStamp,
    //   sha: mergeBranch.data.commit.sha
    // })


    // GITHUB_ISSUE-JIR-000-SCOPE-CURRENT_VERSION
    const newBranch = payload.issue.number + '-' + jsonBody.jira + '-' + jsonBody.scope + '-' + currentVersion
    const newMigration = 'V' + newVersion + '__' + newBranch
    DEBUG && consoleLog(thisFile, 'newBranch:', newBranch)
    DEBUG && consoleLog(thisFile, 'newMigration:', newMigration)


    /**
     * Create a new branch
     */
    let result = await octokit.git.createRef({
      owner: repoOwner,
      repo: repoName,
      ref: `refs/heads/${newBranch}`,
      sha: mergeBranch.data.commit.sha,
      key: payload.issue.number
    });
    DEBUG && consoleLog(thisFile, 'branch result:', result)


    /*
    * [ Resolves #<issue_number> ] links the commit to the issue.  When the commit is merged, it should close the issue.
    * TODO Trying to get the linked branch to show up under 'Development' in the GitHub Issue UI
    */
    let message = `Resolves #${payload.issue.number} - Created ${newMigration}.sql file - [skip actions]}`
    let content = "--flybot created " + newMigration
    if (jsonBody.debug ?? false) {
      content += "\n-- DEBUG ---\n"
      const debugVal = dateStamp.substring(dateStamp.length - 10, 10)
      content += `PRINT(N'Update 6 rows in [SalesLT].[Customer]')
      UPDATE [SalesLT].[Customer] SET [Suffix]='${debugVal}' WHERE [CustomerID] = 1
      UPDATE [SalesLT].[Customer] SET [Suffix]='${debugVal}' WHERE [CustomerID] = 2
      UPDATE [SalesLT].[Customer] SET [Suffix]='${debugVal}' WHERE [CustomerID] = 3
      UPDATE [SalesLT].[Customer] SET [Suffix]='${debugVal}' WHERE [CustomerID] = 4
      UPDATE [SalesLT].[Customer] SET [Suffix]='${debugVal}' WHERE [CustomerID] = 5
      UPDATE [SalesLT].[Customer] SET [Suffix]='${debugVal}' WHERE [CustomerID] = 6
    `
      content += "-- DEBUG ---\n\n\n"
    }

    result = await octokit.repos.createOrUpdateFileContents({
      owner: repoOwner,
      repo: repoName,
      branch: newBranch,
      path: 'migrations/' + newMigration + '.sql',
      message,
      content: encode(content)
    })
    DEBUG && consoleLog(thisFile, 'migration file result:', result)

    content = {
      ...jsonBody,
      newBranch,
      currentVersion,
      currentMajor,
      currentMinor,
      dateStamp,
      newVersion
    }
    DEBUG && consoleLog(thisFile, 'content:', content)

    /**
    * Create a new issue comment
    */
    let commentBody = `Thank you ${payload.issue.user.login} for creating issue #${payload.issue.number}, Jira:[${jsonBody.jira}](${process.env.JIRA_BROWSE_URL}/${jsonBody.jira})!\n\n\n`
    commentBody += "A new branch (["
    commentBody += newBranch
    commentBody += "](https://github.com/MTPenguin/AdvWorksComm/tree/"
    commentBody += newBranch
    commentBody += ")) has been created for this migration."
    const issueComment = context.issue({
      body: commentBody,
    });
    result = await octokit.issues.createComment(issueComment);
    DEBUG && consoleLog(thisFile, 'issue comment result:', result)

    /**
    * Update issue JSON
    */
    const body = `\`\`\`${JSON.stringify(content)}\`\`\``
    DEBUG && consoleLog(thisFile, 'body:', body)
    result = await octokit.issues.update({
      owner: repoOwner,
      repo: repoName,
      issue_number: payload.issue.number,
      title: newBranch,
      body,
      // state: 'open',
      labels: [jsonBody.jira, jsonBody.scope],
      // DEBUG try to link branch
      // development: {
      //   branch: newBranch
      // }
    });
    DEBUG && consoleLog(thisFile, 'issue update result:', result)
  });

  // index.js Push event context.payload: {
  //   ref: 'refs/heads/376-NEW-001-data-v3.0.20230414181533',
  //   before: '21031c8bfaf448e43b3a34b421547ec9b52fea9b',
  //   after: '1c9df66d126351773b17e83d983b7b75d7809184',
  //   repository: {
  //     id: 607309155,
  //     node_id: 'R_kgDOJDLNYw',
  //     name: 'AdvWorksComm',
  //     full_name: 'MTPenguin/AdvWorksComm',
  //     private: false,
  //     owner: {
  //       name: 'MTPenguin',
  //       email: '39835555+MTPenguin@users.noreply.github.com',
  //       login: 'MTPenguin',
  //       id: 39835555,
  //       node_id: 'MDQ6VXNlcjM5ODM1NTU1',
  //       avatar_url: 'https://avatars.githubusercontent.com/u/39835555?v=4',
  //       gravatar_id: '',
  //       url: 'https://api.github.com/users/MTPenguin',
  //       html_url: 'https://github.com/MTPenguin',
  //       followers_url: 'https://api.github.com/users/MTPenguin/followers',
  //       following_url: 'https://api.github.com/users/MTPenguin/following{/other_user}',
  //       gists_url: 'https://api.github.com/users/MTPenguin/gists{/gist_id}',
  //       starred_url: 'https://api.github.com/users/MTPenguin/starred{/owner}{/repo}',
  //       subscriptions_url: 'https://api.github.com/users/MTPenguin/subscriptions',
  //       organizations_url: 'https://api.github.com/users/MTPenguin/orgs',
  //       repos_url: 'https://api.github.com/users/MTPenguin/repos',
  //       events_url: 'https://api.github.com/users/MTPenguin/events{/privacy}',
  //       received_events_url: 'https://api.github.com/users/MTPenguin/received_events',
  //       type: 'User',
  //       site_admin: false
  //     },
  //     html_url: 'https://github.com/MTPenguin/AdvWorksComm',
  //     description: null,
  //     fork: false,
  //     url: 'https://github.com/MTPenguin/AdvWorksComm',
  //     forks_url: 'https://api.github.com/repos/MTPenguin/AdvWorksComm/forks',
  //     keys_url: 'https://api.github.com/repos/MTPenguin/AdvWorksComm/keys{/key_id}',
  //     collaborators_url: 'https://api.github.com/repos/MTPenguin/AdvWorksComm/collaborators{/collaborator}',
  //     teams_url: 'https://api.github.com/repos/MTPenguin/AdvWorksComm/teams',
  //     hooks_url: 'https://api.github.com/repos/MTPenguin/AdvWorksComm/hooks',
  //     issue_events_url: 'https://api.github.com/repos/MTPenguin/AdvWorksComm/issues/events{/number}',
  //     events_url: 'https://api.github.com/repos/MTPenguin/AdvWorksComm/events',
  //     assignees_url: 'https://api.github.com/repos/MTPenguin/AdvWorksComm/assignees{/user}',
  //     branches_url: 'https://api.github.com/repos/MTPenguin/AdvWorksComm/branches{/branch}',
  //     tags_url: 'https://api.github.com/repos/MTPenguin/AdvWorksComm/tags',
  //     blobs_url: 'https://api.github.com/repos/MTPenguin/AdvWorksComm/git/blobs{/sha}',
  //     git_tags_url: 'https://api.github.com/repos/MTPenguin/AdvWorksComm/git/tags{/sha}',
  //     git_refs_url: 'https://api.github.com/repos/MTPenguin/AdvWorksComm/git/refs{/sha}',
  //     trees_url: 'https://api.github.com/repos/MTPenguin/AdvWorksComm/git/trees{/sha}',
  //     statuses_url: 'https://api.github.com/repos/MTPenguin/AdvWorksComm/statuses/{sha}',
  //     languages_url: 'https://api.github.com/repos/MTPenguin/AdvWorksComm/languages',
  //     stargazers_url: 'https://api.github.com/repos/MTPenguin/AdvWorksComm/stargazers',
  //     contributors_url: 'https://api.github.com/repos/MTPenguin/AdvWorksComm/contributors',
  //     subscribers_url: 'https://api.github.com/repos/MTPenguin/AdvWorksComm/subscribers',
  //     subscription_url: 'https://api.github.com/repos/MTPenguin/AdvWorksComm/subscription',
  //     commits_url: 'https://api.github.com/repos/MTPenguin/AdvWorksComm/commits{/sha}',
  //     git_commits_url: 'https://api.github.com/repos/MTPenguin/AdvWorksComm/git/commits{/sha}',
  //     comments_url: 'https://api.github.com/repos/MTPenguin/AdvWorksComm/comments{/number}',
  //     issue_comment_url: 'https://api.github.com/repos/MTPenguin/AdvWorksComm/issues/comments{/number}',
  //     contents_url: 'https://api.github.com/repos/MTPenguin/AdvWorksComm/contents/{+path}',
  //     compare_url: 'https://api.github.com/repos/MTPenguin/AdvWorksComm/compare/{base}...{head}',
  //     merges_url: 'https://api.github.com/repos/MTPenguin/AdvWorksComm/merges',
  //     archive_url: 'https://api.github.com/repos/MTPenguin/AdvWorksComm/{archive_format}{/ref}',
  //     downloads_url: 'https://api.github.com/repos/MTPenguin/AdvWorksComm/downloads',
  //     issues_url: 'https://api.github.com/repos/MTPenguin/AdvWorksComm/issues{/number}',
  //     pulls_url: 'https://api.github.com/repos/MTPenguin/AdvWorksComm/pulls{/number}',
  //     milestones_url: 'https://api.github.com/repos/MTPenguin/AdvWorksComm/milestones{/number}',
  //     notifications_url: 'https://api.github.com/repos/MTPenguin/AdvWorksComm/notifications{?since,all,participating}',
  //     labels_url: 'https://api.github.com/repos/MTPenguin/AdvWorksComm/labels{/name}',
  //     releases_url: 'https://api.github.com/repos/MTPenguin/AdvWorksComm/releases{/id}',
  //     deployments_url: 'https://api.github.com/repos/MTPenguin/AdvWorksComm/deployments',
  //     created_at: 1677522385,
  //     updated_at: '2023-04-14T18:14:43Z',
  //     pushed_at: 1681823980,
  //     git_url: 'git://github.com/MTPenguin/AdvWorksComm.git',
  //     ssh_url: 'git@github.com:MTPenguin/AdvWorksComm.git',
  //     clone_url: 'https://github.com/MTPenguin/AdvWorksComm.git',
  //     svn_url: 'https://github.com/MTPenguin/AdvWorksComm',
  //     homepage: null,
  //     size: 1802,
  //     stargazers_count: 0,
  //     watchers_count: 0,
  //     language: 'TSQL',
  //     has_issues: true,
  //     has_projects: true,
  //     has_downloads: true,
  //     has_wiki: true,
  //     has_pages: true,
  //     has_discussions: false,
  //     forks_count: 1,
  //     mirror_url: null,
  //     archived: false,
  //     disabled: false,
  //     open_issues_count: 1,
  //     license: null,
  //     allow_forking: true,
  //     is_template: false,
  //     web_commit_signoff_required: false,
  //     topics: [],
  //     visibility: 'public',
  //     forks: 1,
  //     open_issues: 1,
  //     watchers: 0,
  //     default_branch: 'dev1',
  //     stargazers: 0,
  //     master_branch: 'dev1'
  //   },
  //   pusher: {
  //     name: 'MTPenguin',
  //     email: '39835555+MTPenguin@users.noreply.github.com'
  //   },
  //   sender: {
  //     login: 'MTPenguin',
  //     id: 39835555,
  //     node_id: 'MDQ6VXNlcjM5ODM1NTU1',
  //     avatar_url: 'https://avatars.githubusercontent.com/u/39835555?v=4',
  //     gravatar_id: '',
  //     url: 'https://api.github.com/users/MTPenguin',
  //     html_url: 'https://github.com/MTPenguin',
  //     followers_url: 'https://api.github.com/users/MTPenguin/followers',
  //     following_url: 'https://api.github.com/users/MTPenguin/following{/other_user}',
  //     gists_url: 'https://api.github.com/users/MTPenguin/gists{/gist_id}',
  //     starred_url: 'https://api.github.com/users/MTPenguin/starred{/owner}{/repo}',
  //     subscriptions_url: 'https://api.github.com/users/MTPenguin/subscriptions',
  //     organizations_url: 'https://api.github.com/users/MTPenguin/orgs',
  //     repos_url: 'https://api.github.com/users/MTPenguin/repos',
  //     events_url: 'https://api.github.com/users/MTPenguin/events{/privacy}',
  //     received_events_url: 'https://api.github.com/users/MTPenguin/received_events',
  //     type: 'User',
  //     site_admin: false
  //   },
  //   installation: {
  //     id: 35320756,
  //     node_id: 'MDIzOkludGVncmF0aW9uSW5zdGFsbGF0aW9uMzUzMjA3NTY='
  //   },
  //   created: false,
  //   deleted: false,
  //   forced: false,
  //   base_ref: null,
  //   compare: 'https://github.com/MTPenguin/AdvWorksComm/compare/21031c8bfaf4...1c9df66d1263',
  //   commits: [
  //     {
  //       id: '1c9df66d126351773b17e83d983b7b75d7809184',
  //       tree_id: '47ca0633dff832fc12a3f00e3e5a7f758cf087af',
  //       distinct: true,
  //       message: 'Update flyway.conf',
  //       timestamp: '2023-04-18T07:19:40-06:00',
  //       url: 'https://github.com/MTPenguin/AdvWorksComm/commit/1c9df66d126351773b17e83d983b7b75d7809184',
  //       author: [Object],
  //       committer: [Object],
  //       added: [],
  //       removed: [],
  //       modified: [Array]
  //     }
  //   ],
  //   head_commit: {
  //     id: '1c9df66d126351773b17e83d983b7b75d7809184',
  //     tree_id: '47ca0633dff832fc12a3f00e3e5a7f758cf087af',
  //     distinct: true,
  //     message: 'Update flyway.conf',
  //     timestamp: '2023-04-18T07:19:40-06:00',
  //     url: 'https://github.com/MTPenguin/AdvWorksComm/commit/1c9df66d126351773b17e83d983b7b75d7809184',
  //     author: {
  //       name: 'MTPenguin',
  //       email: '39835555+MTPenguin@users.noreply.github.com',
  //       username: 'MTPenguin'
  //     },
  //     committer: {
  //       name: 'GitHub',
  //       email: 'noreply@github.com',
  //       username: 'web-flow'
  //     },
  //     added: [],
  //     removed: [],
  //     modified: [ 'flyway.conf' ]
  //   }
  // }
  app.on('push', async (context) => {
    const DEBUG = true
    DEBUG && consoleLog(thisFile, 'Push event context.payload:', context.payload)
    const commits = context.payload.commits

    const branch = context.payload.ref.substring(String('refs/heads/').length)
    DEBUG && consoleLog(thisFile, 'branch:', branch)

    if (branch.match(/[0-9]+-[a-zA-Z]+-[0-9]+-data|refData|schema-/) || (DEBUG && branch == 'dev1')) {
      DEBUG && consoleLog(thisFile, 'Matched branch')
      // Look for migration file changes
      DEBUG && consoleLog(thisFile, 'commits:', commits)
      let matchedFile = false
      for (const commit of commits) {
        if (matchedFile) break
        for (const mod of commit.modified) {
          if (mod.match(/^V/)) {
            matchedFile = mod
            break
          }
        }
      }
      if (matchedFile || DEBUG) {
        DEBUG && consoleLog(thisFile, 'matched file:', matchedFile)
        // 
        // MIGRATION DETECTED
        // 
        // Check with Flyway
        // flyway -community -user="${{ env.userName }}" -password="${{ env.password }}" -configFiles="${{ github.WORKSPACE }}\flyway.conf" -locations="filesystem:${{ github.WORKSPACE }}\migrations, filesystem:${{ github.WORKSPACE }}\\migrations-${{ env.deployment_environment }}" info -url="${{ env.JDBC }}" -outputType=json > ${{ env.REPORT_PATH }}${{ env.INFO_FILENAME }}.json

        const fwCmd = `flyway -community -user="${process.env.DB_USERNAME}" -password='${process.env.DB_PASSWORD}' -configFiles="../flyway.conf" -locations="filesystem:../migrations" info -url="${process.env.DB_JDBC}" -outputType=json > ../reports/${branch}.json`

        exec(fwCmd, (err, output) => {
          // once the command has completed, the callback function is called
          if (err) {
            // log and return if we encounter an error
            console.error("could not execute command: ", err)
            return
          }
          // log the output received from the command
          consoleLog(thisFile, "exec Output: \n", output)
        })
      } else DEBUG && consoleLog(thisFile, 'NO matched files:', commits)
    } else DEBUG && consoleLog(thisFile, 'NON matched branch:', branch)


    // name: CHK Pipeline (Self-Hosted)
    // run-name: CHK ${{ github.head_ref || github.ref_name }} -> ${{ github.event.repository.name }}/${{ github.event.repository.default_branch }}

    // # Controls when the workflow will run
    // on:
    //   # Triggers the workflow on push or pull request events but only for branches beginning with 'task' that have changes in their respective migration folder.
    //   push:
    //     branches: # https://docs.github.com/en/actions/using-workflows/workflow-syntax-for-github-actions#filter-pattern-cheat-sheet
    //       #  GITHUB_ISSUE-JIRA-000-SCOPE-CURRENT_VERSION
    //       - "[0-9]+-[a-zA-Z]+-[0-9]+-data-**"
    //       - "[0-9]+-[a-zA-Z]+-[0-9]+-refData-**"
    //       - "[0-9]+-[a-zA-Z]+-[0-9]+-schema-**"

    //     paths:
    //       - "migrations/V**"
    //       - "migrations-build/V**"
    //       - "migrations-prod-check/V**"
    //       - "migrations-prod/V**"

    //   # Allows you to run this workflow manually from the Actions tab
    //   workflow_dispatch:

    // env:
    //   # Enable this for additional debug logging
    //   ACTIONS_RUNNER_DEBUG: true
    //   ACTION_EMAIL: "MTPenguinAction@youremail.com"
    //   ACTION_USER: "MTPenguinAction"
    //   REPORT_PATH: ${{ github.WORKSPACE }}\reports\
    //   PUBLISH_PATH: https://mtpenguin.github.io/AdvWorksComm/
    //   INFO_FILENAME: "${{ github.RUN_ID }}-Info"

    // permissions:
    //   contents: write
    //   pull-requests: write
    //   actions: write
    //   id-token: write

    // # Allow one concurrent deployment
    // concurrency:
    //   group: "${{ github.head_ref || github.ref_name }}_CHECK"
    //   cancel-in-progress: true

    // # A workflow run is made up of one or more jobs that can run sequentially or in parallel
    // jobs:
    //   info:
    //     name: Migration Info
    //     # Only run on users own self hosted
    //     runs-on: [self-hosted] # Add "${{ github.actor }}" to make it specific to the dev machine
    //     environment: "prod" #Ensure this environment name is setup in the projects Settings>Environment area. Ensuring any reviewers are also configured
    //     outputs:
    //       pendingMigrations: ${{ steps.checkStates.outputs.pendingMigrations }}
    //     env:
    //       stage: "Info"
    //       # Environment Secrets - Ensure all of the below have been created as an Environment Secret (Projects Settings > Secrets > Actions section, specially related to the environment in question) #
    //       databaseName: ${{ secrets.databaseName}}
    //       JDBC: ${{ secrets.JDBC }}
    //       userName: ${{ secrets.userName }}
    //       password: ${{ secrets.password }}
    //       # End of Environment Secrets #
    //       publishArtifacts: true

    //     # Steps represent a sequence of tasks that will be executed as part of the job
    //     steps:
    //       - name: Dump runner context
    //         env:
    //           RUNNER_CONTEXT: ${{ toJson(runner) }}
    //         run: echo "runner context ${{ env.RUNNER_CONTEXT }}"

    //       - name: Get/Set deployment environment
    //         run: |
    //           $deployments = curl ${{ github.event.repository.deployments_url }} | ConvertFrom-Json
    //           echo "deployment_environment=$( $deployments[0] | select -expand environment )" >> $env:GITHUB_ENV
    //           echo "${{ env.deployment_environment }}"

    //       # Checks-out your repository under $GITHUB_WORKSPACE, so your job can access it
    //       - uses: actions/checkout@v3

    //       # Runs the Flyway info command ([ ` ] "tick" character IS escape character)
    //       - name: Run Flyway info command
    //         id: checkStates
    //         run:
    //           | # Format-Table >> ${{ env.REPORT_PATH }}${{ env.INFO_FILENAME }}.txt
    //           md -Force ${{ env.REPORT_PATH }}
    //           flyway -community -user="${{ env.userName }}" -password="${{ env.password }}" -configFiles="${{ github.WORKSPACE }}\flyway.conf" -locations="filesystem:${{ github.WORKSPACE }}\migrations, filesystem:${{ github.WORKSPACE }}\\migrations-${{ env.deployment_environment }}" info -url="${{ env.JDBC }}" -outputType=json > ${{ env.REPORT_PATH }}${{ env.INFO_FILENAME }}.json
    //           $infoObj = Get-Content -Raw -Path ${{ env.REPORT_PATH }}${{ env.INFO_FILENAME }}.json | ConvertFrom-Json
    //           cat ${{ env.REPORT_PATH }}${{ env.INFO_FILENAME }}.json
    //           echo "FLYWAY migration information:" > ${{ env.REPORT_PATH }}${{ env.INFO_FILENAME }}.txt
    //           echo `````` >> ${{ env.REPORT_PATH }}${{ env.INFO_FILENAME }}.txt
    //           $infoObj.migrations | Format-Table -AutoSize -Wrap version, description, state, filepath >> ${{ env.REPORT_PATH }}${{ env.INFO_FILENAME }}.txt 
    //           echo `````` >> ${{ env.REPORT_PATH }}${{ env.INFO_FILENAME }}.txt
    //           cat ${{ env.REPORT_PATH }}${{ env.INFO_FILENAME }}.txt
    //           $pending = @($infoObj.migrations | Where-Object -Property state -Match "^Pending")
    //           echo "$( $pending )"
    //           echo "$( $pending.count )"
    //           echo "pendingMigrations=$( $pending.count -ne 0)" > $env:GITHUB_OUTPUT

    //       - name: Add info files to repo
    //         run: |
    //           git config --global user.name "${{ env.ACTION_USER }}"
    //           git config --global user.email "${{ env.ACTION_EMAIL }}"
    //           git add ${{ env.REPORT_PATH }}${{ env.INFO_FILENAME }}.*

    //       - name: Echo pending migrations
    //         run: |
    //           echo "${{ steps.checkStates.outputs.pendingMigrations }}"

    //       # Publish as an artifact
    //       - name: Publish migration information
    //         if: env.publishArtifacts == 'true'
    //         uses: actions/upload-artifact@v3
    //         with:
    //           name: flyway-info
    //           path: |
    //             ${{ env.REPORT_PATH }}${{ env.INFO_FILENAME }}.txt
    //             ${{ env.REPORT_PATH }}${{ env.INFO_FILENAME }}.json

    //       - name: Commit info files and comment current migrations
    //         if: ${{ steps.checkStates.outputs.pendingMigrations == 'True' }}
    //         run: |
    //           git commit -am "Add migration info files"
    //           git push

    //       - name: Commit info files and comment NOTHING to do!
    //         if: ${{ steps.checkStates.outputs.pendingMigrations == 'False' }}
    //         run:
    //           | # Do not add a pull here.  There should be no new files.  New files show up when action is re-run.
    //           git commit -am "No pending migrations found"
    //           git push
    //           echo "::error::NOTHING to do!"; exit 1

    //   build:
    //     name: Deploy Build
    //     # The type of runner that the job will run on
    //     runs-on: self-hosted
    //     environment: "build" #Ensure this environment name is setup in the projects Settings>Environment area. Ensuring any reviewers are also configured
    //     needs: info
    //     if: ${{ needs.info.outputs.pendingMigrations == 'True' }}
    //     env:
    //       stage: "Build"
    //       # Environment Secrets - Ensure all of the below have been created as an Environment Secret (Projects Settings > Secrets > Actions section, specially related to the environment in question) #
    //       databaseName: ${{ secrets.databaseName}}
    //       # JDBC: ${{ secrets.JDBC }}
    //       userName: ${{ secrets.userName }}
    //       password: ${{ secrets.password }}
    //       # End of Environment Secrets #
    //       executeBuild: true
    //       publishArtifacts: true
    //       cleanDisabled: true

    //     # Steps represent a sequence of tasks that will be executed as part of the job
    //     steps:
    //       - name: Get/Set deployment environment
    //         run: |
    //           $deployments = curl ${{ github.event.repository.deployments_url }} | ConvertFrom-Json
    //           echo "deployment_environment=$( $deployments[0] | select -expand environment )" >> $env:GITHUB_ENV
    //           echo "${{ env.deployment_environment }}"

    //       # Checks-out your repository under $GITHUB_WORKSPACE, so your job can access it
    //       - uses: actions/checkout@v3

    //       - name: Set JDBC
    //         run: |
    //           echo "runner:${{ runner.name }}"
    //           echo "JDBC=${{ vars[format('JDBC_{0}', runner.name )] }}" >> $env:GITHUB_ENV

    //       - name: View JDBC
    //         run: |
    //           echo "JDBC: ${{ env.JDBC }}"

    //       # Runs the Flyway Clean command against the Build database
    //       - name: Clean build db
    //         if: env.executeBuild == 'true'
    //         run: |
    //           flyway -community -user="${{ env.userName }}" -password="${{ env.password }}" -baselineOnMigrate="true" -baselineVersion="${{ vars.BASELINE_VERSION }}" -configFiles="${{ github.WORKSPACE }}\flyway.conf" -locations="filesystem:${{ github.WORKSPACE }}\\migrations, filesystem:${{ github.WORKSPACE }}\\migrations-${{ env.deployment_environment }}" info clean info -url="${{ env.JDBC }}" -cleanDisabled='false'

    //       # Runs the Flyway Migrate command against the Build database
    //       - name: Migrate build db
    //         if: env.executeBuild == 'true'
    //         run: |
    //           flyway -community -user="${{ env.userName }}" -password="${{ env.password }}" -baselineOnMigrate="true" -baselineVersion="${{ vars.BASELINE_VERSION }}" -configFiles="${{ github.WORKSPACE }}\flyway.conf" -locations="filesystem:${{ github.WORKSPACE }}\migrations, filesystem:${{ github.WORKSPACE }}\\migrations-${{ env.deployment_environment }}" info migrate info -url="${{ env.JDBC }}" -cleanDisabled='${{ env.cleanDisabled }}'

    //       # Runs the Flyway Undo command against the Build database
    //       # If the first undo script is U002, this will validate all undo scripts up to and including that
    //       # - name: Undo build db
    //       #   if: env.executeBuild == 'true'
    //       #   run: |
    //       #     flyway -community -user="${{ env.userName }}" -password="${{ env.password }}" -baselineOnMigrate="true" -configFiles="${{ github.WORKSPACE }}\flyway.conf" -locations="filesystem:${{ github.WORKSPACE }}\migrations, filesystem:${{ github.WORKSPACE }}\\migrations-${{ env.deployment_environment }}" info undo info -url="${{ env.JDBC }}" -cleanDisabled='${{ env.cleanDisabled }}' -target="${{ vars.FIRST_UNDO_SCRIPT }}"

    //       # Create a directory to stage the artifact files
    //       - name: Stage files for publishing
    //         if: env.publishArtifacts == 'true'
    //         run: |
    //           cp -R ${{ github.WORKSPACE }}/migrations Artifact_Files/Migration/

    //       # Test for environment specific migrations
    //       - name: Set Env for environment specific files
    //         run: |
    //           echo "env_migrations=$(Test-Path ${{ github.WORKSPACE }}/migrations-${{ env.deployment_environment }} )" >> $env:GITHUB_ENV

    //       # Create a directory to stage the environment specific artifact files
    //       - name: Stage environment specific files for publishing
    //         if: env.publishArtifacts == 'true' && env.env_migrations == 'True'
    //         run: | # || : prevents errors on empty dir
    //           cp -R ${{ github.WORKSPACE }}/migrations-${{ env.deployment_environment }}/* Artifact_Files/Migration/ || :

    //       # After migration scripts are validated, publish them as an artifact
    //       - name: Publish validated migration scripts
    //         if: env.publishArtifacts == 'true'
    //         uses: actions/upload-artifact@v3
    //         with:
    //           name: flyway-build
    //           path: Artifact_Files/Migration/

    //   prod-preparation:
    //     name: Production deployment preparation - report creation
    //     # The type of runner that the job will run on
    //     runs-on: self-hosted
    //     environment: "prod-check" #Ensure this environment name is setup in the projects Settings>Environment area. Ensuring any reviewers are also configured
    //     if: ${{ true }} #Set this variable to false to temporarily disable the job
    //     needs: build
    //     env:
    //       stage: "Prod"
    //       branch_name: ${{ github.head_ref || github.ref_name }}
    //       # Environment Secrets - Ensure all of the below have been created as an Environment Secret (Projects Settings > Secrets > Actions section, specially related to the environment in question) #
    //       databaseName: ${{ secrets.databaseName }}
    //       JDBC: ${{ secrets.JDBC }}
    //       userName: ${{ secrets.userName }}
    //       password: ${{ secrets.password }}
    //       check_JDBC: ${{ secrets.check_JDBC }}
    //       check_userName: ${{ secrets.check_userName }}
    //       check_password: ${{ secrets.check_password }}
    //       # End of Environment Secrets #
    //       generateDriftAndChangeReport: true
    //       failReleaseIfDriftDetected: false
    //       publishArtifacts: true
    //       GITHUB_TOKEN: ${{ github.token }}
    //       REPORT_FILE: ${{ github.RUN_ID }}-${{ secrets.databaseName }}-Check-Report.html

    //     # Steps represent a sequence of tasks that will be executed as part of the job
    //     steps:
    //       - name: Get/Set deployment environment
    //         run: |
    //           $deployments = curl ${{ github.event.repository.deployments_url }} | ConvertFrom-Json
    //           echo "deployment_environment=$( $deployments[0] | select -expand environment )" >> $env:GITHUB_ENV
    //           echo "${{ env.deployment_environment }}"
    //       # Checks-out your repository under $GITHUB_WORKSPACE, so your job can access it
    //       - uses: actions/checkout@v3

    //       # Runs the Flyway Check command, to produce a deployment report, against the production database
    //       # - name: Create check reports
    //       #   if: env.generateDriftAndChangeReport == 'true'
    //       #   run: |
    //       #     flyway -community -user="${{ env.userName }}" -password="${{ env.password }}" -baselineOnMigrate="true" -configFiles="${{ github.WORKSPACE }}\flyway.conf" -locations="filesystem:${{ github.WORKSPACE }}\migrations, filesystem:${{ github.WORKSPACE }}\migrations-${{ env.deployment_environment }}" check -dryrun -changes -drift "-check.failOnDrift=${{ env.failReleaseIfDriftDetected }}" "-check.buildUrl=${{ env.check_JDBC }}" "-check.buildUser=${{ env.check_userName }}" "-check.buildPassword=${{ env.check_password }}" -url="${{ env.JDBC }}" "-check.reportFilename=${{ env.REPORT_PATH }}${{ env.REPORT_FILE }}"
    //       #   continue-on-error: false

    //       # - name: Publish check report
    //       #   if: env.publishArtifacts == 'true' && (${{ failure() }} || ${{ success() }})
    //       #   uses: actions/upload-artifact@v3
    //       #   with:
    //       #     name: flyway-reports
    //       #     path: ${{ github.WORKSPACE }}\reports

    //       # # Commit report to GitHub and put pages URL in commit message
    //       # - name: Commit report
    //       #   if: ${{ failure() }} || ${{ success() }}
    //       #   run: |
    //       #     git config --global user.name "${{ env.ACTION_USER }}"
    //       #     git config --global user.email "${{ env.ACTION_EMAIL }}"
    //       #     git add ${{ env.REPORT_PATH }}
    //       #     git commit -am "Flyway check report URL:${{ env.PUBLISH_PATH }}${{ env.REPORT_FILE }}"
    //       #     git pull
    //       #     git push

    //       - name: Create ${{ env.branch_name }} pull request
    //         run: |
    //           gh pr create -H "${{ env.branch_name }}" --title 'Merge ${{ env.branch_name }} into ${{ github.event.repository.default_branch }}' --body 'Pull request created by Github action.'
    //           gh pr merge --auto --merge

    //       # Trigger workflow to publish report to GitHub pages and try to comment on P.R. (if exists)
    //       - name: Trigger check report to GitHub pages workflow
    //         if: ${{ failure() }} || ${{ success() }}
    //         run: |
    //           gh workflow run fwCheckReport.yml -r ${{ github.ref }} -f title="${{ github.head_ref || github.ref_name }} Info Report" -f report_path="${{ env.PUBLISH_PATH }}" -f info_file="${{ env.INFO_FILENAME }}.txt"

    //   })

    // app.onAny(async (context) => {
    //   consoleLog(thisFile, 'onAny:', { event: context.name, action: context.payload.action })
  });
}

