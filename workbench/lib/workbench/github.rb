# frozen_string_literal: true

require 'json'
require 'open3'
require 'date'

module Workbench
  # GitHub PR/CI/review sync via gh CLI.
  # Operates on a Registry instance — no direct YAML access.
  class GithubSync
    attr_reader :registry

    def initialize(registry:)
      @registry = registry
    end

    # Sync a single ticket's PRs from GitHub.
    # Returns { prs_synced:, status:, last_commit: }
    def sync_ticket(id)
      ticket = registry.get(id)
      raise NotFoundError, "Ticket not found: #{id}" unless ticket

      repo       = ticket['repo'] || ''
      worktree   = ticket['worktree'] || ''
      status     = ticket['status'] || 'active'
      prs        = ticket['prs'] || []
      new_status = status
      prs_synced = 0
      last_commit = ''

      prs.each do |pr|
        result = sync_pr(id, pr['number'], repo)
        next unless result

        prs_synced += 1
        new_status = 'merged' if result[:state] == 'merged'
        new_status = 'review' if %w[changes_requested approved].include?(result[:review_status]) && new_status != 'merged'
      end

      # Check git activity
      if !worktree.empty? && File.directory?(worktree)
        last_commit = registry.git_last_commit_date(worktree)
        if !last_commit.empty? && new_status == 'active'
          days_since = (Date.today - Date.parse(last_commit)).to_i rescue 0
          new_status = 'stale' if days_since >= 3
        end
      end

      if new_status != status
        registry.update(id, 'status', new_status) rescue nil
        $stderr.puts "Status: #{status} -> #{new_status}"
      end

      { 'prs_synced' => prs_synced, 'status' => new_status, 'last_commit' => last_commit }
    end

    # Sync all tickets that have PRs.
    # Returns array of per-ticket results.
    def sync_all
      results = { 'updated' => [], 'errors' => [] }

      registry.list.each do |ticket|
        next if (ticket['prs'] || []).empty?
        begin
          result = sync_ticket(ticket['id'])
          results['updated'] << { 'id' => ticket['id'], **result }
        rescue StandardError => e
          results['errors'] << { 'id' => ticket['id'], 'error' => e.message }
        end
      end

      results
    end

    private

    def sync_pr(ticket_id, pr_number, repo)
      return nil unless pr_number && !repo.empty?

      $stderr.puts "Syncing PR ##{pr_number} on #{repo}..."
      pr_json, status = Open3.capture2(
        'gh', 'pr', 'view', pr_number.to_s,
        '--repo', repo,
        '--json', 'state,statusCheckRollup,reviews'
      )

      unless status.success?
        $stderr.puts "  PR ##{pr_number}: failed to fetch (skipping)"
        return nil
      end

      pr_data = JSON.parse(pr_json)

      state = (pr_data['state'] || '').downcase
      registry.update_pr(ticket_id, pr_number, 'state', state) unless state.empty?

      ci = derive_ci_status(pr_data['statusCheckRollup'] || [])
      registry.update_pr(ticket_id, pr_number, 'ci', ci)

      review = derive_review_status(pr_data['reviews'] || [])
      registry.update_pr(ticket_id, pr_number, 'review_status', review)

      $stderr.puts "  PR ##{pr_number}: state=#{state} ci=#{ci} review=#{review}"
      { state: state, ci: ci, review_status: review }
    rescue JSON::ParserError => e
      $stderr.puts "  PR ##{pr_number}: JSON parse error: #{e.message}"
      nil
    end

    def derive_ci_status(checks)
      return 'pending' if checks.empty?
      conclusions = checks.map { |c| c['conclusion'] || c['status'] }
      if conclusions.all? { |c| %w[SUCCESS COMPLETED].include?(c) }
        'success'
      elsif conclusions.any? { |c| %w[FAILURE ERROR].include?(c) }
        'failure'
      else
        'pending'
      end
    end

    def derive_review_status(reviews)
      return 'pending' if reviews.empty?
      states = reviews.map { |r| r['state'] }
      if states.include?('CHANGES_REQUESTED')
        'changes_requested'
      elsif states.include?('APPROVED')
        'approved'
      else
        'pending'
      end
    end

  end
end
