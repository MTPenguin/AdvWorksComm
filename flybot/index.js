/**
 * This is the main entrypoint to your Probot app
 * @param {import('probot').Probot} app
 */
const { encode } = require('js-base64')
const semver = require('semver')
const thisFile = 'index.js'

module.exports = (app) => {
  // const consoleLog = app.log.info
  const consoleLog = console.log
  consoleLog(thisFile, "Yay, the app was loaded!");


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

    result = await octokit.repos.getContent({
      owner: repoOwner,
      repo: repoName,
      path: 'V.json',
    })
    consoleLog(thisFile, 'V content result:', result)

    message = `Store V.json for CI`
    content = {
      branch: newBranch,
      ...jsonBody, // By value
      currentVersion,
      currentMajor,
      currentMinor,
      dateStamp,
      newVersion
    }
    consoleLog(thisFile, 'content:', content)

    // Put content in issue body instead
    // result = await octokit.repos.createOrUpdateFileContents({
    //   owner: repoOwner,
    //   repo: repoName,
    //   branch: newBranch,
    //   path: 'V.json',
    //   sha: result.data.sha,
    //   message,
    //   content: encode(JSON.stringify(content))
    // })
    // consoleLog(thisFile, 'V file result:', result)

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
    result = await octokit.issues.update({
      owner: repoOwner,
      repo: repoName,
      issue_number: payload.issue.number,
      title: newBranch,
      body: `\`\`\`${JSON.stringify(content)}\`\`\``,
      // state: 'open',
      labels: Object.values(jsonBody),
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
