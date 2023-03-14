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
    const mergeBranchName = 'main'

    consoleLog(thisFile
      , `\npayload:`, payload
      // , `\nrepo:`, repo
      , `\nissueBody:`, issueBody
      , `\nrepoOwner:`, repoOwner
      , `\nrepoName:`, repoName
      , `\nmergeBranchName:`, mergeBranchName
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
     * In order to create a new branch off of main, we first have to get the sha of mergeBranch
     */
    const mergeBranch = await octokit.request(repo.branches_url, { branch: mergeBranchName })
    consoleLog(thisFile, 'mergeBranch:', mergeBranch)

    /* DEBUG ADD LIGHT TAG REF */
    await octokit.git.createRef({
      owner: repoOwner,
      repo: repoName,
      ref: 'refs/tags/v1.0.' + Date.now(),
      sha: mergeBranch.data.commit.sha
    })


    /**
     * Get current version
     */
    const tags = await octokit.request(repo.tags_url)
    consoleLog(thisFile, 'tags:', tags)
    const tagsSorted = semver.sort(tags.data.map(d => d.name))
    consoleLog(thisFile, 'tagsSorted:', tagsSorted)
    const currentVersion = tagsSorted[0]
    consoleLog(thisFile, 'currentVersion:', currentVersion)
    let level
    switch (jsonBody.scope) {
      case 'data':
        level = 'patch'
      case 'refData':
        level = 'minor'
      case 'schema':
        level = 'major'
    }
    consoleLog(thisFile, 'level:', level)

    const newVersion = semver.inc(currentVersion, level).replace(/^v/, 'V')
    consoleLog(thisFile, 'newVersion:', newVersion)


    let newBranch = jsonBody.jira + '-' + jsonBody.scope + '-' + currentVersion
    let newMigration = newVersion + '__' + newBranch
    consoleLog(thisFile, 'newBranch:', newBranch)
    consoleLog(thisFile, 'newMigration:', newMigration)


    /**
     * Create a new branch off of main with the sha of main
     */
    let result = await octokit.git.createRef({
      owner: repoOwner,
      repo: repoName,
      ref: `refs/heads/${newBranch}`,
      sha: mergeBranch.data.commit.sha,
    });
    consoleLog(thisFile, 'branch result:', result)

    const message = "Add versioned migration file [skip actions]";
    let content = "--flybot inserted version gate"
    content += `
    Declare @version varchar(25);
    SELECT @version= Coalesce(Json_Value(
      (SELECT Convert(NVARCHAR(3760), value) 
       FROM sys.extended_properties AS EP
       WHERE major_id = 0 AND minor_id = 0 
        AND name = 'Database_Info'), '$[0].Version'), 'that was not recorded');
    IF @version <> \${flyway:expectedVersion}
    BEGIN
    RAISERROR ('The Target was at version %s, not the correct version (\${flyway:expectedVersion})',16,1,@version)
    SET NOEXEC ON;
    END`
    content += "\n--flybot inserted version gate"

    result = await octokit.repos.createOrUpdateFileContents({
      owner: repoOwner,
      repo: repoName,
      branch: newBranch,
      path: 'migrations/' + newMigration + '.sql',
      message,
      content: encode(content)
    })
    consoleLog(thisFile, 'file result:', result)

    /**
     * Create a new issue comment
     */
    let commentBody = "Thanks for opening this issue!\n\n\n"
    commentBody += "I have created a new branch (["
    commentBody += newBranch
    commentBody += "](https://github.com/MTPenguin/AdvWorksComm/tree/"
    commentBody += newBranch
    commentBody += ")) to work on this migration"
    const issueComment = context.issue({
      body: commentBody,
    });
    result = await octokit.issues.createComment(issueComment);
    consoleLog(thisFile, 'issue result:', result)
  });

  // For more information on building apps:
  // https://probot.github.io/docs/

  // To get your app running against GitHub, see:
  // https://probot.github.io/docs/development/
};
