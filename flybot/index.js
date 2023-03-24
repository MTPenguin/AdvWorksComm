/**
 * This is the main entrypoint to your Probot app
 * @param {import('probot').Probot} app
 */
const { encode } = require('js-base64')
const semver = require('semver')
const bodyParser = require('body-parser');
const thisFile = 'index.js'

module.exports = (app, { getRouter }) => {
  // const consoleLog = app.log.info
  const consoleLog = console.log
  consoleLog(thisFile, "Yay, the app was loaded!");

  const flyBotURI = '/flybot'

  const router = getRouter(flyBotURI)
  router.use(bodyParser.urlencoded({ extended: true }));
  router.use(bodyParser.json());
  router.use(bodyParser.raw());

  // router.post('/', async (req, res) => {
  //   const { body, params: { owner, repo } } = req
  //   consoleLog(thisFile, '/ body test owner, repo:', owner, repo)
  //   consoleLog(thisFile, '/ body test body:', body)
  //   res.json({ got: 'it' })
  // })

  router.post('/:owner/:repo/createIssue', async (req, res) => {
    const { body, params: { owner, repo } } = req
    consoleLog(thisFile, '/createIssue owner, repo:', owner, repo)
    consoleLog(thisFile, '/createIssue body:', body)
    const octokit = await app.auth()
    let raw
    const { data: authData } = raw = await octokit.apps.getAuthenticated()
    // consoleLog(thisFile, '/createIssue raw:', raw)
    consoleLog(thisFile, '/createIssue authData:', authData)


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
      body: `Issue Body \`\`\`${JSON.stringify(body)}\`\`\``
    });
    consoleLog(thisFile, 'issue create result:', result)
  })

  router.get('/whoami', async (req, res) => {
    const octokit = await app.auth()
    const { data } = await octokit.apps.getAuthenticated()
    res.json(data)
  })

  // Add a new route
  router.get("/", (req, res) => {
    res.send(`
    <body>
        <script src="https://unpkg.com/mithril/mithril.js"></script>
        <script>
        console.log('Hello World! You did it! Welcome to Snowpack :D');

let UserNameInput = {
  error: '',
  value: '',
  validate: () => {
    UserNameInput.error = !UserNameInput.value ? 'Please enter user name' : '';
  },
  isValid: () => {
    return UserNameInput.error ? false : true;
  },
  view: () => {
    return [
      m('input', {
        className: UserNameInput.error ? 'error' : '',
        placeholder: 'User Name',
        value: UserNameInput.value,
        type: 'text',
        oninput: e => {
          UserNameInput.value = e.target.value;
          UserNameInput.error && UserNameInput.validate()
        }
      }),
      UserNameInput.error && m('div.error-message', UserNameInput.error)
    ];
  }
};

let PasswordInput = {
  error: '',
  value: '',
  validate: () => {
    PasswordInput.error = !PasswordInput.value ? 'Please enter password' : '';
  },
  isValid: () => {
    return PasswordInput.error ? false : true;
  },
  view: () => {
    return [
      m('input', {
        className: PasswordInput.error ? 'error' : '',
        placeholder: 'Password',
        value: PasswordInput.value,
        type: 'password',
        oninput: e => {
          PasswordInput.value = e.target.value;
          PasswordInput.error && PasswordInput.validate()
        }
      }),
      PasswordInput.error && m('div.error-message', PasswordInput.error)
    ];
  }
};

let LoginForm = {
  isValid() {
    UserNameInput.validate();
    PasswordInput.validate();
    if (UserNameInput.isValid() && PasswordInput.isValid()) {
      return true;
    }
    return false;
  },
  view() {
    return m('form', [
      m('h1',
        'Login'
      ),
      // Passing component
      m(UserNameInput),
      m(PasswordInput),
      m('button', {
        class: 'pure-button pure-button-primary',
        id: 'loginBtn',
        type: 'button',
        onclick() {
          const url = "http://localhost:3000/flybot/:owner/:repo/createIssue"
          console.log('url:', url)
          if (LoginForm.isValid()) {
            m.request({
              method: "PUT",
              url,
              params: { owner: 'MTPenguin', repo: 'AdvWorksComm' },
              body: { name: "test" }
            })
              .then(function (result) {
                console.log(result)
              })
          }
        }
      },
        'Login'
      )
    ])
  }
}

m.mount(document.body, LoginForm)
        </script>
    </body>`);
  });

  app.on("issues.opened", async (context) => {
    const octokit = context.octokit
    const payload = context.payload
    const repo = payload.repository
    const issueBody = payload.issue.body
    const repoOwner = repo.owner.login
    const repoName = repo.name

    consoleLog(thisFile
      , `\npayload:`, payload
      // , `\nrepo:`, repo
      , `\nissueBody:`, issueBody
      , `\nrepoOwner:`, repoOwner
      , `\nrepoName:`, repoName
    )
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

    if (!(jsonBody.jira && jsonBody.scope)) throw new Error('Missing parameter(s) jsonBody.jira && jsonBody.scope')

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
     * In order to create a new branch off of main, we first have to get the sha of mergeBranch
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




    // GITHUB_ISSUE-JIRA-000-SCOPE-CURRENT_VERSION
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
    let message = `Resolves #${payload.issue.number} - Created ${newMigration}.sql file - [skip actions]`
    let content = "--flybot created " + newMigration
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

  // For more information on building apps:
  // https://probot.github.io/docs/

  // To get your app running against GitHub, see:
  // https://probot.github.io/docs/development/
};
