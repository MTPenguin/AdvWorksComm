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
        consoleLog(thisFile, 'jsonBody:', jsonBody)
        jsonBody = JSON.parse(jsonBody)
      } catch (error) {
        console.error('Throwing:', error.message)
        throw error
      }
      consoleLog(thisFile, 'jsonBody:', jsonBody)
    } else {
      consoleLog(thisFile, 'firstT:', firstT, 'lastT:', lastT)
      throw new Error('No JSON body')
    }

    if (!(jsonBody.jira && jsonBody.scope)) throw new Error('Missing parameter(s) jsonBody.jira && jsonBody.scope ' + JSON.stringify(jsonBody))

    /**
     * Get current version
     */
    const tags = await octokit.request(repo.tags_url)
    consoleLog(thisFile, 'tags:', tags)
    const tagsSorted = semver.rsort(tags.data.map(d => d.name))
    consoleLog(thisFile, 'tagsSorted:', tagsSorted)
    const currentVersion = tagsSorted[0]
    consoleLog(thisFile, 'currentVersion:', currentVersion)

    /**
    * Flyway Date Stamp yyyy-MM-dd HH:mm:ss
    */
    const dateNow = new Date()
    const dateStamp = dateNow.getUTCFullYear() + String(dateNow.getUTCMonth() + 1).padStart(2, '0') + String(dateNow.getUTCDate()).padStart(2, '0')
      + String(dateNow.getUTCHours()).padStart(2, '0') + String(dateNow.getUTCMinutes()).padStart(2, '0') + String(dateNow.getUTCSeconds()).padStart(2, '0')
    consoleLog(thisFile, 'dateStamp:', dateStamp)

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
    consoleLog(thisFile, 'level:', level)
    consoleLog(thisFile, 'newVersion:', newVersion)

    /**
     * In order to create a new branch off of default, we first have to get the sha of mergeBranch
     */
    const mergeBranch = await octokit.request(repo.branches_url, { branch: repo.default_branch })
    consoleLog(thisFile, 'mergeBranch:', mergeBranch)

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
    consoleLog(thisFile, 'newBranch:', newBranch)
    consoleLog(thisFile, 'newMigration:', newMigration)


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
    consoleLog(thisFile, 'branch result:', result)


    /*
    * [ Resolves #<issue_number> ] links the commit to the issue.  When the commit is merged, it should close the issue.
    * TODO Trying to get the linked branch to show up under 'Development' in the GitHub Issue UI
    */
    const DEBUG = jsonBody.debug ?? false
    let message = `Resolves #${payload.issue.number} - Created ${newMigration}.sql file - [skip actions]}`
    let content = "--flybot created " + newMigration
    if (DEBUG) {
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
    consoleLog(thisFile, 'migration file result:', result)

    content = {
      ...jsonBody,
      newBranch,
      currentVersion,
      currentMajor,
      currentMinor,
      dateStamp,
      newVersion
    }
    consoleLog(thisFile, 'content:', content)

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
    consoleLog(thisFile, 'issue comment result:', result)

    /**
    * Update issue JSON
    */
    const body = `\`\`\`${JSON.stringify(content)}\`\`\``
    consoleLog(thisFile, 'body:', body)
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
    consoleLog(thisFile, 'issue update result:', result)
  });

  app.on('push', async (context) => {
    consoleLog(thisFile, 'Push event')
  })
};
