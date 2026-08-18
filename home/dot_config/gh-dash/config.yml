# yaml-language-server: $schema=https://gh-dash.dev/schema.json
prSections:
  - title: Mine
    filters: is:open author:@me
    layout:
      author:
        hidden: true
  - title: Review
    filters: is:open review-requested:@me
    layout:
      repo:
        width: 6
  - title: Commented
    filters: commenter:@me
issuesSections:
  - title: Creator
    filters: author:@me
  - title: Commented
    filters: is:open commenter:@me
  - title: Assigned
    filters: is:open assignee:@me

pager:
  diff: diffnav
defaults:
  view: prs
  refetchIntervalMinutes: 10
  layout:
    prs:
      repoName:
        grow: true,
        width: 10
        hidden: false
      base:
        hidden: true

  preview:
    open: false
    width: 70
  prsLimit: 20
  issuesLimit: 20

keybindings:
  universal:
    - key: g
      name: lazygit
      command: >
        cd {{.RepoPath}} && lazygit
  prs:
    - key: C
      name: code review
      command: >
        cmux new-workspace -n "PR-{{.PrNumber}}" 
        'wt switch pr:{{.PrNumber}} -x "cc'
    - key: m
      command: gh pr merge --repo {{.RepoName}} {{.PrNumber}}
    - key: v
      name: approve
      command: >
        gh pr review --repo {{.RepoName}} --approve --body "$(gum input --prompt='Approval Comment: ')" {{.PrNumber}}
  notifications:
    - key: d
      builtin: markAsDone
    - key: D
      builtin: markAllAsDone

theme:
  ui:
    sectionsShowCount: true
    table:
      compact: false
  colors:
    text:
      primary: "#E2E1ED"
      secondary: "#666CA6"
      inverted: "#242347"
      faint: "#B0B3BF"
      warning: "#E0AF68"
      error: "#DB4B4B"
      success: "#3DF294"
    background:
      selected: "#1B1B33"
    border:
      primary: "#383B5B"
      secondary: "#39386B"
      faint: "#2B2B40"
