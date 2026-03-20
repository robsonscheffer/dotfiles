#!/usr/bin/env ruby
# frozen_string_literal: true

#
# PreToolUse hook that auto-approves safe Bash commands (read-only, and optionally write).
# Uses shfmt to properly parse shell syntax and detect unsafe patterns.
#
# Configuration: config.json (in same directory)
# Dependencies: brew install shfmt
#
# Receives JSON on stdin, outputs JSON permission decision on stdout.
#

require 'json'
require 'open3'
require 'fileutils'

# Load configuration (defaults + user overrides)
def load_config
  # Test override - allows injecting full config for testing
  if ENV['TEST_CONFIG_PATH'] && File.exist?(ENV['TEST_CONFIG_PATH'])
    return JSON.parse(File.read(ENV['TEST_CONFIG_PATH']))
  end

  defaults_path = File.expand_path('config.default.json', __dir__)
  user_path = File.expand_path('config.json', __dir__)

  config = {}
  config = JSON.parse(File.read(defaults_path)) if File.exist?(defaults_path)

  if File.exist?(user_path)
    user_config = JSON.parse(File.read(user_path))
    config = deep_merge(config, user_config)
  end

  config
rescue JSON::ParserError => e
  warn "Config parse error: #{e.message}" if ENV['DEBUG']
  {}
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

CONFIG = load_config

def config(key)
  CONFIG[key]
end

def strict_checks
  config('strict_argument_checks')
end

def logging_config
  config('logging') || {}
end

# --- Logging ---

def log_decision(command, approved, reason = nil)
  return unless logging_config['enabled']
  return if approved && !logging_config['log_approved']
  return if !approved && !logging_config['log_rejected']

  log_path = File.expand_path(logging_config['path'] || '~/.claude/logs/approve-safe-commands.jsonl')
  log_dir = File.dirname(log_path)

  FileUtils.mkdir_p(log_dir) unless Dir.exist?(log_dir)

  entry = {
    'timestamp' => Time.now.utc.iso8601(3),
    'command' => command,
    'decision' => approved ? 'approved' : 'not_approved',
    'reason' => reason
  }

  File.open(log_path, 'a') { |f| f.puts JSON.generate(entry) }
rescue StandardError => e
  warn "Logging error: #{e.message}" if ENV['DEBUG']
end

def safe_commands
  config('safe_commands')
end

def safe_write_commands
  config('safe_write_commands') || []
end

def wrapper_commands
  config('wrapper_commands')
end

def dangerous_flags
  config('dangerous_flags')
end

def dangerous_arg_patterns
  config('dangerous_arg_patterns') || {}
end

# --- Parsing ---

def parse_command(command)
  stdout, _stderr, status = Open3.capture3('shfmt', '-tojson', stdin_data: command)
  return nil unless status.success?
  return nil if stdout.empty?

  JSON.parse(stdout)
rescue Errno::ENOENT
  warn 'WARNING: shfmt not found. Install via: brew install shfmt' if ENV['DEBUG']
  nil
rescue JSON::ParserError
  nil
end

def collect_types(node, types = Set.new)
  case node
  when Hash
    types << node['Type'] if node['Type']
    node.each_value { |v| collect_types(v, types) }
  when Array
    node.each { |item| collect_types(item, types) }
  end
  types
end

# --- Command extraction ---

def extract_command_name(stmt)
  cmd = stmt.dig('Cmd')
  return nil unless cmd

  if cmd['Type'] == 'CallExpr'
    args = cmd['Args']
    return nil unless args&.first

    parts = args.first['Parts']
    return nil unless parts&.first

    value = parts.first['Value']
    return nil unless value

    # Block path traversal
    return nil if value.include?('..')
    return nil if value.start_with?('./')

    File.basename(value)
  end
end

def extract_part_value(part)
  case part['Type']
  when 'Lit'
    part['Value']
  when 'SglQuoted'
    part['Value']
  when 'DblQuoted'
    inner_parts = part['Parts'] || []
    inner_parts.map { |p| extract_part_value(p) }.compact.join
  else
    part['Value']
  end
end

def extract_args(stmt)
  cmd = stmt.dig('Cmd')
  return [] unless cmd&.dig('Type') == 'CallExpr'

  args = cmd['Args'] || []
  args.drop(1).map do |arg|
    parts = arg['Parts']
    next nil unless parts&.first
    parts.map { |p| extract_part_value(p) }.compact.join
  end.compact
end

def extract_raw_args(stmt)
  cmd = stmt.dig('Cmd')
  return [] unless cmd&.dig('Type') == 'CallExpr'

  args = cmd['Args'] || []
  args.drop(1).map do |arg|
    parts = arg['Parts'] || []
    parts.map { |p| extract_part_value(p) }.compact.join
  end
end

def extract_wrapper_target(args, wrapper_config)
  flags_with_values = wrapper_config['flags_with_values'] || []
  skip_next = false

  args.each do |arg|
    if skip_next
      skip_next = false
      next
    end
    if flags_with_values.include?(arg)
      skip_next = true
      next
    end
    next if arg.start_with?('-')

    return arg
  end
  nil
end

def safe_redirect?(redir)
  source_fd = redir.dig('N', 'Value')
  return false unless source_fd == '2'

  target = redir.dig('Word', 'Parts', 0, 'Value')
  return false unless target

  target == '1' || target == '/dev/null'
end

# --- Validation ---

def has_dangerous_flags?(command_name, args)
  flags = dangerous_flags[command_name]
  return false unless flags

  args.any? do |arg|
    flags.any? do |flag|
      next true if arg == flag
      next true if arg.start_with?("#{flag}=")

      if flag.start_with?('-') && !flag.start_with?('--')
        next true if arg.start_with?(flag) && arg.length > flag.length

        if flag.length == 2
          flag_letter = flag[1]
          if arg.match?(/\A-[a-zA-Z]+\z/) && arg.include?(flag_letter)
            next true
          end
        end
      end

      false
    end
  end
end

def has_dangerous_patterns?(args)
  return false unless strict_checks['enabled']

  args.any? do |arg|
    next false unless arg

    if strict_checks['block_brace_expansion']
      return true if arg.match?(/\{.+,.+\}/) || arg.match?(/\{.+\.\..+\}/)
    end

    if strict_checks['block_array_syntax']
      return true if arg.match?(/\w\[.+\]/)
    end

    if strict_checks['block_extglob']
      return true if arg.match?(/[@!*+?]\(/)
    end

    false
  end
end

def has_dangerous_arg_patterns?(command_name, args)
  patterns = dangerous_arg_patterns[command_name]
  return false unless patterns

  args.any? do |arg|
    patterns.any? { |pattern| arg.match?(Regexp.new(pattern)) }
  end
end

def has_ansi_c_quoting?(ast)
  return false unless strict_checks['enabled'] && strict_checks['block_ansi_c_quoting']

  check_ansi_c = ->(node) do
    case node
    when Hash
      if node['Type'] == 'SglQuoted' && node['Dollar']
        return true
      end
      node.each_value { |v| return true if check_ansi_c.call(v) }
    when Array
      node.each { |item| return true if check_ansi_c.call(item) }
    end
    false
  end

  check_ansi_c.call(ast)
end

def safe_flags
  config('safe_flags') || {}
end

def safe_subcommands
  config('safe_subcommands') || {}
end

def has_safe_subcommand?(command_name, args)
  subcommands = safe_subcommands[command_name]
  return false unless subcommands

  subcommand = args.find { |arg| !arg.start_with?('-') }
  return false unless subcommand

  subcommands.include?(subcommand)
end

def only_safe_flags?(command_name, args)
  return false if args.empty?

  allowed = (safe_flags['*'] || []) + (safe_flags[command_name] || [])
  return false if allowed.empty?

  flag_args = args.select { |arg| arg.start_with?('-') }
  return false if flag_args.empty?

  flag_args.all? { |arg| allowed.include?(arg) }
end

# --- Main validation ---

UNSAFE_AST_TYPES = %w[
  CmdSubst
  ProcSubst
  ParamExp
  ArithmExp
  ExtGlob
].freeze

MAX_PIPELINE_DEPTH = 5

def safe_command?(command)
  if command =~ /\A[a-z]+\z/
    return :read if safe_commands.include?(command)
    return :write if config('allow_safe_writes') && safe_write_commands.include?(command)
  end

  ast = parse_command(command)
  return false unless ast

  stmts = ast['Stmts']
  return false unless stmts&.length == 1

  all_types = collect_types(ast)
  return false if UNSAFE_AST_TYPES.any? { |type| all_types.include?(type) }
  return false if has_ansi_c_quoting?(ast)

  stmt = stmts.first
  safe_stmt?(stmt)
end

def safe_stmt?(stmt, depth = 0)
  return false if depth > MAX_PIPELINE_DEPTH

  cmd = stmt['Cmd']
  return false unless cmd

  return false if stmt['Background']
  if stmt['Redirs']&.any?
    return false unless stmt['Redirs'].all? { |redir| safe_redirect?(redir) }
  end

  if cmd['Type'] == 'BinaryCmd'
    return validate_binary_cmd(cmd, depth)
  end

  return false if cmd['Assigns']&.any?

  command_name = extract_command_name(stmt)
  return false unless command_name

  args = extract_args(stmt)
  return :read if only_safe_flags?(command_name, args)

  is_write = false

  if wrapper_commands.key?(command_name)
    target_cmd = extract_wrapper_target(args, wrapper_commands[command_name])
    return false unless target_cmd
    target_cmd = File.basename(target_cmd)
    return false unless safe_commands.include?(target_cmd)
  elsif config('allow_safe_writes') && safe_write_commands.include?(command_name)
    is_write = true
  elsif safe_commands.include?(command_name)
    # Command is directly in the safe list (read path)
  elsif has_safe_subcommand?(command_name, args)
    subcommand = args.find { |arg| !arg.start_with?('-') }
    return false if has_dangerous_flags?("#{command_name} #{subcommand}", args)
  else
    return false
  end

  unless is_write
    return false if has_dangerous_flags?(command_name, args)
  end

  raw_args = extract_raw_args(stmt)
  return false if has_dangerous_patterns?(raw_args)
  return false if has_dangerous_arg_patterns?(command_name, args)

  is_write ? :write : :read
end

def validate_binary_cmd(cmd, depth)
  x = cmd['X']
  y = cmd['Y']
  return false unless x && y

  left = safe_stmt?(x, depth + 1)
  return false unless left

  right = safe_stmt?(y, depth + 1)
  return false unless right

  (left == :write || right == :write) ? :write : :read
end

# --- Entry point ---

def main
  input = JSON.parse($stdin.read)
  command = input.dig('tool_input', 'command')

  unless command
    log_decision(command, false, 'No command provided')
    return
  end

  safety = safe_command?(command)
  if safety
    is_write = safety == :write
    reason = is_write ? 'Safe write command' : 'Safe read-only command'
    approval = is_write ? 'Auto-approved safe write command' : 'Auto-approved safe read-only command'

    log_decision(command, true, reason)

    result = {
      'hookSpecificOutput' => {
        'hookEventName' => 'PreToolUse',
        'permissionDecision' => 'allow',
        'permissionDecisionReason' => approval
      }
    }

    puts JSON.generate(result)
  else
    log_decision(command, false, 'Did not match safe command criteria')
  end
rescue JSON::ParserError => e
  warn "Failed to parse hook input: #{e.message}" if ENV['DEBUG']
  nil
rescue StandardError => e
  warn "Hook error: #{e.class} - #{e.message}" if ENV['DEBUG']
  nil
end

main
