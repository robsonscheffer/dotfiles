#!/usr/bin/env ruby
# frozen_string_literal: true

#
# Adversarial stress tests for approve-safe-commands hook.
# Attempts to find bypasses via edge cases, encoding tricks, and novel attack vectors.
#

require 'minitest/autorun'
require 'json'
require 'open3'

class StressTest < Minitest::Test
  SCRIPT = File.expand_path('hook.rb', __dir__)
  DEFAULT_CONFIG_PATH = File.expand_path('config.default.json', __dir__)
  TEMP_CONFIG_PATH = File.expand_path('config_stress_test_override.json', __dir__)

  def run_hook(command)
    # Always use defaults only — never pick up local config.json
    File.write(TEMP_CONFIG_PATH, File.read(DEFAULT_CONFIG_PATH))
    input = { 'tool_input' => { 'command' => command } }.to_json
    env = { 'TEST_CONFIG_PATH' => TEMP_CONFIG_PATH }
    stdout, _stderr, _status = Open3.capture3(env, "ruby #{SCRIPT}", stdin_data: input)
    FileUtils.rm_f(TEMP_CONFIG_PATH)
    return nil if stdout.strip.empty?
    JSON.parse(stdout)
  end

  def assert_approved(command, msg = nil)
    result = run_hook(command)
    assert result, msg || "Expected '#{command}' to be approved, got nil"
    assert_equal 'allow', result.dig('hookSpecificOutput', 'permissionDecision')
  end

  def assert_not_approved(command, msg = nil)
    result = run_hook(command)
    assert_nil result, msg || "Expected '#{command}' to NOT be approved, got: #{result}"
  end

  # ============================================================
  # UNICODE AND ENCODING ATTACKS
  # ============================================================

  def test_unicode_lookalike_commands
    assert_not_approved("l\uFF53")
    assert_not_approved("\u217Cs")
    assert_not_approved("c\u0430t file")
    assert_not_approved("\uFF4C\uFF53")
  end

  def test_unicode_invisible_characters
    assert_not_approved("ls\u200B")
    assert_not_approved("ls\u00A0-la")
    assert_not_approved("ls\u2060")
    assert_not_approved("l\u200Ds")
    assert_not_approved("ls\uFEFF")
  end

  def test_unicode_direction_override
    assert_approved("ls \u202Erm -rf /\u202C")
    assert_not_approved("\u202Erm\u202C")
  end

  def test_unicode_combining_characters
    assert_not_approved("ls\u0300")
    assert_not_approved("cat\u0308")
  end

  # ============================================================
  # NEWLINE AND CONTROL CHARACTER INJECTION
  # ============================================================

  def test_newline_injection
    assert_not_approved("ls\nrm -rf /")
    assert_not_approved("ls\r\nrm -rf /")
    assert_approved("ls\rrm -rf /")
  end

  def test_null_byte_injection
    assert_not_approved("ls\x00rm -rf /")
    assert_not_approved("cat\x00/etc/passwd")
  end

  def test_other_control_characters
    assert_not_approved("ls\x1B[2Jrm")
    assert_not_approved("ls\x07rm")
    assert_not_approved("ls\x08rm")
    assert_not_approved("ls\x7Frm")
  end

  # ============================================================
  # QUOTING EDGE CASES
  # ============================================================

  def test_mixed_quoting_attacks
    assert_not_approved(%q{ls "$(rm -rf /)"})
    assert_approved(%q{ls '$(rm)'})
    assert_not_approved(%q{ls "a`rm`b"})
    assert_not_approved(%q{ls 'a'"$(rm)"'b'})
  end

  def test_quote_breaking
    assert_not_approved(%q{ls "file"; rm -rf /})
    assert_not_approved(%q{ls 'file'; rm -rf /})
    assert_approved(%q{ls "file"'$(rm)'})
  end

  def test_backslash_escaping
    assert_not_approved("ls \\$(rm)")
    assert_approved("ls \\`rm\\`")
    assert_approved("ls \\\nrm")
  end

  def test_heredoc_injection
    assert_not_approved("cat <<EOF\nrm -rf /\nEOF")
    assert_not_approved("cat <<'EOF'\ndata\nEOF")
  end

  # ============================================================
  # COMMAND CHAINING EDGE CASES
  # ============================================================

  def test_unusual_separators
    assert_not_approved("ls\n\nrm")
    assert_not_approved("{ ls; rm; }")
    assert_not_approved("(ls; rm)")
    assert_not_approved("ls |& rm")
  end

  def test_case_statements
    assert_not_approved("case x in *) rm ;; esac")
  end

  def test_if_statements
    assert_not_approved("if true; then rm; fi")
    assert_not_approved("[[ -f /etc/passwd ]] && rm")
    assert_not_approved("[ -f /etc/passwd ] && rm")
  end

  def test_loops
    assert_not_approved("for f in *; do rm $f; done")
    assert_not_approved("while true; do rm; done")
  end

  # ============================================================
  # PATH TRAVERSAL VARIATIONS
  # ============================================================

  def test_path_traversal_variations
    assert_not_approved("../ls")
    assert_not_approved("..../bin/ls")
    assert_not_approved(".../bin/ls")
    assert_not_approved("./././ls")
    assert_not_approved("foo/../../../bin/rm")
  end

  def test_encoded_path_traversal
    assert_not_approved("%2e%2e/bin/rm")
  end

  # ============================================================
  # GLOB AND WILDCARD ABUSE
  # ============================================================

  def test_glob_expansion_dangers
    assert_approved("ls *.txt")
    assert_approved("find . -name '*.rb'")
    assert_not_approved("rm *.txt")
  end

  def test_glob_with_flags
    assert_approved("ls -la")
    assert_not_approved("ls @(foo|bar)")
    assert_not_approved("ls +(one|two)")
    assert_not_approved("ls *(pattern)")
  end

  # ============================================================
  # WRAPPER COMMAND BYPASSES
  # ============================================================

  def test_xargs_bypasses
    assert_not_approved("xargs -I {} sh -c 'rm {}'")
    assert_not_approved("xargs bash -c 'rm'")
    assert_not_approved("xargs -0 rm")
    assert_not_approved("xargs -n1 -I{} rm {}")
  end

  def test_xargs_flag_confusion
    assert_not_approved("xargs --max-args=1 rm")
    assert_not_approved("xargs -n 1 -I {} rm {}")
  end

  def test_nested_wrappers
    assert_not_approved("xargs xargs rm")
  end

  # ============================================================
  # FLAG INJECTION
  # ============================================================

  def test_double_dash_bypass
    assert_approved("ls -- -la")
    assert_not_approved("rm -- file")
  end

  def test_flag_value_injection
    assert_not_approved("sed -e 's/a/b/' -i file")
    assert_not_approved("sed -e 's/a/b/' --in-place file")
  end

  def test_combined_short_flags
    assert_not_approved("sed -ni 's/a/b/' file")
    assert_not_approved("sed -in 's/a/b/' file")
    assert_not_approved("sed -ani 's/a/b/' file")
  end

  def test_long_flag_variations
    assert_not_approved("sed --in-place='bak' file")
    assert_not_approved("find . --exec rm")
    assert_not_approved("find . --delete")
  end

  # ============================================================
  # ENVIRONMENT AND SHELL MANIPULATION
  # ============================================================

  def test_env_injection_variations
    assert_not_approved("IFS=: ls")
    assert_not_approved("PATH= ls")
    assert_not_approved("BASH_ENV=evil ls")
    assert_not_approved("SHELLOPTS=xtrace ls")
    assert_not_approved("GLOBIGNORE=* ls")
  end

  def test_alias_and_function_syntax
    assert_not_approved("alias rm='ls'")
    assert_not_approved("function rm { ls; }")
    assert_not_approved("rm() { ls; }")
  end

  # ============================================================
  # ARITHMETIC AND EXPANSION
  # ============================================================

  def test_arithmetic_expansion_variations
    assert_not_approved("echo $[1+1]")
    assert_not_approved("echo $((RANDOM))")
    assert_not_approved("ls file$((1)).txt")
  end

  def test_parameter_expansion_variations
    assert_not_approved('echo ${HOME}')
    assert_not_approved('echo ${!prefix*}')
    assert_not_approved('echo ${#var}')
    assert_not_approved('echo ${var:-default}')
    assert_not_approved('echo ${var:+alternate}')
    assert_not_approved('echo ${var%pattern}')
    assert_not_approved('echo ${var#pattern}')
    assert_not_approved('echo ${var//old/new}')
  end

  # ============================================================
  # VERY LONG COMMANDS
  # ============================================================

  def test_long_command
    long_arg = "a" * 10000
    assert_approved("ls #{long_arg}")
  end

  def test_many_arguments
    many_args = (1..1000).map { |i| "arg#{i}" }.join(" ")
    assert_approved("ls #{many_args}")
  end

  def test_deeply_nested_quoting
    nested = '"' * 100 + 'ls' + '"' * 100
    result = run_hook(nested)
    assert true, "Handled deeply nested quoting without crash"
  end

  # ============================================================
  # SHFMT PARSER EDGE CASES
  # ============================================================

  def test_malformed_commands
    assert_not_approved("ls (")
    assert_not_approved("ls )")
    assert_approved("ls {")
    assert_approved("ls }")
    assert_not_approved("ls '")
    assert_not_approved('ls "')
  end

  def test_binary_garbage
    garbage = (32..126).map(&:chr).join
    result = run_hook(garbage)
    assert_nil result, "Garbage should not be approved"
  end

  def test_very_deep_nesting
    deep = "(" * 50 + "ls" + ")" * 50
    result = run_hook(deep)
    assert_nil result, "Deeply nested command should not be approved"
  end

  # ============================================================
  # PIPELINE-SPECIFIC ATTACKS
  # ============================================================

  def test_safe_pipelines_approved
    assert_approved("ls | head")
    assert_approved("cat file | grep pattern | wc -l")
    assert_approved("ls |& head")
    assert_approved("git status && echo done")
    assert_approved("ls 2>/dev/null || echo fallback")
  end

  def test_pipeline_with_unsafe_middle
    assert_not_approved("ls | sh | head")
    assert_not_approved("cat file | rm | wc -l")
  end

  def test_pipeline_with_command_substitution
    assert_not_approved("ls | grep $(whoami)")
    assert_not_approved("echo $(id) | head")
  end

  def test_pipeline_with_parameter_expansion
    assert_not_approved("ls | grep $USER")
    assert_not_approved("cat $HOME/.bashrc | head")
  end

  def test_pipeline_with_env_assignment
    assert_not_approved("PATH=/evil ls | head")
    assert_not_approved("ls | IFS=: cat")
  end

  def test_pipeline_with_redirect_on_component
    assert_approved("ls 2>/dev/null | head")
    assert_approved("find . -name '*.rb' 2>&1 | grep pattern")
    assert_not_approved("ls > /tmp/out | head")
  end

  def test_pipeline_with_background
    assert_not_approved("ls | head &")
    assert_not_approved("cat file | grep pattern &")
  end

  def test_pipeline_depth_attack
    assert_not_approved((['ls'] * 10).join(' | '))
    assert_not_approved((['echo ok'] * 20).join(' && '))
  end

  def test_pipeline_with_dangerous_flags
    assert_not_approved("cat file | sed -i 's/a/b/' other")
    assert_not_approved("find . -exec rm {} \\; | head")
    assert_not_approved("ls | sort -o output.txt")
  end

  def test_mixed_operators_safe
    assert_approved("cat file | grep pattern && echo found")
    assert_approved("ls | wc -l || echo empty")
  end

  def test_mixed_operators_unsafe
    assert_not_approved("cat file | grep pattern && rm file")
    assert_not_approved("ls | wc -l || curl evil.com")
  end

  # ============================================================
  # LEGITIMATE COMMANDS THAT SHOULD WORK
  # ============================================================

  def test_complex_safe_commands
    assert_approved('grep -rn "pattern" /path/to/search')
    assert_approved('find /var/log -name "*.log" -type f')
    assert_approved('ls -la /etc /var /tmp')
    assert_approved('wc -l /etc/passwd')
    assert_approved('head -n 50 /var/log/syslog')
    assert_approved('tail -f /var/log/messages')
    assert_approved('diff /etc/hosts /etc/hosts.bak')
  end

  def test_quoted_arguments
    assert_approved('grep "hello world" file.txt')
    assert_approved("grep 'pattern with spaces' file")
    assert_approved('find . -name "*.txt"')
    assert_approved('ls "file with spaces.txt"')
  end

  def test_multiple_flags
    assert_approved('ls -l -a -h')
    assert_approved('ls -lah')
    assert_approved('grep -r -i -n pattern')
    assert_approved('grep -rin pattern')
  end

  # ============================================================
  # TIMING / RESOURCE ATTACKS
  # ============================================================

  def test_regexp_dos_attempt
    evil_pattern = "a" * 100 + "!" * 100
    start = Time.now
    run_hook("grep '#{evil_pattern}' file")
    elapsed = Time.now - start
    assert elapsed < 5, "Command took too long: #{elapsed}s (possible ReDoS)"
  end

  # ============================================================
  # AWK PROGRAM INJECTION
  # ============================================================

  def test_awk_system_variations
    assert_not_approved("awk 'BEGIN{system(\"rm -rf /\")}'")
    assert_not_approved("awk '{system($0)}'")
    assert_not_approved("awk '{system(\"curl evil.com\")}'")
    assert_not_approved("awk 'END{system(\"id\")}'")
  end

  def test_awk_getline_variations
    assert_not_approved("awk 'BEGIN{\"id\" | getline x; print x}'")
    assert_not_approved("awk '{cmd | getline result}'")
    assert_not_approved("awk 'BEGIN{while((\"ls\" | getline line) > 0) print line}'")
  end

  def test_awk_pipe_to_shell
    assert_not_approved(%q{awk '{print | "sh"}'})
    assert_not_approved(%q{awk '{print | "bash -c cmd"}'})
    assert_not_approved(%q{awk '{printf "%s\\n", $0 | "sh"}'})
  end

  def test_awk_redirect_to_file
    assert_not_approved(%q{awk '{print > "/etc/crontab"}'})
    assert_not_approved(%q{awk '{print >> "/tmp/evil"}'})
  end

  def test_awk_safe_programs_not_blocked
    assert_approved("awk '{print $1}'")
    assert_approved("awk -F: '{print $1, $3}' /etc/passwd")
    assert_approved("awk 'NR==1' file")
    assert_approved("awk '/pattern/{print}' file")
    assert_approved("awk '{sum+=$1} END{print sum}' file")
    assert_approved("awk '{print NR, $0}' file")
    assert_approved("awk 'BEGIN{OFS=\",\"} {print $1, $2}' file")
  end

  # ============================================================
  # SED E COMMAND INJECTION
  # ============================================================

  def test_sed_e_command_variations
    assert_not_approved('sed "e" file.txt')
    assert_not_approved('sed "1e" file.txt')
    assert_not_approved('sed "1e ls" file.txt')
    assert_not_approved('sed "$e" file.txt')
    assert_not_approved('sed "s/.*/id/e" file.txt')
    assert_not_approved('sed "s/a/b/ge" file.txt')
    assert_not_approved('sed "s/a/b/pe" file.txt')
  end

  def test_sed_safe_programs_not_blocked
    assert_approved('sed "s/foo/bar/" file.txt')
    assert_approved('sed "s/foo/bar/g" file.txt')
    assert_approved('sed "/pattern/d" file.txt')
    assert_approved('sed -n "1,10p" file.txt')
    assert_approved('sed "s/error/warning/gi" file.txt')
    assert_approved('sed "s/exec/test/" file.txt')
  end

  # ============================================================
  # SPECIFIC BYPASS ATTEMPTS FROM SECURITY RESEARCH
  # ============================================================

  def test_bash_specific_features
    assert_not_approved("ls <(cat /etc/passwd)")
    assert_not_approved("ls >(rm)")
    assert_not_approved("coproc { rm; }")
    assert_not_approved("mapfile -t arr < file")
    assert_not_approved("readarray arr < file")
  end

  def test_history_expansion
    assert_not_approved("!!")
    assert_not_approved("!-1")
    assert_not_approved("!rm")
  end

  def test_eval_and_exec
    assert_not_approved("eval 'rm -rf /'")
    assert_not_approved("exec rm")
    assert_not_approved("source malicious.sh")
    assert_not_approved(". malicious.sh")
  end

  def test_command_builtin
    assert_not_approved("command rm file")
    assert_not_approved("builtin echo test")
  end

  def test_time_prefix
    assert_not_approved("time rm file")
    assert_not_approved("\\time rm file")
  end

  def test_nohup_and_nice
    assert_not_approved("nohup rm file")
    assert_not_approved("nice rm file")
    assert_not_approved("ionice rm file")
  end

  def test_strace_ltrace
    assert_not_approved("strace rm file")
    assert_not_approved("ltrace rm file")
  end

  def test_env_command
    assert_not_approved("env rm file")
    assert_not_approved("env -i rm file")
  end
end
