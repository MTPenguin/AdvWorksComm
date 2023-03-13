/**
 * This is the main entrypoint to your Probot app
 * @param {import('probot').Probot} app
 */

const thisFile = 'index.js'

module.exports = (app) => {
  const consoleLog = app.log.info
  consoleLog(thisFile, "Yay, the app was loaded!");
  

  app.on("issues.opened", async (context) => {
    const octokit = context.octokit
    const repoOwner = 'MTPenguin'

    let newBranch = 'testFlyBot';

    /**
     * In order to create a new branch off of master, we first have to get the sha of master
     */
    const branches = await octokit.request(`GET /repos/${repoOwner}/${config.gitHubRepoName}/branches`, {
        owner: repoOwner,
        repo: config.gitHubRepoName
    });

    consoleLog(thisFile, 'branches:', branches)

    let mainSha;
    for (const branch in branches.data) {
      if (branch.name === 'main') {
        mainSha = branch.commit.sha
      }
      if (branch.name === newBranch) {
          newBranch = newBranch + '.' + Date.now()
      }
    }

    consoleLog(thisFile, 'newBranch:', newBranch)

    // _.forEach(branches.data, function(branch) {
    //     if (branch.name === 'main') {
    //       mainSha = _.get(branch, 'commit.sha');
    //     }
    //     if (branch.name === newBranch) {
    //         newBranch = newBranch + '.' + moment().format('X');
    //     }
    // });

    /**
     * Create a new branch off of master with the sha of master
     */
    const result = await octokit.request(`POST /repos/${repoOwner}/${config.gitHubRepoName}/git/refs`, {
        owner: repoOwner,
        repo: config.gitHubRepoName,
        ref: `refs/heads/${newBranch}`,
        sha: masterSha
    });

    consoleLog(thisFile, 'result:', result)

    const issueComment = context.issue({
      body: "Thanks for opening this issue!",
    });
    return octokit.issues.createComment(issueComment);
  });

  // For more information on building apps:
  // https://probot.github.io/docs/

  // To get your app running against GitHub, see:
  // https://probot.github.io/docs/development/
};
