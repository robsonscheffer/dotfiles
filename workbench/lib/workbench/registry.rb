# frozen_string_literal: true

require 'open3'
require 'date'
require 'fileutils'
require 'net/http'
require 'uri'

module Workbench
  # All ticket and PR operations on top of Store.
  # Pure domain logic — no CLI concerns, no formatting.
  class Registry
    attr_reader :store

    def initialize(store: Store.new, worktree_base: nil)
      @store = store
      @worktree_base = worktree_base || File.expand_path('~/worktrees')
    end

    # --- Ticket CRUD ---

    def list
      store.tickets
    end

    def get(id)
      store.find_ticket(id)
    end

    def add(id:, repo:, worktree:, base_branch: 'main')
      store.mutate do |data|
        raise DuplicateError, "Ticket already exists: #{id}" if data['tickets'].any? { |t| t['id'] == id }
        data['tickets'] << new_ticket(id: id, repo: repo, worktree: worktree, base_branch: base_branch)
      end
    end

    def remove(id)
      store.mutate do |data|
        before = data['tickets'].length
        data['tickets'].reject! { |t| t['id'] == id }
        raise NotFoundError, "Ticket not found: #{id}" if data['tickets'].length == before
      end
    end

    def update(id, field, value)
      if field == 'status' && !VALID_STATUSES.include?(value)
        raise ValidationError, "Invalid status: #{value}. Must be one of: #{VALID_STATUSES.join(', ')}"
      end
      store.mutate do |data|
        ticket = data['tickets'].find { |t| t['id'] == id }
        raise NotFoundError, "Ticket not found: #{id}" unless ticket
        ticket[field] = value
      end
    end

    def touch(id)
      store.mutate do |data|
        ticket = data['tickets'].find { |t| t['id'] == id }
        raise NotFoundError, "Ticket not found: #{id}" unless ticket
        ticket['last_touched'] = Date.today.to_s
      end
    end

    def path(id)
      ticket = get(id)
      raise NotFoundError, "Ticket not found: #{id}" unless ticket
      ticket['worktree']
    end

    def find_by_path(path)
      ticket = store.find_by_path(path)
      raise NotFoundError, "No ticket for path: #{path}" unless ticket
      ticket
    end

    # --- PR management ---

    def add_pr(id, pr_number)
      store.mutate do |data|
        ticket = data['tickets'].find { |t| t['id'] == id }
        raise NotFoundError, "Ticket not found: #{id}" unless ticket
        ticket['prs'] ||= []
        if ticket['prs'].any? { |p| p.is_a?(Hash) && p['number'] == pr_number }
          raise DuplicateError, "PR already exists: #{pr_number}"
        end
        ticket['prs'] << { 'number' => pr_number, 'state' => nil, 'ci' => nil, 'review_status' => nil }
      end
    end

    def remove_pr(id, pr_number)
      store.mutate do |data|
        ticket = data['tickets'].find { |t| t['id'] == id }
        raise NotFoundError, "Ticket not found: #{id}" unless ticket
        before = ticket['prs'].length
        ticket['prs'].reject! { |p| (p.is_a?(Hash) ? p['number'] : p.to_s) == pr_number }
        raise NotFoundError, "PR not found: #{pr_number}" if ticket['prs'].length == before
      end
    end

    def update_pr(id, pr_number, field, value)
      valid_fields = { 'state' => VALID_PR_STATES, 'ci' => VALID_CI_STATUSES, 'review_status' => VALID_REVIEW_STATUSES }
      if valid_fields.key?(field) && !valid_fields[field].include?(value)
        raise ValidationError, "Invalid #{field}: #{value}. Must be one of: #{valid_fields[field].join(', ')}"
      end

      store.mutate do |data|
        ticket = data['tickets'].find { |t| t['id'] == id }
        raise NotFoundError, "Ticket not found: #{id}" unless ticket
        pr = ticket['prs'].find { |p| p.is_a?(Hash) && p['number'] == pr_number }
        raise NotFoundError, "PR not found: #{pr_number}" unless pr
        pr[field] = value
      end
    end

    # --- Lifecycle ---

    def start(id:, repo_path:, base_branch: 'main')
      repo_path = File.expand_path(repo_path)
      raise OperationError, "Not a directory: #{repo_path}" unless File.directory?(repo_path)

      slug = resolve_repo_slug(repo_path)
      raise OperationError, "Cannot resolve repo slug from: #{repo_path}" unless slug

      worktree_path = File.join(@worktree_base, slug, id)
      raise ValidationError, "Worktree already exists: #{worktree_path}" if File.directory?(worktree_path)

      FileUtils.mkdir_p(File.dirname(worktree_path))
      _, err, status = Open3.capture3('git', '-C', repo_path, 'worktree', 'add', worktree_path, '-b', id, base_branch)
      unless status.success?
        _, err, status = Open3.capture3('git', '-C', repo_path, 'worktree', 'add', worktree_path, id)
        raise OperationError, "git worktree add failed: #{err}" unless status.success?
      end

      store.mutate do |data|
        data['tickets'] << new_ticket(id: id, repo: slug, worktree: worktree_path, base_branch: base_branch)
      end

      notes_path = init_investigation_notes(slug, id)
      { 'worktree' => worktree_path, 'repo' => slug, 'id' => id, 'investigation' => notes_path }
    end

    def archive(id, force: false)
      ticket = get(id)
      raise NotFoundError, "Ticket not found: #{id}" unless ticket

      worktree = ticket['worktree']
      repo = ticket['repo']

      if worktree && File.directory?(worktree)
        out, = Open3.capture3('git', '-C', worktree, 'status', '--porcelain')
        if !out.strip.empty? && !force
          raise ValidationError, "Worktree has uncommitted changes. Use --force to override.\n#{out}"
        end
      end

      # Move investigation notes to archive
      if repo
        active_dir  = File.join(Workbench.home, repo, 'active', id)
        archive_dir = File.join(Workbench.home, repo, 'archive', id)
        if File.directory?(active_dir)
          FileUtils.mkdir_p(File.dirname(archive_dir))
          FileUtils.mv(active_dir, archive_dir)
        end
      end

      # Remove git worktree
      if worktree && File.directory?(worktree)
        _, err, status = Open3.capture3('git', 'worktree', 'remove', worktree)
        unless status.success?
          if force
            _, _, status2 = Open3.capture3('git', 'worktree', 'remove', '--force', worktree)
            raise OperationError, "Failed to remove worktree: #{err}" unless status2.success?
          else
            raise OperationError, "Failed to remove worktree: #{err}"
          end
        end
      end

      remove(id)
    end

    def focus(id_or_path, quiet: false)
      ticket = if id_or_path.start_with?('/') || id_or_path.start_with?('.')
                 store.find_by_path(id_or_path)
               else
                 get(id_or_path)
               end
      raise NotFoundError, "Ticket not found: #{id_or_path}" unless ticket

      touch(ticket['id'])
      ticket = get(ticket['id']) # re-read after touch
      return ticket if quiet

      ticket
    end

    # --- Maintenance ---

    def validate
      errors = []
      store.tickets.each_with_index do |t, i|
        prefix = "tickets[#{i}] (#{t['id'] || 'NO ID'})"
        errors << "#{prefix}: missing id" unless t['id'] && !t['id'].empty?
        errors << "#{prefix}: missing repo" unless t['repo'] && !t['repo'].empty?
        errors << "#{prefix}: missing worktree" unless t['worktree'] && !t['worktree'].empty?
        errors << "#{prefix}: repo looks like a flag: #{t['repo']}" if t['repo']&.start_with?('-')
        errors << "#{prefix}: repo missing owner/ prefix: #{t['repo']}" if t['repo'] && !t['repo'].include?('/')
        errors << "#{prefix}: worktree is not absolute: #{t['worktree']}" if t['worktree'] && !t['worktree'].start_with?('/')
        errors << "#{prefix}: invalid status: #{t['status']}" if t['status'] && !VALID_STATUSES.include?(t['status'])

        (t['prs'] || []).each_with_index do |pr, j|
          if pr.is_a?(String)
            errors << "#{prefix}: prs[#{j}] is a bare string '#{pr}' (needs migration)"
          elsif pr.is_a?(Hash)
            errors << "#{prefix}: prs[#{j}] missing number" unless pr['number']
          else
            errors << "#{prefix}: prs[#{j}] unexpected type: #{pr.class}"
          end
        end
      end
      errors
    end

    def migrate
      stats = { migrated: 0, orphaned: 0, legacy_paths: 0, prs_converted: 0 }

      store.mutate do |data|
        data['tickets'].each do |t|
          changed = false

          if t['prs'].is_a?(Array)
            t['prs'] = t['prs'].map do |pr|
              if pr.is_a?(String) || pr.is_a?(Integer)
                stats[:prs_converted] += 1
                changed = true
                { 'number' => pr.to_s, 'state' => nil, 'ci' => nil, 'review_status' => nil }
              else
                pr
              end
            end
          else
            t['prs'] = []
            changed = true
          end

          unless t.key?('status')
            t['status'] = 'active'
            changed = true
          end

          unless t.key?('jira_status')
            t['jira_status'] = nil
            changed = true
          end

          if t['repo'] && (t['repo'].start_with?('-') || !t['repo'].include?('/'))
            if t['worktree'] && File.directory?(t['worktree'])
              slug = resolve_repo_slug(t['worktree'])
              if slug
                $stderr.puts "  Fixed repo for #{t['id']}: #{t['repo']} -> #{slug}"
                t['repo'] = slug
                changed = true
              else
                t['status'] = 'orphan'
                stats[:orphaned] += 1
                changed = true
              end
            else
              t['status'] = 'orphan'
              stats[:orphaned] += 1
              changed = true
            end
          end

          stats[:legacy_paths] += 1 if t['worktree'] && !t['worktree'].include?('/worktrees/')
          stats[:migrated] += 1 if changed
        end
      end

      { 'total' => store.tickets.length, **stats.transform_keys(&:to_s) }
    end

    def reconcile
      result = { 'registered_ok' => [], 'missing_worktree' => [], 'orphan' => [], 'unregistered' => [] }
      registered_paths = {}

      store.tickets.each do |t|
        path = t['worktree']
        registered_paths[path] = t['id']

        unless path&.start_with?('/')
          result['orphan'] << { 'id' => t['id'], 'reason' => 'non-absolute worktree path' }
          next
        end

        if File.directory?(path)
          actual_slug = resolve_repo_slug(path)
          if actual_slug && t['repo'] && actual_slug != t['repo']
            result['orphan'] << { 'id' => t['id'], 'reason' => "repo mismatch: registered=#{t['repo']} actual=#{actual_slug}" }
          else
            result['registered_ok'] << t['id']
          end
        else
          result['missing_worktree'] << { 'id' => t['id'], 'path' => path }
        end
      end

      if File.directory?(@worktree_base)
        Dir.glob("#{@worktree_base}/*/*/**/.git").each do |git_dir|
          wt_path = File.dirname(git_dir)
          next if registered_paths.key?(wt_path)
          next if File.basename(wt_path).match?(/\d{8}-\d+/)
          result['unregistered'] << wt_path
        end
      end

      result
    end

    # --- Watchers ---

    # Flag tickets with no git activity in N+ days.
    # Returns { updated: [...], flagged: [...] }
    def detect_stale(threshold_days: 3)
      result = { 'updated' => [], 'flagged' => [] }

      store.tickets.each do |t|
        next unless t['status'] == 'active'
        worktree = t['worktree']
        next unless worktree && File.directory?(worktree)

        last_date = git_last_commit_date(worktree)
        next if last_date.empty?

        begin
          days = (Date.today - Date.parse(last_date)).to_i
        rescue Date::Error
          next
        end

        if days >= threshold_days
          update(t['id'], 'status', 'stale') rescue nil
          result['updated'] << { 'id' => t['id'], 'days_inactive' => days }
          $stderr.puts "  #{t['id']}: stale (#{days} days inactive)"
        end
      end

      # Flag merged PRs with existing worktrees for archival
      store.tickets.each do |t|
        next unless t['status'] == 'merged'
        next unless t['worktree'] && File.directory?(t['worktree'])
        result['flagged'] << { 'id' => t['id'], 'reason' => 'merged PR, worktree still exists' }
        $stderr.puts "  #{t['id']}: ready for archival (merged)"
      end

      result
    end

    # Reconcile worktrees on disk vs registry. Auto-fixes what it can, flags the rest.
    # Returns { auto_fixed: [...], flagged: [...], errors: [...] }
    def sync_worktrees
      result = { 'auto_fixed' => [], 'flagged' => [], 'errors' => [] }

      # Check registered tickets
      store.tickets.each do |t|
        worktree = t['worktree']
        next unless worktree&.start_with?('/')

        unless File.directory?(worktree)
          result['flagged'] << { 'id' => t['id'], 'issue' => 'missing_worktree', 'path' => worktree }
          $stderr.puts "  #{t['id']}: worktree missing at #{worktree}"
          next
        end

        # Auto-fix: correct repo slug from git remote if mismatched
        actual_slug = resolve_repo_slug(worktree)
        if actual_slug && t['repo'] && actual_slug != t['repo']
          begin
            update(t['id'], 'repo', actual_slug)
            result['auto_fixed'] << { 'id' => t['id'], 'field' => 'repo', 'from' => t['repo'], 'to' => actual_slug }
            $stderr.puts "  #{t['id']}: fixed repo #{t['repo']} -> #{actual_slug}"
          rescue StandardError => e
            result['errors'] << { 'id' => t['id'], 'error' => e.message }
          end
        end
      end

      # Scan for unregistered worktrees
      if File.directory?(@worktree_base)
        registered_paths = store.tickets.map { |t| t['worktree'] }.compact.to_set
        Dir.glob("#{@worktree_base}/*/*/**/.git").each do |git_dir|
          wt_path = File.dirname(git_dir)
          next if registered_paths.include?(wt_path)
          basename = File.basename(wt_path)
          next if basename.match?(/\d{8}-\d+/) # temp dirs

          result['flagged'] << { 'issue' => 'unregistered', 'path' => wt_path }
        end
        $stderr.puts "  #{result['flagged'].count { |f| f['issue'] == 'unregistered' }} unregistered worktrees found" if result['flagged'].any?
      end

      result
    end

    # --- Context ---

    def fetch_context(id)
      ticket = get(id)
      raise NotFoundError, "Ticket not found: #{id}" unless ticket

      repo = ticket['repo']
      raise OperationError, 'No repo on ticket' unless repo && !repo.empty?

      notes_path = init_investigation_notes(repo, id)
      jira_fetched = false
      knowledge_files = []

      # Jira
      if id.match?(JIRA_PATTERN)
        jira_fetched = fetch_jira_context(id, repo, notes_path)
      end

      # Knowledge
      knowledge_dir = File.join(Workbench.home, repo, 'knowledge')
      if File.directory?(knowledge_dir)
        knowledge_files = Dir.glob(File.join(knowledge_dir, '*.md')).map { |f| File.basename(f) }.sort
        append_knowledge_refs(notes_path, knowledge_dir, knowledge_files) if knowledge_files.any?
      end

      { 'jira_fetched' => jira_fetched, 'knowledge_files' => knowledge_files, 'investigation_path' => notes_path }
    end

    # --- Helpers ---

    def resolve_repo_slug(path)
      out, _, status = Open3.capture3('git', '-C', path, 'remote', 'get-url', 'origin')
      return nil unless status.success?
      slug = out.strip.sub(%r{.*github\.com[:/]}, '').sub(/\.git$/, '')
      slug.include?('/') ? slug : nil
    end

    def git_last_commit_date(worktree)
      out, = Open3.capture2('git', '-C', worktree, 'log', '-1', '--format=%cs')
      out.strip
    end

    private

    def new_ticket(id:, repo:, worktree:, base_branch:)
      {
        'id'           => id,
        'repo'         => repo,
        'worktree'     => File.expand_path(worktree),
        'base_branch'  => base_branch,
        'started'      => Date.today.to_s,
        'last_touched' => Date.today.to_s,
        'status'       => 'active',
        'prs'          => [],
        'jira_status'  => nil
      }
    end

    def init_investigation_notes(repo, id)
      notes_dir = File.join(Workbench.home, repo, 'active', id)
      notes_path = File.join(notes_dir, 'investigation.md')
      FileUtils.mkdir_p(notes_dir)
      unless File.exist?(notes_path)
        File.write(notes_path, "# #{id}\n\n## Summary\n\n## Jira Context\n\n## Repo Knowledge\n\n## Notes\n\n")
      end
      notes_path
    end

    def fetch_jira_context(id, repo, notes_path)
      token = ENV['JIRA_API_TOKEN']
      email = ENV['JIRA_EMAIL']
      base  = ENV.fetch('JIRA_BASE_URL') { abort 'JIRA_BASE_URL not set' }

      unless token && email && !token.empty? && !email.empty?
        $stderr.puts '  No JIRA_API_TOKEN/JIRA_EMAIL configured, skipping Jira fetch'
        return false
      end

      $stderr.puts "Fetching Jira context for #{id}..."
      uri = URI("#{base}/rest/api/3/issue/#{id}?fields=summary,status,description,assignee")
      req = Net::HTTP::Get.new(uri)
      req.basic_auth(email, token)

      http = Net::HTTP.new(uri.host, uri.port)
      http.use_ssl = (uri.scheme == 'https')
      http.open_timeout = 10
      http.read_timeout = 10
      resp = http.request(req)

      return ($stderr.puts("  Jira fetch failed (HTTP #{resp.code}), skipping") || false) unless resp.code == '200'

      fields = JSON.parse(resp.body)['fields'] || {}
      summary  = fields['summary'] || 'N/A'
      status   = fields.dig('status', 'name') || 'N/A'
      assignee = fields.dig('assignee', 'displayName') || 'Unassigned'

      update(id, 'jira_status', status) rescue nil

      content = File.read(notes_path)
      unless content.include?('Jira Summary:')
        content.sub!('## Jira Context', <<~MD.chomp)
          ## Jira Context

          - **Jira Summary:** #{summary}
          - **Status:** #{status}
          - **Assignee:** #{assignee}
          - **Link:** #{base}/browse/#{id}
        MD
        File.write(notes_path, content)
      end

      $stderr.puts "  Jira: #{summary} (#{status})"
      true
    rescue StandardError => e
      $stderr.puts "  Jira fetch error: #{e.message}, skipping"
      false
    end

    def append_knowledge_refs(notes_path, knowledge_dir, files)
      content = File.read(notes_path)
      return if content.include?('Knowledge files:')

      list = files.map { |f| "- #{knowledge_dir}/#{f}" }.join("\n")
      content.sub!('## Repo Knowledge', "## Repo Knowledge\n\nKnowledge files:\n#{list}")
      File.write(notes_path, content)
      $stderr.puts "  Knowledge: #{files.join(', ')}"
    end
  end

  # --- Error hierarchy ---

  class Error < StandardError; end
  class NotFoundError < Error; end
  class DuplicateError < Error; end
  class ValidationError < Error; end
  class OperationError < Error; end
  class UsageError < Error; end
end
