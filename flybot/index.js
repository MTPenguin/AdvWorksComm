/**
 * This is the main entrypoint to your Probot app
 * @param {import('probot').Probot} app
 */

const thisFile = 'index.js'

module.exports = (app) => {
  // const consoleLog = app.log.info
  const consoleLog = console.log
  consoleLog(thisFile, "Yay, the app was loaded!");


  app.on("issues.opened", async (context) => {
    const octokit = context.octokit
    // consoleLog(thisFile, 'context:', context)
    const repo = context.payload.repository
    const repoOwner = repo.owner.login
    const repoName = repo.name
    const mergeBranchName = 'main'

    let newBranch = 'testFlyBot';

    consoleLog(thisFile
      , `\n${repo}:`, repo
      , `\n${repoOwner}:`, repoOwner
      , `\n${repoName}:`, repoName
      , `\n${mergeBranchName}:`, mergeBranchName
      , `\n${newBranch}:`, newBranch
    )

    /**
     * In order to create a new branch off of main, we first have to get the sha of mergeBranch
     */

    const mergeBranch = await octokit.request(repo.branches_url, { branch: mergeBranchName })
    consoleLog(thisFile, 'mergeBranch:', mergeBranch)

    /**
     * Create a new branch off of main with the sha of main
     */
    let result = await octokit.git.createRef({
      owner: repoOwner,
      repo: repoName,
      ref: `refs/heads/${newBranch}`,
      sha: mergeBranch.data.commit.sha,
    });
    consoleLog(thisFile, 'result:', result)

    // const content = `--inserted code
    // Declare @version varchar(25);
    // SELECT @version= Coalesce(Json_Value(
    //   (SELECT Convert(NVARCHAR(3760), value) 
    //    FROM sys.extended_properties AS EP
    //    WHERE major_id = 0 AND minor_id = 0 
    //     AND name = 'Database_Info'), '$[0].Version'), 'that was not recorded');
    // IF @version <> '2.1.5'
    // BEGIN
    // RAISERROR ('The Target was at version %s, not the correct version (2.1.5)',16,1,@version)
    // SET NOEXEC ON;
    // END
    // --end of inserted code
    // `
    // const message = "Add versioned migration file";
    // const isBinary = false;
    // branch.write('PATH/TO/FILE.txt', content, message, isBinary)
    //   .done(function () { });

    /**
     * Create a new issue comment
     */
    const issueComment = context.issue({
      body: "Thanks for opening this issue!",
    });
    result = octokit.issues.createComment(issueComment);
    consoleLog(thisFile, 'result:', result)
  });

  // For more information on building apps:
  // https://probot.github.io/docs/

  // To get your app running against GitHub, see:
  // https://probot.github.io/docs/development/
};
