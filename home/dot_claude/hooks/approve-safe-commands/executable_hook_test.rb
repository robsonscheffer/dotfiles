#!/usr/bin/env ruby
# frozen_string_literal: true

require 'minitest/autorun'
require 'json'
require 'open3'
require 'fileutils'

class ApproveSafeCommandsTest < Minitest::Test
  SCRIPT = File.expand_path('hook.rb', __dir__)
  DEFAULT_CONFIG_PATH = File.expand_path('config.default.json', __dir__)
  TEMP_CONFIG_PATH = File.expand_path('config_test_override.json', __dir__)
  LOG_DIR = File.expand_path('tmp_test_logs', __dir__)
  LOG_PATH = File.join(LOG_DIR, 'test.jsonl')

  # --- Test helpers ---

  def default_config
    @default_config ||= JSON.parse(File.read(DEFAULT_CONFIG_PATH))
  end

  def deep_merge(base, overlay)
    base.merge(overlay) do |_key, old_val, new_val|
      if old_val.is_a?(Hash) && new_val.is_a?(Hash)
        deep_merge(old_val, new_val)
      elsif old_val.is_a?(Array) && new_val.is_a?(Array)
        (old_val + new_val).uniq
      else
        new_val
      end
    end
  end

  def run_hook(command)
    run_hook_with_config(command)
  end

  def run_hook_with_config(command, overrides = {})
    config = deep_merge(default_config, overrides)
    File.write(TEMP_CONFIG_PATH, JSON.generate(config))

    input = { 'tool_input' => { 'command' => command } }.to_json
    env = { 'TEST_CONFIG_PATH' => TEMP_CONFIG_PATH }
    stdout, _stderr, _status = Open3.capture3(env, "ruby #{SCRIPT}", stdin_data: input)

    FileUtils.rm_f(TEMP_CONFIG_PATH)

    return nil if stdout.strip.empty?
    JSON.parse(stdout)
  end

  def run_hook_with_writes(command)
    run_hook_with_config(command, 'allow_safe_writes' => true)
  end

  def run_hook_with_logging(command, log_approved: true, log_rejected: true)
    run_hook_with_config(command, 'logging' => {
      'enabled' => true,
      'path' => LOG_PATH,
      'log_approved' => log_approved,
      'log_rejected' => log_rejected
    })
  end

  def read_log_entries
    return [] unless File.exist?(LOG_PATH)

    File.readlines(LOG_PATH).map { |line| JSON.parse(line) }
  end

  def assert_approved(command)
    result = run_hook(command)
    assert result, "Expected '#{command}' to be approved, got nil"
    assert_equal 'allow', result.dig('hookSpecificOutput', 'permissionDecision')
  end

  def assert_not_approved(command)
    result = run_hook(command)
    assert_nil result, "Expected '#{command}' to not be approved, got: #{result}"
  end

  def assert_write_approved(command)
    result = run_hook_with_writes(command)
    assert result, "Expected '#{command}' to be approved (writes enabled), got nil"
    assert_equal 'allow', result.dig('hookSpecificOutput', 'permissionDecision')
    assert_equal 'Auto-approved safe write command',
                 result.dig('hookSpecificOutput', 'permissionDecisionReason'),
                 "Expected write approval reason for '#{command}'"
  end

  # === Safe commands should be approved ===

  def test_ls
    assert_approved('ls')
    assert_approved('ls -la')
    assert_approved('ls /some/path')
  end

  def test_find
    assert_approved('find . -name "*.rb"')
    assert_approved('find /tmp -type f')
  end

  def test_grep
    assert_approved('grep -r "pattern" .')
    assert_approved('grep foo bar.txt')
  end

  def test_rg
    assert_approved('rg "pattern"')
    assert_approved('rg -i foo')
  end

  def test_cat
    assert_approved('cat file.txt')
    assert_approved('cat -n file.txt')
  end

  def test_head_tail
    assert_approved('head -20 file.txt')
    assert_approved('tail -f log.txt')
  end

  def test_other_safe_commands
    assert_approved('pwd')
    assert_approved('which ruby')
    assert_approved('file somefile')
    assert_approved('wc -l file.txt')
    assert_approved('tree')
    assert_approved('diff file1.txt file2.txt')
    assert_approved('date')
    assert_approved('sed -n "1p" file.txt')
    assert_approved('jq ".foo" file.json')
    assert_approved('echo hello')
    assert_approved('xxd file.bin')
  end

  def test_true_false_test_approved
    assert_approved('true')
    assert_approved('false')
    assert_approved('test -f file.txt')
    assert_approved('test -d /some/path')
  end

  def test_true_false_in_chains
    assert_approved('ls /some/path || true')
    assert_approved('test -f file.txt && cat file.txt')
    assert_approved('false || echo "fallback"')
  end

  # === awk: safe patterns approved, execution constructs blocked ===

  def test_awk_safe_patterns_approved
    assert_approved("awk '{print $1}'")
    assert_approved("awk -F: '{print $1}' file")
    assert_approved("awk 'NR==1{print}' file")
    assert_approved("awk '/pattern/{print}' file")
    assert_approved("awk '{sum+=$1} END{print sum}' file")
    assert_approved("awk '{print NR, $0}' file")
  end

  def test_awk_system_blocked
    assert_not_approved("awk 'BEGIN{system(\"rm -rf /\")}'")
    assert_not_approved("awk '{system($0)}'")
  end

  def test_awk_getline_blocked
    assert_not_approved("awk 'BEGIN{\"id\" | getline x}'")
    assert_not_approved("awk '{getline line}'")
  end

  def test_awk_pipe_to_command_blocked
    assert_not_approved(%q{awk '{print | "sh"}'})
    assert_not_approved(%q{awk '{printf "%s", $0 | "sh"}'})
  end

  def test_awk_redirect_to_file_blocked
    assert_not_approved(%q{awk '{print > "file.txt"}'})
    assert_not_approved(%q{awk '{print >> "file.txt"}'})
  end

  def test_commands_with_absolute_paths
    assert_approved('/bin/ls')
    assert_approved('/usr/bin/find . -name "*.rb"')
    assert_approved('/usr/bin/grep pattern file')
  end

  # === Unsafe commands should not be approved ===

  def test_rm_not_approved
    assert_not_approved('rm file.txt')
    assert_not_approved('rm -rf /tmp/foo')
  end

  def test_write_commands_not_approved
    assert_not_approved('mv foo bar')
    assert_not_approved('cp foo bar')
    assert_not_approved('mkdir newdir')
    assert_not_approved('touch newfile')
  end

  def test_dangerous_commands_not_approved
    assert_not_approved('sudo anything')
    assert_not_approved('chmod 777 file')
    assert_not_approved('chown user file')
    assert_not_approved('curl http://example.com')
    assert_not_approved('wget http://example.com')
  end

  def test_npm_yarn_not_approved
    assert_not_approved('npm install')
    assert_not_approved('yarn add package')
  end

  def test_git_unsafe_not_approved
    assert_not_approved('git push')
    assert_not_approved('git checkout main')
    assert_not_approved('git reset --hard')
    assert_not_approved('git merge main')
    assert_not_approved('git clone http://example.com')
  end

  # === Safe git subcommands ===

  def test_git_safe_subcommands
    assert_approved('git status')
    assert_approved('git log')
    assert_approved('git log --oneline -20')
    assert_approved('git diff')
    assert_approved('git diff HEAD~1')
    assert_approved('git branch')
    assert_approved('git branch -a')
    assert_approved('git show HEAD')
    assert_approved('git remote -v')
    assert_approved('git tag')
    assert_approved('git tag -l')
    assert_approved('git stash list')
  end

  def test_git_add_commit_rebase_approved
    assert_approved('git add file.txt')
    assert_approved('git add -A')
    assert_approved('git commit -m "msg"')
    assert_approved('git commit --amend')
    assert_approved('git commit --no-verify -m "msg"')
    assert_approved('git rebase main')
    assert_approved('git rebase --onto main feature')
  end

  def test_git_subcommand_dangerous_flags
    assert_not_approved('git branch -D main')
    assert_not_approved('git branch -d feature')
    assert_not_approved('git branch --delete feature')
    assert_not_approved('git branch --delete-force main')
    assert_approved('git branch -a')
    assert_approved('git branch -v')

    assert_not_approved('git rebase --exec="make test" main')
    assert_not_approved('git rebase --exec "make test" main')

    assert_not_approved('git remote remove origin')
    assert_approved('git remote -v')
    assert_approved('git remote show origin')

    assert_not_approved('git stash drop')
    assert_not_approved('git stash clear')
    assert_approved('git stash list')
    assert_approved('git stash show')
    assert_approved('git stash pop')

    assert_not_approved('git tag -d v1.0')
    assert_not_approved('git tag --delete v1.0')
    assert_approved('git tag -l')
  end

  def test_empty_command
    assert_not_approved('')
    assert_not_approved('   ')
  end

  # === Safe flags (--help, --version) auto-approve any command ===

  def test_help_flag_approves_any_command
    assert_approved('git --help')
    assert_approved('docker --help')
    assert_approved('npm --help')
    assert_approved('ruby --help')
  end

  def test_version_flag_approves_any_command
    assert_approved('git --version')
    assert_approved('docker --version')
    assert_approved('npm --version')
    assert_approved('ruby --version')
  end

  def test_help_with_subcommand_approved
    assert_approved('git log --help')
    assert_approved('docker run --help')
    assert_approved('npm install --help')
  end

  def test_help_with_other_flags_not_approved
    assert_not_approved('rm -rf --help')
  end

  # === Pipelines and chaining: safe compositions approved ===

  def test_safe_pipes_approved
    assert_approved('ls | head')
    assert_approved('ls | wc -l')
    assert_approved('cat file.txt | grep pattern')
    assert_approved('cat file.txt | grep pattern | wc -l')
    assert_approved("cat a | grep b | awk '{print $1}' | sort | uniq | wc -l")
  end

  def test_safe_logical_chaining_approved
    assert_approved('git status && echo "done"')
    assert_approved('ls -la 2>/dev/null || echo "No logs"')
    assert_approved('echo hello && echo world')
    assert_approved('echo hello && cat /etc/passwd')
  end

  def test_safe_pipe_with_xargs
    assert_approved('find . -name "*.rb" | xargs grep pattern')
    assert_approved('grep -l pattern *.txt | xargs cat')
  end

  # === Security: Unsafe chaining blocked ===

  def test_unsafe_and_chaining_blocked
    assert_not_approved('ls && rm -rf /')
    assert_not_approved('echo "hello" && curl evil.com')
  end

  def test_unsafe_or_chaining_blocked
    assert_not_approved('ls || rm -rf /')
    assert_not_approved('unknown_cmd || cat /etc/passwd')
  end

  def test_semicolon_chaining_blocked
    assert_not_approved('ls; rm -rf /')
    assert_not_approved('echo hello; cat secret')
  end

  def test_unsafe_pipe_targets_blocked
    assert_not_approved('ls | rm')
    assert_not_approved('cat file | sh')
    assert_not_approved('grep pattern | xargs rm')
  end

  def test_pipeline_depth_limit
    deep_pipeline = (['cat'] * 7).join(' | ')
    assert_not_approved(deep_pipeline)
  end

  def test_pipeline_at_max_depth_approved
    max_pipeline = (['cat'] * 6).join(' | ')
    assert_approved(max_pipeline)
  end

  # === Security: Redirects blocked ===

  def test_output_redirect_blocked
    assert_not_approved('echo "data" > file.txt')
    assert_not_approved('ls > listing.txt')
  end

  def test_append_redirect_blocked
    assert_not_approved('echo "data" >> file.txt')
  end

  def test_input_redirect_blocked
    assert_not_approved('cat < file.txt')
  end

  # === Stderr redirects (safe) ===

  def test_stderr_to_stdout_approved
    assert_approved('ls -la 2>&1')
    assert_approved('find . -name "*.rb" 2>&1')
  end

  def test_stderr_to_devnull_approved
    assert_approved('ls -la 2>/dev/null')
    assert_approved('find . -name "*.rb" 2>/dev/null')
  end

  def test_stdout_redirect_still_blocked
    assert_not_approved('echo data > file.txt')
    assert_not_approved('echo data 1> file.txt')
  end

  # === Security: Command substitution blocked ===

  def test_command_substitution_dollar_paren_blocked
    assert_not_approved('echo $(rm -rf /)')
    assert_not_approved('ls $(cat /etc/passwd)')
  end

  def test_command_substitution_backticks_blocked
    assert_not_approved('echo `rm -rf /`')
    assert_not_approved('ls `whoami`')
  end

  # === Security: Dangerous flags blocked ===

  def test_sed_inplace_blocked
    assert_not_approved('sed -i "s/foo/bar/" file.txt')
    assert_not_approved('sed --in-place "s/foo/bar/" file.txt')
  end

  def test_awk_inplace_blocked
    assert_not_approved('awk -i inplace "{print}" file.txt')
  end

  # === xargs: allowed only with safe target commands ===

  def test_xargs_with_safe_commands
    assert_approved('xargs echo')
    assert_approved('xargs cat')
    assert_approved('xargs ls')
    assert_approved('xargs -n 1 echo')
    assert_approved('xargs -I {} cat {}')
  end

  def test_xargs_with_unsafe_commands
    assert_not_approved('xargs rm')
    assert_not_approved('xargs rm -rf')
    assert_not_approved('xargs chmod')
    assert_not_approved('xargs mv')
    assert_not_approved('xargs -n 1 rm')
  end

  def test_xargs_without_command
    assert_not_approved('xargs')
    assert_not_approved('xargs -n 1')
  end

  def test_find_exec_not_approved
    assert_not_approved('find . -exec rm {} \\;')
  end

  def test_find_delete_blocked
    assert_not_approved('find . -name "*.tmp" -delete')
  end

  def test_find_execdir_blocked
    assert_not_approved('find . -execdir rm {} \\;')
  end

  def test_find_long_flag_variants_blocked
    assert_not_approved('find . --exec rm')
    assert_not_approved('find . --execdir rm')
    assert_not_approved('find . --delete')
  end

  def test_combined_short_flags_blocked
    assert_not_approved('sed -ni "s/a/b/" file')
    assert_not_approved('sed -in "s/a/b/" file')
    assert_not_approved('sed -ani "s/a/b/" file')
    assert_approved('sed -n "1p" file')
  end

  # === Security: Background jobs blocked ===

  def test_background_jobs_blocked
    assert_not_approved('ls &')
    assert_not_approved('find / -name "*.txt" &')
    assert_not_approved('sleep 1000 &')
  end

  # === Security: Environment assignments blocked ===

  def test_env_assignment_blocked
    assert_not_approved('PATH=/evil ls')
    assert_not_approved('IFS=";" ls')
    assert_not_approved('LC_ALL=C ls')
    assert_not_approved('FOO=bar cat file')
  end

  # === Security: Parameter expansion blocked ===

  def test_parameter_expansion_blocked
    assert_not_approved('echo $HOME')
    assert_not_approved('echo ${HOME}')
    assert_not_approved('cat $FILE')
    assert_not_approved('ls ${DIR:-/tmp}')
  end

  # === Strict mode: Brace expansion ===

  def test_brace_expansion_allowed_by_default
    assert_approved('echo {a,b,c}')
    assert_approved('ls {foo,bar}.txt')
    assert_approved('cat file{1..5}.txt')
  end

  def test_brace_expansion_blocked_when_enabled
    result = run_hook_with_config('echo {a,b,c}',
                                 'strict_argument_checks' => { 'enabled' => true, 'block_brace_expansion' => true })
    assert_nil result, "Expected brace expansion to be blocked when config enabled"
  end

  def test_array_syntax_blocked_in_strict_mode
    assert_not_approved('ls arr[0]')
    assert_not_approved('echo files[1]')
  end

  def test_extglob_blocked
    assert_not_approved('ls !(public)')
    assert_not_approved('ls @(foo|bar)')
    assert_not_approved('ls ?(optional)')
  end

  def test_ansi_c_quoting_blocked_in_strict_mode
    assert_not_approved("echo $'hello\\nworld'")
    assert_not_approved("cat $'\\x2fetc'")
  end

  # === Security: Arithmetic expansion blocked ===

  def test_arithmetic_expansion_blocked
    assert_not_approved('echo $((1+1))')
    assert_not_approved('ls file$((2*3)).txt')
  end

  # === Security: Path traversal blocked ===

  def test_path_traversal_blocked
    assert_not_approved('../../bin/ls')
    assert_not_approved('../../../usr/bin/rm')
    assert_not_approved('./malicious')
    assert_not_approved('./fake_cat file')
  end

  # === Security: Enhanced flag detection ===

  def test_sed_inplace_with_backup_blocked
    assert_not_approved('sed -i.bak "s/foo/bar/" file.txt')
    assert_not_approved('sed --in-place=.bak "s/foo/bar/" file.txt')
  end

  # === Security: Process substitution blocked ===

  def test_process_substitution_blocked
    assert_not_approved('diff <(ls dir1) <(ls dir2)')
    assert_not_approved('cat <(echo secret)')
  end

  # === New safe commands ===

  def test_new_safe_commands
    assert_approved('stat file.txt')
    assert_approved('sort file.txt')
    assert_approved('uniq file.txt')
    assert_approved('cut -d: -f1 file.txt')
    assert_approved('tr a-z A-Z')
    assert_approved('basename /path/to/file.txt')
    assert_approved('dirname /path/to/file.txt')
    assert_approved('realpath relative/path')
  end

  def test_sort_output_flag_blocked
    assert_not_approved('sort -o output.txt input.txt')
    assert_not_approved('sort --output=output.txt input.txt')
  end

  # === New safe git subcommands ===

  def test_git_new_safe_subcommands
    assert_approved('git rev-parse HEAD')
    assert_approved('git ls-files')
    assert_approved('git ls-files --modified')
    assert_approved('git blame file.rb')
    assert_approved('git describe --tags')
  end

  # === sed: read-only patterns approved, e command blocked ===

  def test_sed_read_only_patterns_approved
    assert_approved('sed "s/foo/bar/" file.txt')
    assert_approved('sed "s/foo/bar/g" file.txt')
    assert_approved('sed "/pattern/d" file.txt')
    assert_approved('sed "s/error/warning/gi" file.txt')
    assert_approved('sed -n "1p" file.txt')
    assert_approved('sed -n "/pattern/p" file.txt')
    assert_approved('sed -n "1,10p" file.txt')
  end

  def test_sed_e_command_blocked
    assert_not_approved('sed "e" file.txt')
    assert_not_approved('sed "1e" file.txt')
    assert_not_approved('sed "1e ls" file.txt')
    assert_not_approved('sed "$e" file.txt')
  end

  def test_sed_e_flag_on_s_command_blocked
    assert_not_approved('sed "s/a/b/e" file.txt')
    assert_not_approved('sed "s/a/b/ge" file.txt')
    assert_not_approved('sed "s/.*/id/e" file.txt')
  end

  # === Safe write commands (opt-in) ===

  def test_sed_inplace_approved_with_writes
    assert_write_approved('sed -i "" "s/foo/bar/" file.txt')
    assert_write_approved("sed -i '' 's/foo/bar/' file.txt")
  end

  def test_sed_without_n_approved_with_writes
    assert_write_approved('sed "s/foo/bar/" file.txt')
    assert_write_approved('sed "s/foo/bar/g" file.txt')
  end

  def test_mkdir_approved_with_writes
    assert_write_approved('mkdir newdir')
    assert_write_approved('mkdir -p path/to/dir')
  end

  def test_cp_approved_with_writes
    assert_write_approved('cp file1 file2')
    assert_write_approved('cp -r dir1 dir2')
  end

  def test_touch_approved_with_writes
    assert_write_approved('touch newfile')
    assert_write_approved('touch file1 file2')
  end

  def test_write_commands_blocked_by_default
    assert_not_approved('sed -i "" "s/foo/bar/" file.txt')
    assert_not_approved('mkdir newdir')
    assert_not_approved('cp file1 file2')
    assert_not_approved('touch newfile')
  end

  def test_write_commands_in_compositions_with_unsafe_blocked
    result = run_hook_with_writes('sed -i "" "s/foo/bar/" file.txt | sh')
    assert_nil result, "Expected piped to unsafe command to be blocked"
    result = run_hook_with_writes('mkdir foo && rm -rf /')
    assert_nil result, "Expected chained with unsafe command to be blocked"
  end

  def test_write_commands_in_safe_compositions_approved
    assert_write_approved('mkdir foo && ls foo')
    assert_write_approved('sed -i "" "s/a/b/" file | head')
    assert_write_approved('ls | touch file')
    assert_write_approved('mkdir -p src && cp template src/')
    assert_write_approved('touch file && echo "created"')
  end

  def test_write_commands_with_command_substitution_blocked
    result = run_hook_with_writes('touch $(echo evil)')
    assert_nil result, "Expected write command with substitution to be blocked"
  end

  def test_write_commands_with_redirect_blocked
    result = run_hook_with_writes('cp file1 file2 > log.txt')
    assert_nil result, "Expected write command with redirect to be blocked"
  end

  def test_write_commands_with_env_assignment_blocked
    result = run_hook_with_writes('PATH=/evil cp file1 file2')
    assert_nil result, "Expected write command with env assignment to be blocked"
  end

  def test_write_commands_with_brace_expansion_blocked
    result = run_hook_with_config('cp file{1,2,3} dest/',
                                 'allow_safe_writes' => true,
                                 'strict_argument_checks' => { 'enabled' => true, 'block_brace_expansion' => true })
    assert_nil result, "Expected write command with brace expansion to be blocked when config enabled"
  end

  def test_write_commands_with_ansi_c_quoting_blocked
    result = run_hook_with_writes("sed -i '' $'s/\\x41/B/' file.txt")
    assert_nil result, "Expected write command with ANSI-C quoting to be blocked"
  end

  def test_read_command_shows_read_reason
    result = run_hook('ls -la')
    assert result
    assert_equal 'Auto-approved safe read-only command',
                 result.dig('hookSpecificOutput', 'permissionDecisionReason')
  end

  def test_single_word_write_command_fast_path
    assert_write_approved('touch')
    assert_write_approved('mkdir')
    assert_write_approved('cp')
  end

  # === Logging tests ===

  def setup
    FileUtils.rm_rf(LOG_DIR)
  end

  def teardown
    FileUtils.rm_rf(LOG_DIR)
  end

  def test_logging_approved_command
    run_hook_with_logging('ls -la')
    entries = read_log_entries

    assert_equal 1, entries.length
    assert_equal 'ls -la', entries[0]['command']
    assert_equal 'approved', entries[0]['decision']
    assert entries[0]['timestamp'], 'Should have timestamp'
  end

  def test_logging_not_approved_command
    run_hook_with_logging('rm -rf /')
    entries = read_log_entries

    assert_equal 1, entries.length
    assert_equal 'rm -rf /', entries[0]['command']
    assert_equal 'not_approved', entries[0]['decision']
  end

  def test_logging_only_approved
    run_hook_with_logging('ls', log_approved: true, log_rejected: false)
    run_hook_with_logging('rm file', log_approved: true, log_rejected: false)
    entries = read_log_entries

    assert_equal 1, entries.length
    assert_equal 'approved', entries[0]['decision']
  end

  def test_logging_only_rejected
    run_hook_with_logging('ls', log_approved: false, log_rejected: true)
    run_hook_with_logging('rm file', log_approved: false, log_rejected: true)
    entries = read_log_entries

    assert_equal 1, entries.length
    assert_equal 'not_approved', entries[0]['decision']
  end

  def test_logging_disabled_writes_nothing
    run_hook_with_config('ls', 'logging' => { 'enabled' => false, 'path' => LOG_PATH })
    refute File.exist?(LOG_PATH), 'Log file should not be created when logging disabled'
  end

  def test_log_entry_format
    expected_fields = %w[timestamp command decision reason]
    sample_entry = {
      'timestamp' => '2025-02-05T12:34:56.789Z',
      'command' => 'ls -la',
      'decision' => 'approved',
      'reason' => 'Safe read-only command'
    }

    expected_fields.each do |field|
      assert sample_entry.key?(field), "Log entry should have '#{field}' field"
    end
  end
end
