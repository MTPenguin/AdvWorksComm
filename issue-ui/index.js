import m from 'mithril'


/* Add JavaScript code here! */
console.log('Hello World! You did it! Welcome to Snowpack :D');

let JiraInput = {
  error: '',
  value: 'ABC-000',
  validate: () => {
    const regEx = /[a-zA-Z][a-zA-Z][a-zA-Z]-[0-9][0-9][0-9]/
    const goodFormat = regEx.test(JiraInput.value)
    JiraInput.error = !(JiraInput.value && goodFormat) ? 'Please enter Jira issue with format (XXX-000)  X = Alpha, 0 = Numeric' : '';
  },
  isValid: () => {
    return JiraInput.error ? false : true;
  },
  view: () => {
    return [
      m('label', 'Jira issue'),
      m('input', {
        className: JiraInput.error ? 'error' : '',
        placeholder: '(XXX-000)',
        value: JiraInput.value,
        type: 'text',
        oninput: e => {
          JiraInput.value = e.target.value;
          JiraInput.error && JiraInput.validate()
        }
      }),
      JiraInput.error && m('div.error-message', JiraInput.error)
    ];
  }
};

let ScopeInput = {
  error: '',
  value: 'data',
  validate: () => {
    ScopeInput.error = !ScopeInput.value ? 'Please select issue scope' : '';
  },
  isValid: () => {
    return ScopeInput.error ? false : true;
  },
  view: () => {
    return [
      m('label', 'Scope'),
      m('select', {
        className: ScopeInput.error ? 'error' : '',
        onchange: e => {
          ScopeInput.value = e.target.value;
          ScopeInput.error && ScopeInput.validate()
        },
        value: ScopeInput.value
      },
        ['data', 'refData', 'schema'].map(x =>
          m('option', x)
        )
      ),
      ScopeInput.error && m('div.error-message', ScopeInput.error)
    ];
  }
};

let IssueForm = {
  isValid() {
    JiraInput.validate();
    ScopeInput.validate();
    if (JiraInput.isValid() && ScopeInput.isValid()) {
      return true;
    }
    return false;
  },
  view() {
    return m('form', [
      m('h1',
        'Create Jira Issue'
      ),
      // Passing component
      m(JiraInput),
      m(ScopeInput),
      m('button', {
        class: 'pure-button pure-button-primary',
        id: 'loginBtn',
        type: 'button',
        disabled: !(JiraInput.value && ScopeInput.value),
        onclick() {
          const url = "/flybot/:owner/:repo/createIssue"
          console.log('url:', url)
          if (IssueForm.isValid()) {
            console.log('**** FIRE REQUEST ?:', JiraInput.value)
            m.request({
              method: "POST",
              url,
              params: { owner: 'MTPenguin', repo: 'AdvWorksComm' },
              body: { jira: JiraInput.value, scope: ScopeInput.value }
            })
              .then(function (result) {
                console.log(result)
              })
          }
        }
      },
        'Create Issue'
      )
    ])
  }
}

m.mount(document.body, IssueForm)