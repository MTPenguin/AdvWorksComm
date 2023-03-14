# flybot

> A GitHub App built with [Probot](https://github.com/probot/probot) that A Probot app

## Outline of process
### Create branch where the version is in the branch name as well as a new migrations file.  All branches will have a matching migration file.
Formatted BRANCH naming:   Jira-Scope-FromVersion
Formatted MIGRATION naming:   ToVersion__Jira-Scope-FromVersion
  JIR-123-data-v1.0.0.sql with current db version on data create.
  V1.0.1__JIR-123-data-v1.0.0.sql with new version on data merge.
  JIR-123-refData-v1.0.0.sql with current db version on refData create.
  V1.1.0__JIR-123-refData-v1.0.0.sql with new version on refData merge.
  JIR-123-schema-v1.0.0.sql with current db version on schema create.
  V2.0.0__JIR-123-schema-v1.0.0.sql with new version on schema merge.

## Setup

```sh
# Install dependencies
npm install

# Run the bot
npm start
```

## Contributing

If you have suggestions for how flybot could be improved, or want to report a bug, open an issue! We'd love all and any contributions.

For more, check out the [Contributing Guide](CONTRIBUTING.md).

## License

[ISC](LICENSE) © 2023 MTPenguin
