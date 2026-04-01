# frozen_string_literal: true

require_relative "../../test_helper"

class StoreTest < Minitest::Test
  include WorkbenchTestSetup

  def setup
    setup_workbench
  end

  def teardown
    teardown_workbench
  end

  def test_read_empty
    assert_equal({ "tickets" => [] }, @store.read)
  end

  def test_write_and_read
    data = { "tickets" => [{ "id" => "T-1", "repo" => "o/r" }] }
    @store.write(data)
    assert_equal data, @store.read
  end

  def test_mutate
    @store.write({ "tickets" => [] })
    @store.mutate { |d| d["tickets"] << { "id" => "T-1" } }
    assert_equal 1, @store.tickets.length
  end

  def test_find_ticket
    @store.write({ "tickets" => [{ "id" => "T-1" }, { "id" => "T-2" }] })
    assert_equal "T-1", @store.find_ticket("T-1")["id"]
    assert_nil @store.find_ticket("NOPE")
  end

  def test_find_by_path
    @store.write({ "tickets" => [{ "id" => "T-1", "worktree" => "/tmp/wt1" }] })
    assert_equal "T-1", @store.find_by_path("/tmp/wt1")["id"]
    assert_nil @store.find_by_path("/tmp/nope")
  end

  def test_atomic_write_creates_lock
    @store.write({ "tickets" => [] })
    assert File.exist?(@store.lock_path)
  end
end
