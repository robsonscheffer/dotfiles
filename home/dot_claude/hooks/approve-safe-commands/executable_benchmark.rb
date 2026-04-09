#!/usr/bin/env ruby
# frozen_string_literal: true

#
# Benchmark suite for approve-safe-commands hook.
#
# Usage:
#   ruby benchmark.rb              # full suite
#   ruby benchmark.rb --quick      # fewer iterations, faster
#   ruby benchmark.rb --category fast_path   # single category
#

require 'json'
require 'open3'
require 'optparse'

SCRIPT = File.expand_path('hook.rb', __dir__)

unless system('which shfmt >/dev/null 2>&1')
  abort 'shfmt not found. Install via: brew install shfmt'
end

# --- Options ---

options = { iterations: 50, warmup: 5, category: nil }
OptionParser.new do |opts|
  opts.banner = "Usage: #{$PROGRAM_NAME} [options]"
  opts.on('--quick', 'Fewer iterations (10 per command)') { options[:iterations] = 10; options[:warmup] = 2 }
  opts.on('--iterations N', Integer, 'Iterations per command') { |n| options[:iterations] = n }
  opts.on('--warmup N', Integer, 'Warmup iterations') { |n| options[:warmup] = n }
  opts.on('--category CAT', 'Run single category') { |c| options[:category] = c }
  opts.on('--list', 'List available categories') do
    puts CATEGORIES.keys.sort
    exit
  end
end.parse!

# --- Test commands by category ---

CATEGORIES = {
  'fast_path' => {
    desc: 'Single-word commands (regex fast path, no shfmt)',
    commands: %w[ls pwd wc date which file tree echo jq xxd]
  },
  'safe_with_args' => {
    desc: 'Safe commands with arguments (full shfmt parse)',
    commands: [
      'ls -la /tmp',
      'grep -rn "pattern" /src',
      'find /var/log -name "*.log" -type f',
      'cat -n file.txt',
      'head -20 file.txt',
      'tail -f log.txt',
      'wc -l file.txt',
      'diff file1.txt file2.txt',
      'sed -n "1p" file.txt',
      'jq ".foo" data.json'
    ]
  },
  'wrapper_commands' => {
    desc: 'Wrapper commands (xargs target extraction)',
    commands: [
      'xargs echo',
      'xargs cat',
      'xargs -n 1 echo',
      'xargs -I {} cat {}',
      'xargs -n 1 -I {} ls {}'
    ]
  },
  'subcommands' => {
    desc: 'Safe subcommand matching (git status, etc.)',
    commands: [
      'git status',
      'git log --oneline -20',
      'git diff HEAD~1',
      'git branch -a',
      'git show HEAD',
      'git remote -v',
      'git tag -l',
      'git stash list'
    ]
  },
  'safe_flags' => {
    desc: 'Safe flag auto-approval (--help, --version)',
    commands: [
      'git --help',
      'docker --help',
      'npm --version',
      'ruby --version',
      'git log --help'
    ]
  },
  'rejected_not_in_allowlist' => {
    desc: 'Rejected: command not in allowlist',
    commands: [
      'rm file.txt',
      'mv foo bar',
      'cp foo bar',
      'chmod 777 file',
      'curl http://example.com',
      'npm install',
      'docker run ubuntu'
    ]
  },
  'rejected_chaining' => {
    desc: 'Rejected: command chaining/pipes',
    commands: [
      'ls && rm -rf /',
      'ls || echo fail',
      'ls; rm -rf /',
      'ls | grep foo',
      'cat file | sh'
    ]
  },
  'rejected_dangerous_flags' => {
    desc: 'Rejected: dangerous flags on safe commands',
    commands: [
      'sed -i "s/foo/bar/" file',
      'sed --in-place "s/a/b/" file',
      'find . -exec rm {} \\;',
      'find . -delete',
      'awk -i inplace "{print}" file'
    ]
  },
  'rejected_substitution' => {
    desc: 'Rejected: command/parameter substitution',
    commands: [
      'echo $(rm -rf /)',
      'echo `whoami`',
      'echo $HOME',
      'echo ${HOME}',
      'ls $(cat /etc/passwd)'
    ]
  },
  'rejected_redirects' => {
    desc: 'Rejected: unsafe redirects',
    commands: [
      'echo "data" > file.txt',
      'echo "data" >> file.txt',
      'cat < file.txt',
      'ls > listing.txt'
    ]
  },
  'safe_redirects' => {
    desc: 'Approved: safe stderr redirects',
    commands: [
      'ls -la 2>&1',
      'find . -name "*.rb" 2>/dev/null',
      'ls 2>&1',
      'grep pattern file 2>/dev/null'
    ]
  },
  'long_commands' => {
    desc: 'Commands with long/many arguments',
    commands: [
      "ls #{'a' * 1000}",
      "ls #{(1..100).map { |i| "arg#{i}" }.join(' ')}",
      "grep -rn #{'pattern' * 50} /src",
      "find /var/log #{'-name "*.log" ' * 20}-type f"
    ]
  },
  'strict_checks' => {
    desc: 'Rejected: strict argument checks (brace expansion, etc.)',
    commands: [
      'echo {a,b,c}',
      'ls {foo,bar}.txt',
      'cat file{1..5}.txt',
      'ls arr[0]',
      'ls @(foo|bar)'
    ]
  },
  'parse_failures' => {
    desc: 'Commands that fail shfmt parsing',
    commands: [
      'ls (',
      'ls )',
      "ls '",
      'ls "',
      ''
    ]
  }
}.freeze

# --- Benchmark runner ---

def run_hook(command)
  input = { 'tool_input' => { 'command' => command } }.to_json
  start = Process.clock_gettime(Process::CLOCK_MONOTONIC)
  _stdout, _stderr, _status = Open3.capture3("ruby #{SCRIPT}", stdin_data: input)
  elapsed = Process.clock_gettime(Process::CLOCK_MONOTONIC) - start
  elapsed * 1000 # ms
end

def percentile(sorted_arr, pct)
  return 0 if sorted_arr.empty?

  idx = (pct / 100.0 * (sorted_arr.length - 1)).round
  sorted_arr[idx]
end

# --- Main ---

puts "approve-safe-commands benchmark"
puts "  hook:       #{SCRIPT}"
puts "  ruby:       #{RUBY_VERSION}"
shfmt_version = `shfmt --version 2>/dev/null`.strip
puts "  shfmt:      #{shfmt_version}"
puts "  iterations: #{options[:iterations]} per command (#{options[:warmup]} warmup)"
puts "  time:       #{Time.now.strftime('%Y-%m-%d %H:%M:%S')}"

all_times = []

categories_to_run = if options[:category]
                      selected = CATEGORIES.select { |k, _| k == options[:category] }
                      abort "Unknown category: #{options[:category]}\nAvailable: #{CATEGORIES.keys.join(', ')}" if selected.empty?
                      selected
                    else
                      CATEGORIES
                    end

categories_to_run.each do |name, config|
  cat_times = []
  per_cmd_times = {}

  config[:commands].each do |cmd|
    options[:warmup].times { run_hook(cmd) }
    times = options[:iterations].times.map { run_hook(cmd) }
    per_cmd_times[cmd] = times
    cat_times.concat(times)
  end

  all_times.concat(cat_times)

  puts "\n#{name}: #{config[:desc]}"
  puts '-' * 60

  config[:commands].each do |cmd|
    display = cmd.length > 45 ? "#{cmd[0..42]}..." : cmd
    display = '(empty)' if cmd.empty?
    sorted_cmd = per_cmd_times[cmd].sort

    printf "  %-46s  p50=%6.1fms  p95=%6.1fms  p99=%6.1fms\n",
           display,
           percentile(sorted_cmd, 50),
           percentile(sorted_cmd, 95),
           percentile(sorted_cmd, 99)
  end

  sorted_cat = cat_times.sort
  printf "  %-46s  p50=%6.1fms  p95=%6.1fms  p99=%6.1fms\n",
         ">> CATEGORY (#{config[:commands].length} cmds)",
         percentile(sorted_cat, 50),
         percentile(sorted_cat, 95),
         percentile(sorted_cat, 99)
end

# Overall summary
puts "\n#{'=' * 60}"
puts 'OVERALL SUMMARY'
puts '=' * 60

sorted_all = all_times.sort
total_cmds = categories_to_run.sum { |_, c| c[:commands].length }
total_runs = all_times.length

printf "  Commands tested:  %d\n", total_cmds
printf "  Total runs:       %d\n", total_runs
printf "  p50:              %6.1f ms\n", percentile(sorted_all, 50)
printf "  p95:              %6.1f ms\n", percentile(sorted_all, 95)
printf "  p99:              %6.1f ms\n", percentile(sorted_all, 99)
printf "  min:              %6.1f ms\n", sorted_all.first
printf "  max:              %6.1f ms\n", sorted_all.last
printf "  mean:             %6.1f ms\n", all_times.sum / all_times.length.to_f
printf "  throughput:       %6.1f commands/sec (at p50)\n", 1000.0 / percentile(sorted_all, 50)
