# frozen_string_literal: true

require_relative "../../test_helper"

class GithubSyncTest < Minitest::Test
  include WorkbenchTestSetup

  def setup
    setup_workbench
    @github = Workbench::GithubSync.new(registry: @registry)
  end

  def teardown
    teardown_workbench
  end

  def test_sync_ticket_no_prs
    @registry.add(id: "T-1", repo: "o/r", worktree: "/tmp/wt")
    result = @github.sync_ticket("T-1")
    assert_equal 0, result["prs_synced"]
    assert_equal "active", result["status"]
  end

  def test_sync_ticket_not_found
    assert_raises(Workbench::NotFoundError) { @github.sync_ticket("NOPE") }
  end

  def test_sync_all_empty
    result = @github.sync_all
    assert_empty result["updated"]
    assert_empty result["errors"]
  end
end
