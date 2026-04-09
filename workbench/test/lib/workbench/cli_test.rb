# frozen_string_literal: true

require_relative "../../test_helper"

class CLITest < Minitest::Test
  include WorkbenchTestSetup

  def setup
    setup_workbench
    @cli = Workbench::CLI.new(registry: @registry)
  end

  def teardown
    teardown_workbench
  end

  def test_help
    assert_equal Workbench::EXIT_OK, @cli.run(["--help"])
  end

  def test_empty_args
    assert_equal Workbench::EXIT_OK, @cli.run([])
  end

  def test_unknown_command
    assert_equal Workbench::EXIT_USAGE, @cli.run(["bogus"])
  end

  def test_list_json
    @registry.add(id: "T-1", repo: "o/r", worktree: "/tmp/wt")
    out = capture_stdout { @cli.run(%w[list --json]) }
    parsed = JSON.parse(out)
    assert_equal 1, parsed.length
    assert_equal "T-1", parsed[0]["id"]
  end

  def test_get_json
    @registry.add(id: "T-1", repo: "o/r", worktree: "/tmp/wt")
    out = capture_stdout { @cli.run(%w[get T-1 --json]) }
    assert_equal "T-1", JSON.parse(out)["id"]
  end

  def test_get_not_found
    assert_equal Workbench::EXIT_NOT_FOUND, @cli.run(%w[get NOPE])
  end

  def test_add_and_remove
    assert_equal Workbench::EXIT_OK, @cli.run(%w[add T-1 o/r /tmp/wt])
    assert_equal 1, @registry.list.length
    assert_equal Workbench::EXIT_OK, @cli.run(%w[remove T-1])
    assert_empty @registry.list
  end

  def test_update_via_cli
    @cli.run(%w[add T-1 o/r /tmp/wt])
    assert_equal Workbench::EXIT_OK, @cli.run(%w[update T-1 status stale])
    assert_equal "stale", @registry.get("T-1")["status"]
  end

  def test_update_invalid_status_via_cli
    @cli.run(%w[add T-1 o/r /tmp/wt])
    assert_equal Workbench::EXIT_VALIDATION, @cli.run(%w[update T-1 status bogus])
  end

  def test_pr_lifecycle_via_cli
    @cli.run(%w[add T-1 o/r /tmp/wt])
    assert_equal Workbench::EXIT_OK, @cli.run(%w[add-pr T-1 42])
    assert_equal Workbench::EXIT_OK, @cli.run(%w[update-pr T-1 42 state open])
    assert_equal Workbench::EXIT_OK, @cli.run(%w[remove-pr T-1 42])
  end

  def test_validate_via_cli
    @cli.run(%w[add T-1 o/r /tmp/wt])
    assert_equal Workbench::EXIT_OK, @cli.run(["validate"])
  end

  def test_migrate_via_cli
    @store.write({ "tickets" => [{ "id" => "T-1", "repo" => "o/r", "worktree" => "/tmp/wt", "prs" => ["999"] }] })
    out = capture_stdout { @cli.run(["migrate"]) }
    stats = JSON.parse(out)
    assert_equal 1, stats["prs_converted"]
  end

  def test_usage_errors
    assert_equal Workbench::EXIT_NOT_FOUND, @cli.run(%w[get NOPE])
    assert_equal Workbench::EXIT_USAGE, @cli.run(%w[add])
  end

  private

  def capture_stdout
    old = $stdout
    $stdout = StringIO.new
    yield
    $stdout.string
  ensure
    $stdout = old
  end
end
