# frozen_string_literal: true

# Workbench — lightweight ticket/worktree registry
# Ruby stdlib only — no gems.

require_relative 'workbench/store'
require_relative 'workbench/registry'
require_relative 'workbench/github'
require_relative 'workbench/cli'

module Workbench
  EXIT_OK         = 0
  EXIT_ERROR      = 1
  EXIT_USAGE      = 2
  EXIT_VALIDATION = 3
  EXIT_NOT_FOUND  = 10

  VALID_STATUSES        = %w[active stale review merged orphan].freeze
  VALID_PR_STATES       = %w[open closed merged].freeze
  VALID_CI_STATUSES     = %w[success failure pending].freeze
  VALID_REVIEW_STATUSES = %w[approved changes_requested pending].freeze

  JIRA_PATTERN = /\A[A-Z]+-\d+\z/

  def self.home
    File.expand_path(ENV.fetch('WORKBENCH_HOME', '~/.workbench'))
  end
end
