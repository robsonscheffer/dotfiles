# frozen_string_literal: true

require_relative "../../test_helper"

class RegistryTest < Minitest::Test
  include WorkbenchTestSetup

  def setup
    setup_workbench
  end

  def teardown
    teardown_workbench
  end

  # --- CRUD ---

  def test_add_and_list
    @registry.add(id: "T-1", repo: "o/r", worktree: "/tmp/wt")
    tickets = @registry.list
    assert_equal 1, tickets.length
    assert_equal "T-1", tickets[0]["id"]
    assert_equal "o/r", tickets[0]["repo"]
    assert_equal "active", tickets[0]["status"]
    assert_nil tickets[0]["jira_status"]
    assert_equal [], tickets[0]["prs"]
  end

  def test_add_duplicate_raises
    @registry.add(id: "T-1", repo: "o/r", worktree: "/tmp/wt")
    assert_raises(Workbench::DuplicateError) { @registry.add(id: "T-1", repo: "o/r", worktree: "/tmp/other") }
  end

  def test_add_with_base_branch
    @registry.add(id: "T-1", repo: "o/r", worktree: "/tmp/wt", base_branch: "develop")
    assert_equal "develop", @registry.get("T-1")["base_branch"]
  end

  def test_get
    @registry.add(id: "T-1", repo: "o/r", worktree: "/tmp/wt")
    assert_equal "T-1", @registry.get("T-1")["id"]
    assert_nil @registry.get("NOPE")
  end

  def test_remove
    @registry.add(id: "T-1", repo: "o/r", worktree: "/tmp/wt")
    @registry.remove("T-1")
    assert_empty @registry.list
  end

  def test_remove_not_found
    assert_raises(Workbench::NotFoundError) { @registry.remove("NOPE") }
  end

  def test_update
    @registry.add(id: "T-1", repo: "o/r", worktree: "/tmp/wt")
    @registry.update("T-1", "status", "stale")
    assert_equal "stale", @registry.get("T-1")["status"]
  end

  def test_update_invalid_status
    @registry.add(id: "T-1", repo: "o/r", worktree: "/tmp/wt")
    assert_raises(Workbench::ValidationError) { @registry.update("T-1", "status", "bogus") }
  end

  def test_update_not_found
    assert_raises(Workbench::NotFoundError) { @registry.update("NOPE", "status", "active") }
  end

  def test_touch
    @registry.add(id: "T-1", repo: "o/r", worktree: "/tmp/wt")
    @registry.touch("T-1")
    assert_equal Date.today.to_s, @registry.get("T-1")["last_touched"]
  end

  def test_touch_not_found
    assert_raises(Workbench::NotFoundError) { @registry.touch("NOPE") }
  end

  def test_path
    @registry.add(id: "T-1", repo: "o/r", worktree: "/tmp/wt")
    assert_equal "/tmp/wt", @registry.path("T-1")
  end

  def test_path_not_found
    assert_raises(Workbench::NotFoundError) { @registry.path("NOPE") }
  end

  def test_find_by_path
    @registry.add(id: "T-1", repo: "o/r", worktree: "/tmp/wt")
    assert_equal "T-1", @registry.find_by_path("/tmp/wt")["id"]
  end

  def test_find_by_path_not_found
    assert_raises(Workbench::NotFoundError) { @registry.find_by_path("/tmp/nope") }
  end

  # --- PR management ---

  def test_add_pr
    @registry.add(id: "T-1", repo: "o/r", worktree: "/tmp/wt")
    @registry.add_pr("T-1", "123")
    prs = @registry.get("T-1")["prs"]
    assert_equal 1, prs.length
    assert_equal "123", prs[0]["number"]
    assert_nil prs[0]["state"]
  end

  def test_add_pr_duplicate
    @registry.add(id: "T-1", repo: "o/r", worktree: "/tmp/wt")
    @registry.add_pr("T-1", "123")
    assert_raises(Workbench::DuplicateError) { @registry.add_pr("T-1", "123") }
  end

  def test_update_pr
    @registry.add(id: "T-1", repo: "o/r", worktree: "/tmp/wt")
    @registry.add_pr("T-1", "123")
    @registry.update_pr("T-1", "123", "state", "open")
    @registry.update_pr("T-1", "123", "ci", "success")
    @registry.update_pr("T-1", "123", "review_status", "approved")
    pr = @registry.get("T-1")["prs"][0]
    assert_equal "open", pr["state"]
    assert_equal "success", pr["ci"]
    assert_equal "approved", pr["review_status"]
  end

  def test_update_pr_invalid_state
    @registry.add(id: "T-1", repo: "o/r", worktree: "/tmp/wt")
    @registry.add_pr("T-1", "123")
    assert_raises(Workbench::ValidationError) { @registry.update_pr("T-1", "123", "state", "bogus") }
  end

  def test_update_pr_not_found
    @registry.add(id: "T-1", repo: "o/r", worktree: "/tmp/wt")
    assert_raises(Workbench::NotFoundError) { @registry.update_pr("T-1", "999", "state", "open") }
  end

  def test_remove_pr
    @registry.add(id: "T-1", repo: "o/r", worktree: "/tmp/wt")
    @registry.add_pr("T-1", "123")
    @registry.remove_pr("T-1", "123")
    assert_empty @registry.get("T-1")["prs"]
  end

  def test_remove_pr_not_found
    @registry.add(id: "T-1", repo: "o/r", worktree: "/tmp/wt")
    assert_raises(Workbench::NotFoundError) { @registry.remove_pr("T-1", "123") }
  end

  # --- Validate ---

  def test_validate_clean
    @registry.add(id: "T-1", repo: "o/r", worktree: "/tmp/wt")
    assert_empty @registry.validate
  end

  def test_validate_catches_malformed_repo
    @store.write({ "tickets" => [{ "id" => "BAD", "repo" => "--repo", "worktree" => "/tmp/x" }] })
    assert @registry.validate.any? { |e| e.include?("looks like a flag") }
  end

  def test_validate_catches_missing_owner
    @store.write({ "tickets" => [{ "id" => "BAD", "repo" => "noslash", "worktree" => "/tmp/x" }] })
    assert @registry.validate.any? { |e| e.include?("missing owner/") }
  end

  def test_validate_catches_relative_worktree
    @store.write({ "tickets" => [{ "id" => "BAD", "repo" => "o/r", "worktree" => "relative" }] })
    assert @registry.validate.any? { |e| e.include?("not absolute") }
  end

  def test_validate_catches_bare_pr_strings
    @store.write({ "tickets" => [{ "id" => "BAD", "repo" => "o/r", "worktree" => "/tmp/x", "prs" => ["999"] }] })
    assert @registry.validate.any? { |e| e.include?("bare string") }
  end

  # --- Migrate ---

  def test_migrate_converts_bare_prs
    @store.write({ "tickets" => [{
      "id" => "T-1", "repo" => "o/r", "worktree" => "/tmp/wt", "base_branch" => "main",
      "started" => "2026-01-01", "last_touched" => "2026-01-01", "prs" => ["999"]
    }] })
    stats = @registry.migrate
    assert_equal 1, stats["prs_converted"]
    assert_equal "999", @registry.get("T-1")["prs"][0]["number"]
  end

  def test_migrate_adds_status_and_jira
    @store.write({ "tickets" => [{ "id" => "T-1", "repo" => "o/r", "worktree" => "/tmp/wt", "prs" => [] }] })
    @registry.migrate
    t = @registry.get("T-1")
    assert_equal "active", t["status"]
    assert t.key?("jira_status")
  end

  def test_migrate_orphans_bad_repo
    @store.write({ "tickets" => [{ "id" => "T-1", "repo" => "noslash", "worktree" => "/tmp/nonexistent", "prs" => [] }] })
    stats = @registry.migrate
    assert_equal 1, stats["orphaned"]
    assert_equal "orphan", @registry.get("T-1")["status"]
  end

  # --- Focus ---

  def test_focus_by_id
    @registry.add(id: "T-1", repo: "o/r", worktree: "/tmp/wt")
    ticket = @registry.focus("T-1")
    assert_equal "T-1", ticket["id"]
    assert_equal Date.today.to_s, ticket["last_touched"]
  end

  def test_focus_quiet
    @registry.add(id: "T-1", repo: "o/r", worktree: "/tmp/wt")
    ticket = @registry.focus("T-1", quiet: true)
    assert_equal "T-1", ticket["id"]
  end

  def test_focus_not_found
    assert_raises(Workbench::NotFoundError) { @registry.focus("NOPE") }
  end

  # --- Detect stale ---

  def test_detect_stale_flags_merged_with_worktree
    wt = Dir.mktmpdir("wb-wt")
    @registry.add(id: "T-1", repo: "o/r", worktree: wt)
    @registry.update("T-1", "status", "merged")
    result = @registry.detect_stale
    assert result["flagged"].any? { |f| f["id"] == "T-1" && f["reason"].include?("merged") }
    FileUtils.rm_rf(wt)
  end

  # --- Sync worktrees ---

  def test_sync_worktrees_flags_missing
    @registry.add(id: "T-1", repo: "o/r", worktree: "/tmp/nonexistent-wt-path")
    result = @registry.sync_worktrees
    assert result["flagged"].any? { |f| f["id"] == "T-1" && f["issue"] == "missing_worktree" }
  end

  def test_sync_worktrees_returns_structure
    result = @registry.sync_worktrees
    assert result.key?("auto_fixed")
    assert result.key?("flagged")
    assert result.key?("errors")
  end

  # --- Fetch context ---

  def test_fetch_context_creates_notes
    @registry.add(id: "T-1", repo: "o/r", worktree: "/tmp/wt")
    result = @registry.fetch_context("T-1")
    assert_equal false, result["jira_fetched"]
    assert File.exist?(result["investigation_path"])
    assert_includes File.read(result["investigation_path"]), "# T-1"
  end

  def test_fetch_context_not_found
    assert_raises(Workbench::NotFoundError) { @registry.fetch_context("NOPE") }
  end
end
