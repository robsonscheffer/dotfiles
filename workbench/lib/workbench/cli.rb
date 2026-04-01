# frozen_string_literal: true

require 'json'

module Workbench
  # CLI argument parsing, dispatch, and output formatting.
  # Thin layer — delegates all logic to Registry/GithubSync.
  class CLI
    def initialize(registry: Registry.new, github: nil)
      @registry = registry
      @github = github || GithubSync.new(registry: @registry)
    end

    def run(argv)
      if argv.empty? || %w[--help -h help].include?(argv.first)
        usage
        return EXIT_OK
      end

      command = argv.shift
      dispatch(command, argv)
    rescue UsageError => e
      err(e.message)
      EXIT_USAGE
    rescue NotFoundError => e
      err(e.message)
      EXIT_NOT_FOUND
    rescue DuplicateError, ValidationError => e
      err(e.message)
      EXIT_VALIDATION
    rescue OperationError => e
      err(e.message)
      EXIT_ERROR
    end

    private

    def dispatch(command, args)
      case command
      when 'list'      then cmd_list(args)
      when 'get'       then cmd_get(args)
      when 'add'       then cmd_add(args)
      when 'remove'    then cmd_remove(args)
      when 'update'    then cmd_update(args)
      when 'touch'     then cmd_touch(args)
      when 'path'      then cmd_path(args)
      when 'find'      then cmd_find(args)
      when 'add-pr'    then cmd_add_pr(args)
      when 'remove-pr' then cmd_remove_pr(args)
      when 'update-pr' then cmd_update_pr(args)
      when 'validate'  then cmd_validate
      when 'migrate'   then cmd_migrate
      when 'reconcile' then cmd_reconcile
      when 'start'     then cmd_start(args)
      when 'archive'   then cmd_archive(args)
      when 'focus'     then cmd_focus(args)
      else
        err("Unknown command: #{command}")
        EXIT_USAGE
      end
    end

    # --- Commands ---

    def cmd_list(args)
      tickets = @registry.list
      args.include?('--json') ? puts_json(tickets) : print_ticket_table(tickets)
      EXIT_OK
    end

    def cmd_get(args)
      json = args.delete('--json')
      id = args.shift || raise_usage('wb get <id> [--json]')
      ticket = @registry.get(id)
      raise NotFoundError, "Ticket not found: #{id}" unless ticket
      json ? puts_json(ticket) : print_ticket_detail(ticket)
      EXIT_OK
    end

    def cmd_add(args)
      base = extract_option(args, '--base') || 'main'
      id, repo, worktree = args.shift(3)
      raise_usage('wb add <id> <repo> <worktree> [--base B]') unless id && repo && worktree
      @registry.add(id: id, repo: repo, worktree: worktree, base_branch: base)
      err("Added: #{id}")
      EXIT_OK
    end

    def cmd_remove(args)
      id = args.shift || raise_usage('wb remove <id>')
      @registry.remove(id)
      err("Removed: #{id}")
      EXIT_OK
    end

    def cmd_update(args)
      id, field, value = args.shift(3)
      raise_usage('wb update <id> <field> <value>') unless id && field && value
      @registry.update(id, field, value)
      err("Updated: #{id} #{field}=#{value}")
      EXIT_OK
    end

    def cmd_touch(args)
      id = args.shift || raise_usage('wb touch <id>')
      @registry.touch(id)
      err("Touched: #{id}")
      EXIT_OK
    end

    def cmd_path(args)
      id = args.shift || raise_usage('wb path <id>')
      puts @registry.path(id)
      EXIT_OK
    end

    def cmd_find(args)
      path = args.shift || raise_usage('wb find <path>')
      ticket = @registry.find_by_path(path)
      puts ticket['id']
      EXIT_OK
    end

    def cmd_add_pr(args)
      id, pr_number = args.shift(2)
      raise_usage('wb add-pr <id> <pr_number>') unless id && pr_number
      @registry.add_pr(id, pr_number)
      err("Added PR ##{pr_number} to #{id}")
      EXIT_OK
    end

    def cmd_remove_pr(args)
      id, pr_number = args.shift(2)
      raise_usage('wb remove-pr <id> <pr_number>') unless id && pr_number
      @registry.remove_pr(id, pr_number)
      err("Removed PR ##{pr_number} from #{id}")
      EXIT_OK
    end

    def cmd_update_pr(args)
      id, pr_number, field, value = args.shift(4)
      raise_usage('wb update-pr <id> <num> <field> <value>') unless id && pr_number && field && value
      @registry.update_pr(id, pr_number, field, value)
      err("Updated PR ##{pr_number} on #{id}: #{field}=#{value}")
      EXIT_OK
    end

    def cmd_validate
      errors = @registry.validate
      if errors.empty?
        err("Validation passed: #{@registry.list.length} tickets OK")
        EXIT_OK
      else
        errors.each { |e| err("  ERROR: #{e}") }
        err("\n#{errors.length} validation error(s) in #{@registry.list.length} tickets")
        EXIT_VALIDATION
      end
    end

    def cmd_migrate
      stats = @registry.migrate
      puts_json(stats)
      err("Migration complete: #{stats['migrated']} tickets migrated, #{stats['orphaned']} orphaned, #{stats['prs_converted']} PRs converted")
      EXIT_OK
    end

    def cmd_reconcile
      puts_json(@registry.reconcile)
      EXIT_OK
    end

    def cmd_start(args)
      base = extract_option(args, '--base') || 'main'
      id, repo_path = args.shift(2)
      raise_usage('wb start <id> <repo_path> [--base B]') unless id && repo_path
      result = @registry.start(id: id, repo_path: repo_path, base_branch: base)
      puts_json(result)
      EXIT_OK
    end

    def cmd_archive(args)
      force = !!args.delete('--force')
      id = args.shift || raise_usage('wb archive <id> [--force]')
      @registry.archive(id, force: force)
      err("Archived: #{id}")
      EXIT_OK
    end

    def cmd_focus(args)
      quiet = !!args.delete('--quiet')
      id_or_path = args.shift || raise_usage('wb focus <id_or_path> [--quiet]')
      ticket = @registry.focus(id_or_path, quiet: quiet)
      return EXIT_OK if quiet

      puts "Ticket:       #{ticket['id']}"
      puts "Repo:         #{ticket['repo']}"
      puts "Worktree:     #{ticket['worktree']}"
      puts "Base branch:  #{ticket['base_branch']}"
      puts "Status:       #{ticket['status'] || 'active'}"
      puts "Started:      #{ticket['started']}"
      puts "Last touched: #{ticket['last_touched']}"
      puts "Jira status:  #{ticket['jira_status'] || 'unknown'}"

      if ticket['prs']&.any?
        puts "\nPull Requests:"
        ticket['prs'].each do |pr|
          if pr.is_a?(Hash)
            puts "  ##{pr['number']}  state=#{pr['state'] || 'unknown'}  ci=#{pr['ci'] || 'unknown'}  review=#{pr['review_status'] || 'unknown'}"
          else
            puts "  ##{pr}"
          end
        end
      end

      if ticket['repo']
        notes = File.join(Workbench.home, ticket['repo'], 'active', ticket['id'], 'investigation.md')
        puts "\nInvestigation: #{notes}" if File.exist?(notes)
      end

      puts "\nSuggested actions:"
      case ticket['status']
      when 'stale'   then puts '  - This ticket is stale. Consider re-engaging or archiving.'
      when 'merged'  then puts "  - PR merged. Consider archiving: wb archive #{ticket['id']}"
      when 'review'  then puts '  - PR in review. Check for feedback.'
      when 'orphan'  then puts "  - Orphan entry. Investigate or remove: wb remove #{ticket['id']}"
      else
        if ticket['prs'].nil? || ticket['prs'].empty?
          puts '  - No PR yet. Create one when ready.'
        else
          puts '  - Continue working. PR state is tracked.'
        end
      end

      EXIT_OK
    end

    # --- Output helpers ---

    def puts_json(obj)
      $stdout.puts JSON.pretty_generate(obj)
    end

    def err(msg)
      $stderr.puts "wb: #{msg}"
    end

    def raise_usage(msg)
      raise UsageError, "Usage: #{msg}"
    end

    def extract_option(args, flag)
      i = args.index(flag) or return nil
      args.delete_at(i)
      args.delete_at(i)
    end

    def print_ticket_table(tickets)
      return puts('No tickets.') if tickets.empty?
      header = %w[ID REPO STATUS PRs STARTED LAST_TOUCHED]
      rows = tickets.map do |t|
        prs = (t['prs'] || []).map { |p| p.is_a?(Hash) ? p['number'] : p }.join(',')
        [t['id'], t['repo'] || '', t['status'] || 'active', prs, t['started'] || '', t['last_touched'] || '']
      end
      widths = header.each_with_index.map { |h, i| [h.length, *rows.map { |r| r[i].to_s.length }].max }
      fmt = widths.map { |w| "%-#{w}s" }.join('  ')
      puts format(fmt, *header)
      puts widths.map { |w| '-' * w }.join('  ')
      rows.each { |r| puts format(fmt, *r) }
    end

    def print_ticket_detail(ticket)
      ticket.each do |k, v|
        if k == 'prs' && v.is_a?(Array)
          puts '  prs:'
          v.each do |pr|
            if pr.is_a?(Hash)
              puts "    - ##{pr['number']}  state=#{pr['state'] || 'nil'}  ci=#{pr['ci'] || 'nil'}  review=#{pr['review_status'] || 'nil'}"
            else
              puts "    - #{pr}"
            end
          end
        else
          puts "  #{k}: #{v}"
        end
      end
    end

    # --- Usage ---

    def usage
      $stderr.puts <<~USAGE
        wb -- Workbench CLI

        Core:
          wb list [--json]                          List all tickets
          wb get <id> [--json]                      Print ticket details
          wb add <id> <repo> <worktree> [--base B]  Register a ticket
          wb remove <id>                            Deregister a ticket
          wb update <id> <field> <value>            Update a field
          wb touch <id>                             Update last_touched
          wb path <id>                              Print worktree path
          wb find <path>                            Find ticket by worktree path

        PRs:
          wb add-pr <id> <pr_number>                Add PR to ticket
          wb remove-pr <id> <pr_number>             Remove PR from ticket
          wb update-pr <id> <num> <field> <value>   Update PR field

        Lifecycle:
          wb start <id> <repo_path> [--base B]      Create worktree + register
          wb archive <id> [--force]                  Archive + deregister
          wb focus <id_or_path> [--quiet]            Show context, touch timestamp

        Maintenance:
          wb validate                               Check active.yaml for errors
          wb migrate                                Migrate old schema to new
          wb reconcile                              Compare registry vs filesystem
      USAGE
    end
  end
end
